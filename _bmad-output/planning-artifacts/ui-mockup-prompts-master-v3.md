# APIS UI Mockup Prompts - Epic 14: Hive Task Management

**Purpose:** Each phase is completely self-contained. Copy any single phase and you have everything needed to generate consistent mockups - no need to reference other sections.

**Total:** 3 Phases, 15 Screens (Epic 14 only)

**Phases:**
- Phase 1: Task Management - Portal (5 screens)
- Phase 2: Task Management - Mobile Layout (5 screens)
- Phase 3: Task Management - Mobile Actions & Alerts (5 screens)

---

# The APIS Style Master Prompt

```
OVERALL AESTHETIC: "Modern Artisan Beekeeping"

A premium, high-trust interface that feels like a high-end weather app mixed with a boutique honey brand. The design must be warm, reassuring, and clean, avoiding clinical or industrial "tech" looks.

COLOR PALETTE:
- Primary Background: Coconut Cream (#fbf9e7) — a very warm, soft off-white
- Accent/CTAs: Sea Buckthorn (#f7a42d) — a vibrant honey gold
- Primary Text: Brown Bramble (#662604) — a deep, rich chocolate brown for headers and body
- Surface Color: Pure White (#ffffff) for primary content cards to create "lift" against the warm background
- Secondary Surface: Salomie (#fcd483) — warm gold for secondary cards and highlights
- Success: Soft Sage (#7c9082) — for positive status and confirmations
- Warning: Amber (#d4a574) — for attention-needed states
- Error: Muted Rose (#c4857a) — for errors, never harsh red
- Offline/Sync: Storm Gray (#6b7280) — for offline indicators

TYPOGRAPHY & HEADING:
- System Font: Clean Sans-serif (SF Pro / Inter / system-ui)
- Headers: Semi-bold, Brown Bramble color. H1 is large and welcoming (32px+)
- Hierarchy: Use generous letter spacing for small caps sub-headers to create a professional, architectural feel
- Mobile Body: 18px minimum for outdoor/glove-friendly visibility

UI COMPONENTS & SHAPES:
- Card Styling: Large border radius (8-12px). Soft, diffused shadows (0 10px 30px rgba(102, 38, 4, 0.05))
- Card Accents: Cards can have thin 4px color-coded left/bottom borders to categorize data types
- Sidebar: Clean white background with minimalist line-art icons. Use "pill" shaped highlight for active state in very light cream/gold
- Data Visualization: Use smooth, organic Spline curves for charts (not jagged lines). Data points filled with gradients of Sea Buckthorn gold
- Status Indicators: Colored dots with labels (green=healthy, yellow=attention, red=critical, gray=offline)

INTERACTIVE ELEMENTS:
- Buttons: Fully rounded "pill" buttons (border-radius 9999px). Primary buttons in Sea Buckthorn with white text; secondary buttons in light cream with brown text
- Icons: Thin-stroke, minimalist icons often contained within soft-colored circular backgrounds
- Touch Targets: 64px minimum height for mobile/glove-friendly operation
- Input Fields: 48-56px height, 12px border-radius, Brown Bramble border on focus

EMOTIONAL DESIGN:
- Frame data as learning ("Hornets prefer 20°C") not just logging
- Idle state communicates "protection" not just "no data"
- Celebrate milestones (first harvest, overwintering success)
- Acknowledge losses with empathy and guidance

SPACING:
- Based on 8px unit (xs:4, sm:8, md:16, lg:24, xl:32, 2xl:48)
- Generous whitespace between elements (24px minimum between major sections)
- 16px minimum gap between interactive elements

SIDEBAR REQUIREMENT:
- All authenticated app screens MUST show the sidebar (desktop) or bottom nav (mobile)
- Sidebar shows: APIS logo, Dashboard, Sites, Units, Hives, Clips, Statistics, Maintenance, Tasks, Settings
- Active nav item highlighted with cream/gold pill background
- Only exception: Login, Setup Wizard, and Modals (overlays)
```

---

# Phase 1: Task Management - Portal

## Master Style Block - Phase 1

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is planning work before visiting the apiary. The interface should feel like a helpful checklist that keeps them organized.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Tasks page with library, assignment, and active tasks sections
- Task templates displayed as cards
- Active tasks in filterable table

TASK PRIORITY COLORS:
- Urgent: Red (#ef4444)
- High: Orange (#f97316)
- Medium: Green (#22c55e)
- Low: Gray (#6b7280)

TASK CARD ACCENTS:
- Task Cards: Sea Buckthorn (#f7a42d) 4px left border
- Overdue Cards: Muted Rose (#c4857a) 4px left border

VIBE:
- Organized field companion
- Auto-magic updates (hive config changes automatically)
- NOT: Overwhelming task manager, complex workflows
```

## Acceptance Criteria - Phase 1

- [ ] SIDEBAR VISIBLE on all screens
- [ ] Task templates clearly displayed
- [ ] Multi-hive assignment works up to 500 hives
- [ ] Priority colors consistent

---

### 1.1 Tasks Page - Library Section

**Function:** Display and manage task templates.

**Layout:** SIDEBAR VISIBLE + Section within /tasks page

**User State:** Viewing available task types before assigning.

**Screen Elements:**
- Sidebar with "Tasks" highlighted
- "Tasks" page heading
- **Task Library Section:**
  - Section heading: "Task Library"
  - Grid of template cards (3-4 columns desktop, 2 mobile)
  - Each card shows:
    - Task icon (matching task type)
    - Task name (bold)
    - Brief description
    - "System" badge on built-in templates
    - "Custom" badge on user-created templates
  - System templates displayed first, then custom
  - "+ Create Custom" card at end of grid (dashed border, plus icon)

**Template Icons by Type:**
| Type | Icon |
|------|------|
| Requeen | Queen crown |
| Add frame | Plus/frame |
| Remove frame | Minus/frame |
| Harvest frames | Honey jar |
| Add feed | Feeder/bottle |
| Treatment | Medicine/droplet |
| Add brood box | Box with plus |
| Add honey super | Golden box |
| Remove box | Box with minus |
| Custom | Pencil/note |

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Tasks" active
- [ ] System templates clearly marked
- [ ] Custom templates show after system templates
- [ ] Create Custom card is visually distinct (dashed border)
- [ ] Cards are clickable (selects for assignment)

---

### 1.2 Tasks Page - Assignment Section

**Function:** Assign tasks to one or multiple hives.

**Layout:** SIDEBAR VISIBLE + Section within /tasks page

**User State:** Planning work for upcoming apiary visit.

**Screen Elements:**
- **Task Assignment Section:**
  - Section heading: "Assign Task"
  - Task type dropdown (populated from templates)
  - Hive multi-select with search
  - "Select all in site" dropdown
  - Counter: "3 of 500 max selected"
  - Priority radio buttons (large, 48px): Low | Medium | High | Urgent
  - Due date picker (optional)
  - Notes textarea (optional)
  - "Assign to X Hives" button (Sea Buckthorn)

**Validation:**
- Error if > 500 hives selected
- Success toast with count on assignment
- Form partially resets for quick re-assignment

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Multi-select allows up to 500 hives
- [ ] "Select all in site" works correctly
- [ ] Priority buttons are large and touch-friendly
- [ ] Counter shows selection vs limit

---

### 1.3 Tasks Page - Active Tasks List

**Function:** View and manage all pending tasks across hives.

**Layout:** SIDEBAR VISIBLE + Section within /tasks page

**User State:** Monitoring pending work and completing tasks.

**Screen Elements:**
- **Active Tasks Section:**
  - Section heading: "Active Tasks (X open · Y overdue)"
  - **Filter Row:** Site, Priority, Status, Search
  - **Tasks Table:** Checkbox, Hive, Task, Priority, Due, Status, Created, Actions
  - **Bulk Actions Bar:** "Complete Selected", "Delete Selected"
  - Pagination controls

**Complete Action:**
- Tasks WITHOUT auto-effects: Complete immediately
- Tasks WITH auto-effects: Open completion modal

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Overdue count visible in header (red when > 0)
- [ ] Filters work correctly
- [ ] Bulk actions appear when tasks selected
- [ ] Complete handles with/without auto-effects correctly

---

### 1.4 Task Completion Modal (Portal)

**Function:** Complete tasks that require additional input.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** Completing a task with auto-effects from portal.

**Screen Elements:**
- "Complete Task: [Task Name]" heading
- **Prompts Section:** Rendered from auto_effects schema
- **Preview Section:** "This will update:" with bullet list
- **Actions:** "Complete Task" (Sea Buckthorn), "Cancel"

**Acceptance Criteria:**
- [ ] Modal overlays (sidebar visible behind)
- [ ] All prompt types render correctly
- [ ] Required prompts block submission
- [ ] Preview clearly shows what will be updated

---

### 1.5 Create Custom Template Modal

**Function:** Create a new custom task template.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** Creating a personalized task type.

**Screen Elements:**
- "Create Custom Task" heading
- Name field (required)
- Description field (optional)
- "Create Template" button (Sea Buckthorn)
- "Cancel" link

**Acceptance Criteria:**
- [ ] Modal overlays (sidebar visible behind)
- [ ] Name field required with validation
- [ ] Created template appears immediately in library
- [ ] Template usable for assignment right away

---

# Phase 2: Task Management - Mobile Layout

## Master Style Block - Phase 2

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is at the apiary on mobile. The interface should work like a field companion with everything accessible via scroll and bottom nav.

LAYOUT:
- Mobile hive detail refactored to single scroll with three sections
- 64px bottom anchor nav with Status | Tasks | Inspect buttons
- Section headers as scroll targets

MOBILE-FIRST:
- 64px minimum touch targets throughout
- Single scroll instead of tabs
- Bottom anchor nav for quick section jumping

VIBE:
- Field-ready companion
- Everything accessible without leaving page
- NOT: Complex multi-page navigation
```

## Acceptance Criteria - Phase 2

- [ ] Mobile uses single-scroll layout (< 768px)
- [ ] Desktop unchanged (>= 768px)
- [ ] Bottom anchor nav with 3 buttons
- [ ] Scroll position updates active nav indicator

---

### 2.1 Hive Detail - Task Summary Integration

**Function:** Show task status on hive detail page.

**Layout:** Section within Hive Detail (SIDEBAR visible)

**User State:** Viewing hive and wanting to know pending work.

**Screen Elements:**
- Task Summary Line: "Tasks: X open · Y overdue"
- Clickable to navigate/scroll to tasks
- Y shown in Muted Rose when > 0
- Hive cards show red dot when overdue tasks exist

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Task summary displays in status section
- [ ] Overdue count highlighted in rose when > 0
- [ ] Click navigates/scrolls appropriately

---

### 2.2 Mobile Hive Detail - Single Scroll Layout

**Function:** Reorganized mobile hive detail as single scrollable page.

**Layout:** BOTTOM NAV VISIBLE + Single scroll with section headers

**User State:** Viewing hive on mobile at the apiary.

**Screen Elements:**
- **Header Bar:** Back, Hive name, Settings
- **Section 1: STATUS** - Config, tasks summary, BeeBrain
- **Section 2: TASKS** - Task list (see Phase 3)
- **Section 3: INSPECT** - Start inspection button, history

**Section Headers:**
- Full width with decorative lines: "═══ STATUS ═══"
- Used as scroll targets

**Acceptance Criteria:**
- [ ] Single scroll layout on mobile (< 768px)
- [ ] Desktop layout unchanged (>= 768px)
- [ ] Three sections clearly separated
- [ ] Section headers serve as scroll anchors

---

### 2.3 Mobile Bottom Anchor Navigation

**Function:** Quick navigation between hive detail sections.

**Layout:** Fixed bottom bar (64px)

**User State:** Navigating within hive detail on mobile.

**Screen Elements:**
- Fixed 64px height at bottom
- Three equal-width buttons:
  - "Status" (default active)
  - "Tasks (X)" with count and red dot if overdue
  - "Inspect"
- Active state: Sea Buckthorn highlight

**Scroll Behavior:**
- Tap: Smooth scroll to section (~300ms)
- Manual scroll: Active indicator updates via Intersection Observer

**Acceptance Criteria:**
- [ ] 64px fixed height at bottom
- [ ] Tap smooth-scrolls to section
- [ ] Active indicator updates on scroll
- [ ] Task count shows in button label

---

### 2.4 Mobile Tasks Section View

**Function:** Display pending tasks for current hive on mobile.

**Layout:** Section within mobile hive detail

**User State:** At apiary, checking what work needs to be done.

**Screen Elements:**
- **BeeBrain Suggestions** (if any): Robot icon, soft blue tint
- **Overdue Subsection** (if any): Warning icon, rose tint
- **Pending Subsection:** Sorted by priority, then due date
- **Task Cards:** Priority dot, name, due date, Complete button
- **Empty State:** "No tasks for this hive"
- **Add Task Button:** At bottom of list

**Priority Colors:**
- Urgent: Red (#ef4444)
- High: Orange (#f97316)
- Medium: Green (#22c55e)
- Low: Gray (#6b7280)

**Acceptance Criteria:**
- [ ] BeeBrain suggestions shown first
- [ ] Overdue tasks shown with red styling
- [ ] Tasks sorted by priority then due date
- [ ] Empty state is helpful and warm

---

### 2.5 Mobile Task Card (Expandable)

**Function:** Individual task display with expand/collapse.

**Layout:** Card component within mobile tasks section

**User State:** Reviewing task details before completing.

**Screen Elements:**
- **Collapsed:** Priority dot, task name, due date, "Complete" button (64px)
- **Expanded:** + Description, notes, created date, source, "Delete" link
- Border color: Rose (overdue), Sea Buckthorn (normal), Blue (BeeBrain)

**Acceptance Criteria:**
- [ ] Collapsed shows key info at a glance
- [ ] Expanded shows full details
- [ ] 64px Complete button always visible
- [ ] Smooth expand/collapse animation

---

# Phase 3: Task Management - Mobile Actions & Alerts

## Master Style Block - Phase 3

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is completing tasks at the apiary and receiving alerts about overdue work. The interface should make completion easy and alerts helpful.

LAYOUT:
- Bottom sheets for complex interactions
- Inline forms for quick actions
- Alerts integrated into navigation

MOBILE-FIRST:
- 64px minimum touch targets on all inputs
- Bottom sheets instead of modals
- Works offline with local sync

BEEBRAIN INTEGRATION:
- Suggestions marked with robot icon
- Accept/dismiss actions prominent

VIBE:
- Quick task completion in the field
- Never lose data (offline support)
- BeeBrain as helpful assistant
```

## Acceptance Criteria - Phase 3

- [ ] Task completion with auto-effects shows prompts
- [ ] Inline task creation works
- [ ] BeeBrain suggestions clearly marked
- [ ] Overdue alerts visible in navigation

---

### 3.1 Mobile Task Completion Sheet

**Function:** Complete tasks with auto-effect prompts on mobile.

**Layout:** Bottom sheet modal (slides up from bottom)

**User State:** Completing a task that requires additional input.

**Screen Elements:**
- Bottom sheet (~70% of screen)
- Drag handle at top
- "Complete Task" heading + task name
- **Prompts:** 64px inputs for select, number, text
- **Preview:** "This will update:" with bullet list
- **Actions:** "Complete Task" (64px, Sea Buckthorn), "Cancel"

**Prompt Types:**
- Select (e.g., Queen color): Large touch-friendly color buttons
- Number (e.g., Frames): Large +/- buttons with value display
- Text: Large textarea with voice input option

**Acceptance Criteria:**
- [ ] Bottom sheet slides up smoothly
- [ ] All prompts render with 64px touch targets
- [ ] Preview shows what will be updated
- [ ] Success closes and shows toast

---

### 3.2 Mobile Add Task Form (Inline)

**Function:** Quick task creation on mobile.

**Layout:** Inline expandable form within tasks section

**User State:** At apiary, wants to add a follow-up task.

**Screen Elements:**
- **Collapsed:** Card with dashed border, "+ Add Task"
- **Expanded:**
  - Task type dropdown
  - Custom title input (if custom selected)
  - "Add Task" button (64px, Sea Buckthorn)

**Defaults:**
- Priority: Medium
- Due date: None
- Applied to: Current hive only

**Acceptance Criteria:**
- [ ] Expands inline (not modal)
- [ ] Dropdown shows all templates
- [ ] Custom option reveals text input
- [ ] Collapses after successful add

---

### 3.3 BeeBrain Task Suggestions Section

**Function:** Display AI-suggested tasks with accept/dismiss.

**Layout:** Subsection within mobile tasks view

**User State:** Reviewing AI recommendations.

**Screen Elements:**
- **Section Header:** Robot icon + "Suggested by BeeBrain"
- Soft blue background tint
- **Suggestion Cards:**
  - Robot badge
  - Task name
  - Reason text (why suggested)
  - Priority badge
  - "Accept" button (Sea Buckthorn)
  - "Dismiss" link

**Note:** New BeeBrain analysis replaces previous suggestions.

**Acceptance Criteria:**
- [ ] Section only shows when suggestions exist
- [ ] Robot icon clearly identifies BeeBrain source
- [ ] Reason text explains why suggested
- [ ] Accept creates task, Dismiss removes suggestion

---

### 3.4 Overdue Alert Banner

**Function:** Alert users to overdue tasks on Tasks page.

**Layout:** Banner at top of /tasks page content (SIDEBAR visible)

**User State:** Opening Tasks page with overdue items.

**Screen Elements:**
- Muted Rose background (10% opacity)
- Warning icon + "You have X overdue tasks"
- "View" link scrolls to overdue section
- Close X button (dismissible for session)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Banner shows when overdue tasks exist
- [ ] "View" scrolls to overdue section
- [ ] Dismissible for session, reappears on reload

---

### 3.5 Tasks Navigation Badge

**Function:** Show overdue task count in sidebar navigation.

**Layout:** Badge on Tasks nav item (SIDEBAR)

**User State:** Navigating the app with overdue tasks.

**Screen Elements:**
- Red badge (#ef4444) on "Tasks" nav item
- Shows count (number only)
- Hidden when count = 0
- Also appears in mobile "More" drawer

**Acceptance Criteria:**
- [ ] Badge appears when overdue > 0
- [ ] Badge hidden when overdue = 0
- [ ] Count is accurate and updates on changes
- [ ] Works in sidebar and mobile More drawer

---

# Quick Reference

## Phase Summary

| Phase | Name | Screens |
|-------|------|---------|
| 1 | Task Management - Portal | 5 |
| 2 | Task Management - Mobile Layout | 5 |
| 3 | Task Management - Mobile Actions & Alerts | 5 |
| **Total** | | **15** |

## Task Priority Color Reference

| Priority | Dot Color | Hex | Use Case |
|----------|-----------|-----|----------|
| Urgent | Red | #ef4444 | Immediate action required |
| High | Orange | #f97316 | Should do soon |
| Medium | Green | #22c55e | Normal priority (default) |
| Low | Gray | #6b7280 | Do when convenient |

## Task Card Border Colors

| Status | Border Color | Background |
|--------|--------------|------------|
| Normal | Sea Buckthorn (#f7a42d) | White |
| Overdue | Muted Rose (#c4857a) | Light rose tint |
| BeeBrain | Soft Blue (#3b82f6) | Light blue tint |

## Sidebar Visibility Summary

| Screen Type | Sidebar Visible? |
|-------------|------------------|
| All portal screens | YES |
| Modal overlays | YES (behind modal) |
| Mobile pages | BOTTOM NAV instead |
| Mobile hive detail | BOTTOM ANCHOR NAV (special 3-button nav) |

## The Vibe Checklist (Task-Specific)

| Aspect | YES | NO |
|--------|-----|-----|
| Task language | "3 open · 1 overdue" | "3 pending, 1 past due" |
| Priority | Colored dots with labels | Text-only priority |
| Completion | Auto-magic hive updates | Manual follow-up editing |
| Mobile inputs | 64px touch targets | Standard small inputs |
| BeeBrain | "Suggested by BeeBrain" with robot | "AI recommendation" |
| Empty state | "No tasks for this hive" | Blank section |
