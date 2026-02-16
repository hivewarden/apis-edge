---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd-addendum-hive-tasks.md
  - _bmad-output/planning-artifacts/architecture.md
epicNumber: 14
epicTitle: "Hive Task Management"
status: "ready"
totalStories: 16
phases: 5
validatedAt: "2026-01-29"
---

# Epic 14: Hive Task Management

## Overview

This document provides the epic and story breakdown for Epic 14 - Hive Task Management, enabling beekeepers to plan, track, and complete tasks for their hives with mobile-first completion flows, auto-effects on hive configuration, and BeeBrain AI suggestions.

**Epic Goal:** Enable beekeepers to plan tasks before apiary visits, see pending tasks on mobile after QR scan, complete tasks with automatic hive configuration updates, receive overdue alerts, and get AI-powered task suggestions from BeeBrain.

## Requirements Inventory

### Functional Requirements

**FR-HT: Task Library (Portal)**
| ID | Requirement |
|----|-------------|
| FR-HT-01 | System shall provide predefined task templates |
| FR-HT-02 | System shall allow users to create custom task templates |
| FR-HT-03 | Custom templates shall be stored per-tenant |
| FR-HT-04 | System templates shall be copied to tenant on first access |

**FR-HT: Task Assignment (Portal)**
| ID | Requirement |
|----|-------------|
| FR-HT-05 | System shall allow assigning a task to a single hive |
| FR-HT-06 | System shall allow bulk-assigning a task to multiple hives |
| FR-HT-07 | Bulk assignment shall be limited to 500 hives per operation |
| FR-HT-08 | Task assignment shall include priority selection |
| FR-HT-09 | Task assignment shall optionally include due date |
| FR-HT-10 | Task assignment shall optionally include notes |
| FR-HT-11 | System shall support "Select all in site" for bulk assignment |

**FR-HT: Task Management Screen (Portal)**
| ID | Requirement |
|----|-------------|
| FR-HT-12 | Portal shall have dedicated Tasks screen (`/tasks`) |
| FR-HT-13 | Tasks screen shall display task library section |
| FR-HT-14 | Tasks screen shall display task assignment section |
| FR-HT-15 | Tasks screen shall display active tasks list |
| FR-HT-16 | Active tasks shall be filterable by site, priority, status |
| FR-HT-17 | Active tasks shall support bulk actions (complete, delete) |

**FR-HT: Hive Status Integration (Portal)**
| ID | Requirement |
|----|-------------|
| FR-HT-18 | Hive detail page shall show task count summary |
| FR-HT-19 | Task count shall be clickable to scroll to tasks section |
| FR-HT-20 | Overdue tasks shall be visually highlighted |

**FR-HT: Alert System (Portal)**
| ID | Requirement |
|----|-------------|
| FR-HT-21 | Navigation shall show badge for overdue task count |
| FR-HT-22 | Tasks page shall show alert banner for overdue tasks |

**FR-HT: Mobile Hive Detail Layout**
| ID | Requirement |
|----|-------------|
| FR-HT-23 | Mobile hive detail shall be a single scrollable page with three sections |
| FR-HT-24 | Mobile shall have 64px bottom navigation bar with anchor buttons |
| FR-HT-25 | Tapping bottom nav button shall smooth-scroll to that section |
| FR-HT-26 | Bottom nav shall highlight current section as user scrolls |
| FR-HT-27 | Status section shall be default view (top of page) |
| FR-HT-28 | Tasks section shall show task count in nav label |

**FR-HT: Mobile Task View**
| ID | Requirement |
|----|-------------|
| FR-HT-29 | Tasks section shall show pending tasks for current hive |
| FR-HT-30 | Tasks shall be sorted by priority then due date |
| FR-HT-31 | Overdue tasks shall be visually distinct with red highlight |
| FR-HT-32 | Each task shall be expandable for details |

**FR-HT: Mobile Task Completion**
| ID | Requirement |
|----|-------------|
| FR-HT-33 | Tasks shall have "Complete" button (64px touch target) |
| FR-HT-34 | Tasks with auto-effects shall prompt for required data |
| FR-HT-35 | Completed tasks shall create inspection note entry |
| FR-HT-36 | Auto-applied changes shall be clearly marked in note |
| FR-HT-37 | Tasks shall have "Delete" option |
| FR-HT-38 | Task completion shall work offline |

**FR-HT: Mobile Task Creation**
| ID | Requirement |
|----|-------------|
| FR-HT-39 | Tasks section shall have "Add Task" button at bottom |
| FR-HT-40 | Add Task shall expand inline (not modal) |
| FR-HT-41 | Add Task shall have task type dropdown |
| FR-HT-42 | Custom task shall have text input for title |
| FR-HT-43 | Mobile-created tasks default to Medium priority |
| FR-HT-44 | Mobile-created tasks apply to current hive only |

**FR-HT: BeeBrain Task Suggestions**
| ID | Requirement |
|----|-------------|
| FR-HT-45 | BeeBrain shall analyze inspections for follow-up needs |
| FR-HT-46 | BeeBrain shall suggest tasks based on patterns |
| FR-HT-47 | Suggested tasks shall show BeeBrain source icon |
| FR-HT-48 | User shall be able to accept, modify, or dismiss suggestions |
| FR-HT-49 | New BeeBrain run shall replace previous suggestions |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-HT-01 | Task operations shall work offline on mobile |
| NFR-HT-02 | Task list shall load in <500ms |
| NFR-HT-03 | Bulk assignment shall handle up to 500 hives |
| NFR-HT-04 | Task completion prompts shall be touch-optimized (64px inputs) |
| NFR-HT-05 | All task API endpoints shall require JWT authentication |

### Additional Requirements (from Architecture)

**Database Schema:**
- task_templates table (id, tenant_id, type, name, description, auto_effects, is_system, created_at, created_by)
- hive_tasks table (id, tenant_id, hive_id, template_id, custom_title, description, priority, due_date, status, source, created_by, created_at, completed_by, completed_at, completion_data, auto_applied_changes)
- task_suggestions table (id, tenant_id, hive_id, inspection_id, suggested_template_id, suggested_title, reason, priority, status, created_at)

**Predefined Task Types:**
- Requeen (auto-effect: updates queen_year, queen_marking)
- Add frame (auto-effect: increments frame count)
- Remove frame (auto-effect: decrements frame count)
- Harvest frames (auto-effect: creates harvest record)
- Add feed (auto-effect: creates feeding record)
- Treatment (auto-effect: creates treatment record)
- Add brood box (auto-effect: increments brood box count)
- Add honey super (auto-effect: increments super count)
- Remove box (auto-effect: decrements box count)
- Custom (no auto-effect)

**API Endpoints:**
- GET /api/task-templates — List all templates
- POST /api/task-templates — Create custom template
- DELETE /api/task-templates/{id} — Delete custom template
- GET /api/tasks — List tasks (filterable)
- POST /api/tasks — Create task(s), supports bulk
- GET /api/tasks/{id} — Get single task
- PATCH /api/tasks/{id} — Update task
- DELETE /api/tasks/{id} — Delete task
- POST /api/tasks/{id}/complete — Complete task
- GET /api/hives/{id}/tasks — Get tasks for hive
- GET /api/tasks/overdue — Get overdue tasks
- GET /api/hives/{id}/suggestions — Get BeeBrain suggestions
- POST /api/hives/{id}/suggestions/{id}/accept — Accept suggestion
- DELETE /api/hives/{id}/suggestions/{id} — Dismiss suggestion

## FR Coverage Map

```
FR-HT-01 → 14.1, 14.3 (Predefined templates seeded)
FR-HT-02 → 14.3 (Custom template creation)
FR-HT-03 → 14.3 (Tenant-scoped templates)
FR-HT-04 → 14.3 (Copy-on-first-use)
FR-HT-05 → 14.2 (Single hive assignment)
FR-HT-06 → 14.2 (Bulk assignment)
FR-HT-07 → 14.2 (500 hive limit)
FR-HT-08 → 14.2 (Priority selection)
FR-HT-09 → 14.2 (Due date)
FR-HT-10 → 14.2 (Notes)
FR-HT-11 → 14.4 (Select all in site)
FR-HT-12 → 14.4 (Tasks screen route)
FR-HT-13 → 14.4 (Library section)
FR-HT-14 → 14.4 (Assignment section)
FR-HT-15 → 14.5 (Active tasks list)
FR-HT-16 → 14.5 (Filters)
FR-HT-17 → 14.5 (Bulk actions)
FR-HT-18 → 14.6 (Task count summary)
FR-HT-19 → 14.6 (Scroll to tasks)
FR-HT-20 → 14.6 (Overdue highlight)
FR-HT-21 → 14.14 (Nav badge)
FR-HT-22 → 14.14 (Alert banner)
FR-HT-23 → 14.7 (Single scroll layout)
FR-HT-24 → 14.8 (Bottom nav bar)
FR-HT-25 → 14.8 (Smooth scroll)
FR-HT-26 → 14.8 (Active indicator)
FR-HT-27 → 14.7 (Status default)
FR-HT-28 → 14.8 (Task count label)
FR-HT-29 → 14.9 (Pending tasks)
FR-HT-30 → 14.9 (Sort order)
FR-HT-31 → 14.9 (Overdue style)
FR-HT-32 → 14.9 (Expandable)
FR-HT-33 → 14.10 (Complete button)
FR-HT-34 → 14.10 (Auto-effect prompts)
FR-HT-35 → 14.13 (Inspection note)
FR-HT-36 → 14.13 (Auto-updated label)
FR-HT-37 → 14.10 (Delete option)
FR-HT-38 → 14.16 (Offline completion)
FR-HT-39 → 14.11 (Add Task button)
FR-HT-40 → 14.11 (Inline expansion)
FR-HT-41 → 14.11 (Type dropdown)
FR-HT-42 → 14.11 (Custom title input)
FR-HT-43 → 14.11 (Default priority)
FR-HT-44 → 14.11 (Current hive only)
FR-HT-45 → 14.15 (BeeBrain analysis)
FR-HT-46 → 14.15 (Pattern suggestions)
FR-HT-47 → 14.15 (Robot icon)
FR-HT-48 → 14.15 (Accept/modify/dismiss)
FR-HT-49 → 14.15 (Replace on new run)
NFR-HT-01 → 14.16 (IndexedDB)
NFR-HT-02 → 14.2, 14.5 (Load performance)
NFR-HT-03 → 14.2 (Bulk handling)
NFR-HT-04 → 14.10, 14.11 (Touch optimization)
NFR-HT-05 → 14.2 (JWT auth)
```

## Epic List

### Phase 1: Backend Foundation (Stories 14.1 - 14.3)
Build database schema and API endpoints. After this phase, backend is complete for all task operations.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 14.1 | Database migrations + system template seeding | FR-HT-01 |
| 14.2 | Task CRUD API endpoints | FR-HT-05 to FR-HT-10, NFR-HT-02, NFR-HT-03, NFR-HT-05 |
| 14.3 | Task templates API + copy-on-first-use | FR-HT-01 to FR-HT-04 |

### Phase 2: Portal UI (Stories 14.4 - 14.6)
Build desktop task management experience. After this phase, portal users can manage tasks.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 14.4 | Portal: Tasks screen with library + assignment | FR-HT-11 to FR-HT-14 |
| 14.5 | Portal: Active tasks list with filters | FR-HT-15 to FR-HT-17 |
| 14.6 | Portal: Hive detail task count integration | FR-HT-18 to FR-HT-20 |

### Phase 3: Mobile Experience (Stories 14.7 - 14.11)
Build mobile-first task experience. After this phase, mobile task workflow is complete.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 14.7 | Mobile: Refactor hive detail to single scroll layout | FR-HT-23, FR-HT-27 |
| 14.8 | Mobile: Bottom anchor navigation bar | FR-HT-24 to FR-HT-26, FR-HT-28 |
| 14.9 | Mobile: Tasks section view | FR-HT-29 to FR-HT-32 |
| 14.10 | Mobile: Task completion flow with auto-effect prompts | FR-HT-33, FR-HT-34, FR-HT-37, NFR-HT-04 |
| 14.11 | Mobile: Inline task creation | FR-HT-39 to FR-HT-44, NFR-HT-04 |

### Phase 4: Automation & Intelligence (Stories 14.12 - 14.15)
Build automation features. After this phase, tasks auto-update hives and BeeBrain suggests tasks.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 14.12 | Auto-update hive configuration on completion | (supports FR-HT-34) |
| 14.13 | Task completion → inspection note logging | FR-HT-35, FR-HT-36 |
| 14.14 | Overdue alerts + navigation badge | FR-HT-21, FR-HT-22 |
| 14.15 | BeeBrain task suggestions integration | FR-HT-45 to FR-HT-49 |

### Phase 5: Offline Support (Story 14.16)
Enable offline task operations. After this phase, mobile works without connectivity.

| Story | Title | FRs Covered |
|-------|-------|-------------|
| 14.16 | Offline task support (IndexedDB) | NFR-HT-01, FR-HT-38 |

---

## Stories

### Phase 1: Backend Foundation

---

### Story 14.1: Database Migrations + System Template Seeding

**As a** system administrator,
**I want** the database schema to support task management,
**So that** tasks can be stored, assigned, and tracked for hives.

**Acceptance Criteria:**

**Given** a fresh database or existing APIS deployment
**When** migrations run
**Then** the following schema changes are applied:

1. **task_templates table created:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `tenant_id UUID REFERENCES tenants(id)` — NULL for system templates
   - `type VARCHAR(50) NOT NULL` — 'requeen', 'add_frame', etc.
   - `name VARCHAR(100) NOT NULL`
   - `description TEXT`
   - `auto_effects JSONB` — Schema for auto-updates
   - `is_system BOOLEAN DEFAULT FALSE`
   - `created_at TIMESTAMP NOT NULL DEFAULT NOW()`
   - `created_by UUID REFERENCES users(id)`

2. **hive_tasks table created:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `tenant_id UUID NOT NULL REFERENCES tenants(id)`
   - `hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE`
   - `template_id UUID REFERENCES task_templates(id)`
   - `custom_title VARCHAR(200)` — Used when no template
   - `description TEXT`
   - `priority VARCHAR(20) NOT NULL DEFAULT 'medium'` — low, medium, high, urgent
   - `due_date DATE`
   - `status VARCHAR(20) NOT NULL DEFAULT 'pending'` — pending, completed
   - `source VARCHAR(20) NOT NULL DEFAULT 'manual'` — manual, beebrain
   - `created_by UUID NOT NULL REFERENCES users(id)`
   - `created_at TIMESTAMP NOT NULL DEFAULT NOW()`
   - `completed_by UUID REFERENCES users(id)`
   - `completed_at TIMESTAMP`
   - `completion_data JSONB` — Prompted values
   - `auto_applied_changes JSONB` — What was auto-updated

3. **task_suggestions table created:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `tenant_id UUID NOT NULL REFERENCES tenants(id)`
   - `hive_id UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE`
   - `inspection_id UUID REFERENCES inspections(id)`
   - `suggested_template_id UUID REFERENCES task_templates(id)`
   - `suggested_title VARCHAR(200)`
   - `reason TEXT NOT NULL`
   - `priority VARCHAR(20) NOT NULL DEFAULT 'medium'`
   - `status VARCHAR(20) NOT NULL DEFAULT 'pending'` — pending, accepted, dismissed
   - `created_at TIMESTAMP NOT NULL DEFAULT NOW()`

4. **Indexes created:**
   - `idx_hive_tasks_hive_status ON hive_tasks(hive_id, status)`
   - `idx_hive_tasks_due_date ON hive_tasks(due_date) WHERE status = 'pending'`
   - `idx_hive_tasks_tenant ON hive_tasks(tenant_id)`
   - `idx_task_templates_tenant ON task_templates(tenant_id)`
   - `idx_task_suggestions_hive ON task_suggestions(hive_id, status)`

5. **System templates seeded (tenant_id = NULL, is_system = TRUE):**
   - Requeen, Add frame, Remove frame, Harvest frames, Add feed
   - Treatment, Add brood box, Add honey super, Remove box

**And** each system template has `auto_effects` JSONB defining prompts and updates
**And** existing data is preserved (non-destructive migration)
**And** migrations are idempotent

**Files to Create:**
- `apis-server/internal/storage/migrations/0029_task_templates.sql`
- `apis-server/internal/storage/migrations/0030_hive_tasks.sql`
- `apis-server/internal/storage/migrations/0031_task_suggestions.sql`
- `apis-server/internal/storage/migrations/0032_seed_system_templates.sql`

**Test Criteria:**
- [ ] Migrations run successfully on empty database
- [ ] Migrations run successfully on existing database with data
- [ ] All new tables have correct types and constraints
- [ ] Indexes created and functional
- [ ] System templates seeded with correct auto_effects JSON

---

### Story 14.2: Task CRUD API Endpoints

**As a** developer,
**I want** API endpoints for task operations,
**So that** the frontend can create, read, update, and delete tasks.

**Acceptance Criteria:**

**GET /api/tasks:**
**Given** authenticated request with tenant context
**When** listing tasks
**Then** returns tasks filtered by tenant
**And** supports query params: `hive_id`, `site_id`, `status`, `priority`, `overdue=true`
**And** returns pagination meta (total, page, per_page)
**And** loads in <500ms for up to 1000 tasks

**POST /api/tasks:**
**Given** authenticated request with task data
**When** creating a single task
**Then** validates required fields (hive_id, template_id OR custom_title)
**And** validates priority is one of: low, medium, high, urgent
**And** creates task with `source: 'manual'`
**And** returns created task with 201 status

**POST /api/tasks (bulk):**
**Given** authenticated request with `tasks` array
**When** creating multiple tasks
**Then** validates array length <= 500
**And** creates all tasks in single transaction
**And** returns `{created: N, tasks: [...]}`
**And** completes in <5s for 500 tasks

**GET /api/tasks/{id}:**
**Given** authenticated request
**When** fetching a task
**Then** returns task with template details populated
**And** returns 404 if not found or wrong tenant

**PATCH /api/tasks/{id}:**
**Given** authenticated request with update data
**When** updating a task
**Then** allows updating: priority, due_date, description
**And** does NOT allow updating: hive_id, template_id, status (use /complete)
**And** returns updated task

**DELETE /api/tasks/{id}:**
**Given** authenticated request
**When** deleting a task
**Then** hard-deletes the task (dismiss = delete per PRD)
**And** returns 204 No Content

**POST /api/tasks/{id}/complete:**
**Given** authenticated request with optional `completion_data`
**When** completing a task
**Then** sets `status: 'completed'`, `completed_by`, `completed_at`
**And** stores `completion_data` (prompted values from auto-effects)
**And** returns completed task (auto_applied_changes populated by 14.12)

**GET /api/hives/{id}/tasks:**
**Given** authenticated request
**When** fetching tasks for a specific hive
**Then** returns tasks for that hive only
**And** supports `status` filter (default: pending)

**GET /api/tasks/overdue:**
**Given** authenticated request
**When** fetching overdue tasks
**Then** returns all tenant tasks where `due_date < today AND status = 'pending'`
**And** includes hive name in response for display

**Files to Create:**
- `apis-server/internal/handlers/tasks.go`
- `apis-server/internal/storage/tasks.go`
- `apis-server/internal/models/task.go`

**Test Criteria:**
- [ ] CRUD operations work for single tasks
- [ ] Bulk create handles 500 tasks within timeout
- [ ] Bulk create rejects > 500 tasks with 400 error
- [ ] Filters work correctly (hive_id, status, priority)
- [ ] RLS ensures tenant isolation
- [ ] Complete endpoint sets all required fields

---

### Story 14.3: Task Templates API + Copy-on-First-Use

**As a** user,
**I want** to access predefined task templates and create custom ones,
**So that** I can quickly assign common tasks to hives.

**Acceptance Criteria:**

**GET /api/task-templates:**
**Given** authenticated request
**When** listing templates
**Then** returns:
  - System templates (tenant_id = NULL) — always visible
  - Tenant custom templates (tenant_id = current tenant)
**And** each template includes `auto_effects` schema for UI rendering
**And** system templates are marked with `is_system: true`

**POST /api/task-templates:**
**Given** authenticated request with template data
**When** creating a custom template
**Then** validates: name required, type = 'custom'
**And** sets `tenant_id` to current tenant
**And** sets `is_system: false`
**And** `auto_effects` is NULL for custom templates (v1)
**And** returns created template with 201

**DELETE /api/task-templates/{id}:**
**Given** authenticated request
**When** deleting a template
**Then** only allows deleting tenant-owned templates
**And** returns 403 if attempting to delete system template
**And** returns 404 if template belongs to different tenant
**And** existing tasks referencing template are NOT deleted (keep template_id reference)

**Copy-on-First-Use Logic:**
**Given** a tenant's first access to system templates
**When** they create a task using a system template
**Then** the system template is used directly (no copy needed)
**And** if tenant wants to customize, they create a new custom template

**Note:** Per PRD decision, system templates are used directly without copying. Custom templates are separate tenant-owned records.

**Auto-Effects Schema (for reference):**
```json
{
  "prompts": [
    {"key": "color", "label": "Queen marking color", "type": "select", "options": [...], "required": true}
  ],
  "updates": [
    {"target": "hive.queen_year", "action": "set", "value": "{{current_year}}"},
    {"target": "hive.queen_marking", "action": "set", "value_from": "completion_data.color"}
  ],
  "creates": [
    {"entity": "inspection_note", "fields": {"content": "Task completed: {{task.name}}"}}
  ]
}
```

**Files to Create:**
- `apis-server/internal/handlers/task_templates.go`
- `apis-server/internal/storage/task_templates.go`
- `apis-server/internal/models/task_template.go`

**Test Criteria:**
- [ ] GET returns system + tenant templates
- [ ] POST creates tenant-scoped custom template
- [ ] DELETE works for custom templates only
- [ ] System templates cannot be deleted
- [ ] Auto-effects JSON schema is valid for all system templates

---

### Phase 2: Portal UI

---

### Story 14.4: Portal Tasks Screen with Library + Assignment

**As a** beekeeper using the portal,
**I want** a dedicated Tasks screen to view templates and assign tasks,
**So that** I can plan work before visiting the apiary.

**Acceptance Criteria:**

**Route:** `/tasks` accessible from sidebar navigation

**Given** user navigates to /tasks
**When** page loads
**Then** displays three main sections:

1. **Task Library Section:**
   - Grid of template cards showing: icon, name, description
   - System templates displayed first
   - Custom templates displayed after with "Custom" badge
   - "+ Create Custom" button opens modal
   - Custom template modal: name, description, Save/Cancel

2. **Task Assignment Section:**
   - Task type dropdown (populated from templates)
   - Hive multi-select with search
   - "Select all in site" dropdown (lists sites, selects all hives in chosen site)
   - Counter showing "X of 500 max selected"
   - Priority radio buttons: Low (gray), Medium (green), High (orange), Urgent (red)
   - Due date picker (optional)
   - Notes text area (optional)
   - "Assign to X Hives" button (disabled if no hives selected)

3. **Assignment Validation:**
   - Shows error if > 500 hives selected
   - Shows success toast on assignment with count
   - Clears selection after successful assignment

**Given** user clicks "+ Create Custom"
**When** modal opens
**Then** shows form with name (required), description (optional)
**And** Save creates template and adds to library
**And** new template immediately selectable in dropdown

**Files to Create:**
- `apis-dashboard/src/pages/Tasks.tsx`
- `apis-dashboard/src/components/TaskLibrarySection.tsx`
- `apis-dashboard/src/components/TaskAssignmentSection.tsx`
- `apis-dashboard/src/components/CreateTemplateModal.tsx`
- `apis-dashboard/src/hooks/useTasks.ts`
- `apis-dashboard/src/hooks/useTaskTemplates.ts`

**Modify:**
- `apis-dashboard/src/components/layout/navItems.tsx` (add Tasks nav item)

**Test Criteria:**
- [ ] Tasks page loads with all three sections
- [ ] Template library shows system + custom templates
- [ ] Hive multi-select allows up to 500 selections
- [ ] "Select all in site" populates hive selection
- [ ] Assignment creates tasks for all selected hives
- [ ] Custom template creation works

---

### Story 14.5: Portal Active Tasks List with Filters

**As a** beekeeper,
**I want** to see all active tasks with filtering and bulk actions,
**So that** I can monitor and manage pending work across all hives.

**Acceptance Criteria:**

**Given** user is on /tasks page
**When** viewing the Active Tasks section
**Then** displays:

1. **Header:** "Active Tasks (X open · Y overdue)"

2. **Filter Row:**
   - Site dropdown (All Sites + list of sites)
   - Priority dropdown (All, Low, Medium, High, Urgent)
   - Status dropdown (Open, Completed, All)
   - Search input (searches hive name, task name)

3. **Tasks Table:**
   - Checkbox column for selection
   - Hive name (link to hive detail)
   - Task name (from template or custom_title)
   - Priority with color indicator
   - Due date (or "No due date")
   - Status with overdue indicator (red "Overdue" badge)
   - Created date
   - Actions: Complete, Delete

4. **Bulk Actions Bar (appears when tasks selected):**
   - "X tasks selected"
   - "Complete Selected" button
   - "Delete Selected" button

**Given** user clicks "Complete" on a task with auto-effects
**When** completion modal opens
**Then** shows prompts from auto_effects schema
**And** requires all required prompts before completion
**And** on submit, calls POST /api/tasks/{id}/complete with completion_data

**Given** user clicks "Complete" on a task without auto-effects
**When** clicked
**Then** immediately completes task (no modal)

**Given** user clicks "Delete" on a task
**When** confirmation dialog shown
**Then** on confirm, calls DELETE /api/tasks/{id}
**And** removes task from list

**Given** user selects multiple tasks and clicks "Complete Selected"
**When** bulk complete initiated
**Then** only completes tasks without auto-effects
**And** shows message "X tasks completed, Y skipped (require prompts)"
**And** skipped tasks remain selected for individual completion

**Files to Create:**
- `apis-dashboard/src/components/ActiveTasksList.tsx`
- `apis-dashboard/src/components/TaskRow.tsx`
- `apis-dashboard/src/components/TaskCompletionModal.tsx`
- `apis-dashboard/src/components/TaskFilters.tsx`
- `apis-dashboard/src/components/BulkActionsBar.tsx`

**Test Criteria:**
- [ ] Tasks list displays with all columns
- [ ] Filters work correctly (site, priority, status)
- [ ] Search filters by hive name and task name
- [ ] Single task complete works (with and without prompts)
- [ ] Bulk complete skips tasks requiring prompts
- [ ] Delete removes task from list

---

### Story 14.6: Portal Hive Detail Task Count Integration

**As a** beekeeper viewing a hive in the portal,
**I want** to see a task count summary,
**So that** I know if there's pending work for this hive.

**Acceptance Criteria:**

**Given** user views hive detail page
**When** page loads
**Then** displays task summary in status section:
  - Format: "📋 Tasks: X open · Y overdue"
  - X = count of pending tasks
  - Y = count of overdue tasks (due_date < today)
  - If Y > 0, count shown in red

**Given** task count is clickable
**When** user clicks task count
**Then** smooth-scrolls to Tasks section (if on mobile single-scroll layout)
**Or** opens Tasks page filtered to this hive (on desktop)

**Given** hive has overdue tasks
**When** viewing hive card in list views
**Then** shows small red indicator badge with overdue count

**GET /api/hives/{id} response extended:**
```json
{
  "data": {
    "id": "...",
    "name": "...",
    "task_summary": {
      "open": 3,
      "overdue": 1
    }
  }
}
```

**Files to Modify:**
- `apis-server/internal/handlers/hives.go` (add task_summary to response)
- `apis-server/internal/storage/hives.go` (add task count query)
- `apis-dashboard/src/pages/HiveDetail.tsx`
- `apis-dashboard/src/components/HiveStatusCard.tsx`
- `apis-dashboard/src/components/HiveCard.tsx` (for list views)

**Test Criteria:**
- [ ] Task summary displays on hive detail
- [ ] Overdue count shown in red when > 0
- [ ] Click navigates to tasks (filtered or scroll)
- [ ] API returns task_summary in hive response

---

### Phase 3: Mobile Experience

---

### Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout

**As a** beekeeper using mobile,
**I want** the hive detail page to be a single scrollable page with sections,
**So that** I can see all hive information without navigating between tabs.

**Acceptance Criteria:**

**Given** user views hive detail on mobile (viewport < 768px)
**When** page loads
**Then** displays single scrollable page with three sections:

1. **Status Section (top, default view):**
   - Hive header with name, back button, settings
   - Queen info: age, marking color
   - Box configuration: brood boxes, supers
   - Last inspection date
   - Task summary: "📋 Tasks: X open · Y overdue" (links to Tasks section)
   - Recent activity summary
   - Inspection history accordion

2. **Tasks Section:**
   - Section header: "═══ TASKS (X) ═══"
   - Content implemented in Story 14.9
   - Anchored by id="tasks-section"

3. **Inspect Section:**
   - Section header: "═══ INSPECT ═══"
   - "Start New Inspection" button (64px height)
   - Link to past inspections

**Section Headers:**
- Full-width divider style
- Clear visual separation
- Used as scroll targets for bottom nav

**Given** desktop viewport (>= 768px)
**When** viewing hive detail
**Then** maintains existing tabbed/card layout (no single scroll)

**Responsive Breakpoint:** 768px
- < 768px: Single scroll mobile layout
- >= 768px: Desktop layout (unchanged)

**Files to Modify:**
- `apis-dashboard/src/pages/HiveDetail.tsx` (major refactor for mobile)
- `apis-dashboard/src/components/HiveDetailMobile.tsx` (new)
- `apis-dashboard/src/components/HiveDetailDesktop.tsx` (extract existing)
- `apis-dashboard/src/components/SectionHeader.tsx` (new)

**Test Criteria:**
- [ ] Mobile shows single scroll layout
- [ ] Desktop shows existing layout
- [ ] All three sections present on mobile
- [ ] Section anchors work for scroll targeting
- [ ] Status section shows at top on load

---

### Story 14.8: Mobile Bottom Anchor Navigation Bar

**As a** beekeeper using mobile,
**I want** a bottom navigation bar with section buttons,
**So that** I can quickly jump between Status, Tasks, and Inspect sections.

**Acceptance Criteria:**

**Given** user views hive detail on mobile
**When** page loads
**Then** displays 64px fixed bottom navigation bar with three buttons:
  - "Status" (default active)
  - "Tasks (X)" where X is pending task count
  - "Inspect"

**Button Styling:**
- Equal width (33.33% each)
- Active button has visual indicator (underline or filled background)
- Inactive buttons are dimmed
- Touch target: full 64px height
- Icons optional: 📊 Status, 📋 Tasks, 🔍 Inspect

**Given** user taps a nav button
**When** button is tapped
**Then** smooth-scrolls to corresponding section
**And** updates active indicator to tapped button
**And** scroll duration ~300ms with easing

**Given** user manually scrolls the page
**When** a section header crosses the viewport center
**Then** active indicator updates to that section
**And** uses Intersection Observer for scroll detection

**Given** hive has overdue tasks
**When** viewing bottom nav
**Then** Tasks button shows red dot indicator

**Implementation Notes:**
- Use `scroll-behavior: smooth` or JS smooth scroll
- Intersection Observer on section headers
- Threshold: 0.5 (50% visibility triggers active)
- Account for 64px bottom nav offset in scroll calculations

**Files to Create:**
- `apis-dashboard/src/components/BottomAnchorNav.tsx`
- `apis-dashboard/src/hooks/useActiveSection.ts`

**Modify:**
- `apis-dashboard/src/components/HiveDetailMobile.tsx`

**Test Criteria:**
- [ ] Bottom nav fixed at 64px height
- [ ] Tap scrolls to correct section
- [ ] Active indicator updates on tap
- [ ] Active indicator updates on manual scroll
- [ ] Task count displays in Tasks button
- [ ] Overdue indicator shows when applicable

---

### Story 14.9: Mobile Tasks Section View

**As a** beekeeper at the apiary,
**I want** to see pending tasks for the current hive,
**So that** I know what work needs to be done.

**Acceptance Criteria:**

**Given** user views Tasks section on mobile
**When** section is visible
**Then** displays tasks organized by status:

1. **Overdue Subsection (if any):**
   - Header: "⚠️ OVERDUE"
   - Red background tint
   - Tasks sorted by priority (urgent first)

2. **Pending Subsection:**
   - Header: "📋 PENDING"
   - Tasks sorted by priority, then due date

**Task Card Display:**
- Priority indicator: 🔴 Urgent, 🟠 High, 🟢 Medium, ⚪ Low
- Task name (from template or custom_title)
- Due date (if set) in "Feb 1" format
- Expandable for full description
- "Complete" button (64px touch target)
- "Delete" text link (less prominent)

**Given** user taps a task card (not buttons)
**When** card expands
**Then** shows full description
**And** shows notes if any
**And** shows created date
**And** shows source (manual or "🤖 Suggested by BeeBrain")

**Given** no tasks exist for hive
**When** viewing Tasks section
**Then** displays empty state:
  - Icon: 📋
  - Text: "No tasks for this hive"
  - Subtext: "Plan your next visit by adding a task below"

**Priority Color Mapping:**
| Priority | Color | Indicator |
|----------|-------|-----------|
| Urgent | Red (#ef4444) | 🔴 |
| High | Orange (#f97316) | 🟠 |
| Medium | Green (#22c55e) | 🟢 |
| Low | Gray (#6b7280) | ⚪ |

**Files to Create:**
- `apis-dashboard/src/components/MobileTasksSection.tsx`
- `apis-dashboard/src/components/MobileTaskCard.tsx`
- `apis-dashboard/src/components/TaskEmptyState.tsx`

**Test Criteria:**
- [ ] Overdue tasks shown first with red styling
- [ ] Tasks sorted by priority then due date
- [ ] Cards expandable for full details
- [ ] Empty state displays when no tasks
- [ ] Priority colors match specification

---

### Story 14.10: Mobile Task Completion Flow with Auto-Effect Prompts

**As a** beekeeper at the apiary,
**I want** to complete tasks with guided prompts for auto-effects,
**So that** my hive data is updated automatically.

**Acceptance Criteria:**

**Given** user taps "Complete" on a task WITHOUT auto-effects
**When** button tapped
**Then** immediately marks task complete
**And** shows brief success toast
**And** removes task from pending list with animation

**Given** user taps "Complete" on a task WITH auto-effects
**When** button tapped
**Then** opens bottom sheet modal with prompts:

1. **Modal Header:** "Complete Task: [Task Name]"

2. **Prompts Section:**
   - Renders prompts from `auto_effects.prompts` schema
   - Select type: Large touch-friendly buttons (64px)
   - Number type: Large increment/decrement buttons
   - Text type: Large text input
   - Required prompts marked with asterisk

3. **Preview Section:**
   - "This will update:"
   - Bullet list of changes (from auto_effects.updates)
   - Example: "• Queen year → 2026"
   - Example: "• Queen marking → [selected color]"

4. **Actions:**
   - "Complete Task" button (64px, primary)
   - "Cancel" text link

**Example: Requeen Task Prompts:**
- Queen marking color: 6 large color buttons (White, Yellow, Red, Green, Blue, Unmarked)
- Optional notes text area

**Given** user submits completion
**When** all required prompts filled
**Then** calls POST /api/tasks/{id}/complete with completion_data
**And** closes modal
**And** shows success toast with summary
**And** removes task from list

**Given** user taps "Delete" on a task
**When** tapped
**Then** shows confirmation: "Delete this task?"
**And** on confirm, deletes task
**And** removes from list

**Files to Create:**
- `apis-dashboard/src/components/MobileTaskCompletionSheet.tsx`
- `apis-dashboard/src/components/AutoEffectPrompts.tsx`
- `apis-dashboard/src/components/ColorSelectPrompt.tsx`
- `apis-dashboard/src/components/NumberPrompt.tsx`

**Test Criteria:**
- [ ] Tasks without auto-effects complete immediately
- [ ] Tasks with auto-effects show prompt modal
- [ ] All prompt types render correctly (select, number, text)
- [ ] Required prompts block submission
- [ ] Preview shows what will be updated
- [ ] Delete shows confirmation

---

### Story 14.11: Mobile Inline Task Creation

**As a** beekeeper at the apiary,
**I want** to quickly add a task for the current hive,
**So that** I can capture follow-up actions while I'm thinking of them.

**Acceptance Criteria:**

**Given** user views Tasks section on mobile
**When** scrolling to bottom of tasks list
**Then** sees "Add Task" card with expand indicator

**Given** user taps "Add Task" card
**When** card expands inline
**Then** shows form fields:

1. **Task Type Dropdown:**
   - "Select task type..." placeholder
   - Options: All system templates + custom templates
   - Custom option at bottom: "Custom task..."

2. **Custom Title Input (conditional):**
   - Only shows when "Custom task..." selected
   - Placeholder: "Enter task name"
   - Required when visible

3. **Add Button:**
   - "Add Task" (64px height)
   - Disabled until type selected (and title if custom)

**Given** user selects a template type
**When** Add button tapped
**Then** creates task with:
  - `hive_id`: current hive
  - `template_id`: selected template
  - `priority`: "medium" (default)
  - `due_date`: null
  - `source`: "manual"
**And** collapses form
**And** new task appears in pending list with animation
**And** shows success toast

**Given** user selects "Custom task..."
**When** custom title entered and Add tapped
**Then** creates task with:
  - `custom_title`: entered text
  - `template_id`: null
**And** same behavior as above

**Given** form is expanded
**When** user taps outside or scrolls away
**Then** form collapses (unsaved changes lost)

**Files to Create:**
- `apis-dashboard/src/components/MobileAddTaskForm.tsx`

**Modify:**
- `apis-dashboard/src/components/MobileTasksSection.tsx`

**Test Criteria:**
- [ ] Add Task expands inline (not modal)
- [ ] Dropdown shows all templates
- [ ] Custom option shows text input
- [ ] Default priority is medium
- [ ] Task appears in list after creation
- [ ] Form collapses on completion

---

### Phase 4: Automation & Intelligence

---

### Story 14.12: Auto-Update Hive Configuration on Completion

**As a** beekeeper,
**I want** hive data to update automatically when I complete certain tasks,
**So that** I don't have to manually edit hive configuration.

**Acceptance Criteria:**

**Given** a task with auto_effects is completed
**When** POST /api/tasks/{id}/complete is called with completion_data
**Then** the system processes auto_effects.updates:

**Update Actions:**

| Target | Action | Example |
|--------|--------|---------|
| `hive.queen_year` | set | Set to current year |
| `hive.queen_marking` | set | Set to completion_data.color |
| `hive.brood_boxes` | increment | Add 1 |
| `hive.supers` | increment | Add 1 |
| `hive.brood_boxes` | decrement | Subtract 1 |
| `hive.supers` | decrement | Subtract 1 |

**Given** task is "Requeen"
**When** completed with `{color: "yellow"}`
**Then** updates hive: `queen_year = 2026`, `queen_marking = "yellow"`
**And** stores in task: `auto_applied_changes = {queen_year: 2026, queen_marking: "yellow"}`

**Given** task is "Add brood box"
**When** completed
**Then** updates hive: `brood_boxes = brood_boxes + 1`
**And** stores: `auto_applied_changes = {brood_boxes: {old: 2, new: 3}}`

**Given** task is "Add feed"
**When** completed with `{type: "sugar syrup", amount: "2L"}`
**Then** creates feeding record in feedings table
**And** stores: `auto_applied_changes = {feeding_created: true, feeding_id: "..."}`

**Given** task is "Treatment"
**When** completed with `{treatment_type: "oxalic acid", method: "dribble"}`
**Then** creates treatment record in treatments table
**And** stores: `auto_applied_changes = {treatment_created: true, treatment_id: "..."}`

**Given** task is "Harvest frames"
**When** completed with `{frames: 4, weight: "12kg"}`
**Then** creates harvest record in harvests table
**And** stores: `auto_applied_changes = {harvest_created: true, harvest_id: "..."}`

**Error Handling:**
- If auto-update fails, task completion still succeeds
- Error logged with details
- `auto_applied_changes` includes `{error: "description"}`

**Files to Modify:**
- `apis-server/internal/handlers/tasks.go` (complete endpoint)
- `apis-server/internal/services/task_effects.go` (new)
- `apis-server/internal/storage/hives.go` (update methods)

**Test Criteria:**
- [ ] Requeen updates queen_year and queen_marking
- [ ] Add box increments correct count
- [ ] Remove box decrements correct count
- [ ] Feeding creates feeding record
- [ ] Treatment creates treatment record
- [ ] Harvest creates harvest record
- [ ] auto_applied_changes stored correctly
- [ ] Errors don't block task completion

---

### Story 14.13: Task Completion Inspection Note Logging

**As a** beekeeper,
**I want** task completions logged to inspection notes,
**So that** I have a record of what was done and when.

**Acceptance Criteria:**

**Given** a task is completed
**When** completion processed
**Then** creates inspection note entry:

```json
{
  "hive_id": "...",
  "type": "task_completion",
  "content": "Task completed: Requeen",
  "metadata": {
    "task_id": "...",
    "task_name": "Requeen",
    "completion_data": {"color": "yellow"},
    "auto_applied": true,
    "changes": ["queen_year → 2026", "queen_marking → yellow"]
  },
  "created_at": "2026-01-29T10:30:00Z",
  "created_by": "user_id"
}
```

**Note Content Format:**
- Without auto-effects: "Task completed: [Task Name]"
- With auto-effects: "Task completed: [Task Name]. Auto-updated: [changes list]"

**Given** note has auto-applied changes
**When** viewing in inspection history
**Then** shows "🤖 Auto-updated" badge
**And** lists changes made

**Given** task had notes
**When** completion logged
**Then** includes task notes in the inspection note

**Files to Modify:**
- `apis-server/internal/services/task_effects.go`
- `apis-server/internal/storage/inspection_notes.go` (may need new method)
- `apis-dashboard/src/components/InspectionHistory.tsx` (display task completion notes)

**Test Criteria:**
- [ ] Completion creates inspection note
- [ ] Note content includes task name
- [ ] Auto-changes listed in note
- [ ] Badge displays for auto-updated notes
- [ ] Task notes included if present

---

### Story 14.14: Overdue Alerts + Navigation Badge

**As a** beekeeper,
**I want** to see when I have overdue tasks,
**So that** I don't miss important maintenance windows.

**Acceptance Criteria:**

**Navigation Badge:**
**Given** user has overdue tasks
**When** viewing sidebar navigation
**Then** Tasks nav item shows red badge with count
**And** badge format: number only (e.g., "3")
**And** badge hidden when count = 0

**Tasks Page Alert Banner:**
**Given** user has overdue tasks
**When** viewing /tasks page
**Then** shows alert banner at top:
  - Red/orange background
  - Icon: ⚠️
  - Text: "You have X overdue tasks"
  - "View" link scrolls to overdue section
  - Dismissible (session only, reappears on reload)

**API Support:**
**GET /api/tasks/stats:**
```json
{
  "data": {
    "total_open": 15,
    "overdue": 3,
    "due_today": 2,
    "due_this_week": 5
  }
}
```

**Given** task becomes overdue (due_date passes)
**When** next page load occurs
**Then** badge count updates
**And** banner shows if not dismissed

**Files to Create:**
- `apis-server/internal/handlers/task_stats.go`
- `apis-dashboard/src/components/OverdueAlertBanner.tsx`
- `apis-dashboard/src/hooks/useTaskStats.ts`

**Modify:**
- `apis-dashboard/src/components/layout/navItems.tsx` (badge)
- `apis-dashboard/src/pages/Tasks.tsx` (banner)

**Test Criteria:**
- [ ] Badge shows correct overdue count
- [ ] Badge hidden when no overdue
- [ ] Alert banner displays on Tasks page
- [ ] Banner dismissible for session
- [ ] Stats endpoint returns correct counts

---

### Story 14.15: BeeBrain Task Suggestions Integration

**As a** beekeeper,
**I want** BeeBrain to suggest tasks based on inspection data,
**So that** I don't miss issues that need follow-up.

**Acceptance Criteria:**

**Suggestion Generation:**
**Given** BeeBrain analysis runs on a hive
**When** analysis identifies follow-up needs
**Then** creates suggestions in task_suggestions table:
  - Maps finding to appropriate template
  - Sets priority based on urgency
  - Includes reason explaining why suggested

**Suggestion Triggers:**
| Finding | Suggested Task | Priority |
|---------|---------------|----------|
| Honey stores = Low | Add feed | High |
| Queen cells present | Inspect for swarming | Urgent |
| Queen age > 2 years + decline | Requeen | Medium |
| Spotty brood pattern | Check queen issues | High |
| Varroa count high | Treatment | Urgent |

**Given** user triggers new BeeBrain analysis
**When** analysis completes
**Then** OLD suggestions for that hive are DELETED (per PRD: replace, not accumulate)
**And** new suggestions created

**GET /api/hives/{id}/suggestions:**
```json
{
  "data": [
    {
      "id": "...",
      "suggested_template_id": "...",
      "suggested_title": "Add feed",
      "reason": "Inspection noted low honey stores. Supplemental feeding recommended.",
      "priority": "high",
      "status": "pending",
      "created_at": "..."
    }
  ]
}
```

**Mobile Display:**
**Given** hive has BeeBrain suggestions
**When** viewing Tasks section
**Then** shows "🤖 Suggested by BeeBrain" subsection:
  - Before pending tasks
  - Each suggestion shows: icon, title, reason, priority
  - Actions: "Accept" (creates task), "Dismiss" (deletes suggestion)

**POST /api/hives/{id}/suggestions/{id}/accept:**
- Creates task from suggestion
- Sets `source: 'beebrain'`
- Deletes suggestion record

**DELETE /api/hives/{id}/suggestions/{id}:**
- Deletes suggestion (dismiss)

**Files to Create:**
- `apis-server/internal/handlers/task_suggestions.go`
- `apis-server/internal/storage/task_suggestions.go`
- `apis-dashboard/src/components/BeeBrainSuggestionsSection.tsx`
- `apis-dashboard/src/hooks/useTaskSuggestions.ts`

**Modify:**
- `apis-server/internal/services/beebrain.go` (add suggestion generation)
- `apis-dashboard/src/components/MobileTasksSection.tsx` (show suggestions)

**Test Criteria:**
- [ ] Suggestions created from BeeBrain analysis
- [ ] Old suggestions replaced on new analysis
- [ ] Accept creates task with beebrain source
- [ ] Dismiss removes suggestion
- [ ] Suggestions display with robot icon
- [ ] Reason text explains why suggested

---

### Phase 5: Offline Support

---

### Story 14.16: Offline Task Support (IndexedDB)

**As a** beekeeper at the apiary without internet,
**I want** to view and complete tasks offline,
**So that** I can work even without connectivity.

**Acceptance Criteria:**

**IndexedDB Schema:**
```typescript
// Add to existing Dexie db
db.version(X).stores({
  ...existingStores,
  offlineTasks: 'id, hive_id, status, synced',
  offlineTaskCompletions: 'id, task_id, synced'
});

interface OfflineTask {
  id: string;
  hive_id: string;
  template_id?: string;
  template_name?: string;  // Cached for display
  custom_title?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  status: 'pending' | 'completed';
  auto_effects?: object;  // Cached from template
  completion_data?: Record<string, any>;
  synced: boolean;
  created_at: string;
  completed_at?: string;
}
```

**Cache Strategy:**
**Given** user opens hive detail while online
**When** tasks load
**Then** tasks cached to IndexedDB
**And** template details cached with tasks

**Offline Task View:**
**Given** user is offline
**When** viewing hive tasks
**Then** displays cached tasks from IndexedDB
**And** shows offline banner: "☁️ Offline — changes will sync"

**Offline Task Completion:**
**Given** user is offline
**When** completing a task
**Then** marks task completed in IndexedDB
**And** stores completion_data locally
**And** sets `synced: false`
**And** shows success toast: "Task completed (will sync)"

**Offline Task Creation:**
**Given** user is offline
**When** creating a task
**Then** creates task in IndexedDB with local UUID
**And** sets `synced: false`
**And** task appears in list

**Sync on Reconnect:**
**Given** pending offline changes exist
**When** connectivity restored
**Then** syncs changes in order:
  1. New tasks (POST /api/tasks)
  2. Completions (POST /api/tasks/{id}/complete)
**And** updates local IDs with server IDs
**And** marks records `synced: true`
**And** shows sync success toast

**Conflict Resolution:**
**Given** server task was deleted while offline
**When** syncing offline completion
**Then** logs conflict, discards completion
**And** shows notification: "Task no longer exists"

**Files to Create:**
- `apis-dashboard/src/services/offlineTasks.ts`
- `apis-dashboard/src/hooks/useOfflineTasks.ts`

**Modify:**
- `apis-dashboard/src/services/db.ts` (add task stores)
- `apis-dashboard/src/hooks/useTasks.ts` (integrate offline)
- `apis-dashboard/src/components/MobileTasksSection.tsx` (offline support)
- `apis-dashboard/src/registerSW.ts` (sync handler)

**Test Criteria:**
- [ ] Tasks cached on view
- [ ] Offline tasks display from cache
- [ ] Offline completion works
- [ ] Offline creation works
- [ ] Sync runs on reconnect
- [ ] Conflicts handled gracefully
- [ ] Offline banner displays

---

## Summary

**Total Stories:** 16
**Phases:** 5
**FRs Covered:** 49 (FR-HT-01 through FR-HT-49)
**NFRs Covered:** 5 (NFR-HT-01 through NFR-HT-05)

**Phase Completion Milestones:**
1. **Phase 1 Complete:** Backend fully functional, all API endpoints working
2. **Phase 2 Complete:** Portal users can manage tasks from desktop
3. **Phase 3 Complete:** Mobile task workflow fully operational
4. **Phase 4 Complete:** Auto-effects, alerts, and BeeBrain suggestions working
5. **Phase 5 Complete:** Full offline support, production-ready

**Key Dependencies:**
- Story 14.1 must complete before any other stories
- Stories 14.7-14.8 must complete before 14.9-14.11
- Story 14.12 required before 14.13 (auto_applied_changes)
- Story 14.3 required before 14.15 (templates for suggestions)
