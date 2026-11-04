package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"anchor-management/internal/store"
)

type server struct{ records *store.Store }

type response struct {
	Data any            `json:"data,omitempty"`
	Meta map[string]any `json:"meta,omitempty"`
}

type listMeta struct {
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	dataPath := flag.String("data", "data/anchor-management.json", "mutable JSON database path")
	seedPath := flag.String("seed", "data/seed.json", "extracted seed data path")
	staticPath := flag.String("static", "..", "directory containing index.html")
	flag.Parse()

	records, err := store.Open(*dataPath, *seedPath)
	if err != nil {
		log.Fatal(err)
	}
	s := &server{records: records}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/health", s.health)
	mux.HandleFunc("/api/v1/", s.api)
	mux.Handle("/", http.FileServer(http.Dir(*staticPath)))

	log.Printf("anchor-management listening on %s", *addr)
	log.Printf("UI: http://localhost%s · API: http://localhost%s/api/v1/health", displayAddr(*addr), displayAddr(*addr))
	if err := http.ListenAndServe(*addr, withMiddleware(mux)); err != nil {
		log.Fatal(err)
	}
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, response{Data: map[string]any{"status": "ok", "service": "anchor-management"}})
}

func (s *server) api(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/api/v1/"), "/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeJSON(w, http.StatusOK, response{Data: map[string]any{
			"resources": []string{"cases", "assets", "work-orders", "requisitions", "plad-templates"},
		}})
		return
	}
	resource := parts[0]
	if !validResource(resource) || len(parts) > 2 {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}
	if len(parts) == 1 {
		s.collection(w, r, resource)
		return
	}
	s.item(w, r, resource, parts[1])
}

func (s *server) collection(w http.ResponseWriter, r *http.Request, resource string) {
	switch r.Method {
	case http.MethodGet:
		records, err := s.records.List(resource)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		records = filter(records, r)
		sortRecords(records, r)
		offset := queryInt(r, "offset", 0)
		limit := queryInt(r, "limit", 100)
		if offset < 0 {
			offset = 0
		}
		if limit < 1 {
			limit = 1
		}
		if limit > 500 {
			limit = 500
		}
		total := len(records)
		if offset > total {
			offset = total
		}
		end := offset + limit
		if end > total {
			end = total
		}
		writeJSON(w, http.StatusOK, response{Data: records[offset:end], Meta: map[string]any{"total": total, "limit": limit, "offset": offset}})
	case http.MethodPost:
		input, err := decodeObject(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		record, err := s.records.Create(resource, input)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, response{Data: record})
	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *server) item(w http.ResponseWriter, r *http.Request, resource, id string) {
	switch r.Method {
	case http.MethodGet:
		record, err := s.records.Get(resource, id)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, response{Data: record})
	case http.MethodPatch, http.MethodPut:
		input, err := decodeObject(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		expected := expectedRevision(r, input)
		record, err := s.records.Update(resource, id, input, expected)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, response{Data: record})
	case http.MethodDelete:
		if err := s.records.Delete(resource, id); err != nil {
			writeStoreError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.Header().Set("Allow", "GET, PATCH, PUT, DELETE")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func filter(records []store.Record, r *http.Request) []store.Record {
	query := r.URL.Query()
	matches := make([]store.Record, 0, len(records))
	search := strings.ToLower(strings.TrimSpace(query.Get("search")))
	for _, record := range records {
		if value := query.Get("profile"); value != "" && strings.EqualFold(asString(record["profile"]), value) == false {
			continue
		}
		if value := query.Get("stage"); value != "" && !strings.EqualFold(asString(record["stage"]), value) {
			continue
		}
		if value := query.Get("status"); value != "" && !strings.EqualFold(asString(record["status"]), value) && !strings.EqualFold(asString(record["caseStatus"]), value) {
			continue
		}
		if value := query.Get("caseStatus"); value != "" && !strings.EqualFold(asString(record["caseStatus"]), value) {
			continue
		}
		if value := query.Get("assetId"); value != "" && asString(record["assetId"]) != value {
			continue
		}
		if value := query.Get("hasNextUpdate"); value == "true" && asString(record["nextUpdateAt"]) == "" {
			continue
		}
		if value := query.Get("nextUpdateBefore"); value != "" && !dateBefore(record["nextUpdateAt"], value) {
			continue
		}
		if value := query.Get("nextUpdateAfter"); value != "" && !dateAfter(record["nextUpdateAt"], value) {
			continue
		}
		if search != "" {
			text, _ := json.Marshal(record)
			if !strings.Contains(strings.ToLower(string(text)), search) {
				continue
			}
		}
		matches = append(matches, record)
	}
	return matches
}

func sortRecords(records []store.Record, r *http.Request) {
	field := r.URL.Query().Get("sort")
	allowed := map[string]bool{"id": true, "title": true, "nextUpdateAt": true, "discoveredAt": true, "updatedAt": true, "createdAt": true}
	if !allowed[field] {
		return
	}
	descending := strings.EqualFold(r.URL.Query().Get("order"), "desc")
	sort.SliceStable(records, func(i, j int) bool {
		left, right := asString(records[i][field]), asString(records[j][field])
		if field != "title" && field != "id" {
			left, right = dateSortValue(left), dateSortValue(right)
		}
		if descending {
			return left > right
		}
		return left < right
	})
}

func dateBefore(value any, boundary string) bool {
	at, err := time.Parse(time.RFC3339, asString(value))
	if err != nil {
		return false
	}
	until, err := time.Parse(time.RFC3339, boundary)
	return err == nil && !at.After(until)
}
func dateAfter(value any, boundary string) bool {
	at, err := time.Parse(time.RFC3339, asString(value))
	if err != nil {
		return false
	}
	after, err := time.Parse(time.RFC3339, boundary)
	return err == nil && !at.Before(after)
}
func dateSortValue(value string) string {
	if at, err := time.Parse(time.RFC3339, value); err == nil {
		return at.UTC().Format(time.RFC3339Nano)
	}
	return "9999-12-31T23:59:59.999999999Z"
}

func decodeObject(r *http.Request) (store.Record, error) {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, 4<<20))
	var input store.Record
	if err := decoder.Decode(&input); err != nil {
		return nil, fmt.Errorf("invalid JSON body: %w", err)
	}
	return input, nil
}

func expectedRevision(r *http.Request, input store.Record) *int {
	value := r.Header.Get("If-Match")
	if value == "" {
		value = asString(input["expectedRevision"])
	}
	value = strings.Trim(value, "\"")
	if value == "" || value == "*" {
		return nil
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return nil
	}
	return &n
}

func validResource(resource string) bool {
	switch resource {
	case "cases", "assets", "work-orders", "requisitions", "plad-templates":
		return true
	default:
		return false
	}
}
func queryInt(r *http.Request, name string, fallback int) int {
	n, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil {
		return fallback
	}
	return n
}
func asString(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, store.ErrInvalid):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"message": message}})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, If-Match")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func displayAddr(addr string) string {
	if strings.HasPrefix(addr, ":") {
		return "127.0.0.1" + addr
	}
	return addr
}
