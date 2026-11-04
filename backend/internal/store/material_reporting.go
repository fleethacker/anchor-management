package store

import "time"

// Record reporting consequences in the same transaction as material CRUD.
// This is metadata: it never changes the canonical message, approval revision,
// or an existing submission deadline.
func (s *Store) materialChangedLocked(before, after Record) {
	changed := before == nil || after == nil
	for _, key := range []string{"part", "status", "eta", "quantity", "nsn", "jcn", "casrepId"} {
		if stringValue(before[key]) != stringValue(after[key]) {
			changed = true
		}
	}
	if !changed {
		return
	}
	record := after
	if record == nil {
		record = before
	}
	ids := map[string]bool{stringValue(before["casrepId"]): true, stringValue(after["casrepId"]): true}
	delete(ids, "")
	stamp := time.Now().UTC().Format(time.RFC3339Nano)
	detail := "Material status changed: " + stringValue(record["number"])
	if after == nil {
		detail += " · requisition removed."
	} else {
		detail += " · " + stringValue(after["status"]) + "."
	}
	for _, casrep := range s.db.Cases {
		if !ids[stringValue(casrep["id"])] || stringValue(casrep["caseStatus"]) != "Active" {
			continue
		}
		changes, _ := casrep["materialChanges"].([]any)
		found := false
		for _, change := range changes {
			item, _ := change.(map[string]any)
			if stringValue(item["requisitionId"]) == stringValue(record["id"]) {
				item["at"], item["detail"] = stamp, detail
				found = true
			}
		}
		if !found {
			changes = append(changes, map[string]any{"kind": "parts", "detail": detail, "at": stamp, "source": "requisition", "requisitionId": record["id"]})
		}
		casrep["materialChanges"] = changes
		events, _ := casrep["events"].([]any)
		casrep["events"] = append(events, map[string]any{"at": stamp, "title": "CASREP material update required", "detail": detail, "actor": "material-service"})
		casrep["updatedAt"] = stamp
	}
}
