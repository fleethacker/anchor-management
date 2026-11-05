package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestDisabledAuthenticatorRejectsEverything(t *testing.T) {
	a := New("", time.Hour, true)
	if a.Enabled() {
		t.Fatal("empty secret enabled authentication")
	}
	if _, _, _, ok := a.Login("anything"); ok {
		t.Fatal("disabled authentication accepted a login")
	}
}

func TestSessionAndCSRF(t *testing.T) {
	a := New("shared secret", time.Hour, true)
	sessionID, csrf, expires, ok := a.Login("shared secret")
	if !ok || sessionID == "" || csrf == "" || expires.IsZero() {
		t.Fatal("valid login did not create a session")
	}
	req := httptest.NewRequest("POST", "/api/v1/assistant/responses", nil)
	req.AddCookie(&http.Cookie{Name: SessionCookie, Value: sessionID})
	req.AddCookie(&http.Cookie{Name: CSRFCookie, Value: csrf})
	if !a.Authenticated(req) {
		t.Fatal("valid session was rejected")
	}
	if a.CSRFValid(req) {
		t.Fatal("CSRF token was accepted without its header")
	}
	req.Header.Set(CSRFHeader, csrf)
	if !a.CSRFValid(req) {
		t.Fatal("valid CSRF token was rejected")
	}
	req.Header.Set(CSRFHeader, "wrong")
	if a.CSRFValid(req) {
		t.Fatal("invalid CSRF token was accepted")
	}
	a.Logout(req)
	if a.Authenticated(req) {
		t.Fatal("logged-out session remained valid")
	}
}

func TestLoginFailuresAreRateLimited(t *testing.T) {
	a := New("secret", time.Hour, false)
	for i := 0; i < 5; i++ {
		if _, _, _, ok := a.LoginFor("wrong", "127.0.0.1"); ok {
			t.Fatal("wrong password accepted")
		}
	}
	if _, _, _, ok := a.LoginFor("secret", "127.0.0.1"); ok {
		t.Fatal("rate-limited caller bypassed the failure limit")
	}
	if _, _, _, ok := a.LoginFor("secret", "127.0.0.2"); !ok {
		t.Fatal("a separate caller was rate limited")
	}
}

func TestExpiredSessionIsRejected(t *testing.T) {
	a := New("secret", time.Second, false)
	now := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	a.now = func() time.Time { return now }
	sessionID, _, _, ok := a.Login("secret")
	if !ok {
		t.Fatal("login failed")
	}
	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: SessionCookie, Value: sessionID})
	if !a.Authenticated(req) {
		t.Fatal("new session was rejected")
	}
	now = now.Add(2 * time.Second)
	if a.Authenticated(req) {
		t.Fatal("expired session was accepted")
	}
}
