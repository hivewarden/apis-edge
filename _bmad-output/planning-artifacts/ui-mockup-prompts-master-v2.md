# APIS UI Mockup Prompts - Master Document v2

**Purpose:** Each phase is completely self-contained. Copy any single phase and you have everything needed to generate consistent mockups - no need to reference other sections.

**Total:** 18 Phases, 70 Screens (Epics 1-9, 13 - Dashboard & Portal screens only)

**v2 Changes:**
- Split into 18 smaller phases (was 12 in v1)
- Added explicit sidebar/layout requirements for every screen
- Login/Setup screens now show "no sidebar" explicitly
- All app screens require visible sidebar
- Added missing QR Scanner and QR Code Generator screens
- Merged Export, Milestones & Lifecycle Events into single phase
- Added Add/Edit Hive Form (8.3)
- Added Feeding History View (10.5)
- Added Equipment Log Form (10.6)
- Enhanced dashboard screens with complete story requirements (tooltips, states, etc.)

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
- Sidebar shows: APIS logo, Dashboard, Sites, Units, Hives, Clips, Statistics, Maintenance, Settings
- Active nav item highlighted with cream/gold pill background
- Only exception: Login, Setup Wizard, and Modals (overlays)
```

---

# Phase 1: Authentication (No Sidebar)

## Master Style Block - Phase 1

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The user is logging in or setting up for the first time. The interface should feel welcoming, professional, and reassuring — like entering a trusted space.

LAYOUT:
- NO SIDEBAR - these are pre-authentication screens
- Centered content layout
- APIS logo prominent at top
- Clean, focused forms

COLOR PALETTE:
- Primary Background: Coconut Cream (#fbf9e7)
- Accent/CTAs: Sea Buckthorn (#f7a42d)
- Primary Text: Brown Bramble (#662604)
- Surface Color: Pure White (#ffffff)

VIBE:
- Welcoming and secure
- NOT: Cold, intimidating
```

## Acceptance Criteria - Phase 1

- [ ] NO sidebar shown (pre-authentication)
- [ ] Logo centered and prominent
- [ ] Forms centered with generous padding
- [ ] Mobile-friendly responsive layout

---

### 1.1 Login Page (Local Mode)

**Function:** Secure entry point for standalone deployments.

**Layout:** NO SIDEBAR - centered form layout

**User State:** Returning user accessing their beekeeping data.

**Screen Elements:**
- Coconut Cream (#fbf9e7) full-page background
- APIS logo centered at top
- White card container (centered, max-width 400px)
- Welcome message: "Welcome back to APIS"
- Email field
- Password field with show/hide toggle
- "Remember me" checkbox
- "Sign In" button (Sea Buckthorn, pill shape)
- "Forgot password?" link

**Acceptance Criteria:**
- [ ] NO sidebar visible
- [ ] Form is centered with generous padding
- [ ] Input fields are 48-56px height
- [ ] Password toggle is accessible
- [ ] Primary button is prominent (Sea Buckthorn)

---

### 1.2 Login Page (Zitadel/SSO Mode)

**Function:** SSO entry point for SaaS deployments.

**Layout:** NO SIDEBAR - centered form layout

**User State:** User authenticating via corporate SSO.

**Screen Elements:**
- Coconut Cream (#fbf9e7) full-page background
- APIS logo centered
- White card container (centered)
- "Sign in to APIS" heading
- "Sign in with Zitadel" button (outlined style)
- Brief explanation of SSO flow
- Privacy and terms links at bottom

**Acceptance Criteria:**
- [ ] NO sidebar visible
- [ ] SSO button is prominent but not aggressive
- [ ] Clear explanation of redirect
- [ ] Logo and branding consistent

---

### 1.3 Setup Wizard - Step 1 (Account Creation)

**Function:** Initial configuration for new standalone deployments.

**Layout:** NO SIDEBAR - centered wizard layout

**User State:** First-time setup, needs guidance.

**Screen Elements:**
- Coconut Cream background
- Step indicator (Step 1 of 2) at top
- "Welcome to APIS" heading
- White card container
- Display name field
- Email field
- Password field with requirements shown
- Confirm password field
- "Continue" button

**Acceptance Criteria:**
- [ ] NO sidebar visible
- [ ] Progress indicator shows current step
- [ ] Password requirements displayed gently (not angry red)
- [ ] Large, accessible form fields
- [ ] Encouraging copy ("Let's get you set up")

---

### 1.4 Setup Wizard - Step 2 (Deployment)

**Function:** Configure deployment scenario with security guidance.

**Layout:** NO SIDEBAR - centered wizard layout

**User State:** Completing initial setup.

**Screen Elements:**
- Step indicator (Step 2 of 2)
- "How will you use APIS?" heading
- Three large choice cards (horizontally or vertically stacked):
  - "Just me" (laptop icon) — "Dashboard only, local access"
  - "Home network" (wifi icon) — "Access from devices on your network"
  - "Remote access" (globe icon) — "Access from anywhere"
- Security warning for remote option (amber, not scary)
- "Complete Setup" button

**Acceptance Criteria:**
- [ ] NO sidebar visible
- [ ] Choice cards are large and tappable
- [ ] Icons clearly communicate each option
- [ ] Can go back to previous step
- [ ] Completion feels celebratory

---

# Phase 2: Navigation Components

## Master Style Block - Phase 2

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
These are the structural navigation elements that appear on every authenticated screen.

SIDEBAR (Desktop):
- Width: 240px expanded, 64px collapsed
- Background: Pure White (#ffffff)
- Items: APIS logo, Dashboard, Sites, Units, Hives, Clips, Statistics, Maintenance, Settings
- Active state: Cream/gold pill background
- User info at bottom

BOTTOM NAV (Mobile):
- Height: 64px + safe area
- 5 items: Dashboard, Hives, Clips, Maintenance, More

VIBE:
- Clean and organized
- Always present on app screens
```

## Acceptance Criteria - Phase 2

- [ ] Sidebar appears on all desktop app screens
- [ ] Bottom nav appears on all mobile app screens
- [ ] Active state clearly visible

---

### 2.1 Sidebar Navigation (Desktop)

**Function:** Primary navigation structure for the application.

**Layout:** Left-docked sidebar, 240px width

**User State:** Authenticated user navigating between sections.

**Screen Elements:**
- APIS logo at top (bee + shield motif)
- Navigation items with thin-stroke icons:
  - Dashboard
  - Sites
  - Units
  - Hives
  - Clips
  - Statistics
  - Maintenance
  - Settings
- Active item: cream/gold pill background
- User avatar and name at bottom
- Logout option
- Collapse/expand control (hamburger icon)

**Acceptance Criteria:**
- [ ] Logo is prominent but not overwhelming
- [ ] Active item highlighted with cream/gold pill background
- [ ] Icons are thin-stroke, minimalist style
- [ ] Collapsed state shows icons only (64px width)
- [ ] User info visible at bottom

---

### 2.2 Mobile Bottom Navigation

**Function:** Primary navigation on mobile devices.

**Layout:** Fixed bottom bar, 64px height

**User State:** Mobile user switching between main sections.

**Screen Elements:**
- 5 items: Dashboard, Hives, Clips, Maintenance, More
- Icons with labels below
- Active state in Sea Buckthorn
- "More" opens drawer with: Sites, Units, Statistics, Settings

**Acceptance Criteria:**
- [ ] 64px height minimum for glove-friendly tapping
- [ ] Icons with labels for clarity
- [ ] Active state clearly visible (Sea Buckthorn)
- [ ] Safe area padding for notched phones
- [ ] Subtle shadow separator from content

---

# Phase 3: Dashboard Home

## Master Style Block - Phase 3

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is doing their daily check-in. The interface should feel protective and informative — celebrating when quiet, alerting when busy.

LAYOUT:
- SIDEBAR VISIBLE (left side, desktop) / BOTTOM NAV (mobile)
- Main content area with card grid
- Site selector at top if multiple sites

COLOR PALETTE:
- Primary Background: Coconut Cream (#fbf9e7)
- Cards: Pure White (#ffffff)
- Accent/CTAs: Sea Buckthorn (#f7a42d)

VIBE:
- Warm daily greeting
- Status at a glance
- NOT: Alarming, clinical
```

## Acceptance Criteria - Phase 3

- [ ] SIDEBAR VISIBLE on all screens
- [ ] Welcome message with user name
- [ ] Most important info above the fold

---

### 3.1 Dashboard Home

**Function:** Central overview of protection status.

**Layout:** SIDEBAR VISIBLE (left) + Main content area

**User State:** Daily check-in on apiary status.

**Screen Elements:**
- Sidebar navigation (visible, expanded on desktop)
- Header: "Welcome back, [Name]"
- Top bar:
  - Site selector dropdown (left)
  - Time range selector: Day | Week | Month | Season | Year | All Time (center)
  - Date navigation arrows (right)
  - Date picker appears when "Day" selected
  - URL reflects selection (?range=week&date=2026-01-20)
- Summary cards row (4 cards):
  - "Today's Activity" card (detection count, laser success rate)
  - Weather card (temp, feels like, humidity, last updated)
  - Unit status summary card
  - BeeBrain insights card (summary or prioritized concerns)
- Charts section:
  - Activity Clock (24-hour polar chart)
  - Temperature Correlation (scatter plot with trend line)
  - Trend Line Chart (area chart with comparison line)
- Quick links to other sections

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE on left side
- [ ] Active nav item: "Dashboard" highlighted
- [ ] Time range selector updates all charts
- [ ] Date picker shows when "Day" is selected
- [ ] Most important info above the fold
- [ ] Warm, welcoming tone
- [ ] BeeBrain insights draw attention if urgent
- [ ] All charts have tooltips on hover

---

### 3.2 Today's Detection Count Card

**Function:** Primary activity indicator on dashboard.

**Layout:** Card within dashboard (SIDEBAR VISIBLE)

**User State:** Wanting quick status check.

**Screen Elements:**
- White card with subtle shadow (slight green tint)
- Large detection count number (48-64px, Sea Buckthorn color)
- Friendly text: "5 hornets deterred today"
- Subtext: "Last detection: 2 hours ago"
- Laser success rate: "4 of 5 deterred with laser" (smaller text below)
- Green checkmark icon for quiet days (Soft Sage)
- **Zero state:** "All quiet today ☀️" with reassuring green checkmark
- **Zero state subtext:** "Your bees are protected"

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE (this is a component on dashboard)
- [ ] Count is the dominant element (48-64px)
- [ ] "Deterred" not "detected" (protective framing)
- [ ] Laser success rate always visible when detections > 0
- [ ] Zero state is positive with "All quiet today ☀️" message
- [ ] Last detection gives temporal context
- [ ] Card feels warm and reassuring, not clinical

---

### 3.3 Weather Card

**Function:** Environmental context for activity.

**Layout:** Card within dashboard (SIDEBAR VISIBLE)

**User State:** Correlating weather with hornet behavior.

**Screen Elements:**
- White card with subtle shadow (Salomie background option)
- Weather condition icon (sun, cloud, rain - stylized, warm style)
- Current temperature (large, 32px): "22°C"
- "Feels like" temperature (smaller): "Feels like 24°C"
- Condition + Humidity: "Sunny • Humidity 65%"
- Site name for multi-site users (subtle)
- "Last updated" timestamp at bottom: "Updated 10 min ago"
- **Error state:** "Weather unavailable" with [Retry] button
- **Stale state:** Shows cached data with "Last updated: 2 hours ago" warning

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Weather icon is warm style, not clinical
- [ ] Temperature is prominent (32px)
- [ ] "Feels like" always visible below main temperature
- [ ] "Last updated" timestamp always shown
- [ ] Stale data (>30 min) clearly indicated with warning
- [ ] Error state shows "Weather unavailable" with Retry button
- [ ] Retry button triggers fresh fetch

---

# Phase 4: Sites Management

## Master Style Block - Phase 4

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is organizing their apiaries. The interface should help them feel in control of their locations.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- List/grid views with cards
- Detail pages with sections

VIBE:
- Organized and capable
- Location context with maps
```

## Acceptance Criteria - Phase 4

- [ ] SIDEBAR VISIBLE on all screens
- [ ] "Sites" nav item highlighted when on these pages

---

### 4.1 Sites List Page

**Function:** Overview of all apiaries.

**Layout:** SIDEBAR VISIBLE + Main content with card grid

**User State:** Managing multiple apiary locations.

**Screen Elements:**
- Sidebar with "Sites" highlighted
- "Your Sites" heading
- "Add Site" button (Sea Buckthorn, top right)
- Grid of site cards (2 columns mobile, 3-4 desktop)
- Each card: Name, mini-map thumbnail, unit count, hive count
- Empty state if no sites: "Add your first site" with illustration

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Sites" active
- [ ] Add button prominent (Sea Buckthorn)
- [ ] Cards show location context (mini-map)
- [ ] Click navigates to site detail
- [ ] Empty state is encouraging

---

### 4.2 Site Detail Page

**Function:** Full view of a single apiary.

**Layout:** SIDEBAR VISIBLE + Main content with sections

**User State:** Viewing specific site's units and hives.

**Screen Elements:**
- Sidebar with "Sites" highlighted
- Site name as page heading
- Breadcrumb: Sites > [Site Name]
- Map section (OpenStreetMap) showing site location
- GPS coordinates with copy button
- Timezone display
- Units section: status cards for each unit
- Hives section: preview list
- Edit and Delete actions (top right, secondary buttons)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Sites" active
- [ ] Map shows site location prominently
- [ ] Units grouped with status indicators
- [ ] Hives show quick summary
- [ ] Edit/delete accessible but not prominent

---

### 4.3 Add/Edit Site Form

**Function:** Create or modify a site.

**Layout:** SIDEBAR VISIBLE + Form in main area

**User State:** Configuring apiary details.

**Screen Elements:**
- Sidebar with "Sites" highlighted
- "Add Site" or "Edit [Site Name]" heading
- White card container for form
- Name field
- GPS Latitude field with format hint (e.g., "50.8503")
- GPS Longitude field with format hint (e.g., "4.3517")
- Timezone dropdown (defaults to Europe/Brussels)
- "Save" button (Sea Buckthorn) and "Cancel" button (outlined)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Sites" active
- [ ] GPS format examples provided
- [ ] Timezone defaults intelligently
- [ ] Validation messages are helpful (not red angry text)
- [ ] Save button is primary action

---

# Phase 5: Units Management

## Master Style Block - Phase 5

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is monitoring their protection devices. The interface should show status at a glance and feel reassuring.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Status-focused card displays

STATUS COLORS:
- Online Armed: Soft Sage (#7c9082) dot + "Armed"
- Online Disarmed: Amber (#d4a574) dot + "Disarmed"
- Offline: Muted Rose (#c4857a) dot + "Offline"

VIBE:
- Status at a glance
- Protective confidence
```

## Acceptance Criteria - Phase 5

- [ ] SIDEBAR VISIBLE on all screens
- [ ] "Units" nav item highlighted
- [ ] Status colors consistent

---

### 5.1 Units List Page

**Function:** Overview of all APIS hardware units.

**Layout:** SIDEBAR VISIBLE + Grid of unit cards

**User State:** Monitoring protection device status.

**Screen Elements:**
- Sidebar with "Units" highlighted
- "Your Units" heading
- "Register Unit" button (Sea Buckthorn)
- Filter by site dropdown
- Grid of unit status cards
- Each card: Name, site, status dot+label, last seen time

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Units" active
- [ ] Status immediately visible (colored dot)
- [ ] Last seen time is human-readable ("2 minutes ago")
- [ ] Cards clickable for detail
- [ ] Filter helps with multiple units

---

### 5.2 Unit Status Card (Component)

**Function:** At-a-glance unit status.

**Layout:** Card component - appears on pages where SIDEBAR VISIBLE

**User State:** Quick status check.

**Screen Elements:**
- White card with subtle shadow
- Unit name (bold, Brown Bramble)
- Site name (subtle, 70% opacity)
- Status indicator:
  - Green dot + "Armed" = online and protecting
  - Yellow dot + "Disarmed" = online but laser off
  - Red dot + "Offline" = no heartbeat
- Last seen: "2 minutes ago" or "Offline since 10:30"
- Optional: live preview thumbnail

**Acceptance Criteria:**
- [ ] Component renders correctly within sidebar-visible pages
- [ ] Status dot is 12px with label
- [ ] Time is relative, not absolute
- [ ] Card has hover state (slight lift)
- [ ] Click reveals more detail

---

### 5.3 Unit Detail Page

**Function:** Full unit information and controls.

**Layout:** SIDEBAR VISIBLE + Main content sections

**User State:** Managing specific unit.

**Screen Elements:**
- Sidebar with "Units" highlighted
- Breadcrumb: Units > [Unit Name]
- Unit name as heading + status badge
- Large status card (prominent): status dot, armed state, last seen
- "View Live Feed" button (Sea Buckthorn, prominent)
- Configuration section:
  - Assigned site (dropdown to change)
  - Covered hives (multi-select)
- System info card:
  - Registration date: "Registered Jan 15, 2026"
  - Firmware version: "v1.0.3"
  - Uptime: "5 days, 3 hours"
  - Storage free: "450 MB"
  - Last IP address (subtle)
- API Key section:
  - Masked key: "apis_••••••••••••"
  - "Regenerate" button with warning icon
  - Warning text: "Regenerating will invalidate the current key"
- Arm/Disarm toggle switch (prominent)
- Edit/Delete actions (secondary buttons)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Units" active
- [ ] Live feed button prominent (Sea Buckthorn)
- [ ] Registration date displayed in system info
- [ ] API key shown masked with "Regenerate" warning
- [ ] Regenerate shows confirmation dialog before proceeding
- [ ] Arm/Disarm toggle is clearly visible and functional
- [ ] Firmware version helps with troubleshooting
- [ ] Delete has confirmation dialog

---

### 5.4 Register Unit Modal

**Function:** Add new APIS hardware unit.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** Setting up new protection device.

**Screen Elements:**
- Modal with white background, rounded corners
- "Register New Unit" heading
- Unit name field
- Assigned site dropdown
- Covered hives multi-select (optional)
- "Register" button (Sea Buckthorn)
- On success: API key display with copy button
- Warning: "Save this key now. It won't be shown again."

**Acceptance Criteria:**
- [ ] Modal overlays page (sidebar still visible behind)
- [ ] API key shown ONCE with strong warning (amber)
- [ ] Copy to clipboard works
- [ ] Key masked after modal closes
- [ ] Instructions for entering key on device

---

### 5.5 Live Video Stream Modal

**Function:** Real-time view from unit camera.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** Checking what unit sees.

**Screen Elements:**
- Large modal (80% viewport)
- Unit name as title
- Video player (MJPEG stream) with dark background
- Status indicators: Connected badge, Latency
- Close button (X, top right)
- Optional: detection overlay toggle

**Acceptance Criteria:**
- [ ] Modal overlays page (sidebar visible behind)
- [ ] Video fills modal appropriately
- [ ] Connection status visible
- [ ] Graceful handling if offline ("Camera unavailable")
- [ ] Close button accessible

---

# Phase 6: Detection Charts

## Master Style Block - Phase 6

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is exploring activity patterns. Charts should feel insightful and educational.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Time range selector affects all charts
- Charts use smooth curves and Sea Buckthorn colors

DATA VISUALIZATION:
- Smooth spline curves, not jagged lines
- Filled area charts with gradient
- 24-hour clock uses polar/radar layout
- Scatter plots use soft, round points

VIBE:
- Educational insights
- "Hornets prefer..." framing
```

## Acceptance Criteria - Phase 6

- [ ] SIDEBAR VISIBLE on all screens
- [ ] "Statistics" nav item highlighted
- [ ] Charts use Sea Buckthorn gradients

---

### 6.1 Statistics Page (Full)

**Function:** Comprehensive detection analytics.

**Layout:** SIDEBAR VISIBLE + Scrollable chart sections

**User State:** Exploring patterns over time.

**Screen Elements:**
- Sidebar with "Statistics" highlighted
- "Detection Analytics" heading
- Time Range Selector (segmented control)
- Chart sections (vertical scroll):
  - Activity Clock (polar chart)
  - Temperature Correlation (scatter)
  - Trend Line (area chart)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Statistics" active
- [ ] Time range selector updates all charts
- [ ] Charts are responsive on mobile
- [ ] Loading states for each chart

---

### 6.2 Time Range Selector

**Function:** Control data timeframe across all charts.

**Layout:** Segmented control component (within SIDEBAR pages)

**User State:** Exploring patterns over different periods.

**Screen Elements:**
- Segmented control bar (pill-shaped segments)
- Options: Day | Week | Month | Season | Year | All Time
- Active segment: Sea Buckthorn background, white text
- Inactive segments: Light cream background, Brown Bramble text
- **Date picker:** Appears below when "Day" is selected
- **Date navigation arrows:** < > buttons for previous/next period
- **URL sync:** Selection reflected in URL query params (?range=week&date=2026-01-20)

**Acceptance Criteria:**
- [ ] Sea Buckthorn highlight on selected segment
- [ ] Changes affect ALL charts on page simultaneously
- [ ] Brief loading state during data fetch
- [ ] Date picker visible when "Day" is selected
- [ ] Date navigation arrows work for all ranges
- [ ] URL reflects selection (shareable links)
- [ ] Season = Aug 1 - Nov 30 (configurable per hemisphere)
- [ ] "All Time" shows data from first detection to now

---

### 6.3 Activity Clock (24-Hour Polar Chart)

**Function:** Show daily activity patterns.

**Layout:** Chart card - appears on pages where SIDEBAR VISIBLE

**User State:** Understanding when hornets are most active.

**Screen Elements:**
- White card with "Activity by Hour" heading
- Circular chart shaped like a clock (12:00 at top)
- 24 spokes (hours 0-23)
- Radius = detection count per hour
- Sea Buckthorn (#f7a42d) fill with 50% opacity
- Clock labels at 00, 06, 12, 18 positions
- Afternoon bulge visible (14:00-16:00 peak typical)
- **Tooltip on hover:** "14:00 - 15:00: 8 detections (23% of total)"
- **Empty state:** "No activity recorded for this period" message centered
- **Empty state visual:** Flat circle (zero radius) with message overlay

**Acceptance Criteria:**
- [ ] Component renders correctly within sidebar-visible pages
- [ ] Looks like a clock (familiar orientation, 12 at top)
- [ ] Peak hours bulge outward visibly
- [ ] Night hours (20:00-06:00) visually minimal
- [ ] Hover reveals exact counts with percentage
- [ ] Empty state shows helpful message, not blank chart
- [ ] Title updates for aggregated view: "Average hourly activity"

---

### 6.4 Temperature Correlation Chart

**Function:** Show temperature vs activity relationship.

**Layout:** Chart card (within SIDEBAR pages)

**User State:** Predicting high-activity days.

**Screen Elements:**
- White card with "Temperature Correlation" heading
- Scatter plot
- X-axis: Temperature (°C), range 10-30°C typical
- Y-axis: Detection count, range 0-15 typical
- Each dot = one day's data (Sea Buckthorn points, 8px soft circles)
- Clustering visible around 18-22°C (typical hornet preference)
- **Trend line:** Dashed line showing correlation (optional toggle)
- **Tooltip on hover:** "Oct 15: 22°C, 14 detections"
- **Click action:** Clicking a dot navigates to that day's detailed view
- Insight text below chart: "Hornets prefer 18-22°C at your location"

**Acceptance Criteria:**
- [ ] Points are soft, round, Sea Buckthorn (#f7a42d)
- [ ] Trend line visible (dashed gray) to show correlation pattern
- [ ] Insight text summarizes the learning in plain language
- [ ] Click on any point navigates to that day's detail
- [ ] Tooltip shows date, temperature, and count on hover
- [ ] Chart adapts X-axis range to actual data (not fixed)

---

### 6.5 Trend Line Chart

**Function:** Show activity over time.

**Layout:** Chart card (within SIDEBAR pages)

**User State:** Tracking if hornet pressure is changing.

**Screen Elements:**
- White card with "This Week's Trend" heading (or "This Month's Trend" etc.)
- Area chart with smooth spline curve (organic, not jagged)
- X-axis: Time (Mon-Sun for Week, dates for Month, weeks for Season)
- Y-axis: Detection count
- Sea Buckthorn gradient fill (bottom transparent to solid top)
- **Comparison line:** Faded dashed line showing previous period (last week/month)
- **Legend:** "This week" (solid gold) vs "Last week" (dashed gray)
- **Tooltip on hover:** "Wed: 14 detections" (or "Oct 15: 14 detections")
- **Toggle:** Option to show/hide comparison line

**Acceptance Criteria:**
- [ ] Smooth curves, not jagged (spline interpolation)
- [ ] Gradient fill creates warmth (Sea Buckthorn)
- [ ] Comparison line is subtle (dashed, faded gray)
- [ ] Legend clearly differentiates current vs previous period
- [ ] Tooltip shows exact count on hover
- [ ] Responsive data density on mobile (fewer points)
- [ ] X-axis labels adapt to time range selected

---

# Phase 7: Clip Archive

## Master Style Block - Phase 7

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is reviewing recorded incidents. The interface should feel like a well-organized archive.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Grid of thumbnail cards
- Modal for video playback

MEDIA PRESENTATION:
- Thumbnails: 16:9 aspect ratio, rounded corners (8px)
- Video player: Native controls, dark background for focus

VIBE:
- Organized and scannable
- NOT: Surveillance-heavy
```

## Acceptance Criteria - Phase 7

- [ ] SIDEBAR VISIBLE on all screens
- [ ] "Clips" nav item highlighted
- [ ] Thumbnails load quickly (lazy load)

---

### 7.1 Clips List Page

**Function:** Browse all detection clips.

**Layout:** SIDEBAR VISIBLE + Grid of clip cards

**User State:** Finding specific incidents.

**Screen Elements:**
- Sidebar with "Clips" highlighted
- "Detection Clips" heading
- Filter controls (collapsible on mobile): Date range, Unit, Site
- Result count: "Showing 24 clips"
- Grid of clip thumbnail cards (2 columns mobile, 4 desktop)
- Pagination or infinite scroll
- Empty state: "No clips match your filters"

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Clips" active
- [ ] Filters are collapsible on mobile
- [ ] Clear filters button when filters applied
- [ ] Empty state if no matches
- [ ] Newest clips first by default

---

### 7.2 Clip Thumbnail Card

**Function:** Individual clip preview.

**Layout:** Card component (within SIDEBAR pages)

**User State:** Scanning clips to find relevant one.

**Screen Elements:**
- White card with thumbnail
- Thumbnail image (16:9 aspect, rounded top corners)
- Play icon overlay (center, semi-transparent)
- Date/time: "Jan 22, 14:30"
- Unit name
- Duration badge: "0:04" (bottom right of thumbnail)

**Acceptance Criteria:**
- [ ] Play icon visible on hover/always on mobile
- [ ] Date is human-readable
- [ ] Card clickable to open modal
- [ ] Lazy loading for performance

---

### 7.3 Clip Player Modal

**Function:** Full video playback.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** Reviewing specific detection.

**Screen Elements:**
- Large modal with dark header
- Video player with native controls
- Plays automatically on open
- Detection metadata below video:
  - "Detected: Jan 22, 2026 at 14:30:22"
  - "Unit: Hive 1 Protector"
  - "Confidence: 85%"
  - "Laser activated: Yes"
- Previous/Next navigation arrows (sides)
- Delete button (with confirmation)
- Close button (X or click outside)

**Acceptance Criteria:**
- [ ] Modal overlays page (sidebar visible)
- [ ] Video autoplays
- [ ] Keyboard navigation (arrow keys, Escape)
- [ ] Delete has confirmation dialog
- [ ] Metadata provides full context

---

### 7.4 Nest Radius Estimator

**Function:** Estimate nest location from timing data.

**Layout:** SIDEBAR VISIBLE + Map section

**User State:** Trying to locate hornet nest.

**Screen Elements:**
- Sidebar with "Clips" or "Statistics" highlighted
- "Nest Location Estimate" heading
- Map (OpenStreetMap) centered on site location
- Hive marker (bee icon)
- Estimated radius circle (semi-transparent Sea Buckthorn)
- Text: "Nest likely within 350m based on 42 observations"
- Confidence indicator: Low/Medium/High badge
- "Report Nest Location" button (links to local authorities)
- Progress indicator if insufficient data

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Map uses OpenStreetMap (warm style if possible)
- [ ] Radius circle is semi-transparent
- [ ] Confidence explained clearly
- [ ] Report button links to local authorities info

---

# Phase 8: Hives List & Cards

## Master Style Block - Phase 8

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is managing their hives. The interface should feel like a trusted field companion.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Card-based list views
- Status badges prominent

STATUS BADGES:
- Healthy: Soft Sage (#7c9082)
- Needs Inspection: Amber (#d4a574)
- Issues Noted: Muted Rose (#c4857a)

VIBE:
- Field-ready and practical
- Status at a glance
```

## Acceptance Criteria - Phase 8

- [ ] SIDEBAR VISIBLE on all screens
- [ ] "Hives" nav item highlighted
- [ ] Status badges clearly visible

---

### 8.1 Hives List Page

**Function:** Overview of all hives at a site.

**Layout:** SIDEBAR VISIBLE + Grid/list of hive cards

**User State:** Planning inspection route.

**Screen Elements:**
- Sidebar with "Hives" highlighted
- "Hives at [Site Name]" heading (or "All Hives")
- Site filter dropdown (if multiple sites)
- "Add Hive" button (Sea Buckthorn)
- Sort options: Name, Last Inspection, Status
- Grid of hive cards
- Each card shows status badge prominently

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Hives" active
- [ ] Status badges clearly visible
- [ ] "Needs inspection" badge if >14 days
- [ ] Queen age calculated automatically
- [ ] Cards lead to hive detail

---

### 8.2 Hive Card (Component)

**Function:** Hive summary at a glance.

**Layout:** Card component - appears on pages where SIDEBAR VISIBLE

**User State:** Quick status assessment.

**Screen Elements:**
- White card with subtle shadow
- Hive name/number (bold)
- Status badge (top right): "Healthy", "Needs Inspection", "Issues Noted"
- Queen: "2 years old" (icon + text)
- Config: "2 brood + 1 super"
- Last inspection: "5 days ago"

**Acceptance Criteria:**
- [ ] Component renders correctly within sidebar-visible pages
- [ ] Status badge immediately visible
- [ ] Essential info without overwhelming
- [ ] Click navigates to detail
- [ ] Compact on mobile

---

### 8.3 Add/Edit Hive Form

**Function:** Create or modify a hive.

**Layout:** SIDEBAR VISIBLE + Form in main area (or modal)

**User State:** Setting up a new hive or editing existing.

**Screen Elements:**
- Sidebar with "Hives" highlighted
- "Add Hive" or "Edit [Hive Name]" heading
- White card container for form
- Hive name/identifier field
- Site assignment dropdown
- Queen section:
  - Year introduced (date picker or year selector)
  - Source (text: "Local breeder", "Package", "Swarm", etc.)
  - Marked? (Yes/No toggle + optional color selector)
- Box configuration section:
  - Visual box stack representation
  - "Add Brood Box" button
  - "Add Super" button
  - Drag to reorder boxes
  - Remove box (X button per box)
- Notes field (optional)
- "Save" button (Sea Buckthorn) and "Cancel" button (outlined)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Hives" active
- [ ] Queen year auto-calculates age display
- [ ] Box configuration shows visual stack
- [ ] Can add/remove/reorder boxes
- [ ] Validation on required fields (name, site)
- [ ] Save shows success toast
- [ ] Cancel returns to previous page without saving

---

# Phase 9: Hive Detail & Inspection

## Master Style Block - Phase 9

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is deep in hive management. The interface supports detailed inspection workflows.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Tabbed content organization
- Box visualization for hive structure

MOBILE-FIRST:
- 64px minimum touch targets
- Swipe navigation for inspection cards
- Voice input prominent

VIBE:
- Detailed but not overwhelming
- Field-ready
```

## Acceptance Criteria - Phase 9

- [ ] SIDEBAR VISIBLE on all screens
- [ ] 64px touch targets for mobile
- [ ] Voice input prominent on notes

---

### 9.1 Hive Detail Page

**Function:** Complete hive information hub.

**Layout:** SIDEBAR VISIBLE + Tabbed content area

**User State:** Managing specific hive.

**Screen Elements:**
- Sidebar with "Hives" highlighted
- Breadcrumb: Hives > [Hive Name]
- Hive name as heading
- Status badge next to name
- Configuration summary card (boxes, queen info)
- Box visualization (stacked rectangles showing brood/super)
- "New Inspection" button (Sea Buckthorn, prominent)
- Recent inspection summary card
- BeeBrain analysis section
- Tabs: Inspections | Treatments | Feedings | Equipment

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Hives" active
- [ ] New Inspection is primary action
- [ ] Box visualization shows current setup
- [ ] Queen info includes age calculation
- [ ] BeeBrain provides insights

---

### 9.2 Quick-Entry Inspection (Mobile Swipe Flow)

**Function:** Record inspection with gloves on.

**Layout:** SIDEBAR VISIBLE (collapsed/bottom nav) + Swipe cards

**User State:** In the field, hive open.

**Screen Elements:**
- Bottom nav visible (mobile) / Collapsed sidebar (tablet)
- Progress dots at top (5-6 cards)
- Swipe left/right to navigate
- Card 1 - Queen: Three 64px toggles (Queen seen, Eggs seen, Queen cells)
- Card 2 - Brood: Stepper for frames, Pattern quality buttons
- Card 3 - Stores: Honey level segment, Pollen level segment
- Card 4 - Issues: Large checkboxes (DWV, Chalkbrood, Wax moth, Robbing, Other)
- Card 5 - Notes: Large textarea + 64px "SPEAK" voice button (Sea Buckthorn)
- Card 6 - Review: Summary + 64px "SAVE" button

**Acceptance Criteria:**
- [ ] SIDEBAR/BOTTOM NAV VISIBLE
- [ ] All inputs 64px minimum height
- [ ] Swipe navigation smooth
- [ ] Voice button prominent on notes (Sea Buckthorn, microphone icon)
- [ ] Auto-save draft locally
- [ ] Offline capable

---

### 9.3 Inspection History View

**Function:** Review past inspections.

**Layout:** SIDEBAR VISIBLE + Chronological list

**User State:** Tracking hive progress over time.

**Screen Elements:**
- Sidebar visible
- Part of Hive Detail (Inspections tab)
- Chronological list (newest first)
- Each entry: Date, Key findings summary, Issues flagged (badges)
- Click to expand full detail
- Compare button for 2 inspections
- Export option (CSV)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Key findings scannable
- [ ] Issues highlighted with rose badges
- [ ] Comparison shows changes
- [ ] Edit within 24 hours

---

### 9.4 Frame Development Chart

**Function:** Visualize frame progression over season.

**Layout:** Chart card (within SIDEBAR pages)

**User State:** Understanding hive development.

**Screen Elements:**
- White card with heading
- Stacked area chart
- X-axis: Inspection dates
- Y-axis: Frame count
- Layers: Brood (#8B4513 saddle brown), Honey (#f7a42d gold), Pollen (#FFA500 orange)
- Tooltip: "Jun 15: 6 brood, 4 honey, 2 pollen"
- Year-over-year comparison toggle

**Acceptance Criteria:**
- [ ] Colors match brood/honey/pollen meanings
- [ ] Smooth curves
- [ ] Comparison is optional
- [ ] Works with minimal data

---

# Phase 10: Treatments & Feedings

## Master Style Block - Phase 10

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is logging care activities. The interface should feel like a personal logbook.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Form-based entry
- History lists with cards

CARD ACCENTS:
- Treatment Cards: Soft blue 4px left border
- Feeding Cards: Amber 4px left border

VIBE:
- Organized logbook feel
- Easy multi-hive application
```

## Acceptance Criteria - Phase 10

- [ ] SIDEBAR VISIBLE on all screens
- [ ] Multi-hive selection works intuitively
- [ ] Date defaults to today

---

### 10.1 Treatment Log Form

**Function:** Record varroa treatment.

**Layout:** SIDEBAR VISIBLE + Form in main area

**User State:** Documenting treatment for records.

**Screen Elements:**
- Sidebar visible (Hives or dedicated section)
- "Log Treatment" heading
- White card form container
- Date picker (default: today)
- Hive multi-select (checkbox list or tags)
- Treatment type dropdown (Oxalic, Formic, Apivar, Thymol, Custom)
- Method dropdown (Vaporization, Dribble, Strips)
- Dose/Amount field
- Mite count before (optional)
- Weather conditions (optional)
- Notes textarea
- "Save Treatment" button (Sea Buckthorn)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Multi-hive selection works
- [ ] Built-in types + custom option
- [ ] Mite count enables efficacy tracking
- [ ] Confirmation on save

---

### 10.2 Treatment History View

**Function:** Review treatment records and efficacy.

**Layout:** SIDEBAR VISIBLE + List with cards

**User State:** Tracking treatment schedule and results.

**Screen Elements:**
- Sidebar visible
- Chronological list (newest first)
- Each entry card (blue left border):
  - Date, Type, Method
  - Hives applied to
  - Mite counts (before/after if available)
- Efficacy badge if counts exist: "87% reduction" (Sage)
- "Add follow-up count" button
- Filter by hive, type, date range

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Efficacy calculated automatically
- [ ] Follow-up counts linked to treatment
- [ ] Filtering helps find specific records
- [ ] Next treatment due indicator

---

### 10.3 Feeding Log Form

**Function:** Record feeding activity.

**Layout:** SIDEBAR VISIBLE + Form in main area

**User State:** Documenting feed to track consumption.

**Screen Elements:**
- Sidebar visible
- "Log Feeding" heading
- White card form container
- Date picker (default: today)
- Hive multi-select
- Feed type dropdown (Syrup, Fondant, Pollen patty, Custom)
- Amount field + unit selector (kg/liters)
- Concentration field (for syrup: 1:1, 2:1, custom) - shown only for syrup
- Notes textarea
- "Save Feeding" button (Sea Buckthorn)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Concentration shown for syrup only
- [ ] Units appropriate for feed type
- [ ] Season totals calculated
- [ ] Links to weight chart if available

---

### 10.4 Harvest Log Form

**Function:** Record honey harvest.

**Layout:** SIDEBAR VISIBLE + Form in main area

**User State:** Celebrating and documenting harvest.

**Screen Elements:**
- Sidebar visible
- "Log Harvest" heading
- White card form container
- Date picker
- Hive multi-select
- Frames harvested field
- Total amount (kg) field
- Per-hive split toggle (even distribution or manual)
- Quality notes (color, taste, source)
- Photo upload button
- "Save Harvest" button (Sea Buckthorn)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Per-hive split or even distribution
- [ ] Photo encouraged
- [ ] Season totals shown
- [ ] First harvest triggers celebration modal

---

### 10.5 Feeding History View

**Function:** Review past feeding records.

**Layout:** SIDEBAR VISIBLE + List with cards

**User State:** Tracking feeding patterns and consumption.

**Screen Elements:**
- Sidebar visible
- "Feeding History" heading (or tab within Hive Detail)
- Chronological list (newest first)
- Each entry card (amber left border):
  - Date
  - Feed type + amount (e.g., "2L Sugar syrup 2:1")
  - Hives fed
  - Notes preview
- Season totals summary at top: "2026 Season: 12kg syrup, 2kg fondant"
- Filter by hive, feed type, date range
- Click to expand full details

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Season totals prominently displayed
- [ ] Amber left border distinguishes from treatments
- [ ] Filtering works by hive, type, date
- [ ] Can edit recent entries (within 24 hours)

---

### 10.6 Equipment Log Form

**Function:** Record equipment added or removed from hives.

**Layout:** SIDEBAR VISIBLE + Form in main area

**User State:** Tracking seasonal equipment changes.

**Screen Elements:**
- Sidebar visible
- "Log Equipment" heading
- White card form container
- Equipment type dropdown:
  - Entrance reducer
  - Mouse guard
  - Queen excluder
  - Robbing screen
  - Feeder (top/frame)
  - Varroa board
  - Custom...
- Action toggle: Installed | Removed
- Date picker (default: today)
- Hive selector (single or multi-select)
- Notes textarea
- "Save" button (Sea Buckthorn)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Equipment types include common items + custom option
- [ ] Installed vs Removed clearly distinguished
- [ ] Updates "Currently Installed" list on hive detail
- [ ] Duration calculated when equipment removed
- [ ] Seasonal recommendations based on last year (optional)

---

# Phase 11: Calendar & Labels

## Master Style Block - Phase 11

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is planning and organizing. The interface should feel like a helpful calendar and customizable system.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Calendar uses monthly grid view
- Settings sections with tabs

CALENDAR COLORS:
- Treatments: Blue dot
- Feedings: Amber dot
- Inspections: Sage dot
- Reminders: Rose dot

VIBE:
- Planning and organized
- Customizable to their practice
```

## Acceptance Criteria - Phase 11

- [ ] SIDEBAR VISIBLE on all screens
- [ ] Calendar events color-coded
- [ ] Custom labels appear in dropdowns

---

### 11.1 Treatment Calendar

**Function:** Visual timeline of treatments and reminders.

**Layout:** SIDEBAR VISIBLE + Monthly calendar grid

**User State:** Planning treatment schedule.

**Screen Elements:**
- Sidebar visible (Settings or dedicated section)
- "Treatment Calendar" heading
- Month navigation (< March 2026 >)
- Monthly grid view
- Color-coded event dots per day
- Past treatments: checkmark badge
- Upcoming due: highlight border
- Click on date opens day detail
- "Add Reminder" button

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Treatments visible on calendar
- [ ] Due treatments highlighted (amber border)
- [ ] Click reveals detail
- [ ] Can add custom reminders

---

### 11.2 Custom Labels Management

**Function:** Create personalized categories.

**Layout:** SIDEBAR VISIBLE + Settings section

**User State:** Customizing for their practice.

**Screen Elements:**
- Sidebar with "Settings" highlighted
- "Custom Labels" heading
- Tabs: Feed Types | Treatment Types | Equipment Types | Issue Types
- List of labels per tab:
  - Built-in items (lock icon, non-deletable)
  - Custom items (editable/deletable)
- "Add" button per category
- Edit/Delete actions per custom item

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Settings" active
- [ ] Built-in labels marked with lock icon
- [ ] Custom labels appear in dropdowns throughout app
- [ ] Delete warns if label is in use
- [ ] Rename updates historical records

---

# Phase 12: PWA & Offline

## Master Style Block - Phase 12

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is in the field with limited connectivity. The interface works reliably offline.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Offline banner appears at top of content
- Sync indicators in header

OFFLINE INDICATORS:
- Offline banner: Storm Gray (#6b7280) background
- Pending sync badge: Amber
- Synced indicator: Soft Sage checkmark

VIBE:
- Reliable companion
- NEVER loses data
- NOT: Broken-feeling when offline
```

## Acceptance Criteria - Phase 12

- [ ] SIDEBAR VISIBLE on all screens
- [ ] Offline banner clearly visible when offline
- [ ] Pending sync count shown

---

### 12.1 Offline Banner

**Function:** Indicate offline status.

**Layout:** Fixed banner below header (SIDEBAR still visible)

**User State:** Working without connectivity.

**Screen Elements:**
- Sidebar visible (normal)
- Fixed banner below header bar
- Storm Gray (#6b7280) background
- Cloud-offline icon + text: "Offline — 3 inspections pending sync"
- Subtle animation (pulse) on pending count

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE (not affected by offline)
- [ ] Always visible when offline
- [ ] Shows pending count
- [ ] Disappears when online
- [ ] Brief "Synced!" confirmation toast when back online

---

### 12.2 Sync Status Indicator

**Function:** Show sync progress.

**Layout:** Component in header area (SIDEBAR visible)

**User State:** Returning online, watching sync.

**Screen Elements:**
- Located in header bar (top right area)
- Animated sync icon when syncing (rotating arrows)
- Progress: "Syncing 2 of 5..."
- Success: "All synced" with checkmark (Sage)
- Error: "1 item failed — tap to resolve" (Rose)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Animation indicates activity
- [ ] Progress is specific
- [ ] Errors actionable
- [ ] Auto-dismiss success after 3 seconds

---

### 12.3 Voice Input Button (Component)

**Function:** Speech-to-text for notes.

**Layout:** Button component (within SIDEBAR pages)

**User State:** Dictating with gloves on.

**Screen Elements:**
- Large microphone button: "SPEAK"
- 64px height, pill shape
- Sea Buckthorn background, white icon
- Animated when recording (pulsing border)
- Transcription appears in associated text field
- Stop button replaces speak when recording

**Acceptance Criteria:**
- [ ] 64px minimum for gloves
- [ ] Visual feedback when listening
- [ ] Transcription editable
- [ ] Works with browser Speech API

---

### 12.4 QR Scanner Modal

**Function:** Scan hive QR for quick navigation.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** In large apiary, finding specific hive quickly.

**Screen Elements:**
- Modal with camera viewfinder
- "Point at hive QR code" instruction text
- Viewfinder frame guides (corner brackets)
- Close button (X, top right)
- Flash toggle if available (torch icon)
- Permission request if camera not yet allowed

**Acceptance Criteria:**
- [ ] Modal overlays page (sidebar visible behind)
- [ ] Camera opens promptly
- [ ] Recognizes APIS QR codes
- [ ] Navigates to hive detail on successful scan
- [ ] Invalid code shows error toast

---

### 12.5 QR Code Generator (Settings)

**Function:** Generate printable QR codes for hives.

**Layout:** SIDEBAR VISIBLE + Settings section

**User State:** Setting up hive labels for the apiary.

**Screen Elements:**
- Sidebar with "Settings" highlighted
- "Hive QR Codes" heading
- Hive selector dropdown (or "All hives")
- QR code preview with hive name below
- "Print" button (Sea Buckthorn)
- "Download PNG" button (outlined)
- Multi-hive print layout option: "Print sheet (6 per page)"
- Size selector: Small (2cm) | Medium (4cm) | Large (6cm)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Settings" active
- [ ] QR includes hive ID encoded
- [ ] Print layout is clean and professional
- [ ] Human-readable hive name below each code
- [ ] Multiple codes per page option works

---

# Phase 13: BeeBrain AI

## Master Style Block - Phase 13

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper receives AI-powered insights. The interface should feel like advice from an experienced mentor.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Insight cards with severity borders
- Notification area for proactive insights

INSIGHT CARDS:
- Info: Soft blue left border
- Warning: Amber left border
- Action Needed: Muted Rose left border

BEEBRAIN BRANDING:
- Brain/bee icon (combined logo)
- "BeeBrain Analysis" label

VIBE:
- Wise and helpful mentor
- NOT: Scary alarms, robot-like
```

## Acceptance Criteria - Phase 13

- [ ] SIDEBAR VISIBLE on all screens
- [ ] Insights are human-readable
- [ ] Severity is clear (info < warning < action)

---

### 13.1 Dashboard BeeBrain Card

**Function:** Daily AI summary on dashboard.

**Layout:** Card on dashboard (SIDEBAR visible)

**User State:** Getting quick status overview.

**Screen Elements:**
- White card with brain-bee icon
- "BeeBrain Analysis" heading
- "Last updated: 2 hours ago" + [Refresh] link
- Summary text: "All quiet at [Site]. Your 3 hives are doing well."
- Or prioritized concerns list (max 3 items)
- "View all insights" link

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Brain icon is friendly (not clinical)
- [ ] Refresh triggers new analysis
- [ ] Concerns prioritized by severity
- [ ] Links to relevant actions

---

### 13.2 Hive BeeBrain Section

**Function:** Hive-specific AI analysis.

**Layout:** Section in Hive Detail (SIDEBAR visible)

**User State:** Understanding specific hive.

**Screen Elements:**
- Part of Hive Detail page
- "BeeBrain Analysis for [Hive]" subheading
- Current health assessment text
- Specific recommendations with supporting data
- "Tell me more" expandable details
- "Dismiss" option per insight

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Analysis specific to this hive
- [ ] Data points explained ("Based on last 3 inspections...")
- [ ] Actions linked
- [ ] Can dismiss if not applicable

---

### 13.3 Proactive Insight Notification

**Function:** Surface important insights proactively.

**Layout:** Notification card at top of dashboard (SIDEBAR visible)

**User State:** Opening app, insight waiting.

**Screen Elements:**
- Prominent card in notification area (top of content)
- Severity indicator (colored left border)
- BeeBrain icon
- Insight message
- Action buttons: [Dismiss] [Snooze] [Take Action]
- Snooze dropdown: 1 day, 7 days, 30 days

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Appears prominently
- [ ] Can dismiss permanently
- [ ] Snooze respects duration
- [ ] Action navigates to relevant page

---

### 13.4 Maintenance Priority List

**Function:** Ranked list of hives needing attention.

**Layout:** SIDEBAR VISIBLE + Priority list page

**User State:** Planning apiary work.

**Screen Elements:**
- Sidebar with "Maintenance" highlighted
- "Maintenance Needed" heading
- List sorted by priority (highest first)
- Each item card:
  - Hive name (bold)
  - Priority badge: "Urgent" (Rose), "Soon" (Amber), "Optional" (Sage)
  - Summary text
  - Quick action button
- Batch actions for multiple hives
- Empty state: "All caught up!" with celebration illustration

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Maintenance" active
- [ ] Highest priority first
- [ ] Quick actions accessible
- [ ] Batch actions for multiple hives
- [ ] Empty state celebrates completion

---

# Phase 14: Export, Milestones & Lifecycle Events

## Master Style Block - Phase 14

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
This phase covers the full lifecycle: exporting data, celebrating achievements, and handling losses with compassion. The interface should empower users while acknowledging both joys and sorrows.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Modals overlay for celebrations (sidebar visible behind)
- Wizard flow for sensitive topics (hive loss)

EXPORT:
- Preview shows actual output
- Copy/download prominent

CELEBRATIONS:
- First harvest: Confetti + bee animation
- Overwintering: Gentle celebration
- Season end: Recap with shareable stats

COMPASSION (Hive Loss):
- Empathetic language
- Optional steps (no pressure)
- Learning-focused framing
- Gentle colors, no harsh red

VIBE:
- Empowering and celebratory for achievements
- Compassionate for losses
- NOT: Cold data dumps, clinical documentation
```

## Acceptance Criteria - Phase 14

- [ ] SIDEBAR VISIBLE on all screens
- [ ] Export preview shows actual output
- [ ] Celebrations are joyful not overwhelming
- [ ] Hive loss tone is compassionate throughout
- [ ] Photo prompts encouraged for milestones

---

### 14.1 Export Configuration Page

**Function:** Configure and generate data export.

**Layout:** SIDEBAR VISIBLE + Form and preview area

**User State:** Wanting to share or backup data.

**Screen Elements:**
- Sidebar with "Settings" highlighted (Export section)
- "Export Data" heading
- Configuration card:
  - Hive selector dropdown (or "All hives")
  - What to include (checkbox groups):
    - BASICS: Name, Queen, Boxes, Weight
    - DETAILS: Inspections, Hornet data, Weight history
    - ANALYSIS: BeeBrain insights, Health summary
  - Format selector: Quick Summary | Detailed Markdown | Full JSON
- "Preview" button
- Preview area (scrollable, monospace for JSON)
- "Copy to Clipboard" button (Sea Buckthorn)
- "Download" button (outlined)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Settings" active
- [ ] Preview shows actual output
- [ ] Categories are logical groupings
- [ ] Copy shows confirmation toast
- [ ] Formats clearly differentiated

---

### 14.2 First Harvest Celebration Modal

**Function:** Celebrate first harvest milestone.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** Just logged first harvest.

**Screen Elements:**
- Modal with white background
- Confetti animation (gold/amber confetti)
- Bee illustration flying
- "Congratulations on your first harvest!" heading
- Harvest details: amount, date, hive(s)
- "Add a photo to remember this moment" prompt with upload button
- "Thanks!" dismiss button (Sea Buckthorn)

**Acceptance Criteria:**
- [ ] Modal overlays (sidebar visible behind)
- [ ] Animation is joyful not overwhelming (3-4 seconds)
- [ ] One-time event per user
- [ ] Photo prompt encouraged
- [ ] Dismisses gracefully

---

### 14.3 Season Recap Card

**Function:** End-of-season summary.

**Layout:** Card component (SIDEBAR visible page)

**User State:** Reflecting on season achievements.

**Screen Elements:**
- White card with gold accent border
- "2026 Season Recap" heading
- Key metrics grid:
  - Total harvest: "42 kg"
  - Hornets deterred: "127"
  - Inspections: "24"
  - Milestones reached: "3"
- Per-hive breakdown (expandable)
- "Share" button (generates image/text)
- "View Past Seasons" link
- "Download PDF" option

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Metrics feel celebratory
- [ ] Share generates nice image/text
- [ ] Comparison to previous years
- [ ] Downloadable as PDF

---

### 14.4 Overwintering Survey

**Function:** Spring check-in on survival.

**Layout:** SIDEBAR VISIBLE + Survey form

**User State:** Checking which hives made it through winter.

**Screen Elements:**
- Sidebar visible
- "Did all your hives survive winter?" heading (friendly tone)
- List of hives with radio options: Survived | Lost | Weak
- For survived: Optional condition notes
- For lost: "Document this loss" link (to post-mortem wizard)
- For weak: "Log inspection" link
- "Submit Survey" button
- Completion shows survival rate with appropriate response

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Prompt appears in spring (March-April)
- [ ] Easy status selection (64px touch targets)
- [ ] 100% survival is celebrated (confetti)
- [ ] Losses link to post-mortem wizard

---

### 14.5 Hive Loss Post-Mortem Wizard

**Function:** Guide through documenting hive loss with compassion.

**Layout:** SIDEBAR VISIBLE + Step wizard in main area

**User State:** Grieving, needs compassionate guidance.

**Screen Elements:**
- Sidebar visible
- Progress indicator (5 steps)
- Step 1 - Intro:
  - Empathetic message: "We're sorry about your loss. Recording what happened can help in the future."
  - "Continue" or "Skip documentation" options
- Step 2 - When:
  - Date discovered picker
- Step 3 - Suspected cause:
  - Dropdown: Starvation, Varroa, Queen failure, Pesticide, Robbing, Unknown, Other
- Step 4 - Observations:
  - Symptoms checklist (checkboxes)
  - Notes textarea
- Step 5 - Decision:
  - Archive hive (recommended) vs Delete hive
  - Explanation of archive benefits
- Completion:
  - "Your records have been saved. This information helps beekeepers learn."
  - Links to resources

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Tone is compassionate throughout
- [ ] Steps are optional/skippable
- [ ] Archive is default (preserve data)
- [ ] Final message is supportive

---

# Phase 15: User Management (Local Mode)

## Master Style Block - Phase 17

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The admin is managing team members. The interface should feel like managing a small team.

LAYOUT:
- SIDEBAR VISIBLE on all screens
- Table/list views for users
- Modal forms for add/edit

ROLE BADGES:
- Admin: Gold badge
- Member: Sage badge

STATUS:
- Active: Sage dot
- Inactive: Gray dot

VIBE:
- Professional and secure
- NOT: Enterprise complexity
```

## Acceptance Criteria - Phase 15

- [ ] SIDEBAR VISIBLE on all screens
- [ ] Only visible in local auth mode
- [ ] Cannot delete self or last admin

---

### 15.1 Users List Page

**Function:** Manage tenant users.

**Layout:** SIDEBAR VISIBLE + User table

**User State:** Admin managing team access.

**Screen Elements:**
- Sidebar with "Settings" highlighted (Users section)
- "Team Members" heading
- "Invite User" button (Sea Buckthorn)
- User table:
  - Name
  - Email
  - Role badge (Admin/Member)
  - Status dot (Active/Inactive)
  - Last login
  - Actions (Edit, Delete)
- Search/filter capability

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Settings" active
- [ ] Role badges color-coded (Admin=gold, Member=sage)
- [ ] Status immediately visible
- [ ] Last login provides context
- [ ] Actions accessible per row

---

### 15.2 Invite User Modal

**Function:** Add new team member.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** Inviting colleague to collaborate.

**Screen Elements:**
- Modal with tabs: Temporary Password | Email Invite | Shareable Link
- "Invite Team Member" heading
- Tab 1 - Temporary Password:
  - Email field
  - Role selector (Admin/Member)
  - Generated password display (copy button)
- Tab 2 - Email Invite:
  - Email field
  - Role selector
  - Message preview
  - "Send Invite" button
- Tab 3 - Shareable Link:
  - Role selector
  - Generated URL with copy button
- Expiry note: "Invite expires in 7 days"

**Acceptance Criteria:**
- [ ] Modal overlays (sidebar visible)
- [ ] Methods clearly differentiated in tabs
- [ ] Temp password shown once only
- [ ] Link is copyable
- [ ] Role implications explained

---

### 15.3 Edit User Modal

**Function:** Modify user details.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** Updating team member.

**Screen Elements:**
- Modal with form
- "Edit [User Name]" heading
- Name field (editable)
- Email field (read-only, grayed)
- Role selector dropdown
- Active toggle switch
- "Reset Password" button (generates new temp)
- "Save" and "Cancel" buttons

**Acceptance Criteria:**
- [ ] Modal overlays (sidebar visible)
- [ ] Cannot demote self from admin
- [ ] Cannot deactivate last admin (warning shown)
- [ ] Reset password generates new temp
- [ ] Changes confirmed with toast

---

### 15.4 Profile Settings Page

**Function:** User manages own profile.

**Layout:** SIDEBAR VISIBLE + Form in main area

**User State:** Updating personal settings.

**Screen Elements:**
- Sidebar with "Settings" highlighted
- "Your Profile" heading
- Profile card:
  - Display name (editable)
  - Email (read-only)
- Change Password section (local mode only):
  - Current password field
  - New password field
  - Confirm new password field
  - Password requirements shown (checkmarks as met)
- "Save Changes" button (Sea Buckthorn)

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with "Settings" active
- [ ] Name editable
- [ ] Password change requires current password
- [ ] Requirements shown gently (not red)
- [ ] Success confirmation toast

---

# Phase 16: Super-Admin (SaaS Mode)

## Master Style Block - Phase 16

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The SaaS operator is managing multiple tenants. The interface should be efficient while maintaining warmth.

LAYOUT:
- SIDEBAR VISIBLE on all screens (super-admin nav)
- Data tables with good density
- Impersonation banner always visible when active

SUPER-ADMIN NAV:
- Additional items: Tenants, System Config
- Clearly marked as admin-only

VIBE:
- Professional operations
- Warm aesthetic maintained
```

## Acceptance Criteria - Phase 16

- [ ] SIDEBAR VISIBLE (with admin items)
- [ ] Only visible to super-admins
- [ ] Impersonation has clear indicator

---

### 16.1 Tenant List Page

**Function:** View all tenants.

**Layout:** SIDEBAR VISIBLE (admin nav) + Tenant table

**User State:** SaaS operator managing customers.

**Screen Elements:**
- Sidebar with "Tenants" highlighted (admin section)
- "Tenants" heading
- "Create Tenant" button (Sea Buckthorn)
- Tenant table:
  - Name
  - Plan badge
  - Status dot
  - Hives count
  - Users count
  - Created date
  - Actions (View, Impersonate, Suspend)
- Filters: Status, Plan
- Search by name

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with admin nav items
- [ ] Key metrics visible in table
- [ ] Status badges clear
- [ ] Actions per tenant
- [ ] Efficient pagination

---

### 16.2 Tenant Detail Page

**Function:** Full tenant information.

**Layout:** SIDEBAR VISIBLE + Detail sections

**User State:** Managing specific customer.

**Screen Elements:**
- Sidebar with "Tenants" highlighted
- Breadcrumb: Tenants > [Tenant Name]
- Tenant name as heading + status badge + plan
- Usage metrics card (vs limits):
  - Hives: 5 / 10
  - Storage: 2.4 GB / 5 GB
  - Units: 2 / 5
  - Users: 3 / 5
- Limits configuration (editable)
- User list section
- Activity feed section
- Action buttons: "Impersonate" (amber warning), "Suspend", "Delete"

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE
- [ ] Usage vs limits clear (progress bars)
- [ ] User list accessible
- [ ] Impersonate has warning confirmation
- [ ] Destructive actions confirmed

---

### 16.3 Impersonation Banner

**Function:** Indicate active impersonation.

**Layout:** Fixed banner at top (SIDEBAR visible, banner above content)

**User State:** Viewing tenant as support.

**Screen Elements:**
- Fixed banner below header
- Amber (#d4a574) background
- Warning icon + "Viewing as [Tenant Name]" text
- "Exit" button (right side, outlined)
- Timer showing session duration
- Note: "Actions are logged"

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE (normal tenant nav shown)
- [ ] Banner always visible during impersonation
- [ ] Cannot be dismissed
- [ ] Exit is one-click
- [ ] Session logged on exit

---

### 16.4 BeeBrain System Config

**Function:** Configure AI backend.

**Layout:** SIDEBAR VISIBLE (admin nav) + Config form

**User State:** Setting up system-wide AI.

**Screen Elements:**
- Sidebar with "System Config" highlighted
- "BeeBrain Configuration" heading
- Backend selector cards:
  - Rules Only (default, no AI)
  - Local Model (Ollama)
  - External API (OpenAI/Anthropic)
- Provider dropdown (for external): OpenAI, Anthropic, Ollama
- API Key field (masked input, show/hide toggle)
- "Test Connection" button
- Per-tenant access toggles (which tenants get AI)
- "Save Configuration" button

**Acceptance Criteria:**
- [ ] SIDEBAR VISIBLE with admin nav
- [ ] API key never shown in full after save
- [ ] Per-tenant toggles work
- [ ] Backend change confirmed
- [ ] Test connection shows success/failure

---

# Phase 17: Global Components - States

## Master Style Block - Phase 17

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
These are the global states that appear across all screens. They must maintain consistent warmth.

LOADING:
- Skeleton loaders in warm cream
- Gentle animation

EMPTY:
- Warm illustrations
- Encouraging copy
- Clear next action

ERROR:
- Calm, not scary
- Helpful recovery path

VIBE:
- Consistent and reliable
- Never jarring
```

## Acceptance Criteria - Phase 17

- [ ] States are consistent across all pages
- [ ] Animations are gentle
- [ ] Accessibility maintained

---

### 17.1 Loading State

**Function:** Feedback while content loads.

**Layout:** Component (within SIDEBAR pages)

**User State:** Waiting for data.

**Screen Elements:**
- Skeleton loaders matching expected content layout
- Warm cream (#fbf9e7) skeleton base
- Subtle shimmer animation (left to right)
- Or simple spinner with "Loading..." text

**Acceptance Criteria:**
- [ ] Skeleton matches expected content shape
- [ ] No jarring flash
- [ ] Gentle animation (not fast)
- [ ] Brief appearance (<300ms delay before showing)

---

### 17.2 Empty State

**Function:** No data to display.

**Layout:** Component (within SIDEBAR pages)

**User State:** New user or filtered to nothing.

**Screen Elements:**
- Warm illustration (bee-themed, friendly)
- Title explaining the empty state: "No hives yet"
- Helpful subtitle: "Add your first hive to get started"
- Action button if applicable: "Add Hive" (Sea Buckthorn)

**Acceptance Criteria:**
- [ ] Illustration is warm, not sad
- [ ] Copy is encouraging
- [ ] Clear action available
- [ ] Context-appropriate (different for each page)

---

### 17.3 Error State

**Function:** Something went wrong.

**Layout:** Component (within SIDEBAR pages)

**User State:** Frustrated or worried.

**Screen Elements:**
- Calm illustration (confused bee, not broken robot)
- Title: "Something didn't work"
- Helpful subtitle: "We couldn't load your hives. This might be temporary."
- "Try again" button (Sea Buckthorn)
- "Contact support" link (subtle)

**Acceptance Criteria:**
- [ ] No user blame
- [ ] Apologetic, calm tone
- [ ] Clear recovery path
- [ ] No technical jargon (no error codes unless requested)

---

# Phase 18: Global Components - Interactive

## Master Style Block - Phase 18

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
These are the interactive components used throughout the app. Consistency creates trust.

TOASTS:
- Brief feedback
- Auto-dismiss
- Consistent position (top right or bottom)

MODALS:
- Confirmation for destructive actions
- Clear action/cancel buttons

FORMS:
- Consistent field styling
- Helpful validation

VIBE:
- Consistent and trustworthy
- NOT: Jarring or unpredictable
```

## Acceptance Criteria - Phase 18

- [ ] Components are reusable
- [ ] Consistent across all uses
- [ ] 64px minimum touch targets

---

### 18.1 Toast Notification

**Function:** Feedback for completed actions.

**Layout:** Fixed position (top-right desktop, bottom mobile)

**User State:** Just did something.

**Screen Elements:**
- Slide-in animation (from edge)
- Icon + message text
- Success: Sage background, checkmark
- Error: Rose background, X icon
- Auto-dismiss (3-5 seconds)
- Close button (X, optional)

**Acceptance Criteria:**
- [ ] Success: Soft Sage (#7c9082)
- [ ] Error: Muted Rose (#c4857a)
- [ ] Not intrusive
- [ ] Consistent position
- [ ] Auto-dismiss with option to close early

---

### 18.2 Confirmation Modal

**Function:** Confirm important/destructive actions.

**Layout:** Modal overlay (SIDEBAR visible behind)

**User State:** About to do something significant.

**Screen Elements:**
- Modal with white background
- Clear title stating action: "Delete this hive?"
- Explanation of consequences: "This will remove all inspection history and cannot be undone."
- Cancel button (outlined)
- Confirm button (Sea Buckthorn for normal, Muted Rose for destructive)
- Close X in corner

**Acceptance Criteria:**
- [ ] Action clearly stated in title
- [ ] Consequences explained
- [ ] Cancel always available and prominent
- [ ] No trick questions
- [ ] Destructive confirm button in rose

---

### 18.3 Form Field Components

**Function:** Consistent input styling.

**Layout:** Component (within SIDEBAR pages)

**User State:** Entering information.

**Screen Elements:**
- Text input:
  - Label above (not floating)
  - 48-56px height
  - 12px border radius
  - Placeholder in light gray (60% opacity)
  - Focus: Sea Buckthorn border
  - Error: Muted Rose border + helper text below
- Helper text below field (subtle)
- Required indicator (*)

**Acceptance Criteria:**
- [ ] Labels above, not floating
- [ ] 48-56px height
- [ ] Focus state visible but gentle (Sea Buckthorn)
- [ ] Errors are helpful, not angry

---

### 18.4 Button Styles

**Function:** Consistent button hierarchy.

**Layout:** Component (throughout app)

**User State:** Taking actions.

**Screen Elements:**
- Primary: Sea Buckthorn fill, white text, pill shape (9999px radius)
- Secondary: Outlined, Brown Bramble border, transparent fill
- Tertiary: Text-only link style, Brown Bramble color
- Destructive: Muted Rose fill, white text
- Disabled: 50% opacity, no interaction

**Acceptance Criteria:**
- [ ] Primary is prominent (Sea Buckthorn)
- [ ] Secondary doesn't compete visually
- [ ] Consistent padding (16px horizontal, 12px vertical min)
- [ ] Hover states subtle (slight darken)
- [ ] 64px minimum height for mobile actions

---

# Quick Reference

## Phase Summary

| Phase | Name | Screens |
|-------|------|---------|
| 1 | Authentication (No Sidebar) | 4 |
| 2 | Navigation Components | 2 |
| 3 | Dashboard Home | 3 |
| 4 | Sites Management | 3 |
| 5 | Units Management | 5 |
| 6 | Detection Charts | 5 |
| 7 | Clip Archive | 4 |
| 8 | Hives List & Cards | 3 |
| 9 | Hive Detail & Inspection | 4 |
| 10 | Treatments & Feedings | 6 |
| 11 | Calendar & Labels | 2 |
| 12 | PWA & Offline | 5 |
| 13 | BeeBrain AI | 4 |
| 14 | Export, Milestones & Lifecycle | 5 |
| 15 | User Management (Local) | 4 |
| 16 | Super-Admin (SaaS) | 4 |
| 17 | Global Components - States | 3 |
| 18 | Global Components - Interactive | 4 |
| **Total** | | **70** |

## Sidebar Visibility Summary

| Screen Type | Sidebar Visible? |
|-------------|------------------|
| Login pages | NO |
| Setup Wizard | NO |
| All authenticated app pages | YES |
| Modal overlays | YES (behind modal) |
| Mobile pages | BOTTOM NAV instead |

## The Vibe Checklist

| Aspect | YES | NO |
|--------|-----|-----|
| Colors | Warm cream, honey gold, brown | Cold gray, neon, black |
| Feel | Trusted companion | Clinical system |
| Spacing | Generous, breathable | Cramped, dense |
| Language | "Deterred", "Protected" | "Detected", "Alert" |
| Status | "All quiet today!" | "0 detections" |
| Progress | Encouraging | Gamified |
| Errors | Helpful recovery | Blaming |
| Offline | Reliable sync | Broken feeling |
| Navigation | SIDEBAR always visible | Hidden/inconsistent |
| Overall | Boutique honey brand app | Industrial monitoring tool |

---

## Epics NOT Included (Hardware/Edge)

The following epics are not included in this UI mockup document as they are hardware/firmware focused:

- **Epic 10:** Edge Detection Software (C/Python firmware)
- **Epic 11:** Hardware Assembly Documentation (written docs, not UI)
- **Epic 12:** Edge Laser Deterrent Software (C/Python firmware)

These epics have no dashboard UI screens.
