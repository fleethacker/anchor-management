package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"anchor-management/internal/assistant"
	"anchor-management/internal/auth"
	"anchor-management/internal/store"
)

type server struct {
	records        *store.Store
	models         store.ModelRunner
	auth           *auth.Authenticator
	assistant      *assistant.Service
	allowedOrigins map[string]bool
}

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
	nodePath := flag.String("node", "node", "Node.js 20+ executable for CASREP rules")
	modelHelper := flag.String("model-helper", "scripts/casrep-workflow.cjs", "CASREP rules helper")
	flag.Parse()

	appContext, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	records, err := store.Open(*dataPath, *seedPath)
	if err != nil {
		log.Fatal(err)
	}
	assistantService, closeAssistant := newAssistantService(appContext)
	defer func() { _ = closeAssistant() }()
	s := &server{
		records:        records,
		models:         store.NewModelRunner(*nodePath, *modelHelper, filepath.Join(*staticPath, "index.html")),
		auth:           auth.New(os.Getenv("ASSISTANT_SHARED_PASSWORD"), envDuration("ASSISTANT_SESSION_TTL", 8*time.Hour), envBool("ASSISTANT_COOKIE_SECURE", true)),
		assistant:      assistantService,
		allowedOrigins: envOrigins("ASSISTANT_ALLOWED_ORIGINS"),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/health", s.health)
	mux.HandleFunc("/api/v1/", s.api)
	mux.Handle("/", http.FileServer(http.Dir(*staticPath)))
	httpServer := &http.Server{Addr: *addr, Handler: s.withMiddleware(mux)}
	go func() {
		<-appContext.Done()
		shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownContext)
	}()

	log.Printf("anchor-management listening on %s", *addr)
	log.Printf("UI: http://%s · API: http://%s/api/v1/health", displayAddr(*addr), displayAddr(*addr))
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	data := map[string]any{"status": "ok", "service": "anchor-management"}
	if r.URL.Query().Get("check") == "casrep" {
		if s.models == nil {
			writeStoreError(w, store.ErrUnavailable)
			return
		}
		// Check the packaged rules without reading or changing live records. The
		// ordinary health endpoint remains independent of the optional runtime.
		result, err := s.models(r.Context(), "reporting", "", nil, []store.Record{}, time.Now())
		if err != nil || result.Records == nil {
			writeStoreError(w, store.ErrUnavailable)
			return
		}
		data["capabilities"] = []string{"casrep-workflow-v1", "casrep-deadlines-v1", "command-admin-v1", "casrep-line-wrap-v1"}
	}
	writeJSON(w, http.StatusOK, response{Data: data})
}

func (s *server) api(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/api/v1/"), "/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeJSON(w, http.StatusOK, response{Data: map[string]any{
			"resources": []string{"cases", "assets", "work-orders", "requisitions", "plad-templates", "command-settings"},
		}})
		return
	}
	resource := parts[0]
	if resource == "auth" {
		s.authAPI(w, r, parts[1:])
		return
	}
	if resource == "assistant" {
		s.assistantAPI(w, r, parts[1:])
		return
	}
	if resource == "cases" && len(parts) == 2 && parts[1] == "drafts" && r.Method == http.MethodPost {
		s.caseAction(w, r, "", "save")
		return
	}
	if resource == "cases" && len(parts) == 4 && parts[2] == "actions" {
		s.caseAction(w, r, parts[1], parts[3])
		return
	}
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

func (s *server) authAPI(w http.ResponseWriter, r *http.Request, parts []string) {
	if s.auth == nil || !s.auth.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "Assistant authentication is not configured")
		return
	}
	if len(parts) != 1 {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}
	switch parts[0] {
	case "login":
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		input, err := decodeObject(r)
		if err != nil || strings.TrimSpace(asString(input["password"])) == "" {
			writeError(w, http.StatusBadRequest, "password is required")
			return
		}
		sessionID, csrf, expires, ok := s.auth.LoginFor(asString(input["password"]), auth.CallerKey(r))
		if !ok {
			writeError(w, http.StatusUnauthorized, "invalid login")
			return
		}
		s.auth.SetCookies(w, sessionID, csrf, expires)
		writeJSON(w, http.StatusOK, response{Data: map[string]any{"authenticated": true, "expiresAt": expires.UTC().Format(time.RFC3339)}})
	case "session":
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		expires, ok := s.auth.Session(r)
		data := map[string]any{"authenticated": ok}
		if ok {
			data["expiresAt"] = expires.UTC().Format(time.RFC3339)
		}
		writeJSON(w, http.StatusOK, response{Data: data})
	case "logout":
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if !s.auth.Authenticated(r) || !s.auth.CSRFValid(r) {
			writeError(w, http.StatusUnauthorized, "authenticated session and CSRF token are required")
			return
		}
		s.auth.Logout(r)
		s.auth.ClearCookies(w)
		writeJSON(w, http.StatusOK, response{Data: map[string]any{"authenticated": false}})
	default:
		writeError(w, http.StatusNotFound, "endpoint not found")
	}
}

func (s *server) assistantAPI(w http.ResponseWriter, r *http.Request, parts []string) {
	if len(parts) != 1 {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}
	if parts[0] == "capabilities" && r.Method == http.MethodGet {
		modelConfigured := s.assistant != nil && s.assistant.Available()
		providerRequiresAuth := modelConfigured && s.assistant.RequiresAuthentication()
		authConfigured := s.auth != nil && s.auth.Enabled()
		authenticationRequired := providerRequiresAuth && authConfigured
		provider := "none"
		if s.assistant != nil {
			provider = s.assistant.Provider()
		}
		writeJSON(w, http.StatusOK, response{Data: map[string]any{
			"localAvailable":         true,
			"modelConfigured":        modelConfigured,
			"modelAvailable":         modelConfigured && (!providerRequiresAuth || authConfigured),
			"provider":               provider,
			"authenticationRequired": authenticationRequired,
			"authenticated":          !authenticationRequired || s.auth.Authenticated(r),
		}})
		return
	}
	if parts[0] != "responses" || r.Method != http.MethodPost {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}
	if s.assistant == nil || !s.assistant.Available() {
		writeError(w, http.StatusServiceUnavailable, "Assistant model is not configured")
		return
	}
	if s.assistant.RequiresAuthentication() {
		if s.auth == nil || !s.auth.Enabled() {
			writeError(w, http.StatusServiceUnavailable, "Assistant authentication is not configured")
			return
		}
		if !s.auth.Authenticated(r) || !s.auth.CSRFValid(r) {
			writeError(w, http.StatusUnauthorized, "authenticated session and CSRF token are required")
			return
		}
	}
	var request assistant.Request
	if err := decodeAssistantRequest(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	evidence, err := assistant.ResolveEvidence(s.records.Snapshot(), request)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	result, err := s.assistant.Respond(r.Context(), request, evidence)
	if err != nil {
		if errors.Is(err, assistant.ErrInvalid) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		} else {
			writeError(w, http.StatusServiceUnavailable, "Assistant model did not return a usable response")
		}
		return
	}
	writeJSON(w, http.StatusOK, response{Data: result})
}

func (s *server) collection(w http.ResponseWriter, r *http.Request, resource string) {
	switch r.Method {
	case http.MethodGet:
		records, err := s.records.List(resource)
		if resource == "cases" && r.URL.Query().Get("reporting") == "calculated" {
			records, err = s.records.ReportingCases(r.Context(), s.models)
		}
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

func (s *server) caseAction(w http.ResponseWriter, r *http.Request, id, action string) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	allowed := map[string]bool{"save": true, "submit": true, "return": true, "concur": true, "authorize": true, "transmit": true, "deliver": true, "followup": true, "close": true, "comment-add": true, "comment-reply": true, "comment-resolve": true, "record-submission": true, "require-update": true, "set-route": true, "observation": true}
	if !allowed[action] {
		writeError(w, http.StatusNotFound, "unknown CASREP action")
		return
	}
	input, err := decodeObject(r)
	if err != nil || input == nil {
		writeError(w, http.StatusBadRequest, "request body must be a JSON object")
		return
	}
	if expected := expectedRevision(r, input); expected != nil {
		input["expectedRevision"] = *expected
	}
	record, err := s.records.CaseAction(r.Context(), s.models, id, action, input)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	status := http.StatusOK
	if id == "" {
		status = http.StatusCreated
	}
	writeJSON(w, status, response{Data: record})
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
		schedule, _ := record["reportingSchedule"].(map[string]any)
		required := query.Get("includeRequired") == "true" && schedule["required"] == true
		if value := query.Get("nextUpdateBefore"); value != "" && !dateBefore(record["nextUpdateAt"], value) && !required {
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
		return at.UTC().Format("2006-01-02T15:04:05.000000000Z")
	}
	return "9999-12-31T23:59:59.999999999Z"
}

func decodeAssistantRequest(r *http.Request, target *assistant.Request) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, 4<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid Assistant request: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return errors.New("Assistant request must contain one JSON object")
	}
	return nil
}

func decodeObject(r *http.Request) (store.Record, error) {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, 4<<20))
	var input store.Record
	if err := decoder.Decode(&input); err != nil {
		return nil, fmt.Errorf("invalid JSON body: %w", err)
	}
	if input == nil {
		return nil, errors.New("request body must be a JSON object")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil, errors.New("request body must contain one JSON object")
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

func newAssistantService(parent context.Context) (*assistant.Service, func() error) {
	closeNoop := func() error { return nil }
	providerName := strings.ToLower(strings.TrimSpace(os.Getenv("ASSISTANT_PROVIDER")))
	if providerName == "" || providerName == "none" {
		return assistant.NewService(nil), closeNoop
	}
	model := strings.TrimSpace(os.Getenv("ASSISTANT_MODEL"))
	apiKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	endpoint := strings.TrimSpace(os.Getenv("ASSISTANT_MODEL_ENDPOINT"))
	name := "local-model"
	if providerName == "local" {
		modelPath := strings.TrimSpace(os.Getenv("ASSISTANT_LOCAL_MODEL_PATH"))
		binary := strings.TrimSpace(os.Getenv("ASSISTANT_LOCAL_BINARY"))
		if modelPath != "" || binary != "" {
			if binary == "" {
				binary = "llama-server"
			}
			provider, err := assistant.StartLocalProcessProvider(parent, assistant.LocalProcessConfig{
				Binary:          binary,
				ModelPath:       modelPath,
				Model:           model,
				APIKey:          strings.TrimSpace(os.Getenv("ASSISTANT_LOCAL_API_KEY")),
				Port:            envInt("ASSISTANT_LOCAL_PORT", 9931),
				ContextSize:     envInt("ASSISTANT_LOCAL_CONTEXT_SIZE", 4096),
				Threads:         envInt("ASSISTANT_LOCAL_THREADS", 0),
				MaxTokens:       envInt("ASSISTANT_LOCAL_MAX_TOKENS", 1200),
				StartupTimeout:  envDuration("ASSISTANT_LOCAL_STARTUP_TIMEOUT", 45*time.Second),
				ShutdownTimeout: envDuration("ASSISTANT_LOCAL_SHUTDOWN_TIMEOUT", 5*time.Second),
				LogWriter:       os.Stderr,
			})
			if err != nil {
				log.Printf("disabling local Assistant model: %v", err)
				return assistant.NewService(nil), closeNoop
			}
			return assistant.NewService(provider), provider.Close
		}
	}
	if providerName == "openai" {
		name = "openai"
		if endpoint == "" {
			endpoint = "https://api.openai.com/v1/responses"
		}
	}
	if providerName != "openai" && providerName != "openai-compatible" && providerName != "local" {
		log.Printf("ignoring unsupported ASSISTANT_PROVIDER=%q", providerName)
		return assistant.NewService(nil), closeNoop
	}
	return assistant.NewService(assistant.NewOpenAIProvider(endpoint, apiKey, model, name, nil)), closeNoop
}

func validResource(resource string) bool {
	switch resource {
	case "cases", "assets", "work-orders", "requisitions", "plad-templates", "command-settings":
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
	case errors.Is(err, store.ErrUnavailable):
		writeError(w, http.StatusServiceUnavailable, err.Error())
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
	return (&server{}).withMiddleware(next)
}

func (s *server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if len(s.allowedOrigins) == 0 {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if s.allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, If-Match, X-CSRF-Token")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func envDuration(name string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		log.Printf("ignoring invalid %s=%q", name, value)
		return fallback
	}
	return parsed
}

func envInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		log.Printf("ignoring invalid %s=%q", name, value)
		return fallback
	}
	return n
}

func envBool(name string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes"
}

func envOrigins(name string) map[string]bool {
	origins := make(map[string]bool)
	for _, value := range strings.Split(os.Getenv(name), ",") {
		if origin := strings.TrimSpace(value); origin != "" {
			origins[origin] = true
		}
	}
	return origins
}

func displayAddr(addr string) string {
	if strings.HasPrefix(addr, ":") {
		return "127.0.0.1" + addr
	}
	return addr
}
