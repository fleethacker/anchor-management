package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAIProviderSendsServerOwnedRequestAndParsesOutput(t *testing.T) {
	var authorization, clientRequestID string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		clientRequestID = r.Header.Get("X-Client-Request-Id")
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["model"] != "test-model" || body["store"] != false {
			t.Fatalf("provider request configuration = %v", body)
		}
		text := body["text"].(map[string]any)
		format := text["format"].(map[string]any)
		if format["type"] != "json_schema" || format["strict"] != true {
			t.Fatalf("provider request is not strict structured output: %v", format)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output":[{"content":[{"type":"output_text","text":"{\"mode\":\"chat\",\"answer\":\"grounded\"}"}]}]}`))
	}))
	defer server.Close()
	provider := NewOpenAIProvider(server.URL, "secret", "test-model", "local-model", server.Client())
	result, err := provider.Complete(context.Background(), "prompt")
	if err != nil {
		t.Fatal(err)
	}
	if string(result.JSON) != `{"mode":"chat","answer":"grounded"}` {
		t.Fatalf("JSON = %s", result.JSON)
	}
	if authorization != "Bearer secret" || strings.TrimSpace(clientRequestID) == "" {
		t.Fatalf("provider authentication/request id missing: %q %q", authorization, clientRequestID)
	}
}

func TestUnavailableProviderDoesNotCallNetwork(t *testing.T) {
	provider := NewOpenAIProvider("", "", "", "none", nil)
	if provider.Available() {
		t.Fatal("unconfigured provider reported available")
	}
	if _, err := provider.Complete(context.Background(), "prompt"); err != ErrUnavailable {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}
