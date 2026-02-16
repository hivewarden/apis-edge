# Hivewarden-SAAS Onboarding (APIS -> SSIK)

## Mandatory first step

Read this file fully before any planning or code changes:

`/Users/jermodelaruelle/Projects/apis/zzWeGoSSIK/00-SSIK-CUBES-CONTEXT.md`

Do not continue if unread/unavailable.

## Required acknowledgment in first reply

- `CONTEXT_FILE_READ: /Users/jermodelaruelle/Projects/apis/zzWeGoSSIK/00-SSIK-CUBES-CONTEXT.md`
- `CONTRACT_ACK: secrets path, GitOps flow, Keycloak two-tier, WAF ownership, runtime-contract path`

## SSIK-side source of truth

Use this file for platform-side onboarding details:

`/Users/jermodelaruelle/Projects/SSIK-A/Hivewarden-SAASonboarding.md`

Primary generated handoff bundle (from SSIK onboarding automation):

- `/Users/jermodelaruelle/Projects/SSIK-A/templates/app-onboarding/generated/hivewarden-saas/app-repo-llm-onboarding-prompt.md`
- `/Users/jermodelaruelle/Projects/SSIK-A/templates/app-onboarding/generated/hivewarden-saas/app-repo-ci-secrets.sops.yaml`

## CI credential source

Preferred:

1. Store release credentials in OpenBao path `secret/apps/hivewarden-saas/ci/forgejo`.
2. Set Forgejo repo secrets `OPENBAO_ROLE_ID`, `OPENBAO_SECRET_ID`, and optional `OPENBAO_ADDR`.

Fallback:

1. Set Forgejo repo secrets `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, `INFRA_GIT_TOKEN` directly.

## Connectivity fallback (local agent runtime)

If `bao.ratetheplate.dev` or `forgejo.ratetheplate.dev` is unreachable from your local runtime:

1. Treat it as network reachability issue, not an AppRole bootstrap failure.
2. Continue implementation work in this repo.
3. For live secret checks, use SSIK cluster port-forwards:
   - OpenBao: `kubectl -n ssik-core port-forward svc/ssik-core-openbao 18200:8200`
   - Forgejo: `kubectl -n ssik-cicd port-forward svc/forgejo 13000:3000`
4. Temporarily use `OPENBAO_ADDR=http://127.0.0.1:18200` for local validation commands.
5. Helper script:
   - `./scripts/ssik-connectivity.sh check`
   - `./scripts/ssik-connectivity.sh start`
   - `./scripts/ssik-connectivity.sh stop`

Do not block coding/PR preparation solely because public domains are not reachable from the local agent runtime.

## Delivery constraints

1. Do not deploy directly with `kubectl`.
2. Build/push image, then open infra PR.
3. Use commit identity: `Hivewarden-SAAS AI Agent <hivewarden-saas-ai-agent@ratetheplate.dev>`.
4. Never commit secrets; reference OpenBao paths only.

## Required outputs

1. `.forgejo/workflows/build-release.yaml` configured for this repo.
2. `release-handoff.md` with image digest, runtime contract, migration and rollback notes.
3. PR to SSIK infra repo updating Hivewarden-SAAS image tag/digest.
