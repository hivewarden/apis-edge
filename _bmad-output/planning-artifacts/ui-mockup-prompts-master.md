# APIS UI Mockup Prompts - Master Document

**Purpose:** Each phase is completely self-contained. Copy any single phase and you have everything needed to generate consistent mockups - no need to reference other sections.

**Total:** 12 Phases, 67 Screens (Epics 1-9, 13 - Dashboard & Portal screens only)

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
```

---

# Phase 1: Foundation & Layout

## Master Style Block - Phase 1

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The user is setting up their beekeeping protection system. The interface should feel welcoming, professional, and reassuring — like a trusted tool that will protect their hives.

COLOR PALETTE:
- Primary Background: Coconut Cream (#fbf9e7)
- Accent/CTAs: Sea Buckthorn (#f7a42d)
- Primary Text: Brown Bramble (#662604)
- Surface Color: Pure White (#ffffff)
- Secondary Surface: Salomie (#fcd483)
- Success: Soft Sage (#7c9082)
- Warning: Amber (#d4a574)
- Offline: Storm Gray (#6b7280)

TYPOGRAPHY:
- UI/Body: System Sans-serif (Inter/SF Pro) - 16px base, 18px mobile
- Headers: Semi-bold, Brown Bramble color
- Never use decorative fonts for UI elements

SPACING & SHAPE:
- Generous whitespace (24px minimum between sections)
- Rounded corners (8-12px cards, pill buttons)
- Subtle warm shadows (rgba(102, 38, 4, 0.05))
- Input fields: 48-56px height

VIBE:
- Professional yet warm
- Trustworthy and protective
- NOT: Clinical, cold, overwhelming
- NO: Aggressive tech aesthetics, dark modes
```

## Acceptance Criteria - Phase 1

Every screen in this phase must pass these checks:

- [ ] Uses exact color palette (Coconut Cream background, Brown Bramble text)
- [ ] Sea Buckthorn (#f7a42d) for primary CTAs only
- [ ] Minimum 24px spacing between major elements
- [ ] Cards have 8-12px border radius with subtle shadow
- [ ] Mobile-friendly (64px minimum touch targets)
- [ ] Typography hierarchy is clear (H1 > H2 > body)

---

### 1.1 Sidebar Navigation (Desktop)

**Function:** Primary navigation structure for the application.

**User State:** Authenticated user navigating between sections.

**Screen Elements:**
- APIS logo at top (bee + shield motif)
- Navigation items with icons: Dashboard, Sites, Units, Hives, Clips, Statistics, Maintenance, Settings
- User avatar and name at bottom
- Logout option
- Collapse/expand control

**Acceptance Criteria:**
- [ ] Logo is prominent but not overwhelming
- [ ] Active item highlighted with cream/gold pill background
- [ ] Icons are thin-stroke, minimalist style
- [ ] Collapsed state shows icons only
- [ ] User info visible at bottom

---

### 1.2 Mobile Bottom Navigation

**Function:** Primary navigation on mobile devices.

**User State:** Mobile user switching between main sections.

**Screen Elements:**
- 5 items maximum: Dashboard, Hives, Clips, Maintenance, More
- Icons with labels below
- Active state in Sea Buckthorn
- "More" opens drawer with additional options

**Acceptance Criteria:**
- [ ] 64px height minimum for glove-friendly tapping
- [ ] Icons with labels for clarity
- [ ] Active state clearly visible
- [ ] Safe area padding for notched phones
- [ ] Subtle shadow separator from content

---

### 1.3 Login Page (Local Mode)

**Function:** Secure entry point for standalone deployments.

**User State:** Returning user accessing their beekeeping data.

**Screen Elements:**
- APIS logo centered
- Welcome message: "Welcome back to APIS"
- Email field
- Password field with show/hide toggle
- "Remember me" checkbox
- "Sign In" button (Sea Buckthorn, pill shape)
- "Forgot password?" link

**Acceptance Criteria:**
- [ ] Form is centered with generous padding
- [ ] Input fields are 48-56px height
- [ ] Password toggle is accessible
- [ ] Primary button is prominent (Sea Buckthorn)
- [ ] No aggressive CAPTCHA on first attempt

---

### 1.4 Login Page (Zitadel/SSO Mode)

**Function:** SSO entry point for SaaS deployments.

**User State:** User authenticating via corporate SSO.

**Screen Elements:**
- APIS logo centered
- "Sign in to APIS" heading
- "Sign in with Zitadel" button (outlined style)
- Brief explanation of SSO flow
- Privacy and terms links at bottom

**Acceptance Criteria:**
- [ ] SSO button is prominent but not aggressive
- [ ] Clear explanation of redirect
- [ ] Logo and branding consistent
- [ ] Minimal distractions

---

### 1.5 Setup Wizard (First Run)

**Function:** Initial configuration for new standalone deployments.

**User State:** First-time setup, needs guidance.

**Screen Elements:**
- Step indicator (Step 1 of 2)
- "Welcome to APIS" heading
- Display name field
- Email field
- Password field with requirements shown
- Confirm password field
- "Continue" button

**Acceptance Criteria:**
- [ ] Progress indicator shows current step
- [ ] Password requirements displayed gently (not angry red)
- [ ] Large, accessible form fields
- [ ] Encouraging copy ("Let's get you set up")
- [ ] Clear progression to next step

---

### 1.6 Setup Wizard - Step 2 (Deployment)

**Function:** Configure deployment scenario with security guidance.

**User State:** Completing initial setup.

**Screen Elements:**
- Step indicator (Step 2 of 2)
- "How will you use APIS?" heading
- Three large choice cards:
  - "Just me" (laptop icon) — "Dashboard only, local access"
  - "Home network" (wifi icon) — "Access from devices on your network"
  - "Remote access" (globe icon) — "Access from anywhere"
- Security warning for remote option
- "Complete Setup" button

**Acceptance Criteria:**
- [ ] Choice cards are large and tappable
- [ ] Icons clearly communicate each option
- [ ] Security warning for remote access (amber, not scary)
- [ ] Can go back to previous step
- [ ] Completion feels celebratory

---

# Phase 2: Site & Unit Management

## Master Style Block - Phase 2

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is organizing their apiaries and protection units. The interface should help them feel in control of their equipment and confident in their monitoring coverage.

COLOR PALETTE:
- Primary Background: Coconut Cream (#fbf9e7)
- Accent/CTAs: Sea Buckthorn (#f7a42d)
- Primary Text: Brown Bramble (#662604)
- Surface Color: Pure White (#ffffff)
- Secondary Surface: Salomie (#fcd483)
- Status Online Armed: Soft Sage (#7c9082)
- Status Online Disarmed: Amber (#d4a574)
- Status Offline: Muted Rose (#c4857a)

TYPOGRAPHY:
- UI/Body: System Sans-serif - 16px base, 18px mobile
- Headers: Semi-bold, Brown Bramble color
- Status labels: Small caps, generous letter spacing

SPACING & SHAPE:
- Card grid: 2 columns mobile, 3-4 columns desktop
- Card padding: 16-24px internal
- Status indicators: 12px colored dots with labels

VIBE:
- Organized and capable
- Status at a glance
- NOT: Overwhelming data dumps, alarm-heavy
```

## Acceptance Criteria - Phase 2

- [ ] Status colors are consistent (green=armed, yellow=disarmed, red=offline)
- [ ] Cards show essential info at a glance
- [ ] Actions are discoverable but not intrusive
- [ ] GPS/location data displayed with map context
- [ ] Timestamps are human-readable ("2 minutes ago")

---

### 2.1 Sites List Page

**Function:** Overview of all apiaries.

**User State:** Managing multiple apiary locations.

**Screen Elements:**
- "Your Sites" heading with "Add Site" button
- Grid/list of site cards
- Each card: Name, mini-map thumbnail, unit count, hive count
- Empty state if no sites

**Acceptance Criteria:**
- [ ] Add button prominent (Sea Buckthorn)
- [ ] Cards show location context
- [ ] Click navigates to site detail
- [ ] Empty state is encouraging ("Add your first site")

---

### 2.2 Site Detail Page

**Function:** Full view of a single apiary.

**User State:** Viewing specific site's units and hives.

**Screen Elements:**
- Site name as heading
- GPS coordinates with "View on map" link
- Timezone display
- Units section with status cards
- Hives section preview
- Edit and Delete actions

**Acceptance Criteria:**
- [ ] Map shows site location
- [ ] Units grouped with status indicators
- [ ] Hives show quick summary
- [ ] Edit/delete accessible but not prominent

---

### 2.3 Add/Edit Site Form

**Function:** Create or modify a site.

**User State:** Configuring apiary details.

**Screen Elements:**
- "Add Site" or "Edit [Site Name]" heading
- Name field
- GPS Latitude field with format hint
- GPS Longitude field with format hint
- Timezone dropdown (defaults to Europe/Brussels)
- "Save" and "Cancel" buttons

**Acceptance Criteria:**
- [ ] GPS format examples provided
- [ ] Timezone defaults intelligently
- [ ] Validation messages are helpful
- [ ] Save button is primary action

---

### 2.4 Units List Page

**Function:** Overview of all APIS hardware units.

**User State:** Monitoring protection device status.

**Screen Elements:**
- "Your Units" heading with "Register Unit" button
- Grid of unit status cards
- Each card: Name, site, status dot+label, last seen time
- Filter by site dropdown

**Acceptance Criteria:**
- [ ] Status immediately visible (colored dot)
- [ ] Last seen time is human-readable
- [ ] Cards clickable for detail
- [ ] Filter helps with multiple units

---

### 2.5 Unit Status Card (Component)

**Function:** At-a-glance unit status.

**User State:** Quick status check.

**Screen Elements:**
- Unit name (bold)
- Site name (subtle)
- Status indicator:
  - Green dot + "Armed" = online and protecting
  - Yellow dot + "Disarmed" = online but laser off
  - Red dot + "Offline" = no heartbeat
- Last seen: "2 minutes ago" or "Offline since 10:30"
- Optional: live preview thumbnail

**Acceptance Criteria:**
- [ ] Status dot is 12px with label
- [ ] Time is relative, not absolute
- [ ] Card has hover state
- [ ] Click reveals more detail

---

### 2.6 Unit Detail Page

**Function:** Full unit information and controls.

**User State:** Managing specific unit.

**Screen Elements:**
- Unit name as heading
- Status card (large, prominent)
- "View Live Feed" button
- Configuration section: Assigned site, Covered hives
- System info: Firmware version, Uptime, Storage free
- API Key section (regenerate option)
- Arm/Disarm toggle

**Acceptance Criteria:**
- [ ] Live feed button prominent
- [ ] API key shown with "Regenerate" warning
- [ ] Arm/Disarm toggle is clearly visible
- [ ] Firmware version helps with troubleshooting

---

### 2.7 Register Unit Modal

**Function:** Add new APIS hardware unit.

**User State:** Setting up new protection device.

**Screen Elements:**
- "Register New Unit" heading
- Unit name field
- Assigned site dropdown
- Covered hives multi-select (optional)
- "Register" button
- On success: API key display with copy button and warning

**Acceptance Criteria:**
- [ ] API key shown ONCE with strong warning
- [ ] Copy to clipboard works
- [ ] Key masked after modal closes
- [ ] Instructions for entering key on device

---

### 2.8 Live Video Stream Modal

**Function:** Real-time view from unit camera.

**User State:** Checking what unit sees.

**Screen Elements:**
- Unit name as title
- Video player (MJPEG stream)
- Status indicators: Connected, Latency
- Close button
- Optional: detection overlay toggle

**Acceptance Criteria:**
- [ ] Video fills modal appropriately
- [ ] Connection status visible
- [ ] Graceful handling if offline
- [ ] Close button accessible

---

# Phase 3: Detection Dashboard

## Master Style Block - Phase 3

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is checking on hornet activity. The interface should feel protective and informative — celebrating when quiet, alerting when busy, always reassuring that the system is working.

COLOR PALETTE:
- Primary Background: Coconut Cream (#fbf9e7)
- Accent/CTAs: Sea Buckthorn (#f7a42d)
- Primary Text: Brown Bramble (#662604)
- Chart Fill: Sea Buckthorn gradient (transparent to #f7a42d)
- Chart Line: Sea Buckthorn (#f7a42d)
- Quiet State: Soft Sage (#7c9082)

TYPOGRAPHY:
- Large numbers: 48-64px for detection counts
- Chart labels: 12px, Brown Bramble at 60% opacity
- Insight text: 16px, conversational tone

DATA VISUALIZATION:
- Smooth spline curves, not jagged lines
- Filled area charts with gradient
- 24-hour clock uses polar/radar layout
- Scatter plots use soft, round points

VIBE:
- Protective and informative
- Celebrates quiet days
- Frames detections as "deterred" not just "detected"
- NOT: Alarming, clinical, boring data tables
```

## Acceptance Criteria - Phase 3

- [ ] Zero detections feels positive ("All quiet today!")
- [ ] Charts use Sea Buckthorn color palette
- [ ] Time range selector updates all charts simultaneously
- [ ] Data is framed as learning/insights not just numbers
- [ ] Weather provides context for activity

---

### 3.1 Dashboard Home

**Function:** Central overview of protection status.

**User State:** Daily check-in on apiary status.

**Screen Elements:**
- Welcome message with user name
- Site selector dropdown (if multiple)
- "Today's Activity" card (large)
- Weather card
- Unit status summary
- BeeBrain insights card
- Quick links to other sections

**Acceptance Criteria:**
- [ ] Most important info above the fold
- [ ] Warm, welcoming tone
- [ ] BeeBrain insights draw attention if urgent
- [ ] Clear navigation to detailed views

---

### 3.2 Today's Detection Count Card

**Function:** Primary activity indicator.

**User State:** Wanting quick status check.

**Screen Elements:**
- Large detection count number (48-64px)
- Friendly text: "5 hornets deterred today" or "All quiet today!"
- Subtext: "Last detection: 2 hours ago"
- Laser success rate: "10 of 12 deterred with laser"
- Checkmark icon for quiet days

**Acceptance Criteria:**
- [ ] Count is the dominant element
- [ ] "Deterred" not "detected" (protective framing)
- [ ] Zero state is positive, not empty
- [ ] Last detection gives temporal context

---

### 3.3 Weather Card

**Function:** Environmental context for activity.

**User State:** Correlating weather with hornet behavior.

**Screen Elements:**
- Current temperature (large)
- Weather condition icon (sun, cloud, rain)
- "Feels like" temperature
- Humidity percentage
- Site name for multi-site users
- "Last updated" timestamp

**Acceptance Criteria:**
- [ ] Weather icon is warm, not clinical
- [ ] Temperature is prominent
- [ ] Stale data clearly indicated
- [ ] Error state is graceful ("Weather unavailable")

---

### 3.4 Time Range Selector

**Function:** Control data timeframe across all charts.

**User State:** Exploring patterns over different periods.

**Screen Elements:**
- Segmented control: Day | Week | Month | Season | Year | All Time
- Date picker for specific day selection (when Day selected)
- URL reflects selection

**Acceptance Criteria:**
- [ ] Sea Buckthorn highlight on selected segment
- [ ] Changes affect ALL charts on page
- [ ] Brief loading state during update
- [ ] Season = Aug 1 - Nov 30 (configurable)

---

### 3.5 Activity Clock (24-Hour Polar Chart)

**Function:** Show daily activity patterns.

**User State:** Understanding when hornets are most active.

**Screen Elements:**
- Circular chart shaped like a clock
- 24 spokes (hours 0-23)
- Radius = detection count per hour
- Clock labels at 00, 06, 12, 18 positions
- Tooltip on hover: "14:00 - 15:00: 8 detections (23%)"
- Title: "Activity by Hour"

**Acceptance Criteria:**
- [ ] Looks like a clock (familiar orientation)
- [ ] Peak hours bulge outward
- [ ] Night hours visually minimal
- [ ] Hover reveals exact counts

---

### 3.6 Temperature Correlation Chart

**Function:** Show temperature vs activity relationship.

**User State:** Predicting high-activity days.

**Screen Elements:**
- Scatter plot
- X-axis: Temperature (°C)
- Y-axis: Detection count
- Each dot = one day's data
- Optional trend line
- Tooltip: "Oct 15: 22°C, 14 detections"
- Insight text below: "Hornets prefer 18-22°C at your location"

**Acceptance Criteria:**
- [ ] Points are soft, round, Sea Buckthorn
- [ ] Trend line helps identify pattern
- [ ] Insight summarizes the learning
- [ ] Click on point navigates to that day

---

### 3.7 Trend Line Chart

**Function:** Show activity over time.

**User State:** Tracking if hornet pressure is changing.

**Screen Elements:**
- Area chart with smooth spline curve
- X-axis: Time (days/weeks based on range)
- Y-axis: Detection count
- Sea Buckthorn gradient fill
- Optional comparison line (previous period)
- Tooltip: "Oct 15: 14 detections"

**Acceptance Criteria:**
- [ ] Smooth curves, not jagged
- [ ] Gradient fill creates warmth
- [ ] Comparison line is subtle/dashed
- [ ] Responsive data density on mobile

---

# Phase 4: Clip Archive

## Master Style Block - Phase 4

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is reviewing recorded incidents. The interface should feel like a well-organized archive — easy to browse, quick to play, helpful for understanding what the system saw.

COLOR PALETTE:
- Primary Background: Coconut Cream (#fbf9e7)
- Thumbnail Border: Salomie (#fcd483)
- Play Button: Sea Buckthorn (#f7a42d)
- Metadata Text: Brown Bramble at 70% opacity

MEDIA PRESENTATION:
- Thumbnails: 16:9 aspect ratio, rounded corners
- Video player: Native controls, dark background for focus
- Grid layout: 2 columns mobile, 3-4 columns desktop

VIBE:
- Organized and scannable
- Easy to find specific incidents
- NOT: Overwhelming, surveillance-heavy
```

## Acceptance Criteria - Phase 4

- [ ] Thumbnails load quickly (lazy load)
- [ ] Filters are easy to use
- [ ] Video plays smoothly in modal
- [ ] Metadata provides context (date, unit, confidence)

---

### 4.1 Clips List Page

**Function:** Browse all detection clips.

**User State:** Finding specific incidents.

**Screen Elements:**
- "Detection Clips" heading
- Filter controls: Date range, Unit, Site
- Result count: "Showing 24 clips"
- Grid of clip thumbnail cards
- Pagination or infinite scroll

**Acceptance Criteria:**
- [ ] Filters are collapsible on mobile
- [ ] Clear filters button when filters applied
- [ ] Empty state if no matches
- [ ] Newest clips first by default

---

### 4.2 Clip Thumbnail Card

**Function:** Individual clip preview.

**User State:** Scanning clips to find relevant one.

**Screen Elements:**
- Thumbnail image (320x240 aspect)
- Play icon overlay (center)
- Date/time: "Jan 22, 14:30"
- Unit name
- Duration badge: "0:04"

**Acceptance Criteria:**
- [ ] Play icon visible on hover/always
- [ ] Date is human-readable
- [ ] Card clickable to open modal
- [ ] Lazy loading for performance

---

### 4.3 Clip Player Modal

**Function:** Full video playback.

**User State:** Reviewing specific detection.

**Screen Elements:**
- Video player with native controls
- Plays automatically on open
- Detection metadata below:
  - "Detected: Jan 22, 2026 at 14:30:22"
  - "Unit: Hive 1 Protector"
  - "Confidence: 85%"
  - "Laser activated: Yes"
- Previous/Next navigation arrows
- Delete button (with confirmation)
- Close button (X or click outside)

**Acceptance Criteria:**
- [ ] Video autoplays
- [ ] Keyboard navigation works (arrow keys, Escape)
- [ ] Delete has confirmation dialog
- [ ] Metadata provides full context

---

### 4.4 Nest Radius Estimator

**Function:** Estimate nest location from timing data.

**User State:** Trying to locate hornet nest.

**Screen Elements:**
- Map centered on site location
- Hive marker (bee icon)
- Estimated radius circle
- Text: "Nest likely within 350m based on 42 observations"
- Confidence indicator: Low/Medium/High
- "Report Nest Location" button
- Progress indicator if insufficient data

**Acceptance Criteria:**
- [ ] Map uses OpenStreetMap (warm style if possible)
- [ ] Radius circle is semi-transparent
- [ ] Confidence explained clearly
- [ ] Report button links to local authorities info

---

# Phase 5: Hive Management

## Master Style Block - Phase 5

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is managing their hives and recording inspections. The interface should feel like a trusted field companion — quick to use, easy to read, works with gloves on.

COLOR PALETTE:
- Primary Background: Coconut Cream (#fbf9e7)
- Hive Cards: Pure White (#ffffff)
- Status Healthy: Soft Sage (#7c9082)
- Status Attention: Amber (#d4a574)
- Brood Color: #8B4513 (saddle brown)
- Honey Color: #f7a42d (sea buckthorn)
- Pollen Color: #FFA500 (orange)

MOBILE-FIRST DESIGN:
- 64px minimum touch targets
- Swipe navigation between inspection cards
- Bottom-anchored action buttons
- Voice input prominent
- 18px minimum body text

VIBE:
- Field-ready and practical
- Quick entry, less typing
- NOT: Desktop-first, complex forms
```

## Acceptance Criteria - Phase 5

- [ ] All interactive elements are 64px minimum height
- [ ] Swipe gestures work on mobile
- [ ] Voice input button is prominent
- [ ] Form auto-saves progress
- [ ] Works offline with sync indicator

---

### 5.1 Hives List Page

**Function:** Overview of all hives at a site.

**User State:** Planning inspection route.

**Screen Elements:**
- "Hives at [Site Name]" heading
- "Add Hive" button
- Grid/list of hive cards
- Each card: Name, Queen age, Box config, Last inspection, Status badge
- Sort options: Name, Last Inspection, Status

**Acceptance Criteria:**
- [ ] Status badges clearly visible
- [ ] "Needs inspection" badge if >14 days
- [ ] Queen age calculated automatically
- [ ] Cards lead to hive detail

---

### 5.2 Hive Card (Component)

**Function:** Hive summary at a glance.

**User State:** Quick status assessment.

**Screen Elements:**
- Hive name/number (bold)
- Queen: "2 years old"
- Config: "2 brood + 1 super"
- Last inspection: "5 days ago"
- Status badge: "Healthy" (sage), "Needs Inspection" (amber), "Issues Noted" (rose)

**Acceptance Criteria:**
- [ ] Status immediately visible
- [ ] Essential info without overwhelming
- [ ] Click navigates to detail
- [ ] Compact on mobile

---

### 5.3 Hive Detail Page

**Function:** Complete hive information hub.

**User State:** Managing specific hive.

**Screen Elements:**
- Hive name as heading
- Configuration summary (boxes, queen)
- Box visualization (stacked rectangles)
- "New Inspection" button (prominent, Sea Buckthorn)
- Recent inspection summary
- BeeBrain analysis section
- Tabs: Inspections, Treatments, Feedings, Equipment

**Acceptance Criteria:**
- [ ] New Inspection is primary action
- [ ] Box visualization shows current setup
- [ ] Queen info includes age calculation
- [ ] BeeBrain provides insights

---

### 5.4 Quick-Entry Inspection (Mobile Swipe Flow)

**Function:** Record inspection with gloves on.

**User State:** In the field, hive open.

**Screen Elements:**
- Progress dots at top (5-6 cards)
- Swipe left/right to navigate
- Card 1 - Queen: Three 64px toggles (Queen seen, Eggs seen, Queen cells)
- Card 2 - Brood: Stepper for frames, Pattern quality buttons
- Card 3 - Stores: Honey level segment, Pollen level segment
- Card 4 - Issues: Large checkboxes (DWV, Chalkbrood, Wax moth, Robbing, Other)
- Card 5 - Notes: Large textarea + "SPEAK" voice button
- Card 6 - Review: Summary + 64px "SAVE" button

**Acceptance Criteria:**
- [ ] All inputs 64px minimum height
- [ ] Swipe navigation smooth
- [ ] Voice button prominent on notes
- [ ] Auto-save draft locally
- [ ] Offline capable

---

### 5.5 Inspection History View

**Function:** Review past inspections.

**User State:** Tracking hive progress over time.

**Screen Elements:**
- Chronological list (newest first)
- Each entry: Date, Key findings summary, Issues flagged
- Click to expand full detail
- Compare button for 2 inspections
- Export option (CSV)

**Acceptance Criteria:**
- [ ] Key findings scannable
- [ ] Issues highlighted
- [ ] Comparison shows changes
- [ ] Edit within 24 hours

---

### 5.6 Frame Development Chart

**Function:** Visualize frame progression over season.

**User State:** Understanding hive development.

**Screen Elements:**
- Stacked area chart
- X-axis: Inspection dates
- Y-axis: Frame count
- Layers: Brood (brown), Honey (gold), Pollen (orange)
- Tooltip: "Jun 15: 6 brood, 4 honey, 2 pollen"
- Year-over-year comparison toggle

**Acceptance Criteria:**
- [ ] Colors match brood/honey/pollen meanings
- [ ] Smooth curves
- [ ] Comparison is optional
- [ ] Works with minimal data

---

# Phase 6: Treatments, Feedings & Harvests

## Master Style Block - Phase 6

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is logging care activities. The interface should feel like a personal logbook — easy to record, helpful for tracking patterns, celebrates harvests.

COLOR PALETTE:
- Treatment Cards: Soft blue accent border
- Feeding Cards: Amber accent border
- Harvest Cards: Gold accent border
- Calendar Events: Color-coded by type

FORMS:
- Multi-select for applying to multiple hives
- Date defaults to today
- Dropdowns for common options
- Custom option always available

VIBE:
- Organized and trackable
- Celebrates first harvest specially
- NOT: Clinical record-keeping
```

## Acceptance Criteria - Phase 6

- [ ] Multi-hive selection works intuitively
- [ ] Date defaults to today
- [ ] Custom options accessible
- [ ] History views show efficacy/totals
- [ ] Calendar provides timeline view

---

### 6.1 Treatment Log Form

**Function:** Record varroa treatment.

**User State:** Documenting treatment for records.

**Screen Elements:**
- "Log Treatment" heading
- Date picker (default: today)
- Hive multi-select
- Treatment type dropdown (Oxalic, Formic, Apivar, etc.)
- Method dropdown (Vaporization, Dribble, Strips)
- Dose/Amount field
- Mite count before (optional)
- Weather conditions (optional)
- Notes textarea
- "Save Treatment" button

**Acceptance Criteria:**
- [ ] Multi-hive selection works
- [ ] Built-in types + custom option
- [ ] Mite count enables efficacy tracking
- [ ] Confirmation on save

---

### 6.2 Treatment History View

**Function:** Review treatment records and efficacy.

**User State:** Tracking treatment schedule and results.

**Screen Elements:**
- Chronological list (newest first)
- Each entry: Date, Type, Method, Hives, Mite counts
- Efficacy badge if before/after counts exist: "87% reduction"
- "Add follow-up count" button
- Filter by hive, type, date range

**Acceptance Criteria:**
- [ ] Efficacy calculated automatically
- [ ] Follow-up counts linked to treatment
- [ ] Filtering helps find specific records
- [ ] Next treatment due indicator

---

### 6.3 Feeding Log Form

**Function:** Record feeding activity.

**User State:** Documenting feed to track consumption.

**Screen Elements:**
- "Log Feeding" heading
- Date picker
- Hive multi-select
- Feed type dropdown (Syrup, Fondant, Pollen patty, etc.)
- Amount field + unit selector (kg/liters)
- Concentration field (for syrup: 1:1, 2:1, custom)
- Notes textarea
- "Save Feeding" button

**Acceptance Criteria:**
- [ ] Concentration shown for syrup only
- [ ] Units appropriate for feed type
- [ ] Season totals calculated
- [ ] Links to weight chart if available

---

### 6.4 Harvest Log Form

**Function:** Record honey harvest.

**User State:** Celebrating and documenting harvest.

**Screen Elements:**
- "Log Harvest" heading
- Date picker
- Hive multi-select
- Frames harvested
- Total amount (kg)
- Per-hive split option
- Quality notes (color, taste, source)
- Photo upload
- "Save Harvest" button

**Acceptance Criteria:**
- [ ] Per-hive split or even distribution
- [ ] Photo encouraged
- [ ] Season totals shown
- [ ] First harvest triggers celebration

---

### 6.5 Treatment Calendar

**Function:** Visual timeline of treatments and reminders.

**User State:** Planning treatment schedule.

**Screen Elements:**
- Monthly calendar view
- Color-coded events by type
- Past treatments: checkmark
- Upcoming due: highlight
- Click on date for detail
- "Add Reminder" button

**Acceptance Criteria:**
- [ ] Treatments visible on calendar
- [ ] Due treatments highlighted
- [ ] Click reveals detail
- [ ] Can add custom reminders

---

### 6.6 Custom Labels Management

**Function:** Create personalized categories.

**User State:** Customizing for their practice.

**Screen Elements:**
- "Custom Labels" heading in Settings
- Tabs: Feed Types, Treatment Types, Equipment Types, Issue Types
- List of built-in (non-deletable) + custom labels
- "Add" button per category
- Edit/Delete for custom labels

**Acceptance Criteria:**
- [ ] Built-in labels marked as such
- [ ] Custom labels appear in dropdowns
- [ ] Delete warns if in use
- [ ] Rename updates historical records

---

# Phase 7: PWA & Offline Mode

## Master Style Block - Phase 7

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is in the field with limited connectivity. The interface should work reliably offline, sync transparently, and never lose their data.

OFFLINE INDICATORS:
- Offline banner: Storm Gray (#6b7280) background
- Pending sync badge: Amber
- Synced indicator: Soft Sage checkmark

MOBILE-FIRST:
- Touch targets 64px
- Voice input prominent
- QR scanner for hive navigation
- Swipe gestures

VIBE:
- Reliable companion
- Transparent sync status
- NEVER loses data
- NOT: Broken-feeling when offline
```

## Acceptance Criteria - Phase 7

- [ ] App loads from cache when offline
- [ ] Offline banner clearly visible
- [ ] Pending sync count shown
- [ ] Sync happens automatically when online
- [ ] Data conflicts handled gracefully

---

### 7.1 Offline Banner

**Function:** Indicate offline status.

**User State:** Working without connectivity.

**Screen Elements:**
- Fixed banner at top (below header)
- Storm gray background
- "Offline — 3 inspections pending sync"
- Cloud icon with offline indicator

**Acceptance Criteria:**
- [ ] Always visible when offline
- [ ] Shows pending count
- [ ] Disappears when online
- [ ] Brief "Synced!" confirmation

---

### 7.2 Sync Status Indicator

**Function:** Show sync progress.

**User State:** Returning online, watching sync.

**Screen Elements:**
- Animated sync icon when syncing
- Progress: "Syncing 2 of 5..."
- Success: "All synced" with checkmark
- Error: "1 item failed — tap to resolve"

**Acceptance Criteria:**
- [ ] Animation indicates activity
- [ ] Progress is specific
- [ ] Errors actionable
- [ ] Auto-dismiss success

---

### 7.3 Voice Input Button (Component)

**Function:** Speech-to-text for notes.

**User State:** Dictating with gloves on.

**Screen Elements:**
- Large microphone button: "SPEAK"
- 64px height, pill shape
- Sea Buckthorn color
- Animated when recording
- Transcription appears in text field

**Acceptance Criteria:**
- [ ] 64px minimum for gloves
- [ ] Visual feedback when listening
- [ ] Transcription editable
- [ ] Works with browser API

---

### 7.4 QR Scanner Modal

**Function:** Scan hive QR for quick navigation.

**User State:** In large apiary, finding specific hive.

**Screen Elements:**
- Camera viewfinder
- "Point at hive QR code" instruction
- Viewfinder frame guides
- Close button
- Flash toggle if available

**Acceptance Criteria:**
- [ ] Camera opens promptly
- [ ] Recognizes APIS QR codes
- [ ] Navigates to hive on scan
- [ ] Invalid code shows error

---

### 7.5 QR Code Generator (Settings)

**Function:** Generate printable QR codes for hives.

**User State:** Setting up hive labels.

**Screen Elements:**
- "Generate QR Code" in hive settings
- QR code display with hive name
- "Print" button
- "Download" button
- Multi-hive print layout option

**Acceptance Criteria:**
- [ ] QR includes hive ID
- [ ] Print layout is clean
- [ ] Human-readable name below code
- [ ] Multiple codes per page option

---

# Phase 8: BeeBrain AI Insights

## Master Style Block - Phase 8

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper receives AI-powered insights. The interface should feel like advice from an experienced mentor — helpful, not alarming, actionable when needed.

INSIGHT CARDS:
- Info: Soft blue border
- Warning: Amber border
- Action Needed: Rose border with stronger presence

BEEBRAIN BRANDING:
- Brain/bee icon
- "BeeBrain Analysis" label
- Timestamp and refresh button

VIBE:
- Wise and helpful
- Never scary or overwhelming
- Actionable recommendations
- NOT: Alarm-heavy, robot-like
```

## Acceptance Criteria - Phase 8

- [ ] Insights are human-readable, not technical
- [ ] Severity is clear (info < warning < action)
- [ ] Actions are one-click accessible
- [ ] Dismiss/snooze options available
- [ ] Empty state is positive

---

### 8.1 Dashboard BeeBrain Card

**Function:** Daily AI summary on dashboard.

**User State:** Getting quick status overview.

**Screen Elements:**
- "BeeBrain Analysis" heading with brain icon
- "Last updated: 2 hours ago [Refresh]" timestamp
- Summary text: "All quiet at [Site]. Your 3 hives are doing well."
- Or prioritized concerns list
- "View all insights" link

**Acceptance Criteria:**
- [ ] Brain icon is friendly
- [ ] Refresh triggers new analysis
- [ ] Concerns prioritized by severity
- [ ] Links to relevant actions

---

### 8.2 Hive BeeBrain Section

**Function:** Hive-specific AI analysis.

**User State:** Understanding specific hive.

**Screen Elements:**
- "BeeBrain Analysis for [Hive]" heading
- Current health assessment
- Specific recommendations with data
- "Tell me more" expandable details
- "Dismiss" option

**Acceptance Criteria:**
- [ ] Analysis specific to this hive
- [ ] Data points explained
- [ ] Actions linked
- [ ] Can dismiss if not applicable

---

### 8.3 Proactive Insight Notification

**Function:** Surface important insights proactively.

**User State:** Opening app, insight waiting.

**Screen Elements:**
- Prominent card in notification area
- Severity indicator (color border)
- Insight message
- Action buttons: [Dismiss] [Snooze] [Take Action]
- Snooze options: 1 day, 7 days, 30 days

**Acceptance Criteria:**
- [ ] Appears prominently
- [ ] Can dismiss permanently
- [ ] Snooze respects duration
- [ ] Action navigates to relevant page

---

### 8.4 Maintenance Priority List

**Function:** Ranked list of hives needing attention.

**User State:** Planning apiary work.

**Screen Elements:**
- "Maintenance Needed" heading
- List sorted by priority
- Each item: Hive name, Priority badge, Summary, Quick action
- Priority indicators: Red (Urgent), Amber (Soon), Sage (Optional)
- Empty state: "All caught up!"

**Acceptance Criteria:**
- [ ] Highest priority first
- [ ] Quick actions accessible
- [ ] Batch actions for multiple hives
- [ ] Empty state celebrates completion

---

# Phase 9: Export & Milestones

## Master Style Block - Phase 9

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The beekeeper is exporting data or experiencing milestones. Export should feel empowering. Milestones should feel celebratory and meaningful.

EXPORT:
- Clean preview
- Copy to clipboard easy
- Multiple format options

CELEBRATIONS:
- Confetti or bee animation
- Warm, encouraging copy
- Photo prompts for memories

ACKNOWLEDGMENTS:
- Losses handled with empathy
- Post-mortem guides learning
- Season recaps celebrate journey

VIBE:
- Empowering and celebratory
- Acknowledges both joys and losses
- NOT: Cold data dumps, insensitive
```

## Acceptance Criteria - Phase 9

- [ ] Export preview shows actual output
- [ ] Copy to clipboard works reliably
- [ ] First harvest feels special
- [ ] Loss post-mortem is compassionate
- [ ] Season recap is shareable

---

### 9.1 Export Configuration Page

**Function:** Configure and generate data export.

**User State:** Wanting to share or backup data.

**Screen Elements:**
- "Export Data" heading
- Hive selector (dropdown or "All hives")
- What to include (checkboxes by category):
  - BASICS: Name, Queen, Boxes, Weight
  - DETAILS: Inspections, Hornet data, Weight history
  - ANALYSIS: BeeBrain insights, Health summary
- Format selector: Quick Summary | Detailed Markdown | Full JSON
- "Preview" button
- "Copy to Clipboard" button

**Acceptance Criteria:**
- [ ] Preview shows actual output
- [ ] Categories are logical groupings
- [ ] Copy shows confirmation
- [ ] Formats clearly differentiated

---

### 9.2 First Harvest Celebration Modal

**Function:** Celebrate first harvest milestone.

**User State:** Just logged first harvest.

**Screen Elements:**
- Confetti animation or bee celebration
- "Congratulations on your first harvest!"
- Harvest details prominently displayed
- "Add a photo to remember this moment" prompt
- "Thanks!" dismiss button

**Acceptance Criteria:**
- [ ] Animation is joyful not overwhelming
- [ ] One-time event
- [ ] Photo prompt encouraged
- [ ] Dismisses gracefully

---

### 9.3 Hive Loss Post-Mortem Wizard

**Function:** Guide through documenting hive loss.

**User State:** Grieving, needs compassionate guidance.

**Screen Elements:**
- Empathetic intro: "We're sorry about your loss. Recording what happened can help in the future."
- Step 1: When discovered (date)
- Step 2: Suspected cause (dropdown: Starvation, Varroa, Queen failure, etc.)
- Step 3: What observed (symptoms checklist + notes)
- Step 4: Reflections (optional)
- Step 5: Archive vs delete decision
- Completion message: "Your records have been saved."

**Acceptance Criteria:**
- [ ] Tone is compassionate throughout
- [ ] Steps are optional/skippable
- [ ] Archive is default (preserve data)
- [ ] Final message is supportive

---

### 9.4 Season Recap Card

**Function:** End-of-season summary.

**User State:** Reflecting on season achievements.

**Screen Elements:**
- "2026 Season Recap" heading
- Key metrics: Total harvest, Hornets deterred, Inspections, Milestones
- Per-hive breakdown
- "Share" button with format options
- "View Past Seasons" link

**Acceptance Criteria:**
- [ ] Metrics feel celebratory
- [ ] Share generates nice image/text
- [ ] Comparison to previous years
- [ ] Downloadable as PDF

---

### 9.5 Overwintering Survey

**Function:** Spring check-in on survival.

**User State:** Checking which hives made it through winter.

**Screen Elements:**
- "Did all your hives survive winter?" prompt
- List of hives with status options: Survived, Lost, Weak
- For survived: Condition notes
- For lost: Link to post-mortem
- Completion shows survival rate

**Acceptance Criteria:**
- [ ] Prompt appears in spring
- [ ] Easy status selection
- [ ] 100% survival is celebrated
- [ ] Losses link to documentation

---

# Phase 10: User Management (Local Mode)

## Master Style Block - Phase 10

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The admin is managing team members. The interface should feel like managing a small team — straightforward, secure, with clear roles.

USER MANAGEMENT:
- Clean table/list view
- Role badges: Admin (gold), Member (sage)
- Status: Active (sage), Inactive (gray)
- Invite methods clearly explained

SECURITY:
- Password requirements shown gently
- API key warnings prominent
- Role changes confirmed

VIBE:
- Professional and secure
- Not bureaucratic
- NOT: Enterprise complexity
```

## Acceptance Criteria - Phase 10

- [ ] Only visible in local auth mode
- [ ] Roles clearly explained
- [ ] Invite methods well-documented
- [ ] Cannot delete self or last admin
- [ ] Security warnings are clear

---

### 10.1 Users List Page

**Function:** Manage tenant users.

**User State:** Admin managing team access.

**Screen Elements:**
- "Team Members" heading
- "Invite User" button (Sea Buckthorn)
- User table: Name, Email, Role badge, Status, Last login, Actions
- Search/filter capability

**Acceptance Criteria:**
- [ ] Role badges color-coded
- [ ] Status immediately visible
- [ ] Last login provides context
- [ ] Actions accessible per row

---

### 10.2 Invite User Modal

**Function:** Add new team member.

**User State:** Inviting colleague to collaborate.

**Screen Elements:**
- "Invite Team Member" heading
- Invite method tabs: Temporary Password | Email Invite | Shareable Link
- Email field
- Role selector: Admin | Member
- For temp password: Generated password display
- For email: Message preview
- For link: Generated URL with copy button
- Expiry note: "Invite expires in 7 days"

**Acceptance Criteria:**
- [ ] Methods clearly differentiated
- [ ] Temp password shown once
- [ ] Link is copyable
- [ ] Role implications explained

---

### 10.3 Edit User Modal

**Function:** Modify user details.

**User State:** Updating team member.

**Screen Elements:**
- "Edit [User Name]" heading
- Name field (editable)
- Email field (read-only)
- Role selector
- Active toggle
- "Reset Password" button
- "Save" and "Cancel" buttons

**Acceptance Criteria:**
- [ ] Cannot demote self from admin
- [ ] Cannot deactivate last admin
- [ ] Reset password generates new temp
- [ ] Changes confirmed

---

### 10.4 Profile Settings Page

**Function:** User manages own profile.

**User State:** Updating personal settings.

**Screen Elements:**
- "Your Profile" heading
- Display name (editable)
- Email (read-only)
- Change Password section (local mode only):
  - Current password field
  - New password field
  - Confirm new password field
  - Password requirements shown
- "Save Changes" button

**Acceptance Criteria:**
- [ ] Name editable
- [ ] Password change requires current password
- [ ] Requirements shown gently
- [ ] Success confirmation

---

# Phase 11: Super-Admin (SaaS Mode)

## Master Style Block - Phase 11

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

EMOTIONAL CONTEXT:
The SaaS operator is managing multiple tenants. The interface should be efficient for operations while maintaining the warm APIS aesthetic.

ADMIN VIEWS:
- Data tables with good density
- Status badges per tenant
- Usage metrics clear

IMPERSONATION:
- Warning banner always visible
- Clear exit path
- Session logged

VIBE:
- Professional operations
- Warm aesthetic maintained
- NOT: Cold enterprise admin
```

## Acceptance Criteria - Phase 11

- [ ] Only visible to super-admins
- [ ] Tenant data clearly organized
- [ ] Impersonation has clear indicator
- [ ] Limits enforcement is transparent

---

### 11.1 Tenant List Page

**Function:** View all tenants.

**User State:** SaaS operator managing customers.

**Screen Elements:**
- "Tenants" heading
- "Create Tenant" button
- Tenant table: Name, Plan, Status, Hives, Users, Created, Actions
- Filters: Status, Plan
- Search by name

**Acceptance Criteria:**
- [ ] Key metrics visible
- [ ] Status badges clear
- [ ] Actions per tenant
- [ ] Efficient pagination

---

### 11.2 Tenant Detail Page

**Function:** Full tenant information.

**User State:** Managing specific customer.

**Screen Elements:**
- Tenant name as heading
- Status badge and plan
- Usage metrics (hives, storage, units, users)
- Limits configuration
- User list
- Activity feed
- "Impersonate" button
- "Suspend" / "Delete" actions

**Acceptance Criteria:**
- [ ] Usage vs limits clear
- [ ] User list accessible
- [ ] Impersonate has warning
- [ ] Destructive actions confirmed

---

### 11.3 Impersonation Banner

**Function:** Indicate active impersonation.

**User State:** Viewing tenant as support.

**Screen Elements:**
- Fixed banner at top
- Warning color (amber background)
- "Viewing as [Tenant Name]" text
- "Exit" button
- Timer/action count

**Acceptance Criteria:**
- [ ] Always visible during impersonation
- [ ] Cannot be dismissed
- [ ] Exit is one-click
- [ ] Session logged on exit

---

### 11.4 BeeBrain System Config

**Function:** Configure AI backend.

**User State:** Setting up system-wide AI.

**Screen Elements:**
- "BeeBrain Configuration" heading
- Backend selector: Rules Only | Local Model | External API
- Provider dropdown (for external): OpenAI, Anthropic, Ollama
- API Key field (masked)
- Per-tenant access toggles
- "Save Configuration" button

**Acceptance Criteria:**
- [ ] API key never shown in full
- [ ] Per-tenant toggles work
- [ ] Backend change confirmed
- [ ] Test connection option

---

# Phase 12: Global Components

## Master Style Block - Phase 12

```
DESIGN SYSTEM: "Modern Artisan Beekeeping"

These components appear across all screens and must maintain consistent warmth and the APIS aesthetic regardless of context.

CONSISTENCY:
- Same color palette everywhere
- Same interaction patterns
- Same spacing and typography

STATES:
- Loading: Skeleton loaders, warm tones
- Empty: Encouraging illustrations
- Error: Helpful, not scary
- Success: Brief celebration

VIBE:
- Consistent and reliable
- Never jarring transitions
- NOT: Inconsistent or broken-feeling
```

## Acceptance Criteria - Phase 12

- [ ] Components are reusable
- [ ] States are consistent
- [ ] Animations are gentle
- [ ] Accessibility maintained

---

### 12.1 Loading State

**Function:** Feedback while content loads.

**User State:** Waiting for data.

**Screen Elements:**
- Skeleton loaders matching content layout
- Or subtle spinner with "Loading..." text
- Warm cream tones for skeleton

**Acceptance Criteria:**
- [ ] Skeleton matches expected content
- [ ] No jarring flash
- [ ] Gentle animation
- [ ] Brief appearance

---

### 12.2 Empty State

**Function:** No data to display.

**User State:** New user or filtered to nothing.

**Screen Elements:**
- Warm illustration (bee-themed, abstract)
- Title explaining the empty state
- Helpful subtitle with next step
- Action button if applicable

**Acceptance Criteria:**
- [ ] Illustration is warm, not sad
- [ ] Copy is encouraging
- [ ] Clear action available
- [ ] Context-appropriate

---

### 12.3 Error State

**Function:** Something went wrong.

**User State:** Frustrated or worried.

**Screen Elements:**
- Calm illustration (not broken robot)
- Title: "Something didn't work"
- Helpful subtitle
- "Try again" button
- "Contact support" link

**Acceptance Criteria:**
- [ ] No user blame
- [ ] Apologetic tone
- [ ] Clear recovery path
- [ ] No technical jargon

---

### 12.4 Toast Notification

**Function:** Feedback for completed actions.

**User State:** Just did something.

**Screen Elements:**
- Slide-in from top or bottom
- Icon + message
- Auto-dismiss (3-5 seconds)
- Close button optional

**Acceptance Criteria:**
- [ ] Success: Sage green
- [ ] Error: Muted rose
- [ ] Not intrusive
- [ ] Consistent position

---

### 12.5 Confirmation Modal

**Function:** Confirm important actions.

**User State:** About to do something significant.

**Screen Elements:**
- Clear title stating action
- Explanation of consequences
- Cancel and Confirm buttons
- Destructive actions in muted rose

**Acceptance Criteria:**
- [ ] Action clearly stated
- [ ] Consequences explained
- [ ] Cancel always available
- [ ] No trick questions

---

### 12.6 Form Field Components

**Function:** Consistent input styling.

**User State:** Entering information.

**Screen Elements:**
- Text input with label above
- Placeholder in light gray
- Focus: Sea Buckthorn border
- Error: Muted rose border + helper text
- Helper text below field

**Acceptance Criteria:**
- [ ] Labels above, not floating
- [ ] 48-56px height
- [ ] Focus state visible but gentle
- [ ] Errors are helpful

---

### 12.7 Button Styles

**Function:** Consistent button hierarchy.

**User State:** Taking actions.

**Screen Elements:**
- Primary: Sea Buckthorn fill, white text, pill shape
- Secondary: Outlined, Brown Bramble border
- Tertiary: Text-only link style
- Destructive: Muted rose for irreversible

**Acceptance Criteria:**
- [ ] Primary is prominent
- [ ] Secondary doesn't compete
- [ ] Consistent padding
- [ ] Hover states subtle

---

# Quick Reference

## Phase Summary

| Phase | Name | Screens |
|-------|------|---------|
| 1 | Foundation & Layout | 6 |
| 2 | Site & Unit Management | 8 |
| 3 | Detection Dashboard | 7 |
| 4 | Clip Archive | 4 |
| 5 | Hive Management | 6 |
| 6 | Treatments, Feedings & Harvests | 6 |
| 7 | PWA & Offline Mode | 5 |
| 8 | BeeBrain AI Insights | 4 |
| 9 | Export & Milestones | 5 |
| 10 | User Management (Local) | 4 |
| 11 | Super-Admin (SaaS) | 4 |
| 12 | Global Components | 7 |
| **Total** | | **66** |

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
| Overall | Boutique honey brand app | Industrial monitoring tool |

## Implementation Priority

**Phase 1 - Define Visual Language:**
1. Phase 1: Foundation & Layout
2. Phase 3: Detection Dashboard
3. Phase 12: Global Components

**Phase 2 - Core User Flows:**
4. Phase 2: Site & Unit Management
5. Phase 5: Hive Management
6. Phase 4: Clip Archive

**Phase 3 - Extended Features:**
7. Phase 6: Treatments, Feedings & Harvests
8. Phase 8: BeeBrain AI Insights
9. Phase 7: PWA & Offline Mode

**Phase 4 - Advanced & Admin:**
10. Phase 9: Export & Milestones
11. Phase 10: User Management
12. Phase 11: Super-Admin

---

## Epics NOT Included (Hardware/Edge)

The following epics are not included in this UI mockup document as they are hardware/firmware focused:

- **Epic 10:** Edge Detection Software (C/Python firmware)
- **Epic 11:** Hardware Assembly Documentation (written docs, not UI)
- **Epic 12:** Edge Laser Deterrent Software (C/Python firmware)

These epics have no dashboard UI screens.
