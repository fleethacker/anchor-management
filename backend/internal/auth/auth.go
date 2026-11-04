package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

const (
	SessionCookie = "anchor_management_session"
	CSRFCookie    = "anchor_management_csrf"
	CSRFHeader    = "X-CSRF-Token"
)

type session struct {
	csrf    string
	expires time.Time
}

// Authenticator implements the prototype's optional single-account session.
// It deliberately does not model individual users or authorization roles.
type Authenticator struct {
	mu      sync.Mutex
	secret  [sha256.Size]byte
	enabled bool
	ttl     time.Duration
	secure  bool
	now     func() time.Time
	session map[string]session
	failed  map[string]loginFailure
}

type loginFailure struct {
	count   int
	at      time.Time
	blocked time.Time
}

func New(sharedSecret string, ttl time.Duration, secureCookie bool) *Authenticator {
	secret := sha256.Sum256([]byte(sharedSecret))
	return &Authenticator{
		secret:  secret,
		enabled: strings.TrimSpace(sharedSecret) != "",
		ttl:     ttl,
		secure:  secureCookie,
		now:     time.Now,
		session: make(map[string]session),
		failed:  make(map[string]loginFailure),
	}
}

func (a *Authenticator) Enabled() bool { return a != nil && a.enabled }

func (a *Authenticator) Login(password string) (sessionID, csrf string, expires time.Time, ok bool) {
	return a.LoginFor(password, "shared")
}

// LoginFor applies a small in-memory failure limit per caller key. The key is
// supplied by the HTTP layer from the peer address; it is not an identity.
func (a *Authenticator) LoginFor(password, callerKey string) (sessionID, csrf string, expires time.Time, ok bool) {
	if !a.Enabled() {
		return "", "", time.Time{}, false
	}
	now := a.now()
	a.mu.Lock()
	a.pruneFailuresLocked(now)
	failure := a.failed[callerKey]
	if failure.blocked.After(now) {
		a.mu.Unlock()
		return "", "", time.Time{}, false
	}
	a.mu.Unlock()
	candidate := sha256.Sum256([]byte(password))
	if subtle.ConstantTimeCompare(candidate[:], a.secret[:]) != 1 {
		a.mu.Lock()
		failure = a.failed[callerKey]
		failure.count++
		failure.at = now
		if failure.count >= 5 {
			failure.blocked = now.Add(5 * time.Minute)
			failure.count = 0
		}
		a.failed[callerKey] = failure
		a.mu.Unlock()
		return "", "", time.Time{}, false
	}
	a.mu.Lock()
	delete(a.failed, callerKey)
	a.mu.Unlock()
	sessionID, ok = randomToken()
	if !ok {
		return "", "", time.Time{}, false
	}
	csrf, ok = randomToken()
	if !ok {
		return "", "", time.Time{}, false
	}
	expires = a.now().Add(a.ttl)
	a.mu.Lock()
	a.pruneLocked(a.now())
	if len(a.session) >= 100 {
		for id := range a.session {
			delete(a.session, id)
			break
		}
	}
	a.session[sessionID] = session{csrf: csrf, expires: expires}
	a.mu.Unlock()
	return sessionID, csrf, expires, true
}

func (a *Authenticator) Authenticated(r *http.Request) bool {
	_, ok := a.Session(r)
	return ok
}

func (a *Authenticator) Session(r *http.Request) (time.Time, bool) {
	if !a.Enabled() || r == nil {
		return time.Time{}, false
	}
	cookie, err := r.Cookie(SessionCookie)
	if err != nil || cookie.Value == "" {
		return time.Time{}, false
	}
	now := a.now()
	a.mu.Lock()
	defer a.mu.Unlock()
	s, exists := a.session[cookie.Value]
	if !exists || !now.Before(s.expires) {
		delete(a.session, cookie.Value)
		return time.Time{}, false
	}
	return s.expires, true
}

func (a *Authenticator) CSRFValid(r *http.Request) bool {
	if !a.Authenticated(r) || r == nil {
		return false
	}
	cookie, err := r.Cookie(SessionCookie)
	if err != nil {
		return false
	}
	provided := r.Header.Get(CSRFHeader)
	if provided == "" {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	s, exists := a.session[cookie.Value]
	return exists && subtle.ConstantTimeCompare([]byte(provided), []byte(s.csrf)) == 1
}

func (a *Authenticator) Logout(r *http.Request) {
	if a == nil || r == nil {
		return
	}
	cookie, err := r.Cookie(SessionCookie)
	if err != nil {
		return
	}
	a.mu.Lock()
	delete(a.session, cookie.Value)
	a.mu.Unlock()
}

func (a *Authenticator) SetCookies(w http.ResponseWriter, sessionID, csrf string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{Name: SessionCookie, Value: sessionID, Path: "/api/v1", Expires: expires, MaxAge: maxAge(expires, a.now()), HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteNoneMode})
	http.SetCookie(w, &http.Cookie{Name: CSRFCookie, Value: csrf, Path: "/api/v1", Expires: expires, MaxAge: maxAge(expires, a.now()), Secure: a.secure, SameSite: http.SameSiteNoneMode})
}

func (a *Authenticator) ClearCookies(w http.ResponseWriter) {
	for _, name := range []string{SessionCookie, CSRFCookie} {
		http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/api/v1", MaxAge: -1, HttpOnly: name == SessionCookie, Secure: a.secure, SameSite: http.SameSiteNoneMode})
	}
}

func (a *Authenticator) pruneFailuresLocked(now time.Time) {
	for key, failure := range a.failed {
		if now.Sub(failure.at) > 10*time.Minute && !now.Before(failure.blocked) {
			delete(a.failed, key)
		}
	}
}

func (a *Authenticator) pruneLocked(now time.Time) {
	for id, s := range a.session {
		if !now.Before(s.expires) {
			delete(a.session, id)
		}
	}
}

func CallerKey(r *http.Request) string {
	if r == nil {
		return "unknown"
	}
	if address, err := netip.ParseAddrPort(r.RemoteAddr); err == nil {
		return address.Addr().String()
	}
	if address, err := netip.ParseAddr(r.RemoteAddr); err == nil {
		return address.String()
	}
	return "unknown"
}

func randomToken() (string, bool) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", false
	}
	return base64.RawURLEncoding.EncodeToString(value), true
}

func maxAge(expires, now time.Time) int {
	seconds := int(expires.Sub(now).Seconds())
	if seconds < 1 {
		return 1
	}
	return seconds
}
