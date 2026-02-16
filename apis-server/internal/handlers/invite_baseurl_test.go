package handlers

import "testing"

func TestResolveInviteBaseURL(t *testing.T) {
	t.Run("defaults when env is unset", func(t *testing.T) {
		t.Setenv("DASHBOARD_URL", "")
		if got := resolveInviteBaseURL(); got != defaultDashboardURL {
			t.Fatalf("expected %q, got %q", defaultDashboardURL, got)
		}
	})

	t.Run("accepts valid https URL", func(t *testing.T) {
		t.Setenv("DASHBOARD_URL", "https://apis.example.com")
		if got := resolveInviteBaseURL(); got != "https://apis.example.com" {
			t.Fatalf("expected %q, got %q", "https://apis.example.com", got)
		}
	})

	t.Run("normalizes trailing slash and path", func(t *testing.T) {
		t.Setenv("DASHBOARD_URL", "https://apis.example.com/app/")
		if got := resolveInviteBaseURL(); got != "https://apis.example.com/app" {
			t.Fatalf("expected %q, got %q", "https://apis.example.com/app", got)
		}
	})

	t.Run("rejects non-http schemes", func(t *testing.T) {
		t.Setenv("DASHBOARD_URL", "javascript:alert(1)")
		if got := resolveInviteBaseURL(); got != defaultDashboardURL {
			t.Fatalf("expected %q, got %q", defaultDashboardURL, got)
		}
	})

	t.Run("rejects query and fragment", func(t *testing.T) {
		t.Setenv("DASHBOARD_URL", "https://apis.example.com/path?x=1#frag")
		if got := resolveInviteBaseURL(); got != defaultDashboardURL {
			t.Fatalf("expected %q, got %q", defaultDashboardURL, got)
		}
	})
}
