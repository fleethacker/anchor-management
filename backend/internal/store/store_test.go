package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	seed := filepath.Join(dir, "seed.json")
	data, err := json.Marshal(Database{
		SchemaVersion: 1,
		Cases:         []Record{{"id": "case-1", "title": "Example", "revision": 1}},
		Assets:        []Record{{"id": "asset-1", "name": "Pump"}},
		WorkOrders:    []Record{}, Requisitions: []Record{}, PLADTemplates: []Record{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(seed, data, 0600); err != nil {
		t.Fatal(err)
	}
	s, err := Open(filepath.Join(dir, "db.json"), seed)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestCRUDAndRevisionConflict(t *testing.T) {
	s := testStore(t)
	created, err := s.Create("work-orders", Record{"title": "Inspect pump", "assetId": "asset-1"})
	if err != nil {
		t.Fatal(err)
	}
	if created["status"] != "Open" {
		t.Fatalf("default status = %v", created["status"])
	}
	if created["number"] != "WO-DEMO-001" {
		t.Fatalf("number = %v", created["number"])
	}
	wrong := 9
	_, err = s.Update("work-orders", created["id"].(string), Record{"status": "Complete"}, &wrong)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	updated, err := s.Update("work-orders", created["id"].(string), Record{"status": "Complete"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if updated["status"] != "Complete" {
		t.Fatalf("status = %v", updated["status"])
	}
	if err := s.Delete("work-orders", created["id"].(string)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get("work-orders", created["id"].(string)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestReferenceValidation(t *testing.T) {
	s := testStore(t)
	_, err := s.Create("work-orders", Record{"title": "Bad link", "assetId": "missing"})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected invalid reference, got %v", err)
	}
	_, err = s.Create("plad-templates", Record{"name": "Action", "recipients": "DEMO ACTION"})
	if err != nil {
		t.Fatal(err)
	}
}
