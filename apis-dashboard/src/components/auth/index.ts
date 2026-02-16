/**
 * Auth Components Barrel Export
 *
 * Components for authentication UI including:
 * - AuthGuard: Route protection wrapper
 * - LoginForm: Email/password login for local mode
 * - OIDCLoginButton: SSO button for Keycloak/OIDC mode
 * - SetupWizard: First-time setup wizard for local mode
 * - SecurityWarningModal: Remote access security warning
 */
export { AuthGuard } from "./AuthGuard";
export { AdminGuard } from "./AdminGuard";
export { LoginForm } from "./LoginForm";
export { OIDCLoginButton } from "./OIDCLoginButton";
export { SetupWizard } from "./SetupWizard";
export { SecurityWarningModal } from "./SecurityWarningModal";
