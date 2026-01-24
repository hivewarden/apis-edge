/**
 * Zitadel OIDC Configuration
 *
 * Configures the Zitadel React SDK for authentication using
 * Authorization Code Flow with PKCE (Proof Key for Code Exchange).
 */
import { createZitadelAuth, ZitadelConfig } from "@zitadel/react";
import { ZITADEL_AUTHORITY, ZITADEL_CLIENT_ID } from "../config";

/**
 * Build the Zitadel OIDC configuration from environment variables.
 * All configuration comes from centralized config to support different deployments.
 */
const config: ZitadelConfig = {
  // Zitadel instance URL (issuer)
  authority: ZITADEL_AUTHORITY,

  // Application client ID from Zitadel console
  client_id: ZITADEL_CLIENT_ID,

  // Where to redirect after successful authentication
  redirect_uri: `${window.location.origin}/callback`,

  // Where to redirect after logout
  post_logout_redirect_uri: `${window.location.origin}/login`,

  // Scopes determine what information we get in the token
  // - openid: Required for OIDC
  // - profile: Get user name, picture, etc.
  // - email: Get user email
  // - offline_access: Get refresh token for token renewal
  scope: "openid profile email offline_access",

  // Automatically refresh tokens before they expire
  // This prevents the need for manual signinSilent calls
  automaticSilentRenew: true,

  // Time in seconds before token expiration to trigger silent renew
  // Default is 60 seconds, we use 120 for extra buffer
  accessTokenExpiringNotificationTimeInSeconds: 120,
};

/**
 * Zitadel authentication instance.
 * This wraps oidc-client-ts with Zitadel-specific configuration.
 *
 * Use this to:
 * - Trigger login: zitadelAuth.authorize()
 * - Get current user: zitadelAuth.userManager.getUser()
 * - Logout: zitadelAuth.signout()
 */
export const zitadelAuth = createZitadelAuth(config);

/**
 * Get the underlying UserManager for advanced operations.
 * The UserManager handles token storage, refresh, and session management.
 */
export const userManager = zitadelAuth.userManager;

/**
 * Login with return URL support.
 * Stores the returnTo URL in OIDC state so it can be retrieved after callback.
 *
 * @param returnTo - URL to redirect to after successful login (optional)
 */
export async function loginWithReturnTo(returnTo?: string): Promise<void> {
  const state = returnTo ? { returnTo } : undefined;
  await userManager.signinRedirect({ state });
}
