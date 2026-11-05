package store

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Record map[string]any

type Database struct {
	SchemaVersion   int      `json:"schemaVersion"`
	Source          string   `json:"source,omitempty"`
	ExtractedAt     string   `json:"extractedAt,omitempty"`
	ReferenceTime   string   `json:"referenceTime,omitempty"`
	Cases           []Record `json:"cases"`
	Assets          []Record `json:"assets"`
	WorkOrders      []Record `json:"workOrders"`
	Requisitions    []Record `json:"requisitions"`
	PLADTemplates   []Record `json:"pladTemplates"`
	CommandSettings []Record `json:"commandSettings"`
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
		// #nosec G304 -- the database path is trusted startup configuration, not request data.
		data, err = os.ReadFile(path)
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read database: %w", err)
	}
	if len(data) == 0 {
		// #nosec G304 -- the seed path is trusted startup configuration, not request data.
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
	if db.CommandSettings == nil {
		db.CommandSettings = []Record{}
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
	if resource == "cases" {
		if err := validateCaseHistoryInput(input); err != nil {
			return nil, err
		}
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
	previous := clone(s.db)
	*records = append(*records, record)
	if resource == "requisitions" {
		s.materialChangedLocked(nil, record)
	}
	if err := s.persistLocked(); err != nil {
		s.db = previous
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
		if resource == "cases" {
			if err := validateCaseHistoryInput(patch); err != nil {
				return nil, err
			}
		}
		if resource == "command-settings" {
			if name, ok := patch["name"]; ok && stringValue(name) != stringValue(current["name"]) {
				return nil, fmt.Errorf("%w: setting name cannot change", ErrInvalid)
			}
			if stringValue(current["name"]) == "analysis-areas" && expectedRevision == nil {
				return nil, fmt.Errorf("%w: expectedRevision is required", ErrInvalid)
			}
		}
		next := cloneRecord(current)
		for key, value := range patch {
			if key != "id" && key != "createdAt" && key != "updatedAt" && key != "revision" && key != "expectedRevision" {
				next[key] = value
			}
		}
		next["updatedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
		if resource == "cases" || resource == "command-settings" || resource == "requisitions" {
			next["revision"] = intValue(current["revision"]) + 1
		}
		if err := s.validateLocked(resource, next, id); err != nil {
			return nil, err
		}
		previous := clone(s.db)
		(*records)[i] = next
		if resource == "requisitions" {
			s.materialChangedLocked(current, next)
		}
		if err := s.persistLocked(); err != nil {
			s.db = previous
			return nil, err
		}
		return cloneRecord(next), nil
	}
	return nil, ErrNotFound
}

// Validate only metadata supplied to generic writes. Existing databases and
// unrelated edits may contain legacy malformed history; do not normalize or
// rewrite that evidence. Dedicated workflow commands produce their own shapes.
func validateCaseHistoryInput(input Record) error {
	metadata := Record{}
	for _, key := range []string{"documentHistory", "documentReview"} {
		if value, supplied := input[key]; supplied {
			metadata[key] = value
		}
	}
	if len(metadata) == 0 {
		return nil
	}
	// Use the existing HTTP request budget for the combined metadata, including
	// unknown extensions. This bounds nested text and collections without a new
	// per-message text limit or an arbitrary history-retention count limit.
	const maxCaseHistoryBytes = 4 << 20
	var data bytes.Buffer
	encoder := json.NewEncoder(&data)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(metadata); err != nil {
		return fmt.Errorf("%w: document history/review metadata must be JSON", ErrInvalid)
	}
	if data.Len() > maxCaseHistoryBytes {
		return fmt.Errorf("%w: document history/review metadata exceeds 4 MiB", ErrInvalid)
	}
	// Normalize Go callers' map/slice/numeric types to their JSON representation
	// for validation only. The input and persisted history are left untouched.
	var normalized Record
	if err := json.Unmarshal(data.Bytes(), &normalized); err != nil {
		return fmt.Errorf("%w: document history/review metadata must be JSON", ErrInvalid)
	}
	if history, supplied := normalized["documentHistory"]; supplied {
		if err := validateHistoryArray(history, "documentHistory", "documentHistory"); err != nil {
			return err
		}
	}
	if review, supplied := normalized["documentReview"]; supplied {
		return validateHistoryObject(review, "documentReview", "documentReview")
	}
	return nil
}

func validateHistoryArray(value any, path, kind string) error {
	items, ok := value.([]any)
	if !ok {
		return fmt.Errorf("%w: %s must be an array", ErrInvalid, path)
	}
	for i, item := range items {
		if err := validateHistoryObject(item, fmt.Sprintf("%s[%d]", path, i), kind); err != nil {
			return err
		}
	}
	return nil
}

func validateHistoryObject(value any, path, kind string) error {
	object, ok := value.(map[string]any)
	if !ok || object == nil {
		return fmt.Errorf("%w: %s must be an object", ErrInvalid, path)
	}
	// Known fields are optional for compatibility with imported history. When
	// supplied, their types follow the shared document/workflow model. Unknown
	// fields are retained; this is shape validation, not workflow authorization.
	var textFields, integerFields, arrayFields, objectFields []string
	switch kind {
	case "documentHistory":
		textFields = []string{"id", "messageType", "text", "savedAt", "actor"}
		integerFields = []string{"revision"}
	case "documentReview":
		textFields = []string{"activeSnapshotId"}
		integerFields = []string{"schemaVersion"}
		arrayFields = []string{"snapshots", "comments", "acknowledgements"}
	case "snapshots":
		textFields = []string{"id", "messageType", "digest", "text", "submittedAt", "status", "returnReason", "returnedAt"}
		integerFields = []string{"revision"}
		arrayFields = []string{"assignments", "recipients", "recipientSnapshots"}
		objectFields = []string{"template"}
	case "comments":
		textFields = []string{"id", "snapshotId", "digest", "quote", "author", "at", "text", "resolvedBy", "resolvedAt"}
		integerFields = []string{"revision", "start", "end"}
		arrayFields = []string{"replies"}
		if resolved, supplied := object["resolved"]; supplied {
			if _, ok := resolved.(bool); !ok {
				return fmt.Errorf("%w: %s.resolved must be a boolean", ErrInvalid, path)
			}
		}
	case "acknowledgements":
		textFields = []string{"id", "snapshotId", "digest", "reviewerId", "role", "decision", "mark", "at"}
		integerFields = []string{"revision"}
	case "replies":
		textFields = []string{"author", "at", "text"}
	case "assignments":
		textFields = []string{"role", "reviewerId", "label"}
	case "recipients", "resultingRecipients":
		textFields = []string{"category", "address"}
	case "recipientSnapshots":
		textFields = []string{"templateId", "templateName", "templateVersion", "appliedAt", "category", "mode", "sourceAddresses"}
		arrayFields = []string{"resultingRecipients"}
	case "template":
		textFields = []string{"id", "label", "approval"}
		integerFields = []string{"version"}
	}
	for _, key := range textFields {
		if field, supplied := object[key]; supplied {
			if kind == "documentReview" && key == "activeSnapshotId" && field == nil {
				continue
			}
			if _, ok := field.(string); !ok {
				return fmt.Errorf("%w: %s.%s must be a string", ErrInvalid, path, key)
			}
		}
	}
	for _, key := range integerFields {
		if field, supplied := object[key]; supplied {
			n, ok := field.(float64)
			if !ok || n < 0 || n > 9007199254740991 || math.Trunc(n) != n {
				return fmt.Errorf("%w: %s.%s must be a nonnegative safe integer", ErrInvalid, path, key)
			}
		}
	}
	for _, key := range arrayFields {
		if field, supplied := object[key]; supplied {
			if err := validateHistoryArray(field, path+"."+key, key); err != nil {
				return err
			}
		}
	}
	for _, key := range objectFields {
		if field, supplied := object[key]; supplied {
			if err := validateHistoryObject(field, path+"."+key, key); err != nil {
				return err
			}
		}
	}
	return nil
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
			if resource == "cases" && caseWasTransmitted(record) {
				return fmt.Errorf("%w: transmitted CASREPs cannot be deleted", ErrInvalid)
			}
			previous := clone(s.db)
			*records = append((*records)[:i], (*records)[i+1:]...)
			if resource == "requisitions" {
				s.materialChangedLocked(record, nil)
			}
			if err := s.persistLocked(); err != nil {
				s.db = previous
				return err
			}
			return nil
		}
	}
	return ErrNotFound
}

func caseWasTransmitted(record Record) bool {
	if stage := stringValue(record["stage"]); stage == "Transmitted" || stage == "Delivery verified" {
		return true
	}
	switch transmissions := record["transmissions"].(type) {
	case []any:
		return len(transmissions) > 0
	case []Record:
		return len(transmissions) > 0
	}
	return false
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
	case "command-settings":
		return &s.db.CommandSettings, nil
	default:
		return nil, fmt.Errorf("%w: unknown resource %q", ErrInvalid, resource)
	}
}

func (s *Store) validateLocked(resource string, record Record, existingID string) error {
	if stringValue(record["id"]) == "" {
		return fmt.Errorf("%w: id is required", ErrInvalid)
	}
	switch resource {
	case "command-settings":
		name := stringValue(record["name"])
		switch name {
		case "ship-schedule":
			if strings.TrimSpace(stringValue(record["text"])) == "" {
				return fmt.Errorf("%w: schedule text is required", ErrInvalid)
			}
		case "analysis-areas":
			if err := validateAnalysisSettings(record); err != nil {
				return err
			}
		default:
			return fmt.Errorf("%w: unknown command setting", ErrInvalid)
		}
		for _, item := range s.db.CommandSettings {
			if stringValue(item["id"]) != existingID && stringValue(item["name"]) == name {
				return fmt.Errorf("%w: command setting already exists", ErrConflict)
			}
		}
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
	if resource == "command-settings" || resource == "requisitions" {
		if intValue(record["revision"]) == 0 {
			record["revision"] = 1
		}
	}
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
	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return fmt.Errorf("create database directory: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".anchor-management-*.json")
	if err != nil {
		return fmt.Errorf("create database temp file: %w", err)
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err = tmp.Write(data); err == nil {
		// The database contains message history and locally entered notes. Keep
		// it private to the service account; the seed remains separately readable.
		err = tmp.Chmod(0600)
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
