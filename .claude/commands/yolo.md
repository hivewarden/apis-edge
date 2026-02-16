---
description: 'Full epic automation: serially process all stories through create-story, context gathering, dev-story, code-review with auto-remediation. Only stops when user input is genuinely required.'
---

# YOLO Mode - Full Epic Automation

**Purpose:** Process all stories in an epic through the complete development lifecycle: create-story → gather context → validate ready-for-dev → dev-story → code-review → auto-remediate → mark done. Uses Opus sub-agents. Only stops for genuinely ambiguous decisions.

## Arguments

- `$ARGUMENTS` should contain the epic number (e.g., `6` for Epic 6)

## Philosophy

This workflow embodies "YOLO" (You Only Launch Once) - trust the AI agents to make reasonable decisions and keep moving. We auto-fix all clear issues and only pause for:
- Genuinely ambiguous architectural decisions
- Multiple equally-valid approaches with significant trade-offs
- Security concerns requiring human judgment
- Breaking changes that could affect other epics

## Execution Steps

<steps CRITICAL="TRUE">

### Step 1: Parse Arguments and Load Epic Context

1. Extract epic number from `$ARGUMENTS`
2. If no epic number provided, ask user: "Which epic should I YOLO? (e.g., 6, 7, 8)"
3. Read `_bmad-output/implementation-artifacts/sprint-status.yaml`
4. Read `_bmad/bmm/docs/epics.md` to understand the epic's stories
5. Extract all stories for this epic and their current status

### Step 2: Build Story Queue

1. From sprint-status.yaml, identify stories with status: `backlog`, `ready-for-dev`, or `in-progress`
2. Sort stories by their numeric order (e.g., 6-1 before 6-2 before 6-3)
3. Create the processing queue - these will be done SERIALLY (not parallel)
4. Display queue to user:
   ```
   YOLO Queue for Epic {N}:
   [ ] {story-1-key} - {title} (status: backlog)
   [ ] {story-2-key} - {title} (status: ready-for-dev)
   ...
   Skipping (already done):
   [x] {story-0-key} - {title}

   Press Enter to begin or 'q' to quit.
   ```
5. Wait for user confirmation before starting

### Step 3: Process Each Story Serially

For EACH story in the queue, execute the following phases using Task tool with Opus agents:

---

#### Phase A: Create Story (if status = backlog)

**Skip if:** Story file already exists in `_bmad-output/implementation-artifacts/{story-key}.md`

Launch Task agent:
- `subagent_type`: "general-purpose"
- `model`: "opus"
- `description`: "Create story {story_key}"
- `run_in_background`: false (WAIT for completion)
- `prompt`:
  ```
  Create story {story_key} for Epic {epic_number}: {story_title}

  ## CRITICAL: Use the BMAD Workflow Skill

  You MUST invoke the create-story workflow using the Skill tool:

  Skill tool: skill="bmad:bmm:workflows:create-story" args="{story_key}"

  This workflow will guide you through creating a proper story file with:
  - Full tasks and subtasks
  - Acceptance criteria
  - Technical context

  The workflow saves to: _bmad-output/implementation-artifacts/{story_key}.md
  And updates sprint-status.yaml automatically.

  ## Context

  First read CLAUDE.md to understand project conventions.
  Make autonomous decisions. Only ask if genuinely ambiguous.
  ```

**After Phase A:** Verify story file exists before continuing.

---

#### Phase B: Gather Context & Validate Ready-for-Dev

Launch Task agent:
- `subagent_type`: "general-purpose"
- `model`: "opus"
- `description`: "Context for {story_key}"
- `run_in_background`: false
- `prompt`:
  ```
  Validate story {story_key} is ready for development.

  Story file: _bmad-output/implementation-artifacts/{story_key}.md

  Instructions:
  1. Read the complete story file
  2. Verify it has:
     - Clear acceptance criteria (Given/When/Then or bullet format)
     - Defined tasks and subtasks
     - Referenced files or components to modify
  3. Gather any missing technical context:
     - If story mentions modifying files, read those files
     - If story references API endpoints, check handlers exist
     - If story involves database, check schema/migrations
  4. If story is incomplete:
     - Add missing technical context directly to story file
     - Add any discovered subtasks
     - DO NOT ask user - make reasonable inferences
  5. Output: "Ready for dev" or list of blockers that REQUIRE user input

  Remember: Only block if genuinely ambiguous. Default to action.
  ```

**After Phase B:** If output contains blockers, pause and ask user. Otherwise continue.

---

#### Phase C: Dev Story (Implementation)

Launch Task agent:
- `subagent_type`: "general-purpose"
- `model`: "opus"
- `description`: "Dev story {story_key}"
- `run_in_background`: false
- `prompt`:
  ```
  Implement story {story_key}

  Story file: _bmad-output/implementation-artifacts/{story_key}.md

  ## CRITICAL: Use the BMAD Workflow Skill

  You MUST invoke the dev-story workflow using the Skill tool:

  Skill tool: skill="bmad:bmm:workflows:dev-story" args="{story_key}"

  This workflow will guide you through implementation.

  ## MANDATORY Context (Read First)

  1. Read CLAUDE.md for project conventions
  2. For ANY React/frontend work in apis-dashboard/:
     - You MUST use: Skill tool: skill="frontend-design"
     - This applies to components, pages, hooks, styling

  ## YOLO Mode Rules

  - Make reasonable implementation decisions
  - Follow existing patterns in the codebase
  - Write real tests, not placeholders
  - Do NOT ask for approval - implement the full story
  - Only stop for genuine blockers requiring user decision
  ```

**After Phase C:** Verify implementation was created before continuing.

---

#### Phase D: Code Review with Auto-Remediation

This phase loops until PASS or user intervention required.

**Set:** `max_review_cycles = 3`
**Set:** `review_cycle = 1`

**Loop while** `review_cycle <= max_review_cycles`:

Launch Task agent for Review:
- `subagent_type`: "general-purpose"
- `model`: "opus"
- `description`: "Review {story_key} (cycle {review_cycle})"
- `run_in_background`: false
- `prompt`:
  ```
  Review story {story_key} (cycle {review_cycle})

  Story file: _bmad-output/implementation-artifacts/{story_key}.md

  ## CRITICAL: Use the BMAD Workflow Skill

  You MUST invoke the code-review workflow using the Skill tool:

  Skill tool: skill="bmad:bmm:workflows:code-review" args="{story_key}"

  This workflow performs adversarial review finding 3-10 issues minimum.

  ## YOLO Mode Output Format

  After running the review, provide output in this exact format:

  REVIEW_STATUS: PASS | NEEDS_WORK | BLOCKED

  CRITICAL_ISSUES:
  - [description] | [file:line] | [AUTO_FIXABLE: yes/no]

  HIGH_ISSUES:
  - [description] | [file:line] | [AUTO_FIXABLE: yes/no]

  MEDIUM_ISSUES:
  - [description] | [file:line] | [AUTO_FIXABLE: yes/no]

  LOW_ISSUES:
  - [description] | [file:line] | [AUTO_FIXABLE: yes/no]

  BLOCKER_REASON: [only if BLOCKED - explain why user input needed]

  Mark AUTO_FIXABLE: yes for issues with clear, obvious fixes.
  Mark AUTO_FIXABLE: no for issues requiring architectural decisions.
  ```

**Parse review output:**

- If `REVIEW_STATUS: PASS`:
  - Update sprint-status.yaml: {story_key} → done
  - Update story file status to "done"
  - **Break loop - move to next story**

- If `REVIEW_STATUS: BLOCKED`:
  - Display blocker reason to user
  - Wait for user input/decision
  - Apply user decision and re-run review

- If `REVIEW_STATUS: NEEDS_WORK`:
  - Collect all CRITICAL, HIGH, and MEDIUM issues marked AUTO_FIXABLE: yes
  - If no auto-fixable issues but issues exist, ask user which to fix
  - Launch remediation agent (below)
  - Increment `review_cycle`

**If review_cycle > max_review_cycles:**
  - Display: "Story {story_key} failed to pass review after {max_review_cycles} cycles"
  - List remaining issues
  - Ask user: "Continue to next story or fix manually?"

---

#### Phase D.1: Auto-Remediation (within review loop)

Launch Task agent for Fixes:
- `subagent_type`: "general-purpose"
- `model`: "opus"
- `description`: "Fix {story_key} issues"
- `run_in_background`: false
- `prompt`:
  ```
  Fix code review issues for story: {story_key}

  Story file: _bmad-output/implementation-artifacts/{story_key}.md

  ## CRITICAL: Use the BMAD Workflow Skill

  You MUST invoke the remediate workflow using the Skill tool:

  Skill tool: skill="remediate" args="{story_key}"

  Pass the following issues to fix:
  {list of AUTO_FIXABLE issues from review}

  ## Context

  - Read CLAUDE.md for project conventions
  - For frontend fixes: use Skill tool: skill="frontend-design"
  - Run tests after fixes to verify

  ## Output Format

  FIXED:
  - [issue description] - [what was done]

  COULD_NOT_FIX:
  - [issue description] - [reason]
  ```

**After remediation:** Return to review loop (Phase D).

---

#### Phase E: Story Complete

After a story passes review:
1. Update sprint-status.yaml: {story_key} → done
2. Display completion message:
   ```
   [x] {story_key} COMPLETE

   Files changed: {count}
   Tests added: {count}
   Review cycles: {cycles}

   Moving to next story...
   ```

### Step 4: Move to Next Story

Repeat Step 3 for the next story in queue.

### Step 5: Epic Complete Summary

After all stories processed:

```markdown
# YOLO Epic {N} Summary

**Started:** {timestamp}
**Completed:** {timestamp}

## Stories Processed
| Story | Status | Review Cycles | Files Changed |
|-------|--------|---------------|---------------|
| {key} | DONE   | 2             | 5             |
| {key} | DONE   | 1             | 3             |
| {key} | BLOCKED| -             | -             |

## Blocked Stories (Require Attention)
- {key}: {blocker reason}

## Next Steps
1. Address any blocked stories manually
2. Run retrospective: `/bmad:bmm:workflows:retrospective`
3. Update epic status in sprint-status.yaml to "done" if all stories complete
```

</steps>

## Escalation Rules

Only stop/pause for:
1. **Architectural ambiguity**: Multiple valid approaches with significant trade-offs
2. **Missing requirements**: Story references undefined external system
3. **Security concerns**: Potential vulnerability needs human judgment
4. **Review cycle limit**: Story failed 3 review cycles
5. **Circular dependency**: Fix introduces new issues

Do NOT stop for:
- Minor code style preferences (pick one and move on)
- Test implementation details (follow existing patterns)
- File organization (use existing conventions)
- Documentation format (use project standards)

## Example Usage

```
/yolo 6
```

This will:
1. Find all incomplete stories in Epic 6
2. Process each serially through the full dev lifecycle
3. Auto-remediate HIGH/MEDIUM issues
4. Only pause when human judgment genuinely required
5. Mark stories done and update sprint-status.yaml
