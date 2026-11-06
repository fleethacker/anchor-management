package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"time"
)

var ErrUnavailable = errors.New("CASREP rules service unavailable")

type ModelResult struct {
	Record  Record   `json:"record"`
	Records []Record `json:"records"`
	Error   string   `json:"error"`
	Code    string   `json:"code"`
}

type ModelRunner func(context.Context, string, string, Record, []Record, time.Time) (ModelResult, error)

// NewModelRunner shares the tested document/routing rules with the browser.
// Arguments identify trusted repository files; all request content uses stdin.
func NewModelRunner(node, helper, model string) ModelRunner {
	helper, _ = filepath.Abs(helper)
	model, _ = filepath.Abs(model)
	// Bound process memory on the existing 256 MB demonstration host. Collection
	// reads can arrive concurrently with commands even though writes are locked.
	slots := make(chan struct{}, 1)
	return func(ctx context.Context, action, id string, payload Record, cases []Record, now time.Time) (ModelResult, error) {
		ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		case <-ctx.Done():
			return ModelResult{}, fmt.Errorf("%w: rules request timed out or was cancelled", ErrUnavailable)
		}
		input, err := json.Marshal(map[string]any{"action": action, "id": id, "payload": payload, "cases": cases, "now": now.UTC().Format(time.RFC3339Nano)})
		if err != nil {
			return ModelResult{}, err
		}
		// nosemgrep: go.lang.security.audit.dangerous-exec-command.dangerous-exec-command -- node, helper, and model are trusted startup configuration; request data is stdin.
		cmd := exec.CommandContext(ctx, node, helper, model)
		cmd.Stdin = bytes.NewReader(input)
		output, runErr := cmd.Output()
		var result ModelResult
		if err := json.Unmarshal(output, &result); err != nil {
			return result, fmt.Errorf("%w: ensure Node.js 24 LTS and the model files are available", ErrUnavailable)
		}
		if result.Error != "" {
			kind := ErrInvalid
			if result.Code == "conflict" {
				kind = ErrConflict
			}
			return result, fmt.Errorf("%w: %s", kind, result.Error)
		}
		if runErr != nil {
			return result, fmt.Errorf("%w: model execution failed", ErrUnavailable)
		}
		return result, nil
	}
}

// CaseAction serializes state transitions with all other writes. The helper
// receives the current database snapshot, and Go atomically persists its result.
func (s *Store) CaseAction(ctx context.Context, run ModelRunner, id, action string, payload Record) (Record, error) {
	if run == nil {
		return nil, ErrUnavailable
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	index := -1
	if id != "" {
		for i, record := range s.db.Cases {
			if stringValue(record["id"]) == id {
				index = i
				break
			}
		}
		if index < 0 {
			return nil, ErrNotFound
		}
		current := s.db.Cases[index]
		if _, exists := payload["expectedRevision"]; !exists {
			return nil, fmt.Errorf("%w: expectedRevision is required", ErrInvalid)
		}
		if intValue(payload["expectedRevision"]) != intValue(current["revision"]) {
			return nil, ErrConflict
		}
		if stage := stringValue(payload["expectedStage"]); stage != "" && stage != stringValue(current["stage"]) {
			return nil, ErrConflict
		}
		if round := stringValue(payload["snapshotId"]); round != "" {
			review, _ := current["documentReview"].(map[string]any)
			if round != stringValue(review["activeSnapshotId"]) {
				return nil, ErrConflict
			}
		}
	} else if action != "save" {
		return nil, fmt.Errorf("%w: create a draft before routing", ErrInvalid)
	}
	result, err := run(ctx, action, id, payload, cloneRecords(s.db.Cases), time.Now())
	if err != nil {
		return nil, err
	}
	record := result.Record
	if record == nil || stringValue(record["id"]) == "" || (id != "" && stringValue(record["id"]) != id) {
		return nil, fmt.Errorf("%w: invalid command result", ErrUnavailable)
	}
	if index < 0 && s.existsLocked("cases", stringValue(record["id"])) {
		return nil, ErrConflict
	}
	if err := s.validateLocked("cases", record, id); err != nil {
		return nil, err
	}
	if assetID := stringValue(record["assetId"]); assetID != "" && !s.existsLocked("assets", assetID) {
		return nil, fmt.Errorf("%w: assetId does not exist", ErrInvalid)
	}
	previous := clone(s.db)
	if index < 0 {
		s.db.Cases = append(s.db.Cases, record)
	} else {
		s.db.Cases[index] = record
	}
	if err := s.persistLocked(); err != nil {
		s.db = previous
		return nil, err
	}
	return cloneRecord(record), nil
}

func (s *Store) ReportingCases(ctx context.Context, run ModelRunner) ([]Record, error) {
	if run == nil {
		return nil, ErrUnavailable
	}
	records, err := s.List("cases")
	if err != nil {
		return nil, err
	}
	result, err := run(ctx, "reporting", "", nil, records, time.Now())
	if err != nil {
		return nil, err
	}
	if result.Records == nil {
		return nil, fmt.Errorf("%w: invalid deadline projection", ErrUnavailable)
	}
	return result.Records, nil
}
