package assistant

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// LocalProcessConfig describes a llama-server process that is owned by the API
// process. The model path is intentionally a local file path; the server must
// never download a model at runtime.
type LocalProcessConfig struct {
	Binary          string
	ModelPath       string
	Model           string
	APIKey          string
	Port            int
	ContextSize     int
	Threads         int
	MaxTokens       int
	StartupTimeout  time.Duration
	ShutdownTimeout time.Duration
	LogWriter       io.Writer
}

// LocalProcessProvider supervises llama-server and sends requests through its
// loopback OpenAI-compatible Responses endpoint. It has no tools, database
// access, or workflow integration; the normal Service validation remains the
// authority for model output.
type LocalProcessProvider struct {
	provider      *OpenAIProvider
	cmd           *exec.Cmd
	cancel        context.CancelFunc
	done          chan struct{}
	exitMu        sync.Mutex
	exitErr       error
	apiKeyPath    string
	running       atomic.Bool
	shutdownLimit time.Duration
}

// StartLocalProcessProvider starts llama-server, waits for its /health endpoint,
// and returns only after the model is ready to receive requests.
func StartLocalProcessProvider(parent context.Context, config LocalProcessConfig) (*LocalProcessProvider, error) {
	if parent == nil {
		parent = context.Background()
	}
	if strings.TrimSpace(config.Binary) == "" {
		return nil, fmt.Errorf("local Assistant binary is required")
	}
	if strings.TrimSpace(config.ModelPath) == "" {
		return nil, fmt.Errorf("local Assistant model path is required")
	}
	if strings.TrimSpace(config.Model) == "" {
		return nil, fmt.Errorf("local Assistant model name is required")
	}
	if config.Port == 0 {
		config.Port = 9931
	}
	if config.Port < 1 || config.Port > 65535 {
		return nil, fmt.Errorf("local Assistant port must be between 1 and 65535")
	}
	if config.ContextSize == 0 {
		config.ContextSize = 4096
	}
	if config.ContextSize < 512 {
		return nil, fmt.Errorf("local Assistant context size must be at least 512")
	}
	if config.MaxTokens == 0 {
		config.MaxTokens = 1200
	}
	if config.MaxTokens < 1 {
		return nil, fmt.Errorf("local Assistant max tokens must be positive")
	}
	if config.StartupTimeout == 0 {
		config.StartupTimeout = 45 * time.Second
	}
	if config.StartupTimeout <= 0 {
		return nil, fmt.Errorf("local Assistant startup timeout must be positive")
	}
	if config.ShutdownTimeout == 0 {
		config.ShutdownTimeout = 5 * time.Second
	}
	if config.ShutdownTimeout <= 0 {
		return nil, fmt.Errorf("local Assistant shutdown timeout must be positive")
	}

	apiKey := strings.TrimSpace(config.APIKey)
	if apiKey == "" {
		var err error
		apiKey, err = randomID()
		if err != nil {
			return nil, fmt.Errorf("create local Assistant API key: %w", err)
		}
	}
	apiKeyFile, err := os.CreateTemp("", "anchor-management-llama-api-key-")
	if err != nil {
		return nil, fmt.Errorf("create local Assistant API key file: %w", err)
	}
	apiKeyPath := apiKeyFile.Name()
	cleanupKey := func() {
		_ = apiKeyFile.Close()
		_ = os.Remove(apiKeyPath)
	}
	if err := apiKeyFile.Chmod(0600); err != nil {
		cleanupKey()
		return nil, fmt.Errorf("protect local Assistant API key file: %w", err)
	}
	if _, err := io.WriteString(apiKeyFile, apiKey+"\n"); err != nil {
		cleanupKey()
		return nil, fmt.Errorf("write local Assistant API key file: %w", err)
	}
	if err := apiKeyFile.Close(); err != nil {
		cleanupKey()
		return nil, fmt.Errorf("close local Assistant API key file: %w", err)
	}

	ctx, cancel := context.WithCancel(parent)
	args := []string{
		"--model", config.ModelPath,
		"--alias", config.Model,
		"--host", "127.0.0.1",
		"--port", strconv.Itoa(config.Port),
		"--ctx-size", strconv.Itoa(config.ContextSize),
		"--n-predict", strconv.Itoa(config.MaxTokens),
		"--parallel", "1",
		"--offline",
		"--no-webui",
		"--no-agent",
		"--api-key-file", apiKeyPath,
	}
	if config.Threads > 0 {
		args = append(args, "--threads", strconv.Itoa(config.Threads))
	}
	cmd := exec.CommandContext(ctx, config.Binary, args...)
	if config.LogWriter == nil {
		config.LogWriter = io.Discard
	}
	cmd.Stdout = config.LogWriter
	cmd.Stderr = config.LogWriter
	if err := cmd.Start(); err != nil {
		cancel()
		cleanupKey()
		return nil, fmt.Errorf("start local Assistant model: %w", err)
	}

	process := &LocalProcessProvider{
		provider:      NewLocalProvider(fmt.Sprintf("http://127.0.0.1:%d/v1/responses", config.Port), apiKey, config.Model, nil),
		cmd:           cmd,
		cancel:        cancel,
		done:          make(chan struct{}),
		apiKeyPath:    apiKeyPath,
		shutdownLimit: config.ShutdownTimeout,
	}
	go func() {
		err := cmd.Wait()
		process.exitMu.Lock()
		process.exitErr = err
		process.exitMu.Unlock()
		process.running.Store(false)
		close(process.done)
	}()

	if err := process.waitReady(ctx, config.StartupTimeout); err != nil {
		_ = process.Close()
		return nil, err
	}
	process.running.Store(true)
	return process, nil
}

func (p *LocalProcessProvider) Name() string {
	if p == nil || p.provider == nil {
		return "local-model"
	}
	return p.provider.Name()
}

func (p *LocalProcessProvider) Available() bool {
	return p != nil && p.provider != nil && p.provider.Available() && p.running.Load()
}

func (p *LocalProcessProvider) Complete(ctx context.Context, prompt string) (Completion, error) {
	if !p.Available() {
		return Completion{}, ErrUnavailable
	}
	return p.provider.Complete(ctx, prompt)
}

func (p *LocalProcessProvider) waitReady(ctx context.Context, timeout time.Duration) error {
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	healthClient := &http.Client{Timeout: 2 * time.Second}
	healthURL := strings.Replace(p.provider.endpoint, "/v1/responses", "/health", 1)
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
		if err == nil {
			request.Header.Set("Authorization", "Bearer "+p.provider.apiKey)
			response, requestErr := healthClient.Do(request)
			if requestErr == nil {
				_, _ = io.Copy(io.Discard, response.Body)
				_ = response.Body.Close()
				if response.StatusCode == http.StatusOK {
					return nil
				}
			}
		}
		select {
		case <-p.done:
			if err := p.processError(); err != nil {
				return fmt.Errorf("local Assistant model exited before becoming ready: %w", err)
			}
			return fmt.Errorf("local Assistant model exited before becoming ready")
		case <-ctx.Done():
			return fmt.Errorf("local Assistant model startup cancelled: %w", ctx.Err())
		case <-deadline.C:
			return fmt.Errorf("local Assistant model did not become ready within %s", timeout)
		case <-time.After(100 * time.Millisecond):
		}
	}
}

// Close stops the supervised model process and removes its temporary API key.
func (p *LocalProcessProvider) Close() error {
	if p == nil {
		return nil
	}
	p.cancel()
	select {
	case <-p.done:
	case <-time.After(p.shutdownLimit):
		if p.cmd != nil && p.cmd.Process != nil {
			_ = p.cmd.Process.Kill()
			select {
			case <-p.done:
			case <-time.After(time.Second):
			}
		}
	}
	if p.apiKeyPath != "" {
		_ = os.Remove(p.apiKeyPath)
	}
	// Cancellation normally makes Wait return signal: killed. That is the
	// expected shutdown result, not a provider failure.
	return nil
}

func (p *LocalProcessProvider) processError() error {
	p.exitMu.Lock()
	defer p.exitMu.Unlock()
	return p.exitErr
}
