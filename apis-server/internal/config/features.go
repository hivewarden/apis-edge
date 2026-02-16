package config

// Feature detection helpers that derive capabilities from the current auth mode.
// These functions help code determine what features are available without
// checking the auth mode directly, providing a cleaner abstraction.
//
// IMPORTANT: All functions in this file delegate to IsLocalAuth() or IsSaaSMode(),
// which will panic if called before InitAuthConfig(). Always ensure InitAuthConfig()
// has been called during server startup before using these functions.

// SupportsLocalUserManagement returns true if local user management is available.
// This is true in local mode where users are managed in the local database
// with password-based authentication.
//
// Panics if called before InitAuthConfig.
func SupportsLocalUserManagement() bool {
	return IsLocalAuth()
}

// SupportsSuperAdmin returns true if super admin functionality is available.
// This is true in SaaS (Keycloak) mode where certain emails can be designated as
// super admins with elevated privileges across all tenants.
//
// Panics if called before InitAuthConfig.
func SupportsSuperAdmin() bool {
	return IsSaaSMode()
}

// RequiresOIDCAuth returns true if OIDC authentication (Keycloak) is required.
// This is true in SaaS mode where users authenticate via Keycloak OIDC.
//
// Panics if called before InitAuthConfig.
func RequiresOIDCAuth() bool {
	return IsSaaSMode()
}

// SupportsMultiTenant returns true if multiple tenants are supported.
// In SaaS (Keycloak) mode, each Keycloak organization maps to a tenant.
// In local mode, there is only the default tenant.
//
// Panics if called before InitAuthConfig.
func SupportsMultiTenant() bool {
	return IsSaaSMode()
}

// SupportsInviteFlow returns true if the invite flow is available.
// This is true in local mode where admins can invite users via email.
//
// Panics if called before InitAuthConfig.
func SupportsInviteFlow() bool {
	return IsLocalAuth()
}
