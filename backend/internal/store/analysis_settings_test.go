package store

import (
	"errors"
	"reflect"
	"testing"
)

func analysisSetting() Record {
	return Record{"name": "analysis-areas", "areas": []any{map[string]any{"id": "custom-navigation", "name": "Navigation"}}, "caseDepartments": map[string]any{"case-1": "custom-navigation"}, "assetDepartments": map[string]any{}}
}

func TestAnalysisSettingsPersistAlongsideSchedule(t *testing.T) {
	s := testStore(t)
	before, _ := s.List("cases")
	if _, err := s.Create("command-settings", Record{"name": "ship-schedule", "text": "QA port visit"}); err != nil {
		t.Fatal(err)
	}
	setting, err := s.Create("command-settings", analysisSetting())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Create("command-settings", analysisSetting()); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate singleton: %v", err)
	}
	id := stringValue(setting["id"])
	revision := intValue(setting["revision"])
	if _, err = s.Update("command-settings", id, Record{"caseDepartments": map[string]any{"case-1": "deck"}}, nil); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unguarded update: %v", err)
	}
	saved, err := s.Update("command-settings", id, Record{"caseDepartments": map[string]any{"case-1": "deck"}}, &revision)
	if err != nil || intValue(saved["revision"]) != revision+1 {
		t.Fatalf("guarded update: %v %v", saved, err)
	}
	if _, err = s.Update("command-settings", id, Record{"caseDepartments": map[string]any{}}, &revision); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale edit: %v", err)
	}
	loaded, err := Open(s.path, "")
	if err != nil {
		t.Fatal(err)
	}
	rows, _ := loaded.List("command-settings")
	if len(rows) != 2 {
		t.Fatalf("settings lost: %v", rows)
	}
	after, _ := loaded.List("cases")
	if !reflect.DeepEqual(before, after) {
		t.Fatal("analysis settings changed case records")
	}
}

func TestInvalidAnalysisSettingsLeaveStorageIntact(t *testing.T) {
	for _, change := range []Record{
		{"areas": []any{map[string]any{"id": "deck", "name": "Other"}}},
		{"areas": []any{map[string]any{"id": "custom-one", "name": "Engineering"}}},
		{"areas": []any{map[string]any{"id": "__proto__", "name": "Other"}}},
		{"areas": []any{map[string]any{"id": "custom-one", "name": "Other", "extra": true}}},
		{"caseDepartments": map[string]any{"case-1": "missing"}},
	} {
		s := testStore(t)
		input := analysisSetting()
		for k, v := range change {
			input[k] = v
		}
		if _, err := s.Create("command-settings", input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid settings %v: %v", change, err)
		}
		rows, _ := s.List("command-settings")
		if len(rows) != 0 {
			t.Fatal("invalid settings persisted")
		}
	}
}

func TestRequisitionRevisionProtectsComments(t *testing.T) {
	s := testStore(t)
	req, err := s.Create("requisitions", Record{"part": "QA seal", "assetId": "asset-1", "quantity": 1, "notes": "Original"})
	if err != nil {
		t.Fatal(err)
	}
	revision := intValue(req["revision"])
	id := stringValue(req["id"])
	if _, err = s.Update("requisitions", id, Record{"notes": "Original\nFirst comment"}, &revision); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Update("requisitions", id, Record{"notes": "Stale overwrite"}, &revision); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale comment accepted: %v", err)
	}
	saved, _ := s.Get("requisitions", id)
	if saved["notes"] != "Original\nFirst comment" {
		t.Fatal("saved notes overwritten")
	}
}
