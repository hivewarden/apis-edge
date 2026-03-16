# UI Mockup Prompts — APIS Dashboard (Comprehensive)

**Project:** APIS — Anti-Predator Interference System
**Purpose:** Complete inventory of all screens with AI-ready design prompts
**Usage:** Copy any prompt into Gemini, Midjourney, or similar to generate mockups

---

## Design System Context

**Copy this into your AI tool before each prompt for consistency:**

```
APIS is a beekeeping dashboard with a warm, natural aesthetic inspired by honey and nature.

COLOR PALETTE:
- Sea Buckthorn (#f7a42d): Primary buttons, CTAs, active states
- Coconut Cream (#fbf9e7): Page backgrounds, light surfaces
- Brown Bramble (#662604): All text, headings, dark elements
- Salomie (#fcd483): Cards, elevated surfaces, secondary accents
- Success: #2e7d32 (forest green)
- Warning: #f9a825 (amber)
- Error: #c62828 (deep red)

TYPOGRAPHY: System UI font stack (SF Pro, Segoe UI, Roboto)
- H1: 32px, weight 600
- H2: 24px, weight 600
- Body: 16px (desktop), 18px (mobile)

STYLE: Warm, friendly, NOT clinical. Soft corners (8-12px radius), subtle shadows, generous white space. Think "artisan honey shop" not "industrial IoT dashboard."

MOBILE: 64px minimum tap targets for glove use in bee yards.
```

---

## Epic Summary: UI Work Required

| Epic | Name | UI Work | Key Screens |
|------|------|---------|-------------|
| 1 | Portal Foundation | Yes | Login, Sidebar Layout |
| 2 | Site & Unit Management | Yes | Site list, Unit cards, Live video |
| 3 | Hornet Dashboard | Yes | Dashboard, Charts, Activity Clock |
| 4 | Clip Archive | Yes | Clip grid, Video player modal |
| 5 | Hive Management | Yes | Hive list, Inspection form, Graphs |
| 6 | Treatments & Harvests | Yes | Treatment log, Calendar, Custom labels |
| 7 | Mobile PWA | Yes | Mobile inspection flow, Voice input |
| 8 | BeeBrain AI | Yes | Insight cards, Proactive alerts |
| 9 | Export & Moments | Yes | Export wizard, Celebration screens |
| 10-12 | Edge Device | No | Hardware/firmware only |

---

## Epic 1: Portal Foundation

### Screen 1.1: Login Page

```
Design a login page for APIS - a beekeeping protection dashboard.

CONTEXT:
User is a hobbyist beekeeper accessing their hive protection system. They feel protective of their bees and want reassurance their system is working. This is their gateway to peace of mind.

VISUAL DIRECTION:
Warm, welcoming login page. NOT corporate. Think "artisan honey shop entrance" — inviting, natural, trustworthy. Soft shadows, rounded corners, subtle honey-themed illustration.

COLOR PALETTE:
- Background: Coconut Cream (#fbf9e7)
- Card: White with Salomie (#fcd483) accent border
- Primary button: Sea Buckthorn (#f7a42d)
- Text: Brown Bramble (#662604)

LAYOUT (centered card design):
1. LOGO SECTION (top)
   - Bee/honeycomb icon + "APIS" wordmark
   - Tagline: "Protecting your hives"

2. LOGIN FORM (centered card)
   - Email input field (rounded, 8px radius)
   - Password input field
   - "Remember me" checkbox
   - "Log In" button (Sea Buckthorn, full width)
   - "Forgot password?" link below

3. FOOTER
   - Subtle honeycomb pattern or bee illustration
   - "New to APIS? Get started" link

WHAT TO AVOID:
- Corporate/sterile appearance
- Dark mode
- Complex multi-step login
- Generic stock imagery

OUTPUT: Desktop (1440x900) and mobile (375x812) mockups
```

### Screen 1.2: Dashboard Layout (Sidebar)

```
Design the main dashboard layout for APIS beekeeping dashboard.

CONTEXT:
Beekeeper checking on their hive protection system. They want to see at-a-glance status, then explore details if curious. Most visits are quick status checks.

VISUAL DIRECTION:
Clean dashboard with left sidebar navigation. Warm honey-themed colors throughout. Cards with generous padding. Feels like a cozy command center, not a sterile control room.

COLOR PALETTE:
- Sidebar: Brown Bramble (#662604) background
- Sidebar text: Coconut Cream (#fbf9e7)
- Active nav item: Sea Buckthorn (#f7a42d) highlight
- Main content: Coconut Cream (#fbf9e7) background
- Cards: Salomie (#fcd483) or white

LAYOUT:
1. LEFT SIDEBAR (240px width)
   - Top: APIS logo (bee icon + wordmark in cream color)
   - Navigation items with icons:
     □ Dashboard (home icon)
     □ Units (device icon)
     □ Hives (hexagon icon)
     □ Clips (video icon)
     □ Statistics (chart icon)
   - Spacer
   - Bottom: Settings (gear), User avatar + name

2. MAIN CONTENT AREA
   - Top bar: Site selector dropdown, Time range selector
   - Content: Grid of cards (placeholder boxes for now)

3. MOBILE VARIATION
   - Hamburger menu, sidebar slides in as overlay
   - Bottom-anchored primary action button

WHAT TO AVOID:
- White/gray sidebar
- Tiny navigation icons
- Cluttered header
- More than 6-7 nav items

OUTPUT: Desktop (1440x900) showing sidebar + content area
```

---

## Epic 2: Site & Unit Management

### Screen 2.1: Sites List Page

```
Design a sites list page for APIS - showing beekeeper's apiaries.

CONTEXT:
Beekeeper with 1-3 apiaries (physical locations). Each site has GPS location and multiple hives. Simple list with ability to add new sites.

VISUAL DIRECTION:
Card-based list with subtle map thumbnails. Warm, organized feel. Each card is inviting to click.

LAYOUT:
1. PAGE HEADER
   - Title: "My Apiaries"
   - "+ Add Site" button (Sea Buckthorn)

2. SITE CARDS (grid, 1 col mobile, 2-3 cols desktop)
   Each card shows:
   - Site name (large, Brown Bramble)
   - Mini map thumbnail (100x100px) showing pin location
   - Stats row: "3 hives • 2 units"
   - Last activity: "Active 5 min ago"

3. EMPTY STATE
   - Friendly illustration of beehive
   - "Add your first apiary to get started"
   - CTA button

OUTPUT: Desktop and mobile showing 2-3 site cards
```

### Screen 2.2: Unit Status Cards

```
Design unit status cards for APIS dashboard.

CONTEXT:
Each "unit" is a physical device protecting hives. Beekeepers need to see at a glance: Is it online? Armed? Any issues?

VISUAL DIRECTION:
Status cards with clear traffic-light indicators. Not alarming, but informative. Green = good, yellow = attention, red = offline.

LAYOUT:
Each unit card (in a grid):
- Unit name: "Hive 1 Protector"
- Status dot: Green/Yellow/Red
- Status label: "Armed" / "Disarmed" / "Offline"
- Site name: "Home Apiary"
- Last seen: "2 min ago" or "Offline since 10:30"
- Optional: small camera preview thumbnail

THREE CARD STATES:
1. Green card - Unit online and armed (protective green tint)
2. Yellow card - Unit online but disarmed (subtle amber tint)
3. Red card - Unit offline (subtle red tint, but not alarming)

OUTPUT: 3 unit cards in a row showing all states
```

### Screen 2.3: Live Video Modal

```
Design a live video viewer modal for APIS.

CONTEXT:
Beekeeper clicks "View Live" to see what their unit camera sees right now. This is for validation/checking, not constant monitoring.

LAYOUT:
Modal (80% viewport width):
1. Header: Unit name + Close X button
2. Video player (16:9 aspect ratio, dark placeholder)
   - Play controls at bottom
   - Fullscreen button
3. Below video:
   - Unit status: "Online • Armed"
   - Today's detections: "3 hornets deterred"
   - Current temperature: "22°C"

WHAT TO AVOID:
- Complex video controls
- Tiny modal size

OUTPUT: Modal overlaying dashboard
```

---

## Epic 3: Hornet Detection Dashboard

### Screen 3.1: Main Dashboard View

```
Design the main dashboard for APIS hornet detection system.

CONTEXT:
This is THE primary screen beekeepers see. Shows at-a-glance: Is everything OK? What happened today? Weather? This should communicate "your bees are protected" in 2 seconds.

VISUAL DIRECTION:
Warm, reassuring dashboard. Hero cards at top, charts below. The "all is well" state should feel good, not empty.

LAYOUT:
1. TOP ROW: Three summary cards (equal width)

   WEATHER CARD:
   - Weather icon (sun/cloud)
   - "22°C" large
   - "Sunny • Humidity 65%"

   TODAY'S ACTIVITY CARD:
   - Large number: "5"
   - "hornets deterred today"
   - Green checkmark if all good
   - Subtext: "Last detection: 2h ago"

   HARDWARE STATUS CARD:
   - Status: "All Systems OK" (green)
   - "2 units online"
   - Link: "View details →"

2. TIME RANGE SELECTOR
   - Segmented control: [Day] [Week] [Month] [Season] [Year]
   - < > arrows for navigation

3. CHARTS ROW
   - Activity Clock (polar chart) - 50% width
   - Temperature Correlation (scatter) - 50% width

4. TREND CHART
   - Full width area chart showing daily detection trend

OUTPUT: Full dashboard, desktop 1440x900
```

### Screen 3.2: Activity Clock (24-Hour Polar Chart)

```
Design an Activity Clock visualization for APIS dashboard.

CONTEXT:
Shows what hours of day hornets are most active. Clock-face metaphor (12:00 at top). Bulges outward at peak activity times.

VISUAL DIRECTION:
Beautiful polar/radar chart. 24 spokes (one per hour). Radius = detection count. Should feel like a natural, organic visualization.

COLOR:
- Data fill: Sea Buckthorn (#f7a42d) with 50% transparency
- Stroke: Sea Buckthorn solid
- Background: Coconut Cream
- Grid lines: Brown Bramble at 10% opacity
- Labels: 00, 06, 12, 18 at cardinal positions

EXAMPLE DATA:
Peak activity at 14:00-16:00 (afternoon bulge)
Minimal activity 20:00-06:00 (flat overnight)

TOOLTIP on hover:
"14:00 - 15:00: 8 detections (23% of total)"

OUTPUT: Square chart (400x400px) with sample data showing afternoon peak
```

### Screen 3.3: Temperature Correlation Chart

```
Design a temperature correlation scatter plot for APIS.

CONTEXT:
Shows relationship between temperature and hornet activity. Helps beekeepers predict high-activity days.

LAYOUT:
- X-axis: Temperature (5°C to 35°C)
- Y-axis: Daily detection count (0 to 20)
- Each dot = one day's data
- Color: Sea Buckthorn (#f7a42d)
- Optional trend line showing correlation

INSIGHT TEXT below chart:
"Hornets prefer 18-22°C at your location"

OUTPUT: Chart (600x400px) with sample data showing clustering around 20°C
```

### Screen 3.4: Zero Detections State

```
Design the "all quiet" dashboard state for APIS.

CONTEXT:
When there are zero detections today. Should feel GOOD and reassuring, not empty or broken.

VISUAL DIRECTION:
Celebrate the peace. Use warm imagery. The bees are safe.

TODAY'S ACTIVITY CARD (alternative design):
- Green checkmark icon (large)
- "All quiet today"
- Subtext: "No hornets detected — your bees are safe"
- Optional: subtle bee illustration flying happily

CHARTS:
Show flat/minimal data gracefully, not "No data available"

OUTPUT: Dashboard with zero detections, emphasizing positive state
```

---

## Epic 4: Clip Archive

### Screen 4.1: Clips Grid View

```
Design a video clips archive page for APIS.

CONTEXT:
Beekeepers reviewing detection videos. Grid of thumbnails. Need to filter by date/unit.

LAYOUT:
1. PAGE HEADER
   - Title: "Detection Clips"
   - Filters row: Date range picker, Unit dropdown, "Clear filters"
   - Result count: "Showing 24 clips"

2. CLIPS GRID (responsive)
   - 2 columns mobile, 4 columns desktop
   - Each thumbnail card:
     - Video preview image (16:9)
     - Play icon overlay on hover
     - Date/time: "Jan 22, 14:30"
     - Unit name
     - Duration badge: "0:04"

3. PAGINATION or infinite scroll indicator

EMPTY STATE:
"No clips for this period"
"Try adjusting your date filters"

OUTPUT: Desktop grid with 8 clip thumbnails
```

### Screen 4.2: Video Player Modal

```
Design a video playback modal for APIS detection clips.

LAYOUT:
Modal (max 900px width):
1. Video player (16:9, with standard HTML5 controls)
2. Metadata below video:
   - "Detected: Jan 22, 2026 at 14:30:22"
   - "Unit: Hive 1 Protector"
   - "Confidence: 85%"
   - "Laser activated: Yes" (with green dot)
3. Actions: "Previous" | "Next" | "Delete" | "Download"

OUTPUT: Modal with video playing
```

### Screen 4.3: Nest Radius Map

```
Design a nest location estimator map for APIS.

CONTEXT:
Optional feature that estimates where hornet nest might be based on flight patterns. Shows circular radius on map.

LAYOUT:
1. Map (Leaflet/OpenStreetMap style)
   - Centered on apiary GPS location
   - Bee icon marking hive location
   - Circular radius (dashed orange line) showing estimated nest distance

2. Info panel (sidebar or below):
   - "Estimated nest distance: 350m"
   - "Based on 42 observations"
   - "Confidence: Medium"
   - "Report Nest" button

INSUFFICIENT DATA STATE:
- Grayed map
- "Need 20+ observations to estimate"
- Progress: "12/20 collected"

OUTPUT: Map with radius circle and info panel
```

---

## Epic 5: Hive Management

### Screen 5.1: Hive List View

```
Design a hive list page for APIS.

CONTEXT:
Beekeeper viewing all hives at a site. Quick overview showing status, queen age, last inspection.

LAYOUT:
1. PAGE HEADER
   - Site name: "Home Apiary"
   - "+ Add Hive" button

2. HIVE CARDS (vertical list or 2-col grid)
   Each card:
   - Hive name: "Hive 3" (large)
   - Queen badge: "Queen: 2 years"
   - Config: "2 brood + 1 super"
   - Last inspection: "5 days ago"
   - Status badge: "Healthy" (green) or "Needs inspection" (yellow)
   - Click anywhere to open detail

3. Visual: Small stacked-box icon showing hive configuration

OUTPUT: 3-4 hive cards in a list
```

### Screen 5.2: Hive Detail Page

```
Design a hive detail page for APIS.

CONTEXT:
Deep dive into one hive. Shows configuration, queen history, recent inspections, frame development chart.

LAYOUT:
1. HEADER
   - Hive name + Edit button
   - Quick actions: "New Inspection", "Log Treatment"

2. CONFIGURATION CARD
   - Queen info: "Introduced Mar 2024 (2 years)"
   - Source: "Local breeder"
   - Box visual: stacked rectangles showing brood boxes + supers

3. RECENT INSPECTION CARD
   - Last inspection date
   - Key findings summary
   - "View all inspections" link

4. FRAME DEVELOPMENT CHART
   - Stacked area chart: brood, honey, pollen over time

5. BEEBRAIN INSIGHT CARD
   - AI-generated insight about this hive

OUTPUT: Desktop hive detail page, full layout
```

### Screen 5.3: Mobile Inspection Form (Swipe Cards)

```
Design a mobile-first inspection form for APIS.

CONTEXT:
Beekeeper in the field, wearing gloves. Needs LARGE touch targets (64px minimum). Swipe through cards to record inspection data.

VISUAL DIRECTION:
Big, bold, touch-friendly. Each screen focuses on ONE thing. Swipe left/right to navigate.

CARD 1 - QUEEN:
- Large title: "Queen"
- Three big toggle buttons (full width, 64px height):
  [Queen Seen?] Yes / No
  [Eggs Seen?] Yes / No
  [Queen Cells?] Yes / No
- Progress dots at bottom: ● ○ ○ ○ ○

CARD 2 - BROOD:
- Title: "Brood"
- Large stepper: "Brood Frames" with [-] 6 [+] (big buttons)
- Three-segment selector: [Good] [Spotty] [Poor]

CARD 3 - STORES:
- Title: "Stores"
- Honey: [Low] [Medium] [High] (large segments)
- Pollen: [Low] [Medium] [High]

CARD 4 - NOTES:
- Title: "Notes"
- Big text area
- Huge "🎤 SPEAK" button (64px height, prominent)
- Smaller "Keyboard" button below

CARD 5 - SAVE:
- Summary of all entries
- Giant "SAVE" button (64px, full width, bottom-anchored)

OUTPUT: 5 mobile screens (375x812) showing the swipe flow
```

### Screen 5.4: Frame Development Chart

```
Design a frame development chart for APIS hive tracking.

CONTEXT:
Shows how hive developed over the season. Brood expands in spring, honey accumulates, then brood shrinks for winter.

CHART:
- Stacked area chart
- X-axis: Months (Apr - Nov)
- Y-axis: Frame count (0-20)
- Three layers:
  - Brood frames (brown #8B4513)
  - Honey frames (gold #f7a42d)
  - Pollen frames (orange #FFA500)

SAMPLE DATA:
- Spring: brood expanding
- Summer: honey accumulating
- Fall: brood shrinking, honey dominant

OUTPUT: Chart (700x400) with full season data
```

---

## Epic 6: Treatments, Feedings & Harvests

### Screen 6.1: Treatment Log Form

```
Design a treatment logging form for APIS.

CONTEXT:
Beekeeper recording varroa treatment. Needs to track type, method, dose, and optionally mite counts.

LAYOUT:
Form card:
1. Date picker (default: today)
2. Hive multi-select (can apply to multiple hives)
3. Treatment type dropdown: Oxalic acid, Formic acid, Apiguard...
4. Method: Vaporization, Dribble, Strips, Spray
5. Dose input (text)
6. Optional: Mite count before / after
7. Notes textarea
8. "Save Treatment" button

OUTPUT: Desktop and mobile form views
```

### Screen 6.2: Treatment Calendar

```
Design a treatment calendar view for APIS.

CONTEXT:
Shows upcoming treatments, reminders, and history. Helps beekeepers stay on schedule.

LAYOUT:
1. CALENDAR VIEW (month grid)
   - Days with treatments highlighted
   - Dots/badges showing treatment types

2. UPCOMING section (sidebar or below):
   - "Oxalic acid due in 3 days" (Hive 2)
   - "Last treatment: 87 days ago"
   - Actions: [Mark Done] [Snooze] [Skip]

3. HISTORY section:
   - Timeline of past treatments
   - Icons by type

OUTPUT: Calendar with upcoming reminders highlighted
```

### Screen 6.3: Custom Labels Settings

```
Design a custom labels management page for APIS.

CONTEXT:
Users can add their own treatment types, feed types, equipment, etc. that aren't in the defaults.

LAYOUT:
Settings → Custom Labels

Categories (tabs or sections):
- Feed Types
- Treatment Types
- Equipment Types
- Issue Types

Each category shows:
- Built-in items (grayed, not editable)
- Custom items (editable, with delete X)
- "+ Add" button

EXAMPLE:
Feed Types:
• Sugar syrup (built-in)
• Fondant (built-in)
• "My secret protein mix" (custom) [Edit] [×]
• "Honey-B-Healthy syrup" (custom) [Edit] [×]
[+ Add Feed Type]

OUTPUT: Settings page showing custom labels management
```

---

## Epic 7: Mobile PWA

### Screen 7.1: Offline Banner

```
Design an offline status banner for APIS PWA.

CONTEXT:
Beekeeper in the field with no signal. App still works but data syncs later.

BANNER DESIGN:
- Yellow/amber background
- Lightning bolt icon
- "Offline — 3 inspections pending sync"
- Subtle, not alarming

ONLINE BANNER:
- Green, brief
- "✓ Synced" (auto-dismisses after 3 seconds)

OUTPUT: Both states, mobile width
```

### Screen 7.2: QR Code Scanner

```
Design a QR code scanner interface for APIS.

CONTEXT:
Large apiaries with 50+ hives. Beekeeper scans QR on hive for instant navigation.

LAYOUT:
- Full-screen camera viewfinder
- Targeting square in center
- Instruction: "Point at hive QR code"
- Cancel button (bottom, 64px)
- Flash toggle (optional)

SUCCESS:
- Brief flash of green
- Navigate to scanned hive

OUTPUT: Mobile scanner screen
```

### Screen 7.3: Voice Input Button

```
Design a voice input interface for APIS inspection notes.

CONTEXT:
Beekeeper wearing gloves, can't type. Big voice button is primary input method.

LAYOUT:
1. Text area showing transcribed text
2. Big "🎤 SPEAK" button (64px height, full width, Sea Buckthorn)
3. Smaller "Keyboard" button below (secondary)

RECORDING STATE:
- Button shows pulsing red dot
- Text: "Listening..."
- Cancel X button appears

OUTPUT: Notes input area with prominent voice button
```

---

## Epic 8: BeeBrain AI

### Screen 8.1: BeeBrain Insight Card

```
Design a BeeBrain AI insight card for APIS.

CONTEXT:
AI-generated insights appear in various sections. Shows timestamp, can be refreshed.

CARD DESIGN:
Header:
- 🧠 BeeBrain Analysis
- "Last updated: 2 hours ago" (gray text)
- [↻ Refresh] button

Body:
- Insight text in Brown Bramble
- Example: "Your cost per kg of honey is €4.20, which is below average. Hive 2 is your most profitable at €2.80/kg."

LOADING STATE:
- Skeleton loader
- "Analyzing your data..."

OUTPUT: Insight card in both loaded and loading states
```

### Screen 8.2: Proactive Insight Alert

```
Design a proactive BeeBrain alert for APIS.

CONTEXT:
BeeBrain noticed something worth the user's attention without them asking.

ALERT DESIGN:
Card with yellow/amber left border:
- 💡 BeeBrain noticed:
- Insight text: "Queen is entering her 3rd year and productivity dropped 23% vs last season. Consider requeening in spring."
- Action buttons: [Dismiss] [Add to reminders] [Tell me more]

OUTPUT: Alert card that could appear on dashboard or hive detail
```

---

## Epic 9: Export & Emotional Moments

### Screen 9.1: Data Export Wizard

```
Design a data export configuration page for APIS.

CONTEXT:
Beekeeper wants to export hive data to share on forums, paste into ChatGPT, or download for records.

LAYOUT:
1. HEADER
   - "Export Hive Data"
   - Hive selector: [Hive 3 ▼] or [☑ All hives]

2. FIELD SELECTION (checkboxes in columns)
   BASICS:
   ☑ Hive name
   ☑ Queen age
   ☑ Boxes (brood + supers)
   ☐ Location/GPS

   DETAILS:
   ☐ Full inspection log
   ☐ Hornet detection data
   ☐ Weather correlations

   ANALYSIS:
   ☐ BeeBrain insights
   ☐ Health summary

3. FORMAT SELECTION
   ● Quick summary (for forums)
   ○ Detailed markdown (for AI)
   ○ Full JSON (for nerds)

4. ACTIONS
   [Preview] [Copy to Clipboard] [Download]

OUTPUT: Export configuration page
```

### Screen 9.2: First Harvest Celebration

```
Design a first harvest celebration screen for APIS.

CONTEXT:
Beekeeper logs their first-ever honey harvest. This is a MILESTONE. Celebrate it!

VISUAL DIRECTION:
Joyful, celebratory. Confetti animation. Honey-gold dominant. Achievement unlocked feeling.

LAYOUT:
Full-screen modal:
1. Confetti animation
2. Honey jar illustration
3. "🎉 Your First Harvest!"
4. "Congratulations! You extracted 8kg of golden honey from Hive 3"
5. [Take a Photo] button
6. [Share] [Continue] buttons

OUTPUT: Celebration modal with warm, joyful design
```

### Screen 9.3: Hive Loss Post-Mortem

```
Design a hive loss recording wizard for APIS.

CONTEXT:
Sad moment — beekeeper lost a hive. App should acknowledge the loss and help them learn for next time.

VISUAL DIRECTION:
Respectful, not cheerful. Muted colors. Help them document what happened.

LAYOUT:
Wizard steps:
1. "Recording Hive 3"
   - Date lost
   - Suspected cause (dropdown + other)

2. "What did you observe?"
   - Symptom checkboxes
   - Notes area

3. "Lessons learned"
   - Free text: "What would you do differently?"

4. Summary
   - Review and save
   - "This will help improve BeeBrain recommendations"

TONE: Gentle, supportive, learning-focused

OUTPUT: Multi-step wizard, muted colors
```

### Screen 9.4: Season Recap Summary

```
Design a season recap summary card for APIS.

CONTEXT:
End of year summary that beekeepers will want to save and share. Celebrates the season.

LAYOUT:
Card with stats:
- "🐝 2026 Season Recap: Hive 3"
- Key metrics:
  • Started spring at 12kg
  • First honey flow: April 15 (+8kg in 2 weeks)
  • Hornet pressure: 47 deterred (peak September)
  • You harvested 18kg across 3 extractions
  • Survived winter ✓
- Actions: [Share] [Export] [View Details]

Visual: Mini graph showing weight progression through season

OUTPUT: Shareable season summary card
```

---

## How to Use These Prompts

### With Gemini Image Generation:

1. Copy the Design System Context block first
2. Then paste the specific screen prompt
3. Say "Generate a UI mockup based on these specifications"

### Recommended Design Order:

1. **Screen 3.1: Main Dashboard** — Sets the visual tone
2. **Screen 1.2: Dashboard Layout** — Establishes navigation
3. **Screen 5.3: Mobile Inspection Form** — Defines mobile patterns
4. **Screen 8.1: BeeBrain Insight Card** — Component template
5. Other screens as needed

### Showing Results to Claude for Implementation:

1. Save generated mockups as PNGs
2. Share with Claude Code
3. Say "Implement this design using React + Ant Design + Refine, following the APIS theme from apis-dashboard/src/theme"

### Quick Reference: The APIS Vibe

| YES | NO |
|-----|-----|
| Warm honey gold (#f7a42d) | Cold blue (#007bff) |
| Cream backgrounds (#fbf9e7) | Pure white (#ffffff) |
| Rounded corners (8-12px) | Sharp corners |
| Generous padding | Cramped layouts |
| "Your bees are protected" | "5 detections logged" |
| Big touch targets (64px) | Small buttons |
| Celebration moments | Just data logging |
| "Hornets prefer 20°C" | "Mean temp: 20.3°C" |

---

*Generated for APIS — Anti-Predator Interference System*
*Based on UX Design Specification v2026-01-22*
