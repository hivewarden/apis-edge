---
description: 'Remediate all issues from bulk-review output. Finds latest _BulkReviewEpicX folder, fixes all stories sequentially with Opus sub-agents, then archives the folder.'
---

# Bulk Remediate - Fix All Issues from Bulk Review

**Purpose:** Automatically remediate all issues found by `/bulk-review`. Parses the bulk review output folder, spawns Opus sub-agents to fix each story sequentially, then archives the review folder.

## Arguments

- `$ARGUMENTS` optionally contains the epic number (e.g., `6`)
- If not provided, auto-discovers the latest `_BulkReviewEpic{X}` folder

## Execution Steps

<steps CRITICAL="TRUE">

### Step 1: Discover Bulk Review Folder

1. If `$ARGUMENTS` contains an epic number:
   - Set `{{review_folder}}` = `_bmad-output/_BulkReviewEpic{{epic_number}}/`
2. Otherwise, auto-discover:
   - Glob for `_bmad-output/_BulkReviewEpic*/`
   - Exclude folders with `_remediated_` in the name (already processed)
   - Sort by epic number (extract number from folder name)
   - Select the highest numbered folder as `{{review_folder}}`
3. If no folder found:
   - Output: "No bulk review folder found. Run `/bulk-review {epic}` first."
   - Exit

4. Display discovered folder:
   ```
   Found bulk review folder: {{review_folder}}
   ```

### Step 2: Parse Summary and Build Queue

1. Read `{{review_folder}}/SUMMARY.md`
2. Parse the "## Overview" table to extract:
   - Story IDs
   - Status (PASS, NEEDS_WORK, BLOCKED)
   - Issue counts by severity
3. Parse "## Stories Needing Work" section for issue details
4. Build remediation queue:
   - Include stories with status `NEEDS_WORK`
   - Skip stories with status `PASS`
   - Flag stories with status `BLOCKED` for user attention
5. Sort queue by story number (e.g., 6-1 before 6-2)

### Step 3: Display Remediation Plan

```markdown
## Bulk Remediation Plan

**Review Folder:** {{review_folder}}
**Epic:** {{epic_number}}
**Generated:** {{original_review_timestamp}}

### Stories to Remediate ({{queue_count}})

| Story | Status | Critical | High | Medium | Low | Total |
|-------|--------|----------|------|--------|-----|-------|
| {{story_id}} | NEEDS_WORK | {{c}} | {{h}} | {{m}} | {{l}} | {{total}} |

### Already Passing ({{pass_count}})
{{list of PASS stories - will skip}}

### Blocked ({{blocked_count}}) - Requires Manual Attention
{{list of BLOCKED stories with reasons}}

**Total Issues to Fix:** {{grand_total}}

Proceeding with sequential remediation...
```

### Step 4: Sequential Remediation with Opus Sub-Agents

**CRITICAL:** Process stories ONE AT A TIME (not parallel) to avoid file conflicts.

For EACH story in the remediation queue:

#### Step 4.1: Launch Remediation Agent

Set `{{review_file}}` = `{{review_folder}}/review-{{story_id}}.md`

Launch Task agent:
- `subagent_type`: "general-purpose"
- `model`: "opus"
- `description`: "Remediate {{story_id}}"
- `run_in_background`: false (WAIT for completion before next story)
- `prompt`:
  ```
  ## Your Single Task

  Invoke the BMAD remediate skill for story {{story_id}}.

  ## Acceptance Criteria (You FAIL if not met)

  AC1: Your FIRST tool call MUST be the Skill tool with:
    - skill: "remediate"
    - args: "{{review_file}}"

  AC2: The remediation MUST produce these outcomes that ONLY the BMAD skill handles:
    - Issues in the review file marked with [x] when fixed
    - Story file status updated to reflect remediation
    - Code changes applied to fix the actual issues
    - Sprint status synced if story reaches PASS

  AC3: You MUST NOT read any files BEFORE calling the Skill tool. Your first action is invoking the skill - no exploration, no "let me understand the issues first", no manual fixes.

  AC4: You MUST NOT implement fixes yourself. The /remediate skill contains the full remediation logic. You are a LAUNCHER, not a developer.

  ## Why This Matters

  The /remediate workflow has specialized logic for:
  - Parsing BMAD review format (### I1:, **File:**, **Severity:**)
  - Applying fixes in the correct order
  - Updating review files with completion markers
  - Syncing sprint-status.yaml

  Manual remediation breaks this automation and produces inconsistent results.

  ## Completion

  When the skill finishes, report back with:
  ```
  REMEDIATION_COMPLETE: {{story_id}}
  ISSUES_FIXED: {{count}}
  NEW_STATUS: PASS | NEEDS_WORK
  ```

  If the Skill tool fails or errors, report the error. Do NOT attempt manual remediation as fallback.
  ```

#### Step 4.2: Validate and Process Agent Result

**Validation (agent MUST have used the skill):**
1. Check agent output contains `REMEDIATION_COMPLETE:` marker
2. Check the review file was modified (issues should have `[x]` markers)
3. If validation fails:
   - Log: "Story {{story_id}} remediation invalid - agent did not use BMAD skill"
   - Mark story as SKIPPED_INVALID
   - Continue to next story

**If validation passes:**
1. Parse the agent's output for:
   - `ISSUES_FIXED:` count
   - `NEW_STATUS:` value
2. Record results for this story:
   - Issues fixed
   - Issues remaining
   - New status
3. Display progress:
   ```
   [{{current}}/{{total}}] {{story_id}}: {{fixed_count}} fixed, {{remaining_count}} remaining → {{new_status}}
   ```

#### Step 4.3: Continue to Next Story

Move to the next story in the queue. Repeat Step 4.1-4.2.

### Step 5: Update Sprint Status

After all stories processed:

1. Read `_bmad-output/implementation-artifacts/sprint-status.yaml`
2. For each story that now has status PASS:
   - Update `development_status[{{story_key}}]` = "done"
3. Save file, preserving all comments and structure

### Step 6: Archive the Review Folder

1. Generate timestamp: `YYYY-MM-DD_HHmm` (e.g., `2026-01-25_1430`)
2. Rename folder:
   ```bash
   mv _bmad-output/_BulkReviewEpic{{N}}/ _bmad-output/_BulkReviewEpic{{N}}_remediated_{{timestamp}}/
   ```
3. Confirm rename succeeded

### Step 7: Generate Final Summary

Create `_bmad-output/_BulkReviewEpic{{N}}_remediated_{{timestamp}}/REMEDIATION_SUMMARY.md`:

```markdown
# Bulk Remediation Summary - Epic {{epic_number}}

**Original Review:** {{original_timestamp}}
**Remediated:** {{current_timestamp}}
**Duration:** {{elapsed_time}}

## Results Overview

| Story | Original Issues | Fixed | Remaining | Final Status |
|-------|-----------------|-------|-----------|--------------|
| {{story_id}} | {{original_count}} | {{fixed_count}} | {{remaining}} | PASS/NEEDS_WORK |

**Total Issues Fixed:** {{grand_fixed}} / {{grand_total}}

## Stories Now Complete
{{list of stories that achieved PASS status}}

## Stories Still Needing Work
{{list of stories with remaining issues, and what issues remain}}

## Files Modified During Remediation
{{deduplicated list of all files touched}}

## Next Steps
{{#if all_pass}}
1. All stories remediated successfully
2. Run tests: `go test ./...` and `npm test`
3. Commit changes if tests pass
4. Continue to next epic
{{else}}
1. Review remaining issues manually
2. Address BLOCKED stories
3. Re-run `/bulk-review {{epic}}` after manual fixes
4. Run `/bulk-remediate` again if needed
{{/if}}
```

Also output this summary to the console.

</steps>

## Error Handling

| Situation | Action |
|-----------|--------|
| Review file not found | Skip story, log error, continue to next |
| Agent fails to fix issue | Mark as COULD_NOT_FIX, continue to next issue |
| Story blocked by external dependency | Note in summary, skip, continue |
| All agents fail for a story | Log failure, continue to next story |
| Folder rename fails | Output warning, summary still valid |

## Example Usage

```bash
# Remediate latest bulk review folder (auto-discover)
/bulk-remediate

# Remediate specific epic's bulk review
/bulk-remediate 6
```

## Example Output

```
Found bulk review folder: _bmad-output/_BulkReviewEpic6/

Bulk Remediation Plan
Epic: 6
Stories to Remediate: 4
Total Issues: 25 (2 Critical, 6 High, 9 Medium, 8 Low)

[1/4] 6-1-treatment-log: 7 fixed, 0 remaining → PASS
[2/4] 6-2-feeding-log: 4 fixed, 0 remaining → PASS
[3/4] 6-3-harvest-tracking: 7 fixed, 0 remaining → PASS
[4/4] 6-4-equipment-log: 7 fixed, 0 remaining → PASS

Sprint status updated: 4 stories marked done

Archived: _BulkReviewEpic6/ → _BulkReviewEpic6_remediated_2026-01-25_1430/

All 25 issues remediated successfully.
```
