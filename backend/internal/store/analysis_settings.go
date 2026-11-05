package store

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

var analysisAreaID = regexp.MustCompile(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`)

func validateAnalysisSettings(record Record) error {
	areas, ok := record["areas"].([]any)
	if !ok || len(areas) > 64 {
		return fmt.Errorf("%w: areas must contain at most 64 custom definitions", ErrInvalid)
	}
	allowed := map[string]bool{"combat-systems": true, "engineering": true, "deck": true, "supply": true}
	labels := map[string]bool{"combat systems": true, "combat-systems": true, "engineering": true, "deck": true, "supply": true, "eng": true, "cs": true, "constructor": true, "prototype": true, "all": true, "unknown": true, "unassigned": true}
	for _, raw := range areas {
		area, ok := raw.(map[string]any)
		if !ok || len(area) != 2 {
			return fmt.Errorf("%w: each area needs only id and name", ErrInvalid)
		}
		id, idOK := area["id"].(string)
		name, nameOK := area["name"].(string)
		normalized := strings.ToLower(strings.Join(strings.Fields(strings.NewReplacer("-", " ", "_", " ").Replace(name)), " "))
		invalidText := strings.IndexFunc(name, unicode.IsControl) >= 0
		if !idOK || !nameOK || len(id) > 64 || !analysisAreaID.MatchString(id) || utf8.RuneCountInString(name) > 64 || normalized == "" || invalidText || allowed[id] || labels[id] || labels[normalized] {
			return fmt.Errorf("%w: area ids and names must be valid and unique", ErrInvalid)
		}
		allowed[id] = true
		labels[id] = true
		labels[normalized] = true
	}
	for _, field := range []string{"caseDepartments", "assetDepartments"} {
		assignments, ok := record[field].(map[string]any)
		if !ok {
			return fmt.Errorf("%w: %s must be an object", ErrInvalid, field)
		}
		if len(assignments) > 20000 {
			return fmt.Errorf("%w: too many analysis assignments", ErrInvalid)
		}
		for id, raw := range assignments {
			area, ok := raw.(string)
			if strings.TrimSpace(id) == "" || id == "__proto__" || id == "constructor" || id == "prototype" || !ok || !allowed[area] {
				return fmt.Errorf("%w: assignment must reference a configured area", ErrInvalid)
			}
		}
	}
	return nil
}
