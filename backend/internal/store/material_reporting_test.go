package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestRequisitionChangesPersistReportingMetadata(t *testing.T) {
	s := testStore(t)
	_, err := s.Update("cases", "case-1", Record{"caseStatus": "Active", "nextUpdateAt": "2030-01-01T00:00:00Z"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	first, err := s.Create("requisitions", Record{"part": "Seal", "assetId": "asset-1", "casrepId": "case-1"})
	if err != nil {
		t.Fatal(err)
	}
	id := first["id"].(string)
	caseBefore, _ := s.Get("cases", "case-1")
	_, err = s.Update("requisitions", id, Record{"status": "Received"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	changed, _ := s.Get("cases", "case-1")
	changes := changed["materialChanges"].([]any)
	if len(changes) != 1 || changes[0].(map[string]any)["requisitionId"] != id {
		t.Fatalf("expected one current notice for the requisition, got %v", changes)
	}
	if changed["revision"] != caseBefore["revision"] || changed["nextUpdateAt"] != caseBefore["nextUpdateAt"] {
		t.Fatal("material metadata must not change the message revision or submission deadline")
	}
	_, err = s.Update("requisitions", id, Record{"owner": "EXERCISE SUPPLY", "notes": "Administrative note"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	afterNote, _ := s.Get("cases", "case-1")
	if !reflect.DeepEqual(changed, afterNote) {
		t.Fatal("administrative notes should not create another reporting event")
	}
	_, err = s.Create("requisitions", Record{"part": "Bearing", "assetId": "asset-1", "casrepId": "case-1"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Delete("requisitions", id); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(s.path, "")
	if err != nil {
		t.Fatal(err)
	}
	saved, _ := reopened.Get("cases", "case-1")
	if len(saved["materialChanges"].([]any)) != 2 || len(saved["events"].([]any)) != 4 {
		t.Fatalf("expected two material notices and four audit events, got %v", saved)
	}
}

func TestFailedWritesRollBackAllCollections(t *testing.T) {
	for _, action := range []string{"create", "update", "delete"} {
		t.Run(action, func(t *testing.T) {
			s := testStore(t)
			if _, err := s.Update("cases", "case-1", Record{"caseStatus": "Active"}, nil); err != nil {
				t.Fatal(err)
			}
			req, err := s.Create("requisitions", Record{"part": "Seal", "assetId": "asset-1", "casrepId": "case-1"})
			if err != nil {
				t.Fatal(err)
			}
			before, _ := json.Marshal(s.db)
			// An existing directory makes the final rename fail after the temporary write.
			s.path = filepath.Join(t.TempDir(), "not-a-file")
			if err := os.Mkdir(s.path, 0700); err != nil {
				t.Fatal(err)
			}
			switch action {
			case "create":
				_, err = s.Create("requisitions", Record{"part": "Bearing", "assetId": "asset-1", "casrepId": "case-1"})
			case "update":
				_, err = s.Update("requisitions", req["id"].(string), Record{"status": "Received"}, nil)
			case "delete":
				err = s.Delete("requisitions", req["id"].(string))
			}
			if err == nil {
				t.Fatal("expected persistence failure")
			}
			after, _ := json.Marshal(s.db)
			if string(before) != string(after) {
				t.Fatal("failed write changed the in-memory database")
			}
		})
	}
}
