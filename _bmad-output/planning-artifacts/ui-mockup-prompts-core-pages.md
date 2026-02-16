# UI Mockup Prompts — APIS Core Pages (Hero Designs)

**Project:** APIS — Anti-Predator Interference System
**Purpose:** 5 standalone prompts defining the visual language
**Usage:** Each prompt contains ALL context needed — paste directly into image AI

---

## Why These 5 Pages?

These pages define the visual language for the entire app. Design these well, and everything else follows naturally.

| Page | Why It's Core |
|------|---------------|
| **Main Dashboard** | First impression, emotional anchor, "the one page" |
| **Mobile Inspection Form** | Defines mobile/touch patterns for all forms |
| **Hive Detail Page** | Template for all detail views (units, sites, etc.) |
| **Clip Archive Grid** | Defines media browsing, thumbnail patterns |
| **Season Celebration** | Defines emotional moments, personality of the app |

---

## Core Page 1: Main Dashboard

### Full Standalone Prompt

```
Design a complete dashboard mockup for APIS — a beekeeping hive protection system.

WHAT IS APIS:
A smart camera device that detects Asian hornets hovering near beehives and deters them with a laser. The dashboard shows beekeepers what's happening at their hives — weather, detections, patterns, and device status.

THE USER:
Hobbyist beekeeper (1-10 hives) in Europe. Protective of their bees. Wants reassurance their protection system is working. Most dashboard visits are quick status checks ("Are my bees OK?"). Sometimes they explore patterns ("When do hornets come?").

EMOTIONAL GOAL:
"Reassured confidence" — My bees are protected, and I understand what's happening. NOT anxious monitoring. NOT clinical data analysis. Warm, calm confidence.

VISUAL DIRECTION:
Think "artisan honey shop meets weather app" — warm, natural, inviting. Soft rounded corners, subtle shadows, generous white space. NOT sterile IoT dashboard. NOT dark mode. NOT corporate.

COLOR PALETTE (use these exact colors):
- Primary/CTAs: Sea Buckthorn (#f7a42d) — warm honey gold
- Background: Coconut Cream (#fbf9e7) — warm off-white
- Text/headings: Brown Bramble (#662604) — deep warm brown
- Cards: Salomie (#fcd483) — light golden cream, OR white with golden accent
- Status green: #2e7d32 (forest green)
- Chart data: Sea Buckthorn (#f7a42d) with transparency

TYPOGRAPHY:
- Font: System UI (SF Pro / Segoe UI / Roboto)
- H1: 32px, weight 600, Brown Bramble
- H2: 24px, weight 600
- Body: 16px, weight 400

LAYOUT STRUCTURE (from top to bottom):

1. LEFT SIDEBAR (240px, Brown Bramble #662604 background)
   - Top: Bee logo icon + "APIS" wordmark in cream white
   - Nav items (icons + labels, cream text):
     □ Dashboard (home icon) — ACTIVE, highlighted with Sea Buckthorn
     □ Units (device icon)
     □ Hives (hexagon icon)
     □ Clips (video icon)
     □ Statistics (chart icon)
   - Spacer pushing rest to bottom
   - Settings (gear icon)
   - User: Avatar circle + "Jermoo" name

2. TOP BAR (within main content area)
   - Left: Site dropdown "Home Apiary ▼"
   - Center: Time range selector (segmented control)
     [Day] [Week] [Month] [Season] [Year] [All Time]
     "Week" selected, Sea Buckthorn background
   - Right: Date navigation arrows (< >)
   - When "Day" selected: date picker appears below
   - Selection persists in URL (?range=week&date=2026-01-20)

3. SUMMARY CARDS ROW (four cards in responsive grid)

   WEATHER CARD (Salomie background):
   - Weather icon (sun with rays, stylized)
   - "22°C" very large (32px)
   - "Feels like 24°C" smaller text below
   - "Sunny • Humidity 65%"
   - Small "Updated 10 min ago" timestamp at bottom
   - Card has 12px border radius, subtle shadow
   - ERROR STATE: "Weather unavailable" with [Retry] button

   TODAY'S ACTIVITY CARD (slight green tint):
   - Large number "5" (48px, Sea Buckthorn color)
   - "hornets deterred today"
   - Green checkmark icon
   - Subtext: "Last detection: 2h ago"
   - Laser success: "4 of 5 deterred with laser" (smaller text)
   - Feel POSITIVE and protective
   - ZERO STATE: "All quiet today ☀️" with reassuring message

   HARDWARE STATUS CARD (Salomie background):
   - Green dot + "All Systems OK"
   - "2 units online"
   - "View details →" link

   BEEBRAIN CARD (white with brain-bee icon):
   - "🧠 BeeBrain Analysis" heading
   - "Last updated: 2h ago" + [↻ Refresh] link
   - Summary: "All quiet at Home Apiary. Your 3 hives are doing well."
   - OR prioritized list: "⚠️ Hive 2: Treatment due (92 days)"
   - Each concern links to relevant action

4. CHARTS ROW (two charts side by side)

   ACTIVITY CLOCK (left, 50% width):
   - 24-hour polar/radar chart
   - Clock face layout (12:00 at top, 00/06/12/18 labeled)
   - Data in Sea Buckthorn (#f7a42d) fill with 50% opacity
   - Show afternoon bulge (14:00-16:00 peak)
   - Title: "Activity by Hour"
   - Card wrapper with 12px radius
   - TOOLTIP on hover: "14:00 - 15:00: 8 detections (23%)"
   - EMPTY STATE: "No activity recorded for this period"

   TEMPERATURE CORRELATION (right, 50% width):
   - Scatter plot
   - X-axis: Temperature (10-30°C)
   - Y-axis: Detections (0-15)
   - Dots in Sea Buckthorn (8px soft circles)
   - Clustering around 18-22°C
   - Optional dashed trend line showing correlation
   - Title: "Temperature Correlation"
   - Insight text below: "Hornets prefer 18-22°C"
   - TOOLTIP on hover: "Oct 15: 22°C, 14 detections"
   - Click on dot navigates to that day's detail

5. TREND CHART (full width, below charts row)
   - Area chart (filled with Sea Buckthorn gradient)
   - X-axis: Days of the week (Mon-Sun)
   - Y-axis: Detection count
   - Title: "This Week's Trend"
   - Smooth, organic line
   - Faded dashed comparison line showing previous week
   - Legend: "This week" (solid) vs "Last week" (dashed)
   - TOOLTIP on hover: "Wed: 14 detections"

DESIGN PRINCIPLES:
- Rounded corners (8-12px) on all cards
- Generous padding (24px within cards)
- Subtle shadows (0 2px 8px rgba(0,0,0,0.08))
- The "5 hornets deterred" should feel like a GOOD thing (protection working)
- Zero detections state should feel peaceful, not empty

WHAT TO AVOID:
- Sharp corners
- Pure white backgrounds (#ffffff)
- Dark mode
- Red/danger colors for normal states
- Tiny text or cramped layouts
- Generic IoT/industrial appearance
- Flashing or alarming elements

OUTPUT:
Create a desktop mockup at 1440×900 pixels showing the complete dashboard with all elements described above. Use realistic sample data. The overall feeling should be warm, trustworthy, and reassuring.
```

---

## Core Page 2: Mobile Inspection Form

### Full Standalone Prompt

```
Design a mobile inspection form flow for APIS — a beekeeping hive management app.

WHAT IS THIS:
A mobile-first form for beekeepers to record hive inspections in the field. Critical constraint: USER IS WEARING THICK GLOVES and can't make precise touches or type easily.

THE USER:
Beekeeper standing at their hive, wearing bee suit and leather gloves. They can tap large targets but not small buttons. Voice input is primary, typing is secondary.

VISUAL DIRECTION:
Large, bold, touch-friendly. Each screen focuses on ONE thing. Swipe between cards. Nothing smaller than 64px touch target. Big fat buttons. Think "designed for a 4-year-old" in terms of tap target size.

COLOR PALETTE:
- Primary/Active: Sea Buckthorn (#f7a42d)
- Background: Coconut Cream (#fbf9e7)
- Text: Brown Bramble (#662604)
- Success green: #2e7d32
- Card: White with subtle shadow

TYPOGRAPHY:
- Titles: 24px, bold, Brown Bramble
- Labels: 18px (larger than desktop!)
- Button text: 18px, bold

SCREEN DIMENSIONS: iPhone 13 (390×844 pixels)

DESIGN 5 SEQUENTIAL SCREENS:

SCREEN 1 — QUEEN
- Header: "Queen" (24px, centered)
- Progress indicator: ● ○ ○ ○ ○ (5 dots, first filled)
- Three large toggle buttons (full width, 72px height each):

  [Queen Seen?]
  YES | NO
  (left/right toggle, active side in Sea Buckthorn)

  [Eggs Seen?]
  YES | NO

  [Queen Cells?]
  YES | NO

- Visual spacing: 16px between buttons
- Swipe hint at bottom: "Swipe to continue →"

SCREEN 2 — BROOD
- Header: "Brood"
- Progress: ○ ● ○ ○ ○

- Large stepper control:
  Label: "Brood Frames"
  [ - ]  6  [ + ]
  (huge - and + buttons, 72px squares, number in center)

- Three-segment selector (full width, 64px height):
  Pattern: [ Good ] [ Spotty ] [ Poor ]
  Active segment in Sea Buckthorn

SCREEN 3 — STORES
- Header: "Stores"
- Progress: ○ ○ ● ○ ○

- Label: "Honey"
  Three-segment: [ Low ] [ Medium ] [ High ]
  (72px height, full width)

- Label: "Pollen"
  Three-segment: [ Low ] [ Medium ] [ High ]

SCREEN 4 — NOTES
- Header: "Notes"
- Progress: ○ ○ ○ ● ○

- Text area (200px height, rounded corners, 18px font)
  Placeholder: "Observations, issues, actions..."
  Showing sample text: "Queen seen on frame 4, good laying pattern..."

- Primary button (full width, 72px height, Sea Buckthorn):
  🎤 SPEAK
  (microphone emoji + text, bold)

- Secondary button (full width, 56px height, outlined):
  Keyboard
  (smaller, not as prominent)

SCREEN 5 — SAVE
- Header: "Review & Save"
- Progress: ○ ○ ○ ○ ●

- Summary card showing all entered data:
  ✓ Queen seen, Eggs seen
  ✓ 6 brood frames, Good pattern
  ✓ Honey: Medium, Pollen: High
  ✓ Notes: "Queen seen on frame..."

- Fixed bottom button (full width, 72px height, Sea Buckthorn):
  SAVE INSPECTION
  (bottom-anchored, 24px padding from edges)

DESIGN PRINCIPLES:
- MINIMUM 64px touch targets, prefer 72px
- 16px gaps between interactive elements
- Single focus per screen
- Progress always visible
- Can swipe left/right between cards
- Everything reachable with gloved thumb

WHAT TO AVOID:
- Small checkboxes
- Standard form inputs
- Keyboard as primary input
- Anything requiring precision
- Tiny text (under 18px)
- Cluttered screens

OUTPUT:
Create 5 mobile mockups (390×844 each) showing the complete inspection flow. Show them as a horizontal sequence. Make the touch targets obviously large.
```

---

## Core Page 3: Hive Detail Page

### Full Standalone Prompt

```
Design a hive detail page for APIS — a beekeeping management dashboard.

WHAT IS THIS:
A deep-dive view into a single beehive. Shows configuration, health status, recent inspections, frame development over time, and AI insights. This is where beekeepers learn about their hive's progress.

THE USER:
Beekeeper reviewing how Hive 3 is doing. They want to see queen age, box configuration, inspection history, and frame development trends. They might be planning their next inspection or checking if AI has any recommendations.

EMOTIONAL GOAL:
"I understand this hive's story." The page tells a narrative of the hive's development — not just data, but patterns and insights.

VISUAL DIRECTION:
Information-rich but not cluttered. Cards organize different aspects. Charts tell the story visually. Warm honey-themed colors throughout.

COLOR PALETTE:
- Primary: Sea Buckthorn (#f7a42d)
- Background: Coconut Cream (#fbf9e7)
- Text: Brown Bramble (#662604)
- Cards: White or Salomie (#fcd483)
- Chart colors:
  - Brood: Saddle Brown (#8B4513)
  - Honey: Sea Buckthorn (#f7a42d)
  - Pollen: Orange (#FFA500)

LAYOUT STRUCTURE (desktop, 1440×900):

1. SIDEBAR (same as dashboard, Brown Bramble, "Hives" active)

2. PAGE HEADER
   - Breadcrumb: "Home Apiary > Hive 3"
   - Hive name: "Hive 3" (H1, 32px)
   - Status badge: "Healthy" (green pill)
   - Actions (right-aligned):
     [New Inspection] button (Sea Buckthorn)
     [Edit] button (outlined)
     [•••] menu

3. TOP SECTION (two-column layout)

   LEFT COLUMN — CONFIGURATION CARD (60% width):
   - Card title: "Configuration"
   - Queen info:
     "Queen introduced March 2024"
     "Age: 2 years" (calculated)
     "Source: Local breeder"
   - Visual BOX STACK:
     ┌─────────────┐
     │ Super 1    │  ← honey super (gold color)
     ├─────────────┤
     │ Brood Box 2│  ← brood (brown color)
     ├─────────────┤
     │ Brood Box 1│  ← brood (brown color)
     └═════════════┘
        bottom board
     Caption: "2 brood + 1 super"

   RIGHT COLUMN — LATEST INSPECTION CARD (40% width):
   - Card title: "Latest Inspection"
   - Date: "Jan 20, 2026 (2 days ago)"
   - Quick stats with icons:
     ✓ Queen seen
     ✓ 6 brood frames
     ✓ Stores: Medium
     ⚠ Varroa: Low-Medium
   - "View all inspections →" link

4. MIDDLE SECTION — FRAME DEVELOPMENT CHART (full width card)
   - Card title: "Frame Development — 2026 Season"
   - Stacked area chart:
     X-axis: Apr, May, Jun, Jul, Aug, Sep, Oct (months)
     Y-axis: Frame count (0-20)
     Three stacked layers:
     - Brood frames (brown, bottom layer)
     - Honey frames (gold, middle layer)
     - Pollen frames (orange, top layer)
   - Show realistic season progression:
     - Spring: brood expanding
     - Summer: honey accumulating
     - Fall: brood shrinking
   - Chart height: ~300px

5. BOTTOM SECTION — BEEBRAIN INSIGHT CARD (full width)
   - Header: "🧠 BeeBrain Analysis"
   - Subheader: "Last updated: 2 hours ago" + [↻ Refresh] button
   - Insight text:
     "Hive 3 is developing well. Brood expansion is 15% ahead of your other hives. Queen productivity remains strong at 2 years old. Recommendation: Add second honey super before next inspection if flow continues."
   - Styling: Light background, subtle border, 16px padding

DESIGN PRINCIPLES:
- Visual hierarchy: configuration and latest inspection are primary
- The box stack visual should be simple and clear
- Chart should be the main learning element
- BeeBrain insight feels like a helpful advisor, not a warning system

WHAT TO AVOID:
- Data tables as primary display
- Too many numbers without context
- Clinical/sterile appearance
- Alarmist color coding
- Crowded layout

OUTPUT:
Create a desktop mockup (1440×900) showing the complete hive detail page with all sections. Use realistic sample data that tells a coherent story of a healthy developing hive.
```

---

## Core Page 4: Clip Archive Grid

### Full Standalone Prompt

```
Design a video clips archive page for APIS — a hornet detection system.

WHAT IS THIS:
A browsable archive of detection video clips. Each clip is a 3-5 second video of a hornet being detected and deterred. Beekeepers review these to validate the system works.

THE USER:
Beekeeper reviewing what the camera caught. In early days (validation phase), they watch many clips. Later, they browse occasionally. They need to filter by date or unit, and find specific incidents.

VISUAL DIRECTION:
Clean media grid like a photo gallery. Thumbnails are the primary content. Easy filtering. Video playback in modal. Warm honey theme throughout.

COLOR PALETTE:
- Primary: Sea Buckthorn (#f7a42d)
- Background: Coconut Cream (#fbf9e7)
- Text: Brown Bramble (#662604)
- Cards: White with subtle shadow
- Thumbnail overlay: Semi-transparent Brown Bramble

LAYOUT STRUCTURE (desktop, 1440×900):

1. SIDEBAR (same as other pages, "Clips" active)

2. PAGE HEADER
   - Title: "Detection Clips" (H1)
   - Result count (right): "Showing 24 clips"

3. FILTER BAR (below header)
   - Date range picker: [Jan 15] to [Jan 22] (two date inputs)
   - Unit dropdown: [All Units ▼]
   - Site dropdown (if multiple sites): [All Sites ▼]
   - [Clear filters] link (appears when filters active)

4. CLIPS GRID (main content)
   - 4 columns on desktop
   - 16px gap between items

   EACH CLIP CARD:
   - Thumbnail image (16:9 aspect ratio, ~280×160px)
   - Play icon overlay (centered, white, semi-transparent until hover)
   - On hover: thumbnail slightly scales up, play icon becomes solid
   - Below thumbnail:
     - Date/time: "Jan 22, 14:30" (Brown Bramble)
     - Unit name: "Hive 1 Protector" (lighter gray)
   - Duration badge (top-right corner of thumbnail): "0:04"
   - Confidence badge (top-left, optional): "85%" in small pill

5. PAGINATION (below grid)
   - Page numbers: ◀ 1 2 3 4 5 ▶
   - Or: "Load more" button centered

6. EMPTY STATE (when no clips match filters)
   - Centered in grid area
   - Illustration: Bee with magnifying glass
   - Text: "No clips found for this period"
   - Subtext: "Try adjusting your date range"
   - [Clear filters] button

THUMBNAIL DETAILS:
- Show realistic camera view: blurry background, focused hornet
- Some variation in thumbnails (different lighting, angles)
- Duration badges all 3-5 seconds
- Mix of morning and afternoon timestamps

HOVER STATE:
- Card lifts slightly (shadow increases)
- Play icon becomes more prominent
- Subtle scale animation (1.02x)

DESIGN PRINCIPLES:
- Thumbnails are the hero content
- Filters are accessible but not dominant
- Easy to scan many clips quickly
- Play action is obvious

WHAT TO AVOID:
- List view as primary
- Tiny thumbnails
- Complex filter UI
- Missing hover states
- Generic video placeholder images

OUTPUT:
Create a desktop mockup (1440×900) showing 12 clip thumbnails in the grid with realistic camera-capture thumbnails. Show filters set to current week. Include one clip with hover state visible.
```

---

## Core Page 5: First Harvest Celebration

### Full Standalone Prompt

```
Design a first harvest celebration screen for APIS — a beekeeping management app.

WHAT IS THIS:
A special milestone celebration when a beekeeper logs their FIRST honey harvest. This is a significant emotional moment in beekeeping — the reward after months of work. The app should celebrate with them.

THE USER:
Excited beekeeper who just extracted their first honey. Feeling proud, maybe relieved, definitely happy. They want to mark this moment. Maybe share it.

EMOTIONAL GOAL:
Pure joy and celebration. This is the BEST moment in beekeeping. The app should feel like a friend congratulating them, not a form completion.

VISUAL DIRECTION:
Celebratory and joyful. Confetti. Warm gold colors. Think "achievement unlocked" meets "birthday card." Not subtle or understated — go big.

COLOR PALETTE:
- Primary celebration color: Sea Buckthorn (#f7a42d) — golden honey
- Confetti colors: Gold, Orange, Brown, Cream (honey theme)
- Background: Gradient from Coconut Cream to Salomie
- Text: Brown Bramble (#662604)
- Accents: Warm amber glow effects

LAYOUT (modal/overlay, centered, 600×700px):

1. BACKGROUND
   - Full-screen semi-transparent overlay (Brown Bramble at 50%)
   - Modal card with rounded corners (16px), white/cream background
   - Subtle golden glow around edges

2. CONFETTI ANIMATION (description for static mockup)
   - Gold, orange, and brown confetti pieces falling from top
   - Mix of rectangles, circles, and honey drop shapes
   - Some confetti at various positions for static version

3. ILLUSTRATION (top center)
   - Stylized honey jar, overflowing with golden honey
   - Dripping honey effect
   - Sparkle effects around the jar
   - Could include a small bee nearby
   - Size: ~200×200px

4. CELEBRATION TEXT (centered)
   - "🎉 Your First Harvest!" (H1, 36px, Brown Bramble)
   - Subtext: "Congratulations!"
   - Large text: "You extracted 8kg of golden honey from Hive 3"
   - (or dynamic: "{amount} from {hive}")

5. MEMORY PROMPT
   - Text: "Want to capture this moment?"
   - Camera icon

6. ACTION BUTTONS (stacked, full-width within card)
   - Primary: [📸 Take a Photo] — Sea Buckthorn, 56px height
   - Secondary: [Share] — Outlined, 48px height
   - Tertiary: [Continue] — Text link below

7. MILESTONE BADGE (bottom of card)
   - Small badge/ribbon: "🏆 Harvest #1"
   - Saved to profile/achievements

ANIMATION NOTES (for reference):
- Confetti falls and drifts
- Honey jar has subtle glow pulse
- Text fades in sequentially
- Buttons slide up from bottom

DESIGN PRINCIPLES:
- Go BIG on the celebration — this matters
- Golden honey color is the star
- Feels personal and warm
- Encourages memory-making (photo)
- Easy to dismiss without feeling pushed

WHAT TO AVOID:
- Corporate/formal achievement banners
- Cold blue "success" colors
- Generic checkmark completions
- Small or subtle celebrations
- Making it feel like a data entry confirmation

OUTPUT:
Create a mockup showing the celebration modal overlaying a blurred dashboard background. Include static confetti elements. The overall feeling should be joyful, warm, and memorable — like the app is genuinely happy for them.
```

---

## How to Use These Prompts

### Step 1: Generate Mockups

1. Open your image AI (Gemini, Midjourney, DALL-E, etc.)
2. Paste the ENTIRE prompt for one page (they're standalone)
3. Generate 2-4 variations
4. Pick the best one or combine elements

### Step 2: Refine if Needed

Common refinements:
- "Make the cards more rounded"
- "Use more of the gold (#f7a42d) color"
- "Increase padding between elements"
- "Show the mobile version"

### Step 3: Establish Design System

Once you have Core Page 1 (Dashboard) approved:
- Extract specific component styles
- Use those as reference for other pages
- The dashboard sets the tone for everything

### Step 4: Share with Claude for Implementation

1. Save mockups as PNG files
2. Attach to Claude Code conversation
3. Say: "Implement this design using React + Ant Design, following the APIS theme configuration in apis-dashboard/src/theme/apisTheme.ts"

### Design Order Priority

1. **Main Dashboard** — Defines the core look and feel
2. **Mobile Inspection Form** — Defines mobile/touch patterns
3. **Hive Detail Page** — Template for all detail pages
4. **Clip Archive Grid** — Media/thumbnail patterns
5. **Celebration Screen** — Emotional personality of the app

---

## Quick Reference: The APIS Aesthetic

### Color Quick Reference
| Use | Color | Hex |
|-----|-------|-----|
| Buttons, CTAs, Active | Sea Buckthorn | #f7a42d |
| Page background | Coconut Cream | #fbf9e7 |
| All text | Brown Bramble | #662604 |
| Card backgrounds | Salomie or White | #fcd483 |

### The Feel

**YES:**
- "My bees are protected" ✓
- Warm honey glow
- Celebrating milestones
- "Hornets prefer 20°C" (insights)
- Big touch targets

**NO:**
- Clinical IoT dashboard ✗
- Dark mode
- Alert-heavy design
- "5 events logged" (just data)
- Tiny buttons

### Typography Hierarchy
- H1: 32px, weight 600
- H2: 24px, weight 600
- H3: 20px, weight 600
- Body: 16px desktop, 18px mobile
- Small: 14px

### Spacing (8px base)
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px

---

*These 5 pages define APIS. Get them right, and the rest follows.*

*Generated for APIS — Anti-Predator Interference System*
