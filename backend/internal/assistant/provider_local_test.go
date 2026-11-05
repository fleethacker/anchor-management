package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLocalProviderUsesLlamaResponseSchemaAndNormalizes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if _, exists := body["text"]; exists {
			t.Fatal("local provider sent the OpenAI text.format shape")
		}
		extra := body["extra_params"].(map[string]any)
		format := extra["response_format"].(map[string]any)
		if format["type"] != "json_object" {
			t.Fatalf("local response format = %v", format)
		}
		schema := format["schema"].(map[string]any)
		if schema["additionalProperties"] != false {
			t.Fatalf("local schema is not closed: %v", schema)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output_text":"{\"answer\":\"Grounded\",\"claim\":\"Recorded\",\"sourceId\":\"case-1\",\"gap\":\"\",\"warning\":\"\"}"}`))
	}))
	defer server.Close()
	provider := NewLocalProvider(server.URL, "secret", "smollm2", server.Client())
	result, err := provider.Complete(context.Background(), "ASSISTANT_INPUT:\n{\"request\":{\"mode\":\"chat\"}}")
	if err != nil {
		t.Fatal(err)
	}
	var normalized map[string]any
	if err := json.Unmarshal(result.JSON, &normalized); err != nil {
		t.Fatal(err)
	}
	if normalized["mode"] != "chat" || normalized["answer"] != "Grounded" {
		t.Fatalf("normalized response = %s", result.JSON)
	}
	claims := normalized["claims"].([]any)
	if len(claims) != 1 || !strings.Contains(string(result.JSON), "case-1") {
		t.Fatalf("normalized claims = %s", result.JSON)
	}
}

func TestLocalProviderNormalizesDraftMode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output_text":"{\"answer\":\"Draft\",\"claim\":\"\",\"sourceId\":\"\",\"gap\":\"\",\"warning\":\"\",\"equipment\":\"PUMP\",\"category\":\"C3\",\"title\":\"Leak\",\"description\":\"Leak observed\",\"impact\":\"Reduced\",\"actions\":\"Inspect\",\"mitigation\":\"Backup\",\"parts\":\"Seal\",\"assistance\":\"None\",\"poc\":\"Watch\"}"}`))
	}))
	defer server.Close()
	provider := NewLocalProvider(server.URL, "", "smollm2", server.Client())
	result, err := provider.Complete(context.Background(), "ASSISTANT_INPUT:\n{\"request\":{\"mode\":\"draft\"}}")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(result.JSON), `"mode":"draft"`) || !strings.Contains(string(result.JSON), `"category":"C3"`) {
		t.Fatalf("normalized draft = %s", result.JSON)
	}
}
