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
	client      *http.Client
	endpoint    string
	apiKey      string
	model       string
	name        string
	localModel  bool
	requireAuth bool
}

func NewOpenAIProvider(endpoint, apiKey, model, name string, client *http.Client) *OpenAIProvider {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	if name == "" {
		name = "openai"
	}
	return &OpenAIProvider{client: client, endpoint: strings.TrimRight(endpoint, "/"), apiKey: apiKey, model: model, name: name, requireAuth: true}
}

func NewLocalProvider(endpoint, apiKey, model string, client *http.Client) *OpenAIProvider {
	provider := NewOpenAIProvider(endpoint, apiKey, model, "local-model", client)
	provider.localModel = true
	provider.requireAuth = false
	return provider
}

func (p *OpenAIProvider) RequiresAuthentication() bool {
	return p == nil || p.requireAuth
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
	maxOutputTokens := 1200
	if p.localModel {
		maxOutputTokens = 600
	}
	body := map[string]any{
		"model":             p.model,
		"store":             false,
		"input":             prompt,
		"max_output_tokens": maxOutputTokens,
	}
	if p.localModel {
		// llama.cpp's Responses adapter forwards extra_params to its Chat
		// Completions implementation. Its schema-constrained route uses the
		// json_object shape; the OpenAI text.format shape is not forwarded.
		body["extra_params"] = map[string]any{
			"temperature": 0,
			"seed":        42,
			"response_format": map[string]any{
				"type":   "json_object",
				"schema": localResponseSchema(localDraftPrompt(prompt), localSourceIDs(prompt)),
			},
		}
	} else {
		body["text"] = map[string]any{
			"format": map[string]any{
				"type":   "json_schema",
				"name":   "casrep_assistant_response",
				"strict": true,
				"schema": responseSchema(),
			},
		}
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
	if p.localModel {
		text, err = normalizeLocalResponse([]byte(text), localDraftPrompt(prompt))
		if err != nil {
			return Completion{}, fmt.Errorf("%w: local provider returned an unsupported response", ErrUnavailable)
		}
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

func localSourceIDs(prompt string) []string {
	const marker = "ASSISTANT_INPUT:\n"
	index := strings.Index(prompt, marker)
	if index < 0 {
		return []string{""}
	}
	var envelope struct {
		Evidence struct {
			Cases []struct {
				ID string `json:"id"`
			} `json:"cases"`
		} `json:"evidence"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(prompt[index+len(marker):])), &envelope); err != nil {
		return []string{""}
	}
	ids := []string{""}
	seen := map[string]bool{"": true}
	for _, record := range envelope.Evidence.Cases {
		id := strings.TrimSpace(record.ID)
		if id != "" && !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	return ids
}

func localResponseSchema(draft bool, sourceIDs []string) map[string]any {
	sourceID := map[string]any{"type": "string"}
	if len(sourceIDs) > 0 {
		sourceID["enum"] = sourceIDs
	}
	properties := map[string]any{
		"answer":   map[string]any{"type": "string"},
		"claim":    map[string]any{"type": "string"},
		"sourceId": sourceID,
	}
	required := []string{"answer", "claim", "sourceId"}
	if draft {
		properties["gap"] = map[string]any{"type": "string"}
		properties["warning"] = map[string]any{"type": "string"}
		required = append(required, "gap", "warning")
		for _, field := range []string{"equipment", "category", "title", "description", "impact", "actions", "mitigation", "parts", "assistance", "poc"} {
			if field == "category" {
				properties[field] = map[string]any{"type": "string", "enum": []string{"", "C2", "C3", "C4"}}
			} else {
				properties[field] = map[string]any{"type": "string"}
			}
			required = append(required, field)
		}
	}
	return map[string]any{"type": "object", "additionalProperties": false, "properties": properties, "required": required}
}

func localDraftPrompt(prompt string) bool {
	const marker = "ASSISTANT_INPUT:\n"
	index := strings.Index(prompt, marker)
	if index < 0 {
		return false
	}
	var envelope struct {
		Request struct {
			Mode string `json:"mode"`
		} `json:"request"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(prompt[index+len(marker):])), &envelope); err != nil {
		return false
	}
	return envelope.Request.Mode == "draft"
}

func normalizeLocalResponse(data []byte, draft bool) (string, error) {
	var compact map[string]string
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&compact); err != nil {
		return "", err
	}
	mode := "chat"
	if draft {
		mode = "draft"
	}
	claims := []any{}
	if strings.TrimSpace(compact["claim"]) != "" && strings.TrimSpace(compact["sourceId"]) != "" {
		claims = append(claims, map[string]any{"text": compact["claim"], "sourceIds": []string{compact["sourceId"]}})
	}
	facts := map[string]string{}
	for _, field := range []string{"equipment", "category", "title", "description", "impact", "actions", "mitigation", "parts", "assistance", "poc"} {
		facts[field] = compact[field]
	}
	gaps := []string{}
	warnings := []string{}
	if draft {
		gaps = compactStrings(compact["gap"])
		warnings = compactStrings(compact["warning"])
	}
	result := map[string]any{
		"mode":             mode,
		"answer":           compact["answer"],
		"claims":           claims,
		"gaps":             gaps,
		"nextQuestions":    []string{},
		"facts":            facts,
		"missingEssential": []string{},
		"warnings":         warnings,
	}
	encoded, err := json.Marshal(result)
	return string(encoded), err
}

func compactStrings(value string) []string {
	if strings.TrimSpace(value) == "" {
		return []string{}
	}
	return []string{value}
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
