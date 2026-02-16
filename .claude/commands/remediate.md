---
description: 'Fix issues from an existing code review file. Parses issues, applies fixes, marks done. No re-review - trusts existing findings.'
---

# Remediate - Fix Issues from Existing Review

**Purpose:** Take an existing code review output file (from `/bulk-review` or `/code-review`) and fix all issues found. Does NOT re-review - trusts the existing findings and goes straight to fixing.

## Arguments

- `$ARGUMENTS` should contain the path to a review file (e.g., `_bmad-output/_BulkReviewEpic6/review-6-1-treatment-log.md`)
- If no path provided, will prompt for one

## Execution Steps

<steps CRITICAL="TRUE">

### Step 1: Load Review File

1. If `$ARGUMENTS` is empty, ask: "Which review file should I remediate? (e.g., `_bmad-output/_BulkReviewEpic6/review-6-1-treatment-log.md`)"
2. Read the COMPLETE review file
3. Extract key metadata:
   - `{{story_id}}` from the "**Story:**" line (e.g., `6-1-treatment-log`)
   - `{{review_status}}` from "**Status:**" line
   - `{{story_file}}` = `_bmad-output/implementation-artifacts/{{story_id}}.md`
4. If status is already "PASS", output "Review already passed. Nothing to remediate." and exit.

### Step 2: Parse Issues

Parse the "## Issues Found" section. Extract ALL issues from these subsections:

```
### Critical (Must Fix)
- [ ] Issue description [file:line]

### High (Should Fix)
- [ ] Issue description [file:line]

### Medium (Consider Fixing)
- [ ] Issue description [file:line]

### Low (Nice to Have)
- [ ] Issue description [file:line]
```

For each issue, extract:
- `{{severity}}`: Critical, High, Medium, or Low
- `{{issue_id}}`: e.g., H1, M2, L1 (if present) or generate sequential
- `{{description}}`: The issue text
- `{{file_location}}`: The `[file:line]` reference (may be `[no file]` for missing tests)
- `{{is_checked}}`: Whether already marked `[x]` (skip if already fixed)

Create prioritized queue:
1. All Critical issues (must fix)
2. All High issues (must fix)
3. All Medium issues (should fix)
4. All Low issues (will fix - per user request, we fix ALL severities)

Skip any issues already marked `[x]`.

### Step 3: Display Remediation Plan

```markdown
## Remediation Plan for {{story_id}}

**Review File:** {{review_file_path}}
**Story File:** {{story_file}}

### Issues to Fix ({{total_count}} total)

**Critical ({{critical_count}}):**
- [ ] {{C1_description}} [{{file:line}}]

**High ({{high_count}}):**
- [ ] {{H1_description}} [{{file:line}}]
- [ ] {{H2_description}} [{{file:line}}]

**Medium ({{medium_count}}):**
- [ ] {{M1_description}} [{{file:line}}]

**Low ({{low_count}}):**
- [ ] {{L1_description}} [{{file:line}}]

Proceeding with fixes...
```

### Step 4: Fix Each Issue

For EACH issue in priority order (Critical → High → Medium → Low):

1. **Read Context:**
   - If `{{file_location}}` specifies a file:line, read that file
   - If `[no file]` (e.g., missing tests), determine what files need to be created
   - Read the story file for additional context if needed

2. **Understand the Problem:**
   - Parse the `{{description}}` to understand what's wrong
   - Check the "## Recommendations" section of review file for suggested fixes

3. **Apply the Fix:**
   - Make the code change using Edit tool
   - If creating new files (tests), use Write tool
   - If multiple files affected, fix all of them

4. **Verify Fix:**
   - For test-related issues: run the relevant tests if possible
   - For validation issues: ensure the validation is actually added
   - For security issues: verify the vulnerability is addressed

5. **Track Progress:**
   - After each fix, output:
     ```
     [x] {{severity}}{{issue_id}}: {{short_description}} - FIXED
         Applied: {{brief explanation of what was changed}}
     ```

### Step 5: Update Review File

After all issues are fixed:

1. Read the review file again
2. For each issue that was successfully fixed:
   - Change `- [ ]` to `- [x]` in the review file
3. Update the "**Status:**" line:
   - If ALL Critical, High, and Medium issues fixed → `PASS`
   - Otherwise → `NEEDS_WORK` (with note about remaining issues)
4. Add a "## Remediation Log" section at the bottom:
   ```markdown
   ## Remediation Log

   **Remediated:** {{timestamp}}
   **Issues Fixed:** {{fixed_count}} of {{total_count}}

   ### Changes Applied
   - {{issue_id}}: {{what was fixed}}
   - {{issue_id}}: {{what was fixed}}

   ### Remaining Issues
   - {{issue_id}}: {{why not fixed}} (if any)
   ```
5. Save the review file

### Step 6: Update Story File

1. Read `{{story_file}}`
2. If ALL Critical and High issues are fixed:
   - Update story Status field to "done" (if not already)
3. Add entries to the story's Dev Agent Record → Change Log:
   ```
   - [{{date}}] Remediation: Fixed {{count}} issues from code review
   ```
4. Save the story file

### Step 7: Sync Sprint Status

1. Check if `_bmad-output/implementation-artifacts/sprint-status.yaml` exists
2. If exists:
   - Find the story key in `development_status`
   - If story status is now "done", update sprint-status.yaml to match
   - Preserve all comments and structure
3. Output sync result

### Step 8: Final Summary

```markdown
## Remediation Complete: {{story_id}}

**Issues Fixed:** {{fixed_count}} / {{total_count}}
- Critical: {{critical_fixed}} / {{critical_total}}
- High: {{high_fixed}} / {{high_total}}
- Medium: {{medium_fixed}} / {{medium_total}}
- Low: {{low_fixed}} / {{low_total}}

**Story Status:** {{new_status}}
**Sprint Status:** {{synced/not synced}}

**Files Modified:**
- {{list of files changed during remediation}}

{{#if remaining_issues}}
**Remaining Issues (could not auto-fix):**
- {{issue_id}}: {{reason}}
{{/if}}
```

</steps>

## Issue Type Handling

### Common Issue Patterns and Fixes

| Issue Type | How to Fix |
|------------|------------|
| "No tests written" | Create test file in `tests/` directory following project patterns |
| "Potential IDOR vulnerability" | Add explicit tenant_id validation in handler before operations |
| "Not transactional" | Wrap operations in `conn.Begin()` / `tx.Commit()` / `tx.Rollback()` |
| "Missing validation" | Add validation check before processing |
| "AC not implemented" | Implement the missing acceptance criteria |
| "Task marked [x] but not done" | Actually implement the task |

### When to Skip an Issue

Only skip if:
- Issue requires architectural decision that would affect other stories
- Issue references external system not yet available
- Fix would break other functionality (note this in remaining issues)

Do NOT skip for:
- "This is hard" - figure it out
- "Not sure how" - read the codebase patterns
- "Might take a while" - just do it

## Example Usage

```bash
# Fix specific review file
/remediate _bmad-output/_BulkReviewEpic6/review-6-1-treatment-log.md

# Will prompt for path if not provided
/remediate
```
