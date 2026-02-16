# Hivewarden-SAAS Release Handoff (App Repo -> SSIK-A)

Date: 2026-02-16  
Runtime contract path: `/Users/jermodelaruelle/Projects/apis/release-handoff.md`

## OpenBao Path Contract (authoritative)

- Runtime logical path: `secret/apps/hivewarden-saas/prod/*`
- Runtime KVv2 API path: `secret/data/apps/hivewarden-saas/prod/*`
- Runtime metadata path: `secret/metadata/apps/hivewarden-saas/prod/*`
- CI logical path: `secret/apps/hivewarden-saas/ci/forgejo`
- CI KVv2 API path: `secret/data/apps/hivewarden-saas/ci/forgejo`
- CI keys required:
  - `REGISTRY_USERNAME`
  - `REGISTRY_PASSWORD`
  - `INFRA_GIT_TOKEN`

## 1. Artifact Identity

- App name: `hivewarden-saas`
- Environment: `prod`
- Image repository: `forgejo.ratetheplate.dev/ssik-apps/hivewarden-saas`
- Image tag: `${GITHUB_SHA}` (workflow tag strategy)
- Image digest (required): produced by `.forgejo/workflows/build-release.yaml` step `Resolve immutable image digest`
- App commit SHA / release tag: `${GITHUB_SHA}` (current local HEAD reference: `ee49da378e77`)

## 2. Runtime Contract

- Container port(s): `3000` (APIS server default, configurable with `PORT`)
- Readiness endpoint: `GET /api/health`
- Liveness endpoint: `GET /api/health`
- Startup endpoint (if used): `GET /api/health`
- Required environment variables (names only):
  - `AUTH_MODE`
  - `JWT_SECRET`
  - `KEYCLOAK_ISSUER`
  - `KEYCLOAK_CLIENT_ID`
  - `SECRETS_BACKEND`
  - `OPENBAO_ADDR`
  - `OPENBAO_TOKEN`
  - `OPENBAO_SECRET_PATH`
  - `PORT`
- Required secrets (OpenBao path + key names only):
  - `secret/data/apps/hivewarden-saas/prod/database`: `host`, `port`, `name`, `user`, `password`, `ssl_mode`
  - `secret/data/apps/hivewarden-saas/prod/keycloak`: `issuer`, `client_id`, `client_secret`, `admin_username`, `admin_password`
  - `secret/data/apps/hivewarden-saas/prod/jwt`: `secret`
  - `secret/data/apps/hivewarden-saas/prod/integrations/*`: provider-specific integration keys only

## 3. Data/Migration Changes

- Schema/data migration included? (yes/no): `yes` (embedded SQL migrations run at server startup)
- Migration plan:
  - CI publishes immutable image.
  - Infra PR updates Helm values with image tag+digest.
  - After merge, ArgoCD sync rolls out pods.
  - App startup runs pending migrations before serving traffic.
- Rollback plan:
  - Revert SSIK-A `helm/hivewarden-saas/values.yaml` to previous known-good image tag+digest.
  - Re-sync ArgoCD.
  - If a migration is not backward compatible, restore DB from pre-release backup/snapshot before retry.
- Expected migration window/downtime: low for additive migrations; potentially elevated for large DDL operations.

## 4. Ingress and Auth Changes

- Hostnames/domains affected: `app.hivewarden.example.com` (SSIK WAF-managed)
- Path routing changes: none in this release handoff
- Auth/OIDC changes: Keycloak tier-2 app identity (`AUTH_MODE=keycloak`), no Zitadel dependency
- TLS/certificate impact: no app-repo TLS change; cert/WAF routing remains GitOps-owned in SSIK-A

## 5. Validation Evidence

- Build/CI run URL: Forgejo Actions run for `.forgejo/workflows/build-release.yaml` (record in PR)
- Image push proof (registry URL): `forgejo.ratetheplate.dev/ssik-apps/hivewarden-saas:${GITHUB_SHA}` plus digest output
- CI credential source contract:
  - OpenBao-first via AppRole login at `POST ${OPENBAO_ADDR}/v1/auth/approle/login`
  - CI secret read at `${OPENBAO_ADDR}/v1/secret/data/apps/hivewarden-saas/ci/forgejo`
  - Direct Forgejo secrets are fallback only when `OPENBAO_ROLE_ID` / `OPENBAO_SECRET_ID` are absent
- Smoke test evidence:
  - `GET /api/health` returns HTTP 200 post-rollout
  - Auth config endpoint responds: `GET /api/auth/config`
  - Core API probe responds without 5xx under baseline load
- Known risks:
  - Current SSIK chart scaffold for `hivewarden-saas` is static-site oriented (`port: 8080`, `/healthz`).  
    Runtime contract above is API-oriented (`port: 3000`, `/api/health`), so SSIK chart probe/port alignment must be verified before production merge.

## 6. SSIK-A Change Request

- Target files expected in SSIK-A:
  - `helm/hivewarden-saas/values.yaml` (image `tag` + `digest`)
- Required rollout sequence:
  - app CI build/push -> infra PR -> human approval -> ArgoCD sync -> smoke validation
- Post-deploy verification checklist:
  - Deployment healthy in namespace `hivewarden-saas`
  - Probes pass on live pods
  - No secret material in repo, only OpenBao paths referenced
  - Keycloak login/OIDC flow operational in tier-2 realm
