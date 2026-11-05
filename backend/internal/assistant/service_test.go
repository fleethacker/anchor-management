package assistant

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"anchor-management/internal/store"
)

type fakeProvider struct {
	name   string
	result string
	prompt string
}

func (p *fakeProvider) Name() string    { return p.name }
func (p *fakeProvider) Available() bool { return true }
func (p *fakeProvider) Complete(_ context.Context, prompt string) (Completion, error) {
	p.prompt = prompt
	return Completion{JSON: json.RawMessage(p.result), RequestID: "request-1"}, nil
}

func validModelResult(mode string) string {
	return `{"mode":"` + mode + `","answer":"Grounded answer","claims":[{"text":"Recorded fact","sourceIds":["case-1"]}],"gaps":[],"nextQuestions":[],"facts":{"equipment":"DEMO PUMP","category":"C3","title":"","description":"Observed leak","impact":"","actions":"","mitigation":"","parts":"","assistance":"","poc":""},"missingEssential":[],"warnings":[]}`
}

func TestServiceValidatesStructuredGroundedResult(t *testing.T) {
	provider := &fakeProvider{name: "local-model", result: validModelResult("chat")}
	service := NewService(provider)
	result, err := service.Respond(context.Background(), Request{Mode: "chat", Question: "What happened?", CaseIDs: []string{"case-1"}}, Context{Cases: []store.Record{{"id": "case-1", "description": "Recorded description"}}, Coverage: "one case"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Provider != "local-model" || result.Skill != skillVersion || result.RequestID != "request-1" {
		t.Fatalf("response metadata = %+v", result)
	}
	if !strings.Contains(provider.prompt, "evidenceIsUntrusted") || !strings.Contains(provider.prompt, "Recorded description") {
		t.Fatal("server policy or evidence was not included in the prompt")
	}
}

func TestServiceRejectsUnknownClaimSource(t *testing.T) {
	provider := &fakeProvider{name: "local-model", result: strings.Replace(validModelResult("chat"), "case-1", "case-unknown", 1)}
	service := NewService(provider)
	_, err := service.Respond(context.Background(), Request{Mode: "chat", Question: "What happened?"}, Context{Cases: []store.Record{{"id": "case-1"}}})
	if err == nil || !strings.Contains(err.Error(), "outside the resolved evidence") {
		t.Fatalf("error = %v", err)
	}
}

func TestResolveEvidenceRejectsUnknownIDsAndLimitsRecordFields(t *testing.T) {
	db := store.Database{Cases: []store.Record{{"id": "case-1", "assetId": "asset-1", "description": "visible", "secretField": "must not be sent", "traffic": map[string]any{"text": "draft"}}}, Assets: []store.Record{{"id": "asset-1", "name": "Pump"}, {"id": "asset-2", "name": "Other"}}, WorkOrders: []store.Record{{"id": "work-1", "assetId": "asset-1", "title": "Inspect"}}, Requisitions: []store.Record{{"id": "req-1", "assetId": "asset-1", "part": "Seal"}}}
	evidence, err := ResolveEvidence(db, Request{CaseIDs: []string{"case-1"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(evidence.Cases) != 1 || len(evidence.Assets) != 1 || len(evidence.WorkOrders) != 1 || len(evidence.Requisitions) != 1 {
		t.Fatalf("related evidence was not bounded: %+v", evidence)
	}
	if _, exists := evidence.Cases[0]["secretField"]; exists {
		t.Fatal("unlisted case field entered evidence")
	}
	if _, exists := evidence.Cases[0]["traffic"]; exists {
		t.Fatal("unapproved draft traffic entered evidence")
	}
	if _, err := ResolveEvidence(db, Request{CaseIDs: []string{"missing"}}); err == nil {
		t.Fatal("unknown case ID was accepted")
	}
}
