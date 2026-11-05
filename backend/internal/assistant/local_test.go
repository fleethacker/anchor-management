package assistant

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStartLocalProcessProviderValidatesOfflineConfiguration(t *testing.T) {
	tests := []struct {
		name   string
		config LocalProcessConfig
		want   string
	}{
		{name: "binary", config: LocalProcessConfig{ModelPath: "/models/smollm2.gguf", Model: "smollm2"}, want: "binary is required"},
		{name: "model path", config: LocalProcessConfig{Binary: "/usr/bin/llama-server", Model: "smollm2"}, want: "model path is required"},
		{name: "model name", config: LocalProcessConfig{Binary: "/usr/bin/llama-server", ModelPath: "/models/smollm2.gguf"}, want: "model name is required"},
		{name: "port", config: LocalProcessConfig{Binary: "/usr/bin/llama-server", ModelPath: "/models/smollm2.gguf", Model: "smollm2", Port: 70000}, want: "port must be between"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := StartLocalProcessProvider(context.Background(), test.config)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want substring %q", err, test.want)
			}
		})
	}
}

func TestLocalProcessProviderUsesSafeDefaults(t *testing.T) {
	// A missing executable is reached only after all local model requirements and
	// defaults have been validated. This keeps accidental partial configurations
	// from creating a process or a temporary API-key file.
	_, err := StartLocalProcessProvider(context.Background(), LocalProcessConfig{
		Binary:    "/missing/llama-server",
		ModelPath: "/models/smollm2.gguf",
		Model:     "smollm2",
	})
	if err == nil || !strings.Contains(err.Error(), "start local Assistant model") {
		t.Fatalf("error = %v, want process start failure", err)
	}
}

func TestLocalProcessProviderSupervisesLoopbackProcess(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(t.TempDir(), "fake-llama-server.sh")
	contents := fmt.Sprintf("#!/bin/sh\nASSISTANT_FAKE_LLAMA=1 exec %s -test.run=TestFakeLlamaServer -- \"$@\"\n", shellQuote(executable))
	if err := os.WriteFile(script, []byte(contents), 0700); err != nil {
		t.Fatal(err)
	}

	provider, err := StartLocalProcessProvider(context.Background(), LocalProcessConfig{
		Binary:          script,
		ModelPath:       "/models/smollm2.gguf",
		Model:           "smollm2",
		Port:            unusedPort(t),
		StartupTimeout:  5 * time.Second,
		ShutdownTimeout: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !provider.Available() {
		t.Fatal("supervised provider is not available after readiness")
	}
	result, err := provider.Complete(context.Background(), "Test policy\nASSISTANT_INPUT:\n"+`{"request":{"mode":"chat","question":"What happened?"},"evidence":{"cases":[]}}`)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(result.JSON), `"mode":"chat"`) || !strings.Contains(string(result.JSON), `"answer":"fake"`) {
		t.Fatalf("response = %s", result.JSON)
	}
	keyPath := provider.apiKeyPath
	if err := provider.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(keyPath); !os.IsNotExist(err) {
		t.Fatalf("temporary API key file still exists: %v", err)
	}
	if provider.Available() {
		t.Fatal("closed supervised provider remains available")
	}
}

func TestFakeLlamaServer(t *testing.T) {
	if os.Getenv("ASSISTANT_FAKE_LLAMA") != "1" {
		return
	}
	port := testArg("--port")
	keyPath := testArg("--api-key-file")
	key, err := os.ReadFile(keyPath)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	authenticated := func(r *http.Request) bool {
		return r.Header.Get("Authorization") == "Bearer "+strings.TrimSpace(string(key))
	}
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if !authenticated(r) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/v1/responses", func(w http.ResponseWriter, r *http.Request) {
		if !authenticated(r) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"output_text":"{\"answer\":\"fake\",\"claim\":\"\",\"sourceId\":\"\"}"}`)
	})
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: mux}
	go func() { _ = server.Serve(listener) }()
	select {}
}

func unusedPort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	_ = listener.Close()
	return port
}

func testArg(name string) string {
	for i, arg := range os.Args {
		if arg == name && i+1 < len(os.Args) {
			return os.Args[i+1]
		}
	}
	return ""
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
