---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-review
inputDocuments:
  - prd.md
  - architecture.md
  - conversation-context
workflowType: prd-addendum
parentPRD: prd.md
epicTarget: 14
---

# PRD Addendum: Hive Task Management

**Author:** Jermoo
**Date:** 2026-01-29
**Version:** 1.1
**Status:** Ready for Approval
**Parent PRD:** prd.md (APIS v2.0)

---

## 1. Overview & Motivation

### 1.1 Problem Statement

Currently, APIS helps beekeepers **record what they did** (inspections, treatments, harvests) but does not help them **plan what they need to do**. Beekeepers often notice issues during inspections that require follow-up action days or weeks later:

- "Queen is getting old — requeen in spring"
- "Low stores — need to feed next week"
- "Add a honey super when flow starts"

Without a task system, these intentions get lost between the apiary and the next visit. Beekeepers resort to paper notes, phone reminders, or memory — none of which integrate with their hive data.

### 1.2 Solution Overview

A **task management system** that allows beekeepers to:
1. **Create tasks** in the portal before visiting the apiary
2. **See pending tasks** on mobile after scanning a hive's QR code
3. **Complete tasks** in the field with optional auto-updates to hive configuration
4. **Receive alerts** when tasks are due or overdue
5. **Get suggestions** from BeeBrain based on inspection data

### 1.3 User Value

| User Need | How Tasks Address It |
|-----------|---------------------|
| "I forget what I planned to do" | Tasks visible on mobile after QR scan |
| "I manage multiple hives" | Bulk-assign tasks to multiple hives at once |
| "I want to plan ahead" | Due dates with priority levels |
| "I hate manual data entry" | Task completion auto-updates hive config |
| "I want guidance" | BeeBrain suggests tasks based on inspection data |

### 1.4 Relationship to Existing PRD

This addendum extends:
- **Section 16: Hive Diary Module** — Tasks complement inspections
- **Section 17: BeeBrain AI** — BeeBrain suggests tasks
- **Section 18: Mobile PWA** — Mobile task view and completion

New navigation elements:
- **Portal:** Dedicated `/tasks` screen in sidebar
- **Mobile:** Single scrollable hive detail with bottom anchor navigation (Status | Tasks | Inspect)

---

## 2. User Stories

### 2.1 Primary User Stories

**US-HT-01: Planning Tasks Before Visit**
> As a beekeeper, I want to create tasks for specific hives before I visit the apiary, so that I remember what needs to be done when I'm there.

**US-HT-02: Seeing Tasks on Mobile**
> As a beekeeper at the apiary, I want to see pending tasks for a hive immediately after scanning its QR code, so that I know what actions are needed.

**US-HT-03: Completing Tasks in Field**
> As a beekeeper, I want to mark tasks as complete on my phone while at the hive, so that my hive records stay up to date without manual data entry.

**US-HT-04: Bulk Task Assignment**
> As a beekeeper with multiple hives, I want to assign the same task to multiple hives at once, so that I can efficiently plan treatments or seasonal preparations.

**US-HT-05: Task Reminders**
> As a beekeeper, I want to see which tasks are overdue in the portal, so that I don't miss important maintenance windows.

### 2.2 Secondary User Stories

**US-HT-06: BeeBrain Task Suggestions**
> As a beekeeper, I want BeeBrain to suggest tasks based on my inspection data, so that I don't miss issues that need follow-up.

**US-HT-07: Mobile Task Creation**
> As a beekeeper at the apiary, I want to quickly add a task for the current hive from my phone, so that I can capture follow-up actions while I'm thinking of them.

**US-HT-08: Custom Task Types**
> As a beekeeper, I want to create my own task types beyond the predefined list, so that I can track activities specific to my operation.

---

## 3. Functional Requirements

### 3.1 Task Library (Portal)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-01 | System shall provide predefined task templates | Must Have | Templates visible in task creation UI |
| FR-HT-02 | System shall allow users to create custom task templates | Must Have | Custom template saved and reusable |
| FR-HT-03 | Custom templates shall be stored per-tenant | Must Have | All tenant users see same library |
| FR-HT-04 | System templates shall be copied to tenant on first access | Must Have | Copy-on-first-use pattern |

**Predefined Task Types:**

| Task Type | Description | Auto-Effect on Completion |
|-----------|-------------|---------------------------|
| Requeen | Replace or introduce queen | Prompts for queen color/marking → updates `queen_year`, `queen_marking` |
| Add frame | Add frame(s) to a box | Prompts for box → increments frame count |
| Remove frame | Remove frame(s) from a box | Prompts for box → decrements frame count |
| Harvest frames | Extract honey from frames | Prompts for frame numbers → creates harvest record |
| Add feed | Provide supplemental feeding | Prompts for feed type/amount → creates feeding record |
| Treatment | Apply varroa or other treatment | Prompts for treatment type → creates treatment record |
| Add brood box | Add a brood box | Increments brood box count |
| Add honey super | Add a honey super | Increments super count |
| Remove box | Remove a box | Prompts for box type → decrements count |
| Custom | User-defined task | No auto-effect — logs completion only |

### 3.2 Task Assignment (Portal)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-05 | System shall allow assigning a task to a single hive | Must Have | Task appears on hive's task list |
| FR-HT-06 | System shall allow bulk-assigning a task to multiple hives | Must Have | Same task created for all selected hives |
| FR-HT-07 | Bulk assignment shall be limited to 500 hives per operation | Must Have | UI prevents exceeding limit |
| FR-HT-08 | Task assignment shall include priority selection | Must Have | Low/Medium/High/Urgent selectable |
| FR-HT-09 | Task assignment shall optionally include due date | Should Have | Date picker available |
| FR-HT-10 | Task assignment shall optionally include notes | Should Have | Text field for context |
| FR-HT-11 | System shall support "Select all in site" for bulk assignment | Should Have | Checkbox selects all hives in a site |

### 3.3 Task Management Screen (Portal)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-12 | Portal shall have dedicated Tasks screen (`/tasks`) | Must Have | Accessible from sidebar navigation |
| FR-HT-13 | Tasks screen shall display task library section | Must Have | Predefined + custom templates shown |
| FR-HT-14 | Tasks screen shall display task assignment section | Must Have | Multi-select hives, task dropdown |
| FR-HT-15 | Tasks screen shall display active tasks list | Must Have | All open tasks across tenant |
| FR-HT-16 | Active tasks shall be filterable by site, priority, status | Should Have | Filter dropdowns functional |
| FR-HT-17 | Active tasks shall support bulk actions (complete, delete) | Should Have | Checkbox selection with action buttons |

### 3.4 Hive Status Integration (Portal)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-18 | Hive detail page shall show task count summary | Must Have | "3 open · 1 overdue" displayed |
| FR-HT-19 | Task count shall be clickable to scroll to tasks section | Must Have | Smooth scroll to tasks |
| FR-HT-20 | Overdue tasks shall be visually highlighted | Must Have | Red badge or indicator |

### 3.5 Alert System (Portal)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-21 | Navigation shall show badge for overdue task count | Must Have | Badge on Tasks nav item |
| FR-HT-22 | Tasks page shall show alert banner for overdue tasks | Should Have | Banner at top of page |

### 3.6 Mobile Hive Detail (Single Scroll with Bottom Anchor Nav)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-23 | Mobile hive detail shall be a single scrollable page with three sections | Must Have | Status, Tasks, Inspect sections |
| FR-HT-24 | Mobile shall have 64px bottom navigation bar with anchor buttons | Must Have | Status / Tasks / Inspect buttons |
| FR-HT-25 | Tapping bottom nav button shall smooth-scroll to that section | Must Have | Scroll animation to section |
| FR-HT-26 | Bottom nav shall highlight current section as user scrolls | Must Have | Active indicator updates on scroll |
| FR-HT-27 | Status section shall be default view (top of page) | Must Have | Page loads at Status section |
| FR-HT-28 | Tasks section shall show task count in nav label | Should Have | "Tasks (3)" format |

### 3.7 Mobile Task View

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-29 | Tasks section shall show pending tasks for current hive | Must Have | Tasks listed in section |
| FR-HT-30 | Tasks shall be sorted by priority then due date | Must Have | Urgent/overdue at top |
| FR-HT-31 | Overdue tasks shall be visually distinct with red highlight | Must Have | Red indicator visible |
| FR-HT-32 | Each task shall be expandable for details | Should Have | Tap to expand |

**Priority Color Mapping:**

| Priority | Color | Indicator |
|----------|-------|-----------|
| Urgent | Red | 🔴 |
| High | Orange/Yellow | 🟠 |
| Medium | Green | 🟢 |
| Low | Gray | ⚪ |

### 3.8 Mobile Task Completion

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-33 | Tasks shall have "Complete" button (64px touch target) | Must Have | Button visible on task card |
| FR-HT-34 | Tasks with auto-effects shall prompt for required data | Must Have | Modal/form appears before completion |
| FR-HT-35 | Completed tasks shall create inspection note entry | Must Have | Entry appears in inspection notes |
| FR-HT-36 | Auto-applied changes shall be clearly marked in note | Must Have | "Auto-updated" label in note |
| FR-HT-37 | Tasks shall have "Delete" option | Must Have | Can remove task without completing |
| FR-HT-38 | Task completion shall work offline | Should Have | Queued and synced when online |

### 3.9 Mobile Task Creation

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-39 | Tasks section shall have "Add Task" button at bottom | Must Have | Visible below task list |
| FR-HT-40 | Add Task shall expand inline (not modal) | Should Have | Form appears in-place |
| FR-HT-41 | Add Task shall have task type dropdown | Must Have | Predefined types + Custom |
| FR-HT-42 | Custom task shall have text input for title | Must Have | Field appears when Custom selected |
| FR-HT-43 | Mobile-created tasks default to Medium priority | Should Have | Reasonable default |
| FR-HT-44 | Mobile-created tasks apply to current hive only | Must Have | No multi-hive from mobile |

### 3.10 BeeBrain Task Suggestions

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-HT-45 | BeeBrain shall analyze inspections for follow-up needs | Should Have | Analysis runs on-demand (user-triggered) |
| FR-HT-46 | BeeBrain shall suggest tasks based on patterns | Should Have | Suggestion card displayed |
| FR-HT-47 | Suggested tasks shall show BeeBrain source icon (🤖) | Should Have | Robot icon on task |
| FR-HT-48 | User shall be able to accept, modify, or dismiss suggestions | Should Have | Actions on suggestion card |
| FR-HT-49 | New BeeBrain run shall replace previous suggestions | Must Have | Old suggestions cleared on new analysis |

**BeeBrain Suggestion Triggers (Examples):**

| Inspection Finding | Suggested Task |
|--------------------|----------------|
| Honey stores = Low | Add feed (sugar syrup) |
| Queen cells present | Inspect for swarming / Consider split |
| Queen age > 2 years + declining productivity | Requeen in spring |
| Brood pattern = Spotty | Check for queen issues |
| Varroa count = High | Treatment required |

---

## 4. Non-Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| NFR-HT-01 | Task operations shall work offline on mobile | Must Have | IndexedDB storage, sync queue |
| NFR-HT-02 | Task list shall load in <500ms | Should Have | Performance acceptable |
| NFR-HT-03 | Bulk assignment shall handle up to 500 hives | Must Have | No timeout, progress indicator for large ops |
| NFR-HT-04 | Task completion prompts shall be touch-optimized | Must Have | 64px inputs, large buttons |
| NFR-HT-05 | All task API endpoints shall require JWT authentication | Must Have | Per architecture.md patterns |

---

## 5. Data Model

### 5.1 New Entities

```sql
-- Task templates (predefined + custom)
-- System templates have tenant_id = NULL, copied to tenant on first use
CREATE TABLE task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL for system templates
  type VARCHAR(50) NOT NULL,  -- 'requeen', 'add_frame', ..., 'custom'
  name VARCHAR(100) NOT NULL,
  description TEXT,
  auto_effects JSONB,         -- Schema of what gets auto-updated (predefined only)
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Tasks assigned to hives
CREATE TABLE hive_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  template_id UUID REFERENCES task_templates(id),
  custom_title VARCHAR(200),  -- Used when no template
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',  -- low, medium, high, urgent
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending, completed
  source VARCHAR(20) NOT NULL DEFAULT 'manual',    -- manual, beebrain
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMP,
  completion_data JSONB,      -- Prompted values (queen color, feed amount, etc.)
  auto_applied_changes JSONB  -- What was auto-updated on completion
);

-- BeeBrain task suggestions (replaced on each new analysis run)
CREATE TABLE task_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES inspections(id),
  suggested_template_id UUID REFERENCES task_templates(id),
  suggested_title VARCHAR(200),
  reason TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, accepted, dismissed
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5.2 Indexes

```sql
-- Task queries by hive and status
CREATE INDEX idx_hive_tasks_hive_status ON hive_tasks(hive_id, status);

-- Overdue task queries
CREATE INDEX idx_hive_tasks_due_date ON hive_tasks(due_date)
  WHERE status = 'pending';

-- Tenant-scoped queries
CREATE INDEX idx_hive_tasks_tenant ON hive_tasks(tenant_id);
CREATE INDEX idx_task_templates_tenant ON task_templates(tenant_id);
CREATE INDEX idx_task_suggestions_hive ON task_suggestions(hive_id, status);
```

### 5.3 Auto-Effects JSON Schema

Auto-effects define what happens when a predefined task is completed. Schema:

```json
{
  "prompts": [
    {
      "key": "color",
      "label": "Queen marking color",
      "type": "select",
      "options": ["white", "yellow", "red", "green", "blue", "unmarked"],
      "required": true
    }
  ],
  "updates": [
    {
      "target": "hive.queen_year",
      "action": "set",
      "value": "{{current_year}}"
    },
    {
      "target": "hive.queen_marking",
      "action": "set",
      "value_from": "completion_data.color"
    }
  ],
  "creates": [
    {
      "entity": "inspection_note",
      "fields": {
        "content": "Task completed: {{task.name}}. {{auto_summary}}"
      }
    }
  ]
}
```

**Note:** Custom auto-effects (user-defined) are deferred to v2.

### 5.4 API Endpoints

All endpoints require JWT authentication. Tenant context derived from JWT claims.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/task-templates` | List all templates (system + tenant custom) |
| POST | `/api/task-templates` | Create custom template |
| DELETE | `/api/task-templates/{id}` | Delete custom template (tenant-owned only) |
| GET | `/api/tasks` | List tasks (filterable: hive_id, site_id, status, priority) |
| POST | `/api/tasks` | Create task(s) — supports bulk via array (max 500) |
| GET | `/api/tasks/{id}` | Get single task |
| PATCH | `/api/tasks/{id}` | Update task (priority, due_date, etc.) |
| DELETE | `/api/tasks/{id}` | Delete task |
| POST | `/api/tasks/{id}/complete` | Complete task with completion_data |
| GET | `/api/hives/{id}/tasks` | Get tasks for specific hive |
| GET | `/api/tasks/overdue` | Get all overdue tasks for tenant |
| GET | `/api/hives/{id}/suggestions` | Get BeeBrain suggestions for hive |
| POST | `/api/hives/{id}/suggestions/{id}/accept` | Accept suggestion (creates task) |
| DELETE | `/api/hives/{id}/suggestions/{id}` | Dismiss suggestion |

**Bulk Create Request Example:**
```json
POST /api/tasks
{
  "tasks": [
    {"hive_id": "uuid1", "template_id": "uuid", "priority": "high", "due_date": "2026-02-01"},
    {"hive_id": "uuid2", "template_id": "uuid", "priority": "high", "due_date": "2026-02-01"}
  ]
}
```

**Bulk Create Response:**
```json
{
  "data": {
    "created": 2,
    "tasks": [{"id": "...", "hive_id": "uuid1", ...}, ...]
  }
}
```

---

## 6. UI Wireframes

### 6.1 Portal: Tasks Screen (`/tasks`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Tasks                                                    [+ New Task]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Task Library ─────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  [Requeen] [Add Frame] [Remove Frame] [Harvest] [Add Feed]         │ │
│  │  [Treatment] [Add Box] [Remove Box] [+ Create Custom]              │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ Assign Tasks ─────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  Task:     [Select task type          ▼]                           │ │
│  │                                                                     │ │
│  │  Hives:    ☑ Queen Bee #7        ☑ Worker's Paradise              │ │
│  │            ☐ Honey Factory       ☐ Bee Haven                       │ │
│  │            [Select all in: North Apiary ▼]   (2 of 500 max)       │ │
│  │                                                                     │ │
│  │  Priority: (⚪Low) (🟢Medium) (🟠High) (🔴Urgent)                   │ │
│  │  Due:      [Date picker]                                           │ │
│  │  Notes:    [Optional notes...]                                     │ │
│  │                                                                     │ │
│  │  [Assign to 2 Hives]                                               │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ Active Tasks (12 open · 2 overdue) ───────────────────────────────┐ │
│  │                                                                     │ │
│  │  Filter: [All Sites ▼] [All Priorities ▼] [Open ▼]    [Search...] │ │
│  │                                                                     │ │
│  │  ☐ │ Hive          │ Task        │ Priority │ Due     │ Status    │ │
│  │  ──┼───────────────┼─────────────┼──────────┼─────────┼───────────│ │
│  │  ☐ │ Queen Bee #7  │ Requeen     │ 🔴 Urgent│ Jan 25  │ ⚠ Overdue │ │
│  │  ☐ │ Worker's...   │ Add super   │ 🟠 High  │ Feb 1   │ Pending   │ │
│  │  ☐ │ Honey Factory │ Treatment   │ 🟢 Medium│ Feb 5   │ Pending   │ │
│  │                                                                     │ │
│  │  [Complete Selected] [Delete Selected]                             │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Mobile: Single Scroll with Bottom Anchor Navigation

```
┌─────────────────────────────────────────┐
│  < Back          Queen Bee #7      ⚙️   │
├─────────────────────────────────────────┤
│                                         │
│  ══ STATUS ═══════════════════════════  │  ← Section anchor
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🐝 Queen: 2 years old          │    │
│  │  📦 3 boxes (2 brood + 1 super) │    │
│  │  📊 Last inspection: 5 days ago │    │
│  │  📋 Tasks: 3 open · 1 overdue   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Recent Activity...]                   │
│  [Inspection History...]                │
│                                         │
│  ══ TASKS (3) ════════════════════════  │  ← Section anchor
│                                         │
│  ⚠️ OVERDUE                             │
│  ┌─────────────────────────────────┐    │
│  │ 🔴 Requeen            Jan 25    │    │
│  │ Marked queen failing            │    │
│  │ [Complete]         [Delete]     │    │  ← 64px buttons
│  └─────────────────────────────────┘    │
│                                         │
│  📋 PENDING                             │
│  ┌─────────────────────────────────┐    │
│  │ 🟠 Add honey super     Feb 1    │    │
│  │ [Complete]                      │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 🟢 Check stores        Feb 5    │    │
│  │ [Complete]                      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ➕ Add Task                     │    │
│  │  [Task type ▼]                  │    │
│  │  [Custom task name...]          │    │
│  │  [Add]                          │    │  ← 64px button
│  └─────────────────────────────────┘    │
│                                         │
│  ══ INSPECT ══════════════════════════  │  ← Section anchor
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │      START NEW INSPECTION       │    │  ← 64px button
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [View past inspections...]             │
│                                         │
├─────────────────────────────────────────┤
│ [●Status]   [Tasks (3)]   [Inspect]     │  ← 64px bottom nav
└─────────────────────────────────────────┘    Tap = scroll to section
                                              ● = current section
```

### 6.3 Task Completion Modal (Requeen Example)

```
┌─────────────────────────────────────────┐
│  Complete Task: Requeen                 │
├─────────────────────────────────────────┤
│                                         │
│  Queen marking color:                   │
│                                         │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │ ⚪  │ │ 🟡  │ │ 🔴  │ │ 🟢  │       │  ← 64px touch targets
│  │White│ │Yell │ │ Red │ │Green│       │
│  └─────┘ └─────┘ └─────┘ └─────┘       │
│  ┌─────┐ ┌─────────────────────┐       │
│  │ 🔵  │ │    No marking       │       │
│  │Blue │ └─────────────────────┘       │
│  └─────┘                               │
│                                         │
│  Notes (optional):                      │
│  ┌─────────────────────────────────┐   │
│  │ Replaced with local queen...    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │        COMPLETE TASK            │   │  ← 64px button
│  └─────────────────────────────────┘   │
│                                         │
│  This will update:                      │
│  • Queen year → 2026                    │
│  • Queen marking → [selected color]     │
│                                         │
└─────────────────────────────────────────┘
```

### 6.4 Empty/Error States

**No Tasks:**
```
┌─────────────────────────────────────┐
│  ══ TASKS (0) ════════════════════  │
│                                     │
│       📋                           │
│       No tasks for this hive        │
│                                     │
│       Plan your next visit by       │
│       adding a task below           │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  ➕ Add Task                 │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Offline Mode:**
```
┌─────────────────────────────────────┐
│  ☁️ Offline — changes will sync     │
└─────────────────────────────────────┘
```

---

## 7. Dependencies

### 7.1 Existing Features Required

| Dependency | Location | Status |
|------------|----------|--------|
| Hive CRUD | Epic 5 | Implemented |
| Mobile inspection flow | Epic 5 | Implemented |
| QR code scanning | Epic 5 | Implemented |
| BeeBrain engine | Epic 8 | Implemented |
| Offline sync (IndexedDB) | Epic 7 | Implemented |
| Inspection notes | Epic 5 | Implemented |

### 7.2 Architecture Alignment

This feature follows existing patterns from `architecture.md`:
- Go handlers in `internal/handlers/tasks.go`
- Storage in `internal/storage/tasks.go`
- React components in `src/components/` and `src/pages/`
- Hooks in `src/hooks/useTasks.ts`, `src/hooks/useTaskSuggestions.ts`

---

## 8. Out of Scope (v1)

| Feature | Rationale | Future Consideration |
|---------|-----------|---------------------|
| Recurring tasks | Adds complexity | v2 — "Every 2 weeks: check mites" |
| Site-level tasks | Focus on hive-level first | v2 — "All hives: winter prep" |
| Task assignments to users | Single-user focus for now | v2 — Team features |
| Push notifications | PWA limitation | v2 — Native app or web push |
| Task templates marketplace | Community feature | v3 |
| Custom auto-effects | User-defined auto-updates | v2 — Allow users to define what happens on completion |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Task completion rate | >70% | Completed / Created |
| Time from task creation to completion | Tracked | Avg days |
| Mobile task completions | >50% of all completions | Source tracking |
| BeeBrain suggestion acceptance | >30% | Accepted / Suggested |
| Tasks created per active user | >5/month | Usage analytics |

---

## 10. Implementation Notes

### 10.1 Suggested Epic Structure

**Epic 14: Hive Task Management**

| Story | Description |
|-------|-------------|
| 14.1 | Database migrations + system template seeding |
| 14.2 | Task CRUD API endpoints (including bulk create) |
| 14.3 | Task templates API + copy-on-first-use logic |
| 14.4 | Portal: Tasks screen with library + assignment |
| 14.5 | Portal: Active tasks list with filters |
| 14.6 | Portal: Hive detail task count integration |
| 14.7 | Mobile: Refactor hive detail to single scroll layout |
| 14.8 | Mobile: Bottom anchor navigation bar |
| 14.9 | Mobile: Tasks section view |
| 14.10 | Mobile: Task completion flow with auto-effect prompts |
| 14.11 | Mobile: Inline task creation |
| 14.12 | Auto-update hive configuration on completion |
| 14.13 | Task completion → inspection note logging |
| 14.14 | Overdue alerts + navigation badge |
| 14.15 | BeeBrain task suggestions integration |
| 14.16 | Offline task support (IndexedDB) |

### 10.2 Risk Considerations

| Risk | Mitigation |
|------|------------|
| Mobile single-scroll is long | Section anchors provide quick navigation |
| Auto-update creates incorrect data | Clear "auto-updated" labels, manual override via inspection edit |
| BeeBrain suggestions feel spammy | Replace on new run (not accumulate), easy dismiss |
| Offline sync conflicts | Last-write-wins with sync status indicator |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Task | A planned action to be performed on a hive |
| Task Template | A reusable task type (predefined or custom) |
| Auto-effect | Automatic update to hive data when task is completed |
| Bulk assignment | Creating the same task for multiple hives at once |
| BeeBrain suggestion | AI-generated task recommendation based on inspection data |
| Anchor navigation | Bottom bar buttons that scroll to page sections |

---

## Appendix B: Offline Data Schema (IndexedDB)

```typescript
// Dexie.js schema additions
interface OfflineTask {
  id: string;          // local_uuid format for offline-created
  hive_id: string;
  template_id?: string;
  custom_title?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  status: 'pending' | 'completed';
  completion_data?: Record<string, any>;
  synced: boolean;
  created_at: string;
  completed_at?: string;
}

// Add to existing Dexie db
db.version(X).stores({
  ...existingStores,
  offlineTasks: 'id, hive_id, status, synced'
});
```

---

**Document Status:** Ready for Approval
**Version:** 1.1
**Last Updated:** 2026-01-29
**Next Step:** Approve, then create Epic 14 with stories
