# APIS (Hivewarden SaaS) SSIK/Cubes Context Pack

Date: 2026-02-15  
Audience: AI agents and engineers working in `apis`

## Why this file exists

This repository is the active **Hivewarden SaaS** project.

The separate website/public surface is in:

`/Users/jermodelaruelle/Projects/hivewarden-website`

SSIK platform infrastructure is in:

`/Users/jermodelaruelle/Projects/SSIK-A`

## Ownership boundaries

| Area | System of Record | Notes |
|---|---|---|
| Hivewarden SaaS app/API | `/Users/jermodelaruelle/Projects/apis` | This repo |
| Hivewarden website | `/Users/jermodelaruelle/Projects/hivewarden-website` | Website-only repo |
| Cluster + ArgoCD + OpenBao + WAF + Keycloak wiring | `/Users/jermodelaruelle/Projects/SSIK-A` | Infra repo |

## SSIK “Cubes” deployment model (SaaS lane)

1. App CI builds/pushes image to Forgejo registry.
2. App CI opens PR against SSIK infra repo values/chart references.
3. ArgoCD syncs from SSIK Git and deploys namespace `hivewarden-saas`.
4. Runtime secrets are delivered via OpenBao + External Secrets Operator.

## Core contracts to honor

### Secrets (OpenBao)

- Canonical path: `secret/apps/hivewarden-saas/prod/*`
- API path form: `secret/data/apps/hivewarden-saas/prod/*`
- Never commit secrets to git.

### Identity (Keycloak two-tier)

- Tier-1: platform/control identities.
- Tier-2: app/business identities for Hivewarden SaaS.
- Machine identity example: `hivewarden-saas-ai-agent`.

### WAF/ingress ownership

- Public ingress is managed through SSIK WAF.
- Domain/allowlist/WAF rules are GitOps-managed in SSIK-A.
- Do not patch runtime ingress config manually.

## Mandatory references

- `/Users/jermodelaruelle/Projects/SSIK-A/Hivewarden-SAASonboarding.md`
- `/Users/jermodelaruelle/Projects/SSIK-A/templates/app-onboarding/generated/hivewarden-saas/onboarding-summary.md`
- `/Users/jermodelaruelle/Projects/SSIK-A/argocd/projects/hivewarden-saas.yaml`
- `/Users/jermodelaruelle/Projects/SSIK-A/argocd/applications/hivewarden-saas.yaml`
- `/Users/jermodelaruelle/Projects/SSIK-A/docs/APP-AGENT-LANDING-ARCHITECTURE.md`

## Agent execution rules

1. Do not deploy directly with `kubectl`.
2. Follow GitOps flow only (app CI -> infra PR -> Argo sync).
3. Use app-scoped commit/audit identity for CI actions.
4. Keep this repo focused on SaaS behavior and runtime contracts.
