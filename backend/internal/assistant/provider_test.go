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
		if body["model"] != "test-model" || body["store"] != false || body["max_output_tokens"] != float64(1200) {
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

func TestLocalResponseRejectsMalformedCompactOutput(t *testing.T) {
	for _, output := range []string{
		`{}`,
		`{"answer":" ","claim":"","sourceId":""}`,
		`{"answer":"Reported condition","claim":"Uncited fact","sourceId":""}`,
		`{"answer":"Reported condition","claim":"","sourceId":"case-1"}`,
		`{"answer":"Reported condition","claim":"","sourceId":"","traffic":"injected"}`,
		`{"answer":"Reported condition","claim":"","sourceId":""} {}`,
	} {
		if _, err := normalizeLocalResponse([]byte(output), false); err == nil {
			t.Errorf("accepted malformed compact response: %s", output)
		}
	}
}

func TestLocalProviderUsesConstrainedSchemaAndNormalizesRealProtocol(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		params := body["extra_params"].(map[string]any)
		input := body["input"].([]any)
		if len(input) != 2 || input[0].(map[string]any)["role"] != "system" || input[1].(map[string]any)["role"] != "user" || !strings.Contains(input[1].(map[string]any)["content"].(string), "case-1") {
			t.Fatalf("local prompt roles/evidence = %v", input)
		}
		format := params["response_format"].(map[string]any)
		schema := format["schema"].(map[string]any)
		ids := schema["properties"].(map[string]any)["sourceId"].(map[string]any)["enum"].([]any)
		if body["store"] != false || body["max_output_tokens"] != float64(600) || format["type"] != "json_object" || len(ids) != 2 || ids[1] != "case-1" {
			t.Fatalf("local provider contract = %v", body)
		}
		_, _ = w.Write([]byte(`{"output":[{"content":[{"type":"output_text","text":"{\"answer\":\"A leak is reported.\",\"claim\":\"A leak is reported.\",\"sourceId\":\"case-1\"}"}]}]}`))
	}))
	defer server.Close()
	provider := NewLocalProvider(server.URL, "test-key", "smollm2", server.Client())
	result, err := provider.Complete(context.Background(), "ASSISTANT_INPUT:\n"+`{"request":{"mode":"chat"},"evidence":{"cases":[{"id":"case-1"}]}}`)
	if err != nil {
		t.Fatal(err)
	}
	var response Response
	if err := json.Unmarshal(result.JSON, &response); err != nil {
		t.Fatal(err)
	}
	if response.Mode != "chat" || response.Answer != "A leak is reported." || len(response.Claims) != 1 || response.Claims[0].SourceIDs[0] != "case-1" || result.RequestID == "" {
		t.Fatalf("normalized response = %+v", response)
	}
}
