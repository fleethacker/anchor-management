package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"anchor-management/internal/store"
)

type testClient struct {
	t    *testing.T
	s    *server
	path string
}

func client(t *testing.T, cases []store.Record) *testClient {
	t.Helper()
	dir := t.TempDir()
	seed := filepath.Join(dir, "seed.json")
	dbPath := filepath.Join(dir, "db.json")
	data, err := json.Marshal(store.Database{SchemaVersion: 1, Cases: cases,
		Assets:     []store.Record{{"id": "asset-1", "name": "DEMO PUMP"}},
		WorkOrders: []store.Record{}, Requisitions: []store.Record{}, PLADTemplates: []store.Record{}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(seed, data, 0600); err != nil {
		t.Fatal(err)
	}
	records, err := store.Open(dbPath, seed)
	if err != nil {
		t.Fatal(err)
	}
	return &testClient{t: t, path: dbPath, s: &server{records: records,
		models: store.NewModelRunner("node", "../../scripts/casrep-workflow.cjs", "../../../index.html")}}
}

func (c *testClient) request(method, path string, body store.Record, want int, headers ...string) map[string]any {
	c.t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		c.t.Fatal(err)
	}
	req := httptest.NewRequest(method, "/api/v1"+path, bytes.NewReader(data))
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	w := httptest.NewRecorder()
	withMiddleware(http.HandlerFunc(c.s.api)).ServeHTTP(w, req)
	if w.Code != want {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, w.Code, want, w.Body.String())
	}
	if want == http.StatusNoContent {
		return nil
	}
	var result map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		c.t.Fatal(err)
	}
	return result
}

func record(result map[string]any) store.Record { return result["data"].(map[string]any) }
func object(value any) map[string]any           { return value.(map[string]any) }
func (c *testClient) action(current store.Record, name string, input store.Record, want int) store.Record {
	c.t.Helper()
	payload := store.Record{"expectedRevision": current["revision"], "expectedStage": current["stage"]}
	if review, ok := current["documentReview"].(map[string]any); ok {
		payload["snapshotId"] = review["activeSnapshotId"]
	}
	for key, value := range input {
		payload[key] = value
	}
	result := c.request("POST", "/cases/"+asString(current["id"])+"/actions/"+name, payload, want)
	if want != 200 {
		return current
	}
	return record(result)
}

func TestExistingCRUDContract(t *testing.T) {
	c := client(t, []store.Record{})
	inputs := []struct {
		resource string
		fields   store.Record
	}{
		{"cases", store.Record{"title": "Exercise casualty", "category": "C3"}},
		{"assets", store.Record{"name": "Exercise motor"}},
		{"work-orders", store.Record{"title": "Inspect", "assetId": "asset-1"}},
		{"requisitions", store.Record{"part": "Seal", "assetId": "asset-1"}},
		{"plad-templates", store.Record{"name": "Exercise routing", "recipients": "DEMO ACTION"}},
	}
	for _, input := range inputs {
		t.Run(input.resource, func(t *testing.T) {
			r := record(c.request("POST", "/"+input.resource, input.fields, 201))
			path := "/" + input.resource + "/" + asString(r["id"])
			c.request("GET", path, nil, 200)
			updated := record(c.request("PATCH", path, store.Record{"notes": "Persistent change"}, 200))
			if updated["notes"] != "Persistent change" {
				t.Fatal("PATCH lost fields")
			}
			updated = record(c.request("PUT", path, store.Record{"notes": "Merged PUT"}, 200))
			if updated["notes"] != "Merged PUT" {
				t.Fatal("PUT lost fields")
			}
			if input.resource == "cases" {
				c.request("PATCH", path, store.Record{"title": "Stale"}, 409, "If-Match", `"1"`)
				if updated["revision"] != float64(3) {
					t.Fatalf("revision = %v", updated["revision"])
				}
			}
			reopened, err := store.Open(c.path, "")
			if err != nil {
				t.Fatal(err)
			}
			if saved, err := reopened.Get(input.resource, asString(r["id"])); err != nil || saved["notes"] != "Merged PUT" {
				t.Fatal("CRUD write did not persist", err)
			}
			c.request("DELETE", path, nil, 204)
			c.request("GET", path, nil, 404)
		})
	}
	c.request("POST", "/work-orders", store.Record{"title": "Invalid reference", "assetId": "missing"}, 422)
	c.request("POST", "/plad-templates", store.Record{"name": "Missing recipients"}, 422)
	c.request("OPTIONS", "/cases", nil, 204)
	c.request("POST", "/cases", nil, 400)
}

func TestCASREPDeploymentReadiness(t *testing.T) {
	c := client(t, []store.Record{})
	check := func(query string, want int) map[string]any {
		t.Helper()
		w := httptest.NewRecorder()
		c.s.health(w, httptest.NewRequest("GET", "/api/v1/health"+query, nil))
		if w.Code != want {
			t.Fatalf("health%s: status %d, want %d: %s", query, w.Code, want, w.Body.String())
		}
		var body map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body
	}
	ready := record(check("?check=casrep", http.StatusOK))
	capabilities := ready["capabilities"].([]any)
	if len(capabilities) != 6 || capabilities[0] != "casrep-workflow-v1" || capabilities[1] != "casrep-deadlines-v1" || capabilities[2] != "command-admin-v1" || capabilities[3] != "casrep-line-wrap-v1" || capabilities[4] != "casrep-routing-edit-v1" || capabilities[5] != "casrep-delete-v1" {
		t.Fatal("missing deployment capabilities", ready)
	}
	c.s.models = store.NewModelRunner("missing-node-for-readiness-test", "../../scripts/casrep-workflow.cjs", "../../../index.html")
	check("?check=casrep", http.StatusServiceUnavailable)
	if record(check("", http.StatusOK))["status"] != "ok" {
		t.Fatal("ordinary health depends on the rules runtime")
	}
	if rows, err := c.s.records.List("cases"); err != nil || len(rows) != 0 {
		t.Fatal("readiness check mutated records", err)
	}
}

func TestServerPaginationAndLegacyFilters(t *testing.T) {
	var cases []store.Record
	base := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 525; i++ {
		cases = append(cases, store.Record{"id": fmt.Sprintf("case-%03d", i), "title": fmt.Sprintf("Pump %03d", i),
			"profile": "FLEET", "caseStatus": "Active", "stage": "In review", "assetId": "asset-1",
			"nextUpdateAt": base.Add(time.Duration(i) * 100 * time.Millisecond).Format(time.RFC3339Nano)})
	}
	c := client(t, cases)
	page := c.request("GET", "/cases?profile=fleet&caseStatus=Active&stage=In+review&assetId=asset-1&hasNextUpdate=true&sort=nextUpdateAt&limit=10&offset=10", nil, 200)
	rows := page["data"].([]any)
	meta := object(page["meta"])
	if len(rows) != 10 || meta["total"] != float64(525) || meta["offset"] != float64(10) || object(rows[0])["id"] != "case-010" || object(rows[9])["id"] != "case-019" {
		t.Fatalf("server pagination/order mismatch: %v %v", meta, rows)
	}
	page = c.request("GET", "/cases?limit=9999&offset=-10", nil, 200)
	if len(page["data"].([]any)) != 500 || object(page["meta"])["limit"] != float64(500) {
		t.Fatal("maximum page size changed")
	}
	page = c.request("GET", "/cases?limit=500&offset=500", nil, 200)
	if len(page["data"].([]any)) != 25 {
		t.Fatal("last page lost records")
	}
	boundary := url.QueryEscape(base.Add(200 * time.Millisecond).Format(time.RFC3339Nano))
	page = c.request("GET", "/cases?hasNextUpdate=true&nextUpdateBefore="+boundary+"&sort=nextUpdateAt&order=desc", nil, 200)
	if len(page["data"].([]any)) != 3 || object(page["data"].([]any)[0])["id"] != "case-002" {
		t.Fatal("legacy date filter/order changed")
	}
	page = c.request("GET", "/cases?search=Pump+001", nil, 200)
	if object(page["meta"])["total"] != float64(1) {
		t.Fatal("search changed")
	}
}

func validTraffic() store.Record {
	now := time.Now().UTC()
	text := "P " + strings.ToUpper(now.Format("021504Z Jan 06")) + "\nFM USS CONSTITUTION\nTO DEMO ACTION\nINFO DEMO INFO\nBT\nUNCLAS\nMSGID/CASREP/USS CONSTITUTION/001//\nPOSIT/DEMO PORT/041700ZNOV26//\nCASUALTY/INITIAL-26001/DEMO PUMP/EIC:Z901/CAT:3//\nAMPN/EXERCISE LEAK DETECTED.//\nESTIMATE/" + strings.ToUpper(now.Add(45*24*time.Hour).Format("021504ZJan06")) + "//\nASSIST/NONE//\nPARTSID/APL:9990001/-/JCN:DEMO-JCN//\nTECHPUB/EXERCISE PUBLICATION//\nRMKS/EXERCISE EXERCISE EXERCISE. ALL DATA SYNTHETIC.\nTITLE: EXERCISE PUMP\nIMPACT: REDUNDANCY REDUCED.\nACTIONS: REPLACE SEAL.\nMITIGATION: ALTERNATE PUMP IN SERVICE.\nPARTS: DEMO SEAL.\nPOC: EXERCISE COORDINATOR.//\nBT\nNNNN\n"
	return store.Record{"schemaVersion": 1, "template": store.Record{"id": "casrep-demo-message", "version": 1}, "text": text, "recipientSnapshots": []any{}}
}

func TestPersistedCASREPReviewLoopAndUpdate(t *testing.T) {
	c := client(t, []store.Record{})
	r := record(c.request("POST", "/cases/drafts", store.Record{"traffic": validTraffic(), "assetId": "asset-1"}, 201))
	path := "/cases/" + asString(r["id"])
	c.request("POST", path+"/actions/submit", store.Record{}, 422)
	c.action(r, "submit", store.Record{"expectedRevision": 99}, 409)
	started := time.Now().Add(-time.Second)
	r = c.action(r, "submit", store.Record{"submittedAt": "2000-01-01T00:00:00Z"}, 200)
	firstSubmission := asString(object(object(r["reporting"])["submissions"].([]any)[0])["submittedAt"])
	at, err := time.Parse(time.RFC3339Nano, firstSubmission)
	if err != nil || at.Before(started) || at.After(time.Now()) {
		t.Fatal("submission did not use server time", firstSubmission)
	}
	if len(object(r["documentReview"])["snapshots"].([]any)) != 1 {
		t.Fatal("review snapshot not saved")
	}
	c.action(r, "save", store.Record{"impact": "BYPASS LOCK"}, 422)
	c.action(r, "concur", store.Record{"reviewId": "xo", "reviewerId": "demo-xo"}, 422)
	r = c.action(r, "comment-add", store.Record{"reviewerId": "demo-divo", "start": 0, "end": 5, "text": "Clarify the impact."}, 200)
	commentID := object(object(r["documentReview"])["comments"].([]any)[0])["id"]
	r = c.action(r, "comment-reply", store.Record{"reviewerId": "originator", "commentId": commentID, "text": "Will revise."}, 200)
	r = c.action(r, "comment-resolve", store.Record{"reviewerId": "demo-divo", "commentId": commentID}, 200)
	stale := r
	r = c.action(r, "return", store.Record{"reviewerId": "demo-divo", "note": "Revise mission impact."}, 200)
	c.action(stale, "concur", store.Record{"reviewId": "divo", "reviewerId": "demo-divo"}, 409)
	r = c.action(r, "save", store.Record{"impact": "EXERCISE REDUNDANCY REMAINS REDUCED."}, 200)
	if r["revision"] != float64(2) {
		t.Fatal("returned draft did not create a new revision")
	}
	r = c.action(r, "submit", nil, 200)
	if object(object(r["reporting"])["submissions"].([]any)[0])["submittedAt"] != firstSubmission {
		t.Fatal("return loop postponed the original deadline")
	}
	if len(object(r["documentReview"])["snapshots"].([]any)) != 2 || len(object(r["documentReview"])["comments"].([]any)) != 1 {
		t.Fatal("return loop lost review history")
	}
	for _, role := range []string{"divo", "department", "cheng", "xo", "co"} {
		r = c.action(r, "concur", store.Record{"reviewId": role, "reviewerId": "demo-" + role}, 200)
	}
	c.action(r, "authorize", store.Record{"reviewerId": "demo-xo"}, 422)
	r = c.action(r, "authorize", store.Record{"reviewerId": "demo-co"}, 200)
	if len(object(r["documentReview"])["acknowledgements"].([]any)) != 5 {
		t.Fatal("approval history incomplete")
	}
	r = c.action(r, "transmit", store.Record{"dtg": "041700Z NOV 26", "recipients": r["recipients"]}, 200)
	r = c.action(r, "deliver", store.Record{"note": "Exercise delivery recorded for every recipient."}, 200)
	r = c.action(r, "followup", store.Record{"type": "UPDATE"}, 200)
	if r["stage"] != "Draft" || r["messageType"] != "UPDATE" || len(r["versions"].([]any)) != 1 {
		t.Fatal("follow-on lost the released version")
	}
	traffic := object(r["traffic"])
	traffic["text"] = strings.ReplaceAll(strings.ReplaceAll(asString(traffic["text"]), "[DTG]", "041800Z NOV 26"), "[MESSAGE SERIAL]", "002")
	r = c.action(r, "save", store.Record{"traffic": traffic}, 200)
	// A linked material write becomes a reporting requirement, without changing the draft.
	req := record(c.request("POST", "/requisitions", store.Record{"part": "Seal", "assetId": "asset-1", "casrepId": r["id"]}, 201))
	c.request("PATCH", "/requisitions/"+asString(req["id"]), store.Record{"status": "Received"}, 200)
	r = record(c.request("GET", path, nil, 200))
	page := c.request("GET", "/cases?reporting=calculated&hasNextUpdate=true&includeRequired=true&nextUpdateBefore="+url.QueryEscape(time.Now().Format(time.RFC3339Nano)), nil, 200)
	if len(page["data"].([]any)) != 1 || object(object(page["data"].([]any)[0])["reportingSchedule"])["required"] != true {
		t.Fatal("required material update disappeared outside the due horizon")
	}
	r = c.action(r, "submit", nil, 200)
	if len(r["materialChanges"].([]any)) != 0 {
		t.Fatal("submitted UPDATE did not acknowledge reported material changes")
	}
	submissions := object(r["reporting"])["submissions"].([]any)
	if len(submissions) != 2 || object(submissions[1])["submittedAt"] == firstSubmission {
		t.Fatal("new UPDATE did not start its own clock")
	}
	reopened, err := store.Open(c.path, "")
	if err != nil {
		t.Fatal(err)
	}
	c.s.records = reopened
	saved := record(c.request("GET", path, nil, 200))
	if saved["stage"] != "In review" || len(object(saved["documentReview"])["snapshots"].([]any)) != 3 {
		t.Fatal("workflow did not survive process reload")
	}
	if len(saved["events"].([]any)) < 20 {
		t.Fatal("workflow audit history incomplete")
	}
	legacy := saved["nextUpdateAt"]
	calculated := c.request("GET", "/cases?reporting=calculated&sort=nextUpdateAt&limit=10", nil, 200)
	if object(calculated["data"].([]any)[0])["nextUpdateAt"] == "" {
		t.Fatal("server deadline projection missing")
	}
	if record(c.request("GET", path, nil, 200))["nextUpdateAt"] != legacy {
		t.Fatal("calculated read changed the legacy stored field")
	}
}

func TestConcurrentCommentsPreserveBothWriters(t *testing.T) {
	c := client(t, []store.Record{})
	r := record(c.request("POST", "/cases/drafts", store.Record{"traffic": validTraffic()}, 201))
	r = c.action(r, "submit", nil, 200)
	var wg sync.WaitGroup
	errors := make(chan string, 2)
	for _, author := range []string{"demo-divo", "originator"} {
		wg.Add(1)
		go func(author string) {
			defer wg.Done()
			body, _ := json.Marshal(store.Record{"expectedRevision": r["revision"], "expectedStage": "In review", "reviewerId": author, "start": 0, "end": 5, "text": author})
			req := httptest.NewRequest("POST", "/api/v1/cases/"+asString(r["id"])+"/actions/comment-add", bytes.NewReader(body))
			w := httptest.NewRecorder()
			c.s.api(w, req)
			if w.Code != 200 {
				errors <- w.Body.String()
			}
		}(author)
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		t.Fatal(err)
	}
	saved := record(c.request("GET", "/cases/"+asString(r["id"]), nil, 200))
	if len(object(saved["documentReview"])["comments"].([]any)) != 2 {
		t.Fatal("concurrent comment was lost")
	}
}

func TestRulesUnavailableDoesNotDisableCRUDOrWritePartialCase(t *testing.T) {
	c := client(t, []store.Record{})
	c.s.models = store.NewModelRunner(filepath.Join(t.TempDir(), "missing-node"), "../../scripts/casrep-workflow.cjs", "../../../index.html")
	c.request("POST", "/cases/drafts", store.Record{"traffic": validTraffic()}, 503)
	page := c.request("GET", "/cases", nil, 200)
	if object(page["meta"])["total"] != float64(0) {
		t.Fatal("failed workflow created a partial case")
	}
	c.request("POST", "/work-orders", store.Record{"title": "Inspect pump", "assetId": "asset-1"}, 201)
	c.request("GET", "/cases?reporting=calculated", nil, 503)
}

func TestCaseDeleteRejectsTransmissionHistory(t *testing.T) {
	c := client(t, []store.Record{
		{"id": "sent", "title": "Sent", "stage": "Transmitted"},
		{"id": "delivered", "title": "Delivered", "stage": "Delivery verified"},
		{"id": "follow-on", "title": "Follow-on draft", "stage": "Draft", "transmissions": []any{map[string]any{"dtg": "TEST"}}},
	})
	for _, id := range []string{"sent", "delivered", "follow-on"} {
		c.request("DELETE", "/cases/"+id, nil, 422)
		c.request("GET", "/cases/"+id, nil, 200)
	}
}
