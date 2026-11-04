package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Record map[string]any

type Database struct {
	SchemaVersion int      `json:"schemaVersion"`
	Source        string   `json:"source,omitempty"`
	ExtractedAt   string   `json:"extractedAt,omitempty"`
	ReferenceTime string   `json:"referenceTime,omitempty"`
	Cases         []Record `json:"cases"`
	Assets        []Record `json:"assets"`
	WorkOrders    []Record `json:"workOrders"`
	Requisitions  []Record `json:"requisitions"`
	PLADTemplates []Record `json:"pladTemplates"`
}

var (
	ErrNotFound = errors.New("record not found")
	ErrConflict = errors.New("record was changed by another request")
	ErrInvalid  = errors.New("invalid record")
)

// Store is a small, file-backed JSON store. It is intentionally dependency-free;
// replace this boundary with a database adapter when multi-instance deployment
// or higher write concurrency is needed.
type Store struct {
	mu   sync.RWMutex
	path string
	db   Database
}

func Open(path, seedPath string) (*Store, error) {
	var data []byte
	var err error
	loadedSeed := false
	if path != "" {
		data, err = os.ReadFile(path)
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read database: %w", err)
	}
	if len(data) == 0 {
		data, err = os.ReadFile(seedPath)
		if err != nil {
			return nil, fmt.Errorf("read seed data: %w", err)
		}
		loadedSeed = true
	}
	var db Database
	if err := json.Unmarshal(data, &db); err != nil {
		return nil, fmt.Errorf("decode database: %w", err)
	}
	if db.SchemaVersion != 1 {
		return nil, fmt.Errorf("unsupported data schema version %d", db.SchemaVersion)
	}
	if db.Cases == nil || db.Assets == nil || db.WorkOrders == nil || db.Requisitions == nil || db.PLADTemplates == nil {
		return nil, errors.New("database is missing one or more resource collections")
	}
	s := &Store{path: path, db: db}
	if path != "" && loadedSeed {
		if err := s.persistLocked(); err != nil {
			return nil, err
		}
	}
	return s, nil
}

func (s *Store) Snapshot() Database {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return clone(s.db)
}

func (s *Store) List(resource string) ([]Record, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	records, err := s.records(resource)
	if err != nil {
		return nil, err
	}
	return cloneRecords(*records), nil
}

func (s *Store) Get(resource, id string) (Record, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	records, err := s.records(resource)
	if err != nil {
		return nil, err
	}
	for _, record := range *records {
		if stringValue(record["id"]) == id {
			return cloneRecord(record), nil
		}
	}
	return nil, ErrNotFound
}

func (s *Store) Create(resource string, input Record) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	records, err := s.records(resource)
	if err != nil {
		return nil, err
	}
	if input == nil {
		return nil, fmt.Errorf("%w: request body must be an object", ErrInvalid)
	}
	record := cloneRecord(input)
	if stringValue(record["id"]) != "" {
		return nil, fmt.Errorf("%w: id is assigned by the server", ErrInvalid)
	}
	stamp := time.Now().UTC().Format(time.RFC3339Nano)
	record["id"] = newID(resource)
	record["createdAt"] = stamp
	record["updatedAt"] = stamp
	setDefaults(resource, record)
	assignNumber(resource, *records, record)
	if err := s.validateLocked(resource, record, ""); err != nil {
		return nil, err
	}
	*records = append(*records, record)
	if err := s.persistLocked(); err != nil {
		return nil, err
	}
	return cloneRecord(record), nil
}

func (s *Store) Update(resource, id string, patch Record, expectedRevision *int) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	records, err := s.records(resource)
	if err != nil {
		return nil, err
	}
	if patch == nil {
		return nil, fmt.Errorf("%w: request body must be an object", ErrInvalid)
	}
	for i, current := range *records {
		if stringValue(current["id"]) != id {
			continue
		}
		if expectedRevision != nil && intValue(current["revision"]) != *expectedRevision {
			return nil, ErrConflict
		}
		next := cloneRecord(current)
		for key, value := range patch {
			if key != "id" && key != "createdAt" && key != "updatedAt" && key != "revision" && key != "expectedRevision" {
				next[key] = value
			}
		}
		next["updatedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
		if resource == "cases" {
			next["revision"] = intValue(current["revision"]) + 1
		}
		if err := s.validateLocked(resource, next, id); err != nil {
			return nil, err
		}
		(*records)[i] = next
		if err := s.persistLocked(); err != nil {
			return nil, err
		}
		return cloneRecord(next), nil
	}
	return nil, ErrNotFound
}

func (s *Store) Delete(resource, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	records, err := s.records(resource)
	if err != nil {
		return err
	}
	for i, record := range *records {
		if stringValue(record["id"]) == id {
			*records = append((*records)[:i], (*records)[i+1:]...)
			return s.persistLocked()
		}
	}
	return ErrNotFound
}

func (s *Store) records(resource string) (*[]Record, error) {
	switch resource {
	case "cases":
		return &s.db.Cases, nil
	case "assets":
		return &s.db.Assets, nil
	case "work-orders":
		return &s.db.WorkOrders, nil
	case "requisitions":
		return &s.db.Requisitions, nil
	case "plad-templates":
		return &s.db.PLADTemplates, nil
	default:
		return nil, fmt.Errorf("%w: unknown resource %q", ErrInvalid, resource)
	}
}

func (s *Store) validateLocked(resource string, record Record, existingID string) error {
	if stringValue(record["id"]) == "" {
		return fmt.Errorf("%w: id is required", ErrInvalid)
	}
	switch resource {
	case "cases":
		if title := stringValue(record["title"]); title == "" {
			return fmt.Errorf("%w: title is required", ErrInvalid)
		}
		if category := stringValue(record["category"]); category != "" && !contains([]string{"C1", "C2", "C3", "C4"}, category) {
			return fmt.Errorf("%w: category must be C1, C2, C3, or C4", ErrInvalid)
		}
	case "assets":
		if stringValue(record["name"]) == "" {
			return fmt.Errorf("%w: name is required", ErrInvalid)
		}
	case "work-orders":
		if stringValue(record["title"]) == "" || stringValue(record["assetId"]) == "" {
			return fmt.Errorf("%w: title and assetId are required", ErrInvalid)
		}
		if !s.existsLocked("assets", stringValue(record["assetId"])) {
			return fmt.Errorf("%w: assetId does not exist", ErrInvalid)
		}
		if status := stringValue(record["status"]); status != "" && !contains([]string{"Open", "In progress", "Awaiting parts", "Complete"}, status) {
			return fmt.Errorf("%w: invalid work-order status", ErrInvalid)
		}
	case "requisitions":
		if stringValue(record["part"]) == "" || stringValue(record["assetId"]) == "" {
			return fmt.Errorf("%w: part and assetId are required", ErrInvalid)
		}
		if !s.existsLocked("assets", stringValue(record["assetId"])) {
			return fmt.Errorf("%w: assetId does not exist", ErrInvalid)
		}
		if quantity, ok := numberValue(record["quantity"]); ok && quantity < 1 {
			return fmt.Errorf("%w: quantity must be positive", ErrInvalid)
		}
	case "plad-templates":
		if stringValue(record["name"]) == "" || stringValue(record["recipients"]) == "" {
			return fmt.Errorf("%w: name and recipients are required", ErrInvalid)
		}
	}
	if caseID := stringValue(record["casrepId"]); caseID != "" && !s.existsLocked("cases", caseID) {
		return fmt.Errorf("%w: casrepId does not exist", ErrInvalid)
	}
	return nil
}

func (s *Store) existsLocked(resource, id string) bool {
	records, _ := s.records(resource)
	for _, record := range *records {
		if stringValue(record["id"]) == id {
			return true
		}
	}
	return false
}

func assignNumber(resource string, records []Record, record Record) {
	if stringValue(record["number"]) != "" {
		return
	}
	prefix := ""
	switch resource {
	case "cases":
		prefix = "DEMO-26-"
	case "work-orders":
		prefix = "WO-DEMO-"
	case "requisitions":
		prefix = "W-DEMO-"
	default:
		return
	}
	highest := 0
	for _, current := range records {
		tail := strings.TrimPrefix(stringValue(current["number"]), prefix)
		n, err := strconv.Atoi(tail)
		if err == nil && n > highest {
			highest = n
		}
	}
	record["number"] = prefix + fmt.Sprintf("%03d", highest+1)
}

func setDefaults(resource string, record Record) {
	switch resource {
	case "cases":
		if stringValue(record["stage"]) == "" {
			record["stage"] = "Draft"
		}
		if stringValue(record["caseStatus"]) == "" {
			record["caseStatus"] = "Active"
		}
		if intValue(record["revision"]) == 0 {
			record["revision"] = 1
		}
	case "work-orders":
		if stringValue(record["status"]) == "" {
			record["status"] = "Open"
		}
		if stringValue(record["priority"]) == "" {
			record["priority"] = "P2"
		}
	case "requisitions":
		if stringValue(record["status"]) == "" {
			record["status"] = "Requested"
		}
		if _, ok := numberValue(record["quantity"]); !ok {
			record["quantity"] = 1
		}
	}
}

func (s *Store) persistLocked() error {
	if s.path == "" {
		return nil
	}
	data, err := json.MarshalIndent(s.db, "", "  ")
	if err != nil {
		return fmt.Errorf("encode database: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0755); err != nil {
		return fmt.Errorf("create database directory: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".anchor-management-*.json")
	if err != nil {
		return fmt.Errorf("create database temp file: %w", err)
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err = tmp.Write(data); err == nil {
		err = tmp.Chmod(0644)
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("write database: %w", err)
	}
	if err := os.Rename(name, s.path); err != nil {
		return fmt.Errorf("replace database: %w", err)
	}
	return nil
}

func newID(resource string) string {
	prefix := strings.TrimSuffix(resource, "s")
	if resource == "work-orders" {
		prefix = "work"
	}
	if resource == "plad-templates" {
		prefix = "plad"
	}
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err == nil {
		return prefix + "-" + hex.EncodeToString(buf)
	}
	return prefix + "-" + strconv.FormatInt(time.Now().UnixNano(), 36)
}

func clone[T any](value T) T {
	data, _ := json.Marshal(value)
	var result T
	_ = json.Unmarshal(data, &result)
	return result
}
func cloneRecord(value Record) Record      { return clone(value) }
func cloneRecords(value []Record) []Record { return clone(value) }
func stringValue(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}
func intValue(value any) int { n, _ := numberValue(value); return int(n) }
func numberValue(value any) (float64, bool) {
	switch n := value.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		v, err := n.Float64()
		return v, err == nil
	default:
		return 0, false
	}
}
func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
