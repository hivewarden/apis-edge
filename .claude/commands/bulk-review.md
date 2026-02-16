---
description: 'Run parallel code reviews for all stories in an epic using Opus sub-agents. Each review runs independently and outputs are saved to _bmad-output/_BulkReviewEpicX/'
---

# Bulk Code Review - Epic-Wide Parallel Review

**Purpose:** Run the `code-review` workflow in parallel for every story in a specified epic, using Opus sub-agents. Each review is saved as a separate markdown file.

## Arguments

- `$ARGUMENTS` should contain the epic number (e.g., `3` for Epic 3)

## Execution Steps

<steps CRITICAL="TRUE">

### Step 1: Parse Arguments and Validate

1. Extract epic number from `$ARGUMENTS`
2. If no epic number provided, ask user: "Which epic number should I review? (e.g., 3, 4, 5)"
3. Validate epic number is a positive integer

### Step 2: Discover Story Files

1. Find all story files matching pattern: `_bmad-output/implementation-artifacts/{epic}-*-*.md`
2. Exclude files that are NOT stories:
   - `code-review-*.md` (previous review outputs)
   - `frontend-redesign-plan.md` (planning docs)
   - `sprint-status.yaml` (status files)
3. List discovered stories and confirm with user before proceeding

### Step 3: Create Output Directory

1. Create directory: `_bmad-output/_BulkReviewEpic{epic_number}/`
2. Generate timestamp for this review batch: `YYYY-MM-DD-HHmm`

### Step 4: Launch Parallel Review Agents

**CRITICAL:** Launch Opus sub-agents that invoke the Skill tool. Sub-agents are LAUNCHERS, not reviewers.

**Validation:** After agents complete, verify each output file contains `### I1:` format. If a review lacks this format, the agent failed to use the skill - flag it for re-run.

For each story file, launch a Task agent with:
- `subagent_type`: "general-purpose"
- `model`: "opus"
- `description`: "Invoke code-review skill for {story_id}"
- `run_in_background`: true
- `prompt`: See template below (agents MUST use Skill tool as first action)

**Agent Prompt Template:**
```
## Your Single Task

Invoke the BMAD code-review skill for story {story_id}.

## Acceptance Criteria (You FAIL if not met)

AC1: Your FIRST tool call MUST be the Skill tool with:
  - skill: "bmad:bmm:workflows:code-review"
  - args: "_bmad-output/implementation-artifacts/{story_filename}"

AC2: The review output file MUST contain these EXACT sections that ONLY the BMAD skill produces:
  - `## Acceptance Criteria Verification` with evidence table
  - `## Issues Found` with `### I1:`, `### I2:` numbered format
  - `## Verdict` with PASS/FAIL/NEEDS_WORK status
  - Issue entries with `**File:**`, `**Line:**`, `**Severity:**` fields

AC3: You MUST NOT read any files BEFORE calling the Skill tool. Your first action is invoking the skill - no exploration, no "let me understand the story first".

## Why This Matters

The `/bulk-remediate` workflow parses the BMAD review format to auto-fix issues.
Manual reviews break this automation. You are a launcher, not a reviewer.

## Completion

When the skill finishes, it saves output to `_bmad-output/_BulkReviewEpic{epic}/`.
Report back: "Skill completed for story {story_id}" with the verdict (PASS/FAIL).

If the Skill tool fails or errors, report the error. Do NOT attempt manual review as fallback.
```

### Step 5: Monitor and Validate Results

1. Wait for all background agents to complete using TaskOutput tool
2. For EACH review file in `_bmad-output/_BulkReviewEpic{epic}/`:
   - Grep for `### I1:` - if missing, the agent did NOT use the skill
   - Grep for `## Verdict` - if missing, format is wrong
3. **If validation fails for any review:**
   - Delete the malformed review file
   - Report: "Story {id} review invalid - agent did not use BMAD skill"
   - List failed stories for manual `/code-review` run
4. Only proceed to summary if ALL reviews pass validation

### Step 6: Generate Summary Report

Create `_bmad-output/_BulkReviewEpic{epic}/SUMMARY.md`:

```markdown
# Bulk Review Summary - Epic {epic}

**Generated:** {timestamp}
**Stories Reviewed:** {count}

## Overview
| Story | Status | Critical | High | Medium | Low |
|-------|--------|----------|------|--------|-----|
| 3-1   | PASS   | 0        | 1    | 2      | 1   |

## Stories Needing Work
- [ ] Story 3-2: 2 critical issues
- [ ] Story 3-5: Missing AC implementation

## Next Steps
1. Address critical issues in stories marked NEEDS_WORK
2. Run dev-story workflow on failing stories
3. Re-run bulk-review after fixes
```

</steps>

## Example Usage

```
/bulk-review 3
```

This will:
1. Find all stories: 3-1-*.md, 3-2-*.md, etc.
2. Launch parallel Opus agents to review each
3. Save outputs to `_bmad-output/_BulkReviewEpic3/`
