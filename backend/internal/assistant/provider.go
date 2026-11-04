package assistant

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var (
	ErrUnavailable = errors.New("assistant model unavailable")
	ErrInvalid     = errors.New("invalid assistant request")
)

type Provider interface {
	Name() string
	Available() bool
	Complete(context.Context, string) (Completion, error)
}

type Completion struct {
	JSON      json.RawMessage
	RequestID string
}

type OpenAIProvider struct {
	client   *http.Client
	endpoint string
	apiKey   string
	model    string
	name     string
}

func NewOpenAIProvider(endpoint, apiKey, model, name string, client *http.Client) *OpenAIProvider {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	if name == "" {
		name = "openai"
	}
	return &OpenAIProvider{client: client, endpoint: strings.TrimRight(endpoint, "/"), apiKey: apiKey, model: model, name: name}
}

func (p *OpenAIProvider) Name() string { return p.name }

func (p *OpenAIProvider) Available() bool {
	if p == nil || p.endpoint == "" || p.model == "" {
		return false
	}
	return p.name != "openai" || p.apiKey != ""
}

func (p *OpenAIProvider) Complete(ctx context.Context, prompt string) (Completion, error) {
	if !p.Available() {
		return Completion{}, ErrUnavailable
	}
	requestID, err := randomID()
	if err != nil {
		return Completion{}, fmt.Errorf("create assistant request id: %w", err)
	}
	body := map[string]any{
		"model": p.model,
		"store": false,
		"input": prompt,
		"text": map[string]any{
			"format": map[string]any{
				"type":   "json_schema",
				"name":   "casrep_assistant_response",
				"strict": true,
				"schema": responseSchema(),
			},
		},
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return Completion{}, fmt.Errorf("encode assistant request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewReader(encoded))
	if err != nil {
		return Completion{}, fmt.Errorf("create assistant request: %w", err)
	}
	if p.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.apiKey)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Client-Request-Id", requestID)
	response, err := p.client.Do(req)
	if err != nil {
		return Completion{}, fmt.Errorf("%w: provider request failed", ErrUnavailable)
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, 2<<20)
	data, readErr := io.ReadAll(limited)
	if readErr != nil {
		return Completion{}, fmt.Errorf("%w: provider response could not be read", ErrUnavailable)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Completion{}, fmt.Errorf("%w: provider returned HTTP %d", ErrUnavailable, response.StatusCode)
	}
	var result responseBody
	if err := json.Unmarshal(data, &result); err != nil {
		return Completion{}, fmt.Errorf("%w: provider returned invalid JSON", ErrUnavailable)
	}
	text := result.OutputText
	if text == "" {
		for _, item := range result.Output {
			for _, content := range item.Content {
				if content.Type == "output_text" || content.Type == "text" {
					text += content.Text
				}
			}
		}
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return Completion{}, fmt.Errorf("%w: provider returned no structured output", ErrUnavailable)
	}
	if !json.Valid([]byte(text)) {
		return Completion{}, fmt.Errorf("%w: provider returned non-JSON output", ErrUnavailable)
	}
	return Completion{JSON: json.RawMessage(text), RequestID: requestID}, nil
}

type responseBody struct {
	OutputText string `json:"output_text"`
	Output     []struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
}

func responseSchema() map[string]any {
	stringArray := map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "maxItems": 20}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]any{
			"mode":             map[string]any{"type": "string", "enum": []string{"chat", "draft"}},
			"answer":           map[string]any{"type": "string", "maxLength": 8000},
			"claims":           map[string]any{"type": "array", "maxItems": 20, "items": map[string]any{"type": "object", "additionalProperties": false, "properties": map[string]any{"text": map[string]any{"type": "string", "maxLength": 2000}, "sourceIds": map[string]any{"type": "array", "maxItems": 20, "items": map[string]any{"type": "string", "maxLength": 180}}}, "required": []string{"text", "sourceIds"}}},
			"gaps":             stringArray,
			"nextQuestions":    stringArray,
			"facts":            map[string]any{"type": "object", "additionalProperties": false, "properties": map[string]any{"equipment": map[string]any{"type": "string", "maxLength": 12000}, "category": map[string]any{"type": "string", "maxLength": 20}, "title": map[string]any{"type": "string", "maxLength": 12000}, "description": map[string]any{"type": "string", "maxLength": 12000}, "impact": map[string]any{"type": "string", "maxLength": 12000}, "actions": map[string]any{"type": "string", "maxLength": 12000}, "mitigation": map[string]any{"type": "string", "maxLength": 12000}, "parts": map[string]any{"type": "string", "maxLength": 12000}, "assistance": map[string]any{"type": "string", "maxLength": 12000}, "poc": map[string]any{"type": "string", "maxLength": 12000}}, "required": []string{"equipment", "category", "title", "description", "impact", "actions", "mitigation", "parts", "assistance", "poc"}},
			"missingEssential": stringArray,
			"warnings":         stringArray,
		},
		"required": []string{"mode", "answer", "claims", "gaps", "nextQuestions", "facts", "missingEssential", "warnings"},
	}
}

func randomID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}
