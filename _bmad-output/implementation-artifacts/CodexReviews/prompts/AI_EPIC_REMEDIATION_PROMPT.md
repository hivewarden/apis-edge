# AI Epic Remediation Prompt (Fix Epic N from CodexReviews)

Use this prompt to have an AI **implement fixes** for a specific epic based on the output of the code-review prompt stored in `CodexReviews/`.

---

## Prompt

You are a **Staff Engineer** tasked with remediating issues found in an epic code review.

### Inputs

- **Epic to remediate:** `{EPIC}` (single epic number, e.g. `0` or `10`)
- **Review artifacts folder:** `_bmad-output/implementation-artifacts/CodexReviews/`
  - Epic summary input: `_bmad-output/implementation-artifacts/CodexReviews/{EPIC}-summary.md`
  - Story review inputs: `_bmad-output/implementation-artifacts/CodexReviews/*-review.md` for stories whose basename starts with `{EPIC}-`

### Scope (what you may change)

- Application source code (e.g., `apis-server/`, `apis-dashboard/`, `docker-compose.yml`, `scripts/`, `docs/`)
- The story files for the epic (e.g., `_bmad-output/implementation-artifacts/{EPIC}-*.md`) **only** to reflect remediation progress (status, change log, verification notes).

### Non-goals

- Don’t refactor unrelated areas.
- Don’t “gold-plate” — fix the items required to clear Critical/High issues and satisfy story ACs.
- Don’t modify other generated review folders (e.g., `_bmad-output/_BulkReview*`) unless explicitly asked.

### Remediation rules

- **Start from the review artifacts, not assumptions.** Treat `F#` findings and `E##` backlog items as the source of truth.
- **Fix highest severity first:** Critical → High → Medium → Low.
- **Every fix must be verifiable.** Add tests when feasible; otherwise provide explicit manual verification steps.
- **Secrets safety:** never print decrypted secrets or tokens; never commit plaintext secret files.
- **If blocked by manual bootstrap/config, remove the block.** If an AC requires E2E behavior (auth, stack startup), implement a repeatable bootstrap path (script + docs + safe defaults).

### Required output files

Write a remediation report to:

- `_bmad-output/implementation-artifacts/CodexReviews/{EPIC}-remediation.md`

After fixes, **re-run the code review prompt for `{EPIC}`** and overwrite:

- `_bmad-output/implementation-artifacts/CodexReviews/{EPIC}-summary.md`
- `_bmad-output/implementation-artifacts/CodexReviews/{EPIC}-*-review.md`

### Remediation report format (Markdown)

#### 1) Plan

- Bullet list of steps you’ll take, in order.

#### 2) Fix Log (mapped to review IDs)

For each item you address, use:

**Item:** `E##` or `F#`  
- Status: Fixed / Partially fixed / Deferred (with reason)  
- Files changed: list  
- What changed: 1–3 bullets  
- Verification: tests/commands run (and results) OR manual steps  

#### 3) Verification Summary

- **Commands/tests executed**
- **Commands/tests not executed** (and why)
- **Runtime checks performed** (if any)

#### 4) Remaining Work

- List any remaining `E##`/`F#` items, with blocking reasons and the shortest path to unblock.

---

## Example usage

- “Use `_bmad-output/implementation-artifacts/CodexReviews/prompts/AI_EPIC_REMEDIATION_PROMPT.md` with `{EPIC}=0` and remediate Epic 0.”

