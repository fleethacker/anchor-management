package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestCaseHistoryRejectsMalformedIncomingMetadata(t *testing.T) {
	history := func(entry any) Record { return Record{"documentHistory": []any{entry}} }
	review := func(key string, value any) Record {
		return Record{"documentReview": map[string]any{key: value}}
	}
	snapshot := func(key string, value any) Record {
		return review("snapshots", []any{map[string]any{"revision": 1, key: value}})
	}
	comment := func(key string, value any) Record {
		return review("comments", []any{map[string]any{"revision": 1, key: value}})
	}
	tests := []struct {
		name  string
		input Record
	}{
		{"history string", Record{"documentHistory": "history"}},
		{"history object", Record{"documentHistory": map[string]any{}}},
		{"history null", Record{"documentHistory": nil}},
		{"history null entry", history(nil)},
		{"history scalar entry", history("saved")},
		{"history array entry", history([]any{})},
		{"revision string", history(map[string]any{"revision": "1"})},
		{"revision HTML", history(map[string]any{"revision": `<img src=x onerror="window.historyXSS=true">`})},
		{"revision null", history(map[string]any{"revision": nil})},
		{"revision negative", history(map[string]any{"revision": -1})},
		{"revision fractional", history(map[string]any{"revision": 1.5})},
		{"revision unsafe integer", history(map[string]any{"revision": 9007199254740992.0})},
		{"history text object", history(map[string]any{"revision": 1, "text": map[string]any{}})},
		{"review array", Record{"documentReview": []any{}}},
		{"review null", Record{"documentReview": nil}},
		{"review string", Record{"documentReview": "review"}},
		{"snapshot collection object", review("snapshots", map[string]any{})},
		{"snapshot null entry", review("snapshots", []any{nil})},
		{"snapshot revision HTML", snapshot("revision", "<svg onload=alert(1)>")},
		{"comments collection string", review("comments", "comments")},
		{"comment array entry", review("comments", []any{[]any{}})},
		{"comment revision string", comment("revision", "3")},
		{"comment replies object", comment("replies", map[string]any{})},
		{"comment reply null", comment("replies", []any{nil})},
		{"comment reply text array", comment("replies", []any{map[string]any{"text": []any{}}})},
		{"comment start negative", comment("start", -1)},
		{"comment end fractional", comment("end", 1.5)},
		{"comment resolved string", comment("resolved", "false")},
		{"acknowledgements collection null", review("acknowledgements", nil)},
		{"acknowledgement scalar entry", review("acknowledgements", []any{true})},
		{"acknowledgement revision string", review("acknowledgements", []any{map[string]any{"revision": "1"}})},
		{"active snapshot object", review("activeSnapshotId", map[string]any{})},
		{"schema version string", review("schemaVersion", "1")},
		{"assignments collection object", snapshot("assignments", map[string]any{})},
		{"assignment scalar entry", snapshot("assignments", []any{"demo-divo"})},
		{"assignment label object", snapshot("assignments", []any{map[string]any{"label": map[string]any{}}})},
		{"recipients collection object", snapshot("recipients", map[string]any{})},
		{"recipient null entry", snapshot("recipients", []any{nil})},
		{"recipient snapshots collection object", snapshot("recipientSnapshots", map[string]any{})},
		{"recipient snapshot null entry", snapshot("recipientSnapshots", []any{nil})},
		{"resulting recipients collection object", snapshot("recipientSnapshots", []any{map[string]any{"resultingRecipients": map[string]any{}}})},
		{"template array", snapshot("template", []any{})},
		{"template version string", snapshot("template", map[string]any{"version": "1"})},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, operation := range []string{"create", "update"} {
				t.Run(operation, func(t *testing.T) {
					s := testStore(t)
					before := s.Snapshot()
					diskBefore, err := os.ReadFile(s.path)
					if err != nil {
						t.Fatal(err)
					}
					input := cloneRecord(tt.input)
					input["title"] = "Fictional rejected import"
					if operation == "create" {
						_, err = s.Create("cases", input)
					} else {
						_, err = s.Update("cases", "case-1", input, nil)
					}
					if !errors.Is(err, ErrInvalid) {
						t.Fatalf("expected ErrInvalid, got %v", err)
					}
					if !reflect.DeepEqual(before, s.Snapshot()) {
						t.Fatal("rejected metadata changed in-memory records")
					}
					diskAfter, err := os.ReadFile(s.path)
					if err != nil || !bytes.Equal(diskBefore, diskAfter) {
						t.Fatalf("rejected metadata changed persisted bytes: %v", err)
					}
				})
			}
		})
	}
}

func TestCaseHistoryAcceptsSeedAndGeneratedWorkflowMetadata(t *testing.T) {
	seed, err := Open("", "../../data/seed.json")
	if err != nil {
		t.Fatal(err)
	}
	s := testStore(t)
	seedTarget := &Store{db: Database{}}
	// Current seeds predate document history. All seeded case shapes must still
	// be accepted; generated workflow records below exercise populated metadata.
	for _, record := range seed.Snapshot().Cases {
		delete(record, "id")
		if _, err := seedTarget.Create("cases", record); err != nil {
			t.Fatalf("seed %v rejected: %v", record["number"], err)
		}
	}
	source, err := seed.Get("cases", "demo-006")
	if err != nil {
		t.Fatal(err)
	}
	traffic := source["traffic"].(map[string]any)
	traffic["recipientSnapshots"] = []any{map[string]any{
		"templateId": "fictional-plad", "templateName": "Fictional recipients", "templateVersion": "2026-11-05T12:00:00Z",
		"appliedAt": "2026-11-05T12:00:00Z", "category": "TO", "mode": "replace", "sourceAddresses": "DEMO ACTION RECIPIENT",
		"resultingRecipients": []any{map[string]any{"category": "TO", "address": "DEMO ACTION RECIPIENT"}},
	}}
	run := NewModelRunner("node", "../../scripts/casrep-workflow.cjs", "../../../index.html")
	record, err := s.CaseAction(context.Background(), run, "", "save", Record{"traffic": traffic})
	if err != nil {
		t.Fatal(err)
	}
	for _, step := range []struct {
		action  string
		payload Record
	}{
		{"submit", Record{"actorId": "originator"}},
		{"comment-add", Record{"reviewerId": "demo-divo", "start": 0, "end": 10, "text": "Fictional review comment"}},
		{"comment-reply", Record{"reviewerId": "originator", "text": "Fictional reply"}},
		{"concur", Record{"reviewerId": "demo-divo", "reviewId": "divo"}},
	} {
		step.payload["expectedRevision"] = record["revision"]
		if step.action == "comment-reply" {
			review := record["documentReview"].(map[string]any)
			step.payload["commentId"] = review["comments"].([]any)[0].(map[string]any)["id"]
		}
		record, err = s.CaseAction(context.Background(), run, record["id"].(string), step.action, step.payload)
		if err != nil {
			t.Fatalf("generate %s metadata: %v", step.action, err)
		}
	}
	input := Record{
		"title": "Fictional metadata roundtrip", "documentHistory": record["documentHistory"], "documentReview": record["documentReview"],
		"extension": map[string]any{"future": []any{nil, "retained", map[string]any{"revision": "not a history revision"}}},
	}
	input["documentReview"].(map[string]any)["futureMetadata"] = map[string]any{"values": []any{1, "retained"}}
	created, err := s.Create("cases", input)
	if err != nil {
		t.Fatalf("generated metadata create: %v", err)
	}
	updated, err := s.Update("cases", created["id"].(string), input, nil)
	if err != nil {
		t.Fatalf("generated metadata update: %v", err)
	}
	reloaded, err := Open(s.path, "")
	if err != nil {
		t.Fatal(err)
	}
	persisted, err := reloaded.Get("cases", updated["id"].(string))
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"documentHistory", "documentReview", "extension"} {
		if !reflect.DeepEqual(cloneRecord(input)[key], persisted[key]) {
			t.Fatalf("%s was not preserved through generic writes and reload", key)
		}
	}
}

func TestCaseHistoryPreservesUntouchedLegacyMetadata(t *testing.T) {
	for _, supplied := range []string{"neither", "documentHistory", "documentReview"} {
		t.Run(supplied, func(t *testing.T) {
			s := testStore(t)
			legacy := Record{
				"documentHistory": []any{nil, map[string]any{"revision": "<img src=x onerror=alert(1)>"}},
				"documentReview":  map[string]any{"snapshots": "legacy malformed snapshots"},
			}
			for key, value := range legacy {
				s.db.Cases[0][key] = value
			}
			if err := s.persistLocked(); err != nil {
				t.Fatal(err)
			}
			reopened, err := Open(s.path, "")
			if err != nil {
				t.Fatal(err)
			}
			patch := Record{"title": "Fictional unrelated edit"}
			if supplied == "documentHistory" {
				patch[supplied] = []any{}
			} else if supplied == "documentReview" {
				patch[supplied] = map[string]any{"schemaVersion": 1, "activeSnapshotId": nil, "snapshots": []any{}, "comments": []any{}, "acknowledgements": []any{}}
			}
			updated, err := reopened.Update("cases", "case-1", patch, nil)
			if err != nil {
				t.Fatalf("untouched legacy metadata blocked an edit: %v", err)
			}
			for key, value := range legacy {
				if key != supplied && !reflect.DeepEqual(value, updated[key]) {
					t.Fatalf("untouched legacy %s was changed", key)
				}
			}
		})
	}
}

func TestCaseHistoryMetadataBoundMatchesRequestBudget(t *testing.T) {
	s := testStore(t)
	before := s.Snapshot()
	input := Record{"title": "Fictional oversized history", "documentHistory": []any{map[string]any{"revision": 1, "text": strings.Repeat("x", 4<<20)}}}
	if _, err := s.Create("cases", input); !errors.Is(err, ErrInvalid) {
		t.Fatalf("oversized metadata accepted: %v", err)
	}
	if !reflect.DeepEqual(before, s.Snapshot()) {
		t.Fatal("oversized metadata changed state")
	}
	// Long histories use the existing aggregate request budget, without an
	// arbitrary per-entry text cap or a history-retention count cap.
	input["documentHistory"] = []any{map[string]any{"revision": 0, "text": strings.Repeat("x", 128<<10)}}
	input["documentReview"] = map[string]any{"activeSnapshotId": nil, "snapshots": []any{}, "comments": []any{}, "acknowledgements": []any{}}
	data, err := json.Marshal(input)
	if err != nil || len(data) >= 4<<20 {
		t.Fatal("test fixture exceeds the existing request budget")
	}
	if _, err := s.Create("cases", input); err != nil {
		t.Fatalf("bounded metadata rejected: %v", err)
	}
}
