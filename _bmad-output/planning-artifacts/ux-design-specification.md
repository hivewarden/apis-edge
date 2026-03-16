---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-core-experience
  - step-04-emotional-response
  - step-05-inspiration
  - step-06-design-system
  - step-07-defining-experience
  - step-08-visual-foundation
  - step-09-design-directions
inputDocuments:
  - prd.md
  - architecture.md
  - CLAUDE.md
  - honeybeegood-home-style
workflowType: ux-design
project_name: APIS - Anti-Predator Interference System
user_name: Jermoo
date: 2026-01-22
designReference:
  source: honeybeegood.be
  colors:
    sea-buckthorn: '#f7a42d'
    coconut-cream: '#fbf9e7'
    brown-bramble: '#662604'
    salomie: '#fcd483'
  typography: system-ui stack
  style: warm, natural, honey-themed
---

# UX Design Specification — APIS Dashboard

**Author:** Jermoo
**Date:** 2026-01-22
**Design Reference:** Honey Beegood home page style

---

## Executive Summary

### Project Vision

APIS Dashboard provides beekeepers with confident, at-a-glance monitoring of their hornet detection and deterrent system. The interface prioritizes trust and simplicity — users should feel their hives are protected without needing to understand the underlying technology. When incidents occur, the dashboard tells a clear story: what happened, when, and what the system did about it.

### Target Users

**Primary: Jermoo (Project Creator)**
- Beekeeper with 2 hives, no electronics background
- Needs confidence the system is working
- Will review incidents to validate laser deterrence effectiveness

**Secondary: Open Source Community**
- Hobbyist beekeepers across Europe affected by Asian hornets
- Varying technical skill; need intuitive, low-configuration experience
- Access from multiple devices (phone in field, laptop at home)

### Key Design Challenges

| Challenge | UX Impact |
|-----------|-----------|
| **Glanceability vs. Depth** | Dashboard home must communicate status in 2 seconds; incident detail must support careful review |
| **Intermittent Attention** | Critical alerts must be visually persistent; "nothing happened" should feel reassuring, not empty |
| **Trust & Confidence** | Users protecting living creatures; system must communicate reliability through design |
| **Technical Simplicity** | Avoid IoT jargon; use beekeeper-friendly language |
| **Multi-Device Access** | Responsive design essential; touch-friendly for phone use near hives |

### Design Opportunities

| Opportunity | Approach |
|-------------|----------|
| **Warm, Natural Aesthetic** | Apply Honey Beegood color palette (honey gold, warm cream, deep brown) for emotional connection |
| **"All is Well" State** | Design idle state that actively communicates protection (not just "no data") |
| **Incident Storytelling** | Structure events as narratives with clear timeline and outcome |
| **Seasonal Awareness** | Consider hornet season context in information hierarchy |

### Design Reference

**Source:** Honey Beegood home page

**Color Palette:**
- Sea Buckthorn (`#f7a42d`) — Primary accent, CTAs
- Coconut Cream (`#fbf9e7`) — Background
- Brown Bramble (`#662604`) — Text, dark sections
- Salomie (`#fcd483`) — Secondary accent, cards

**Typography:** System UI font stack

**Style:** Warm, natural, soft corners, subtle shadows

---

## Core User Experience

### Defining Experience

**Two-Phase Usage Model:**

| Phase | When | Focus | Video Role |
|-------|------|-------|------------|
| **Validation** | First 3 days | Verify system works | Primary — watch clips |
| **Ongoing** | Rest of season | Learn patterns, monitor trends | Archive — accessible but secondary |

**Core Loop (Ongoing Phase):**
1. Quick status glance — weather + today's count
2. Pattern exploration — when/why do hornets come?
3. Occasional clip review — verify specific incidents

The dashboard is primarily a **learning tool** — helping beekeepers understand hornet behavior patterns at their specific location. Video clips validate the system initially but become archive material for ongoing use.

### Platform Strategy

**Target:** Responsive web dashboard (React + Refine + Ant Design)

| Platform | Priority | Notes |
|----------|----------|-------|
| Desktop browser | Primary | Pattern analysis, detailed charts |
| Mobile browser | Secondary | Quick status check in field |

**Chart Library:** `@ant-design/charts` (Ant Design Pro)

Ready-made components styled with Honey Beegood colors — no custom chart development needed.

### Time Range Selector

**Global control affecting all charts:**

```
┌───────────────────────────────────────────────────────┐
│  [Day]  [Week]  [Month]  [Season]  [Year]  [All Time] │
└───────────────────────────────────────────────────────┘
```

**Component:** Ant Design `Segmented` control

| Range | Shows |
|-------|-------|
| **Day** | Today's activity (or pick specific day) |
| **Week** | This week aggregated / compared to previous |
| **Month** | Monthly patterns, daily averages |
| **Season** | Full hornet season overview (Aug-Nov) |
| **Year** | Year-over-year comparison |
| **All Time** | Complete historical data since installation |

All visualizations update together when range changes — unified time context across dashboard.

### Primary Dashboard Content

**Daily Glance (top of page):**
- Current weather (temp, conditions)
- Today's count ("5 hornets deterred today")
- Device status (online/armed)

**Pattern Insights (main content):**

| Insight | Ant Design Chart | What Users Learn |
|---------|------------------|------------------|
| **Activity Clock** | `Radar` or `Rose` (24hr polar) | When hornets come by hour — clock-face visualization |
| **Temperature correlation** | `Scatter` | Activity vs temperature — "they prefer 18-22°C" |
| **Daily/weekly trend** | `Line` or `Area` | Detection patterns over time |
| **Weather overlay** | Custom with icons | Sunny vs cloudy day comparison |

**Hero Visualization — Activity Clock:**
```
              12:00
                ▲
          11  / | \  13
            /  |  \
       10 /    |    \ 14
         |     ●     |
    09 ──|───────────|── 15
         |           |
        8 \         / 16
            \     /
          7  \   /  17
              \ /
              18:00

Radius = detection count per hour
Bigger bulge = more hornet activity
```

**Clip Archive (accessible but secondary):**
- Recent clips list
- Date filter/search
- Easy access for validation phase users

### Effortless Interactions

| Interaction | Target Experience |
|-------------|-------------------|
| Status check | Weather + count in 2 seconds |
| Time range switch | One tap, all charts update |
| Pattern browsing | Scroll through insight cards |
| Clip access | Clear path but not dominant |

### Critical Success Moments

1. **First Insight** — User learns something ("Oh, they come when it's warm!")
2. **Pattern Recognition** — Charts reveal behavior not obvious from raw data
3. **Validation Complete** — User trusts system, shifts to pattern mode
4. **Seasonal Summary** — End of season: "This is what happened at my hive"

### Experience Principles

1. **Learning Over Logging** — Dashboard teaches, not just records
2. **Trust at a Glance** — Status in 2 seconds, insights when curious
3. **Warm Data Viz** — Charts in Honey Beegood colors, not clinical
4. **Accessible Archive** — Clips available but not the focus
5. **Beekeeper Insights** — "Hornets prefer 20°C" not "mean temp: 20.3°C"

---

## Desired Emotional Response

### Primary Emotional Goal

**Reassured confidence** — "My bees are protected, and I understand what's happening."

Not anxious monitoring. Not clinical data analysis. Calm confidence that the system is working and teaching users something useful about hornet behavior at their specific location.

### Emotional Journey

| Stage | Desired Feeling |
|-------|-----------------|
| **First visit** | "This is friendly, I can understand this" |
| **Status check** | "All good, my hives are protected" |
| **Pattern exploration** | "Interesting! I'm learning something" |
| **Incident occurs** | "I see what happened, system handled it" |
| **Device offline** | "Something needs attention" (not panic) |
| **End of season** | "I understand my hive's hornet pressure now" |

### Micro-Emotions

**Emotions to Cultivate:**

| Emotion | Why It Matters |
|---------|----------------|
| **Confidence** | System is reliable, no need to worry |
| **Curiosity** | Invites exploration of patterns |
| **Trust** | Bees are being protected |
| **Warmth** | Emotional connection to beekeeping |
| **Calm** | No stress, gentle monitoring |
| **Accomplishment** | Learning something valuable |

**Emotions to Avoid:**

| Emotion | How We Prevent It |
|---------|-------------------|
| **Anxiety** | No flashing alerts, calm status display |
| **Overwhelm** | Focused insights, not raw data dumps |
| **Skepticism** | Clear feedback when system acts |
| **Frustration** | Intuitive navigation, obvious actions |
| **Clinical coldness** | Warm colors, natural aesthetic |

### Emotion → Design Implications

| Emotion | UX Approach |
|---------|-------------|
| **Confidence** | Clear status indicators, prominent "All is well" states |
| **Curiosity** | Inviting charts with discoverable insights |
| **Trust** | Consistent behavior, honest empty states, visible activity |
| **Warmth** | Honey Beegood palette, soft rounded corners, natural feel |
| **Calm** | Gentle color transitions, no jarring alerts |
| **Accomplishment** | Insights framed as learnings ("Hornets prefer warm afternoons") |

### Emotional Design Principles

1. **Protection, Not Surveillance** — Frame as guardian, not monitor
2. **Learning, Not Logging** — Insights users can act on or remember
3. **Gentle Alerts** — Inform without alarming
4. **Honest States** — "No detections" is good news, show it warmly
5. **Natural Rhythm** — Design mirrors beekeeping's seasonal patience

---

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

**Primary Visual Inspiration: Honey Beegood**
- Warm honey color palette applied to dashboard
- Soft rounded corners, subtle shadows
- Natural, friendly aesthetic vs clinical IoT

**Component Framework: Ant Design Pro**
- Pre-built chart components (`@ant-design/charts`)
- Proven dashboard layouts
- Responsive design patterns
- Styled with custom Honey Beegood theme

**Interaction Inspiration: Weather Apps**
- Glanceable status (weather-like simplicity)
- Time-based data visualization
- "At a glance" information hierarchy

### Transferable UX Patterns

| Pattern | Source | Application in APIS |
|---------|--------|---------------------|
| Segmented time control | Common in analytics | Day/Week/Month/Season/Year/All Time toggle |
| Polar/radial charts | Data viz best practice | Activity Clock (24hr hornet pattern) |
| Status cards | Dashboard standard | Device status, today's count |
| Map integration | Location apps | Nest radius estimation (unique feature) |

### Unique APIS Features

**Activity Clock (24-hour polar chart):**
- Clock-face visualization of hourly hornet activity
- Instantly shows peak activity times
- Natural metaphor for time-of-day patterns

**Nest Radius Estimator (map feature):**
- Optional local map centered on hive location
- Calculates estimated nest distance from hornet timing patterns
- Hornet departure/return timing → flight distance estimate (~20-25 km/h)
- Displays radius circle showing probable nest location
- Helps beekeepers locate and report nests
- User enables map, sets hive GPS location, system calculates over time

```
┌─────────────────────────────────┐
│         ╭───────────╮           │
│        ╱             ╲          │
│       │    ~350m      │         │
│       │   estimated   │         │
│       │     [HIVE]    │         │
│        ╲             ╱          │
│         ╰───────────╯           │
│                                 │
│   Nest likely within 350m       │
│   based on 42 observations      │
└─────────────────────────────────┘
```

### Anti-Patterns to Avoid

| Anti-Pattern | Why Avoid | Our Approach |
|--------------|-----------|--------------|
| Data dumps | Overwhelms users | Curated insights |
| Flashing alerts | Creates anxiety | Gentle status updates |
| Technical jargon | Alienates beekeepers | Plain language |
| Complex configuration | Frustrating setup | Sensible defaults |
| Tiny mobile targets | Touch frustration | Large tap targets |

### Design Inspiration Strategy

**Adopt:**
- Ant Design Pro chart components
- Honey Beegood color theming
- Weather-app glanceability

**Create (Unique to APIS):**
- Activity Clock visualization
- Nest Radius Map feature
- Beekeeper-friendly data framing

**Avoid:**
- Generic IoT dashboard aesthetics
- Over-engineering visualizations
- Technical language in UI

---

## Design System Foundation

### Ant Design Theme Configuration

**Base:** Ant Design 5.x with ConfigProvider theme override

**Honey Beegood Token Mapping:**

```javascript
const apisTheme = {
  token: {
    colorPrimary: '#f7a42d',      // Sea Buckthorn
    colorBgContainer: '#fbf9e7',   // Coconut Cream
    colorText: '#662604',          // Brown Bramble
    colorBgElevated: '#fcd483',    // Salomie
    borderRadius: 8,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  components: {
    Card: {
      colorBgContainer: '#fcd483',
      borderRadiusLG: 12,
    },
    Button: {
      colorPrimary: '#f7a42d',
      algorithm: true,
    },
    Segmented: {
      colorBgLayout: '#fbf9e7',
      colorText: '#662604',
    },
  },
};
```

### Chart Color Scheme

**@ant-design/charts palette override:**

| Chart Element | Color | Usage |
|---------------|-------|-------|
| Primary data | `#f7a42d` | Main series, active state |
| Secondary data | `#fcd483` | Comparison, hover state |
| Background | `#fbf9e7` | Chart background |
| Text/labels | `#662604` | Axis labels, tooltips |
| Grid lines | `#662604` @ 10% | Subtle grid |

---

## Multi-Device Architecture

### Data Hierarchy

```
User Account
└── Sites (physical locations)
    └── Site "Home Apiary" (GPS location)
        ├── Unit A (APIS device) → covers Hives 1, 2, 3
        └── Unit B (APIS device) → covers Hives 4, 5
```

### Entity Definitions

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| **Site** | Physical location (apiary) | Name, GPS coords, timezone |
| **Unit** | Single APIS hardware device | Serial number, assigned hives |
| **Hive** | Individual beehive | Name/number, queen info, notes |

### Dashboard Scope Controls

```
┌─────────────────────────────────────────────────────────┐
│ [Site: Home Apiary ▼]  [Unit: All ▼]  [Hive: All ▼]    │
├─────────────────────────────────────────────────────────┤
│ [Day]  [Week]  [Month]  [Season]  [Year]  [All Time]   │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Site selector → filters all data to that location
- Unit selector → "All" aggregates, or specific unit data
- Hive selector → available when viewing inspections/sensor data
- Time range → applies to all visible charts

### Nest Radius Map (Per-Site Aggregation)

- Map shows **site-level** nest radius estimation
- Aggregates observations from **all units** at that site
- More units = more observations = better estimate
- Each site has its own map with its GPS center point

---

## Hive Diary Module

### Purpose

Full hive inspection tracking — what every beekeeper already does on paper, digitized with APIS integration.

### Information Architecture

```
Site
└── Hive
    └── Inspections (chronological log)
        ├── Inspection 2026-01-22
        │   ├── Queen status
        │   ├── Brood assessment
        │   ├── Stores
        │   ├── Issues found
        │   ├── Actions taken
        │   ├── Notes
        │   └── Photos
        └── Inspection 2026-01-15
            └── ...
```

### V1 Inspection Form

**Quick-entry fields optimized for field use:**

| Section | Fields | Input Type |
|---------|--------|------------|
| **Queen** | Seen / Eggs / Q-cells | Toggles (3) |
| **Brood** | Amount (frames) + Pattern | Stepper + Select |
| **Stores** | Honey / Pollen | Low/Med/High each |
| **Space** | Tight/OK/Plenty + Needs super? | Select + Toggle |
| **Varroa** | Estimate | Low/Med/High |
| **Temperament** | Calm/Nervous/Defensive | Select |
| **Issues** | DWV, Chalkbrood, Wax moth, AFB | Checkboxes |
| **Actions** | +Super, Fed, Treated | Checkboxes |
| **Notes** | Free text | Text area (voice input) |
| **Photos** | Attach images | Camera/Library picker |

### Frame-Level Tracking

**Per-box frame inventory:**

| Field | Description | Input |
|-------|-------------|-------|
| **Total frames** | How many frames in this box | Number (e.g., 10) |
| **Drawn comb** | Frames with comb built | Number |
| **Brood frames** | Frames with brood | Number |
| **Honey frames** | Frames with capped honey | Number |
| **Pollen frames** | Frames with pollen stores | Number |
| **Empty/foundation** | Frames not yet drawn | Auto-calculated |

**Quick entry UI:**

```
┌────────────────────────────────────────────────────────────┐
│  Brood Box 1 — Frame Count                                 │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Total frames in box:  [10]                                │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Drawn comb    [  8  ]  ████████░░                  │   │
│  │  Brood         [  6  ]  ██████░░░░                  │   │
│  │  Honey         [  2  ]  ██░░░░░░░░                  │   │
│  │  Pollen        [  1  ]  █░░░░░░░░░                  │   │
│  │  Empty         [  2  ]  (auto: 10 - 8 drawn)        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                            │
│  Note: Brood + Honey can overlap on same frame             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Frame Data Over Time — Graphs

**Seasonal progression chart:**

```
┌────────────────────────────────────────────────────────────┐
│  Hive 3 — Frame Development (2026 Season)                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  20 ┤                                    ╭──── Honey       │
│     │                              ╭─────╯                 │
│  15 ┤                        ╭─────╯                       │
│     │                  ╭─────╯                             │
│  10 ┤      ╭───────────╯          ╭──────────── Brood     │
│     │ ╭────╯                 ╭────╯                        │
│   5 ┤─╯ Brood           ─────╯                             │
│     │                                                      │
│   0 ┼────┬────┬────┬────┬────┬────┬────┬────┬────┬────    │
│       Apr  May  Jun  Jul  Aug  Sep  Oct  Nov               │
│                                                            │
│  ● Brood frames  ● Honey frames  ○ Total drawn comb       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**What the graph reveals:**
- Spring buildup: brood expands rapidly
- Peak season: honey accumulates as brood peaks
- Late season: brood shrinks, honey dominates
- Winter prep: mostly honey stores, minimal brood

**Year-over-year comparison:**

```
┌────────────────────────────────────────────────────────────┐
│  Hive 3 — Frame Data: 2025 vs 2026                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Peak brood frames:    2025: 8    2026: 11  (+38%)        │
│  Peak honey frames:    2025: 12   2026: 15  (+25%)        │
│  Season start (>5 brood): Apr 20 → Apr 8  (12 days earlier)│
│                                                            │
│  [View full comparison chart]                              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Long-term data retention:**
- All frame counts stored permanently
- Queryable for any date range
- Exportable for external analysis
- BeeBrain uses for pattern detection

### Inspection Flow (Mobile)

```
┌─────────────────┐
│  Select Hive    │  ← Or scan QR
└────────┬────────┘
         ▼
┌─────────────────┐
│   Quick Entry   │  ← Swipe cards: Queen → Brood → Stores → ...
│   [Card 1/7]    │
│    ◀ SWIPE ▶    │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Notes + Photos │  ← Voice input available
└────────┬────────┘
         ▼
┌─────────────────┐
│     Review      │  ← Summary before save
│     [Save]      │
└─────────────────┘
```

### Desktop View

- Full inspection history table
- Side-by-side comparison of inspections
- Export to CSV/PDF for records
- Search/filter by date, issues, actions

---

## Glove-Friendly Mobile UX

### Design Constraints

Beekeepers wear gloves that reduce touch precision. Design must accommodate:

| Standard Mobile | APIS Mobile |
|-----------------|-------------|
| 44px tap targets | **64px minimum** tap targets |
| Small checkboxes | Large toggle switches |
| Keyboard input | Voice input + large buttons |
| Precise gestures | Swipe-based navigation |

### Touch Target Specifications

```
┌────────────────────────────────────┐
│                                    │
│   ┌──────────────────────────┐     │
│   │                          │     │
│   │     64px × 64px min      │     │  ← All interactive elements
│   │                          │     │
│   └──────────────────────────┘     │
│                                    │
│        16px minimum gap            │  ← Between targets
│                                    │
└────────────────────────────────────┘
```

### Interaction Patterns

| Interaction | Implementation |
|-------------|----------------|
| **Selection** | Large cards with full-surface tap |
| **Binary choice** | Big toggle switches, not checkboxes |
| **Multi-select** | Full-width option bars |
| **Navigation** | Horizontal swipe between cards |
| **Text input** | Voice button prominent, keyboard secondary |
| **Confirmation** | Bottom-anchored large buttons |

### Bottom-Anchored Actions

```
┌────────────────────────────────────┐
│                                    │
│         [Content Area]             │
│                                    │
│                                    │
├────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │          SAVE                │  │  ← 64px height, full width
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

---

## Voice Input Strategy

### Purpose

Replace typing in the field — notes and observations via speech.

### Implementation Options

| Option | Accuracy | Offline | Size | Latency |
|--------|----------|---------|------|---------|
| **Native Dictation** | Good | ❌ | 0 | Low |
| **Server Whisper** | Best | ❌ | 0 | Medium |
| **Local Whisper WASM** | Best | ✅ | ~1.5GB | Medium |

### User Choice Model

```
Settings → Voice Input
┌─────────────────────────────────────────┐
│ Voice Transcription                     │
├─────────────────────────────────────────┤
│ ○ Native (iOS/Android dictation)        │
│   Lightweight, requires signal          │
│                                         │
│ ○ Server (APIS Whisper)                 │
│   Best accuracy, requires server        │
│                                         │
│ ● Offline (Local Whisper)               │
│   Best accuracy, works offline          │
│   [Download Model — 1.5GB]              │
│   ✓ Downloaded                          │
└─────────────────────────────────────────┘
```

### Voice UI Component

```
┌────────────────────────────────────┐
│  Notes                             │
│  ┌──────────────────────────────┐  │
│  │ Queen seen on frame 4,       │  │
│  │ good laying pattern...       │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌────────────┐  ┌──────────────┐  │
│  │  🎤 SPEAK  │  │   Keyboard   │  │  ← Voice button prominent
│  └────────────┘  └──────────────┘  │
└────────────────────────────────────┘
```

---

## Offline-First Architecture (PWA)

### Requirements

Beekeepers often have poor signal at apiaries. The app must:
1. Load without network (cached app shell)
2. Save inspections locally when offline
3. Sync automatically when connection returns
4. Never lose data

### Technical Architecture

```
┌─────────────────────────────────────────────┐
│              Phone Browser (PWA)            │
├─────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │  Service Worker │  │   IndexedDB      │  │
│  │  (app shell)    │  │   (Dexie.js)     │  │
│  └────────┬────────┘  └────────┬─────────┘  │
│           │                    │            │
│           │    ┌───────────────┘            │
│           ▼    ▼                            │
│  ┌─────────────────────────────────────┐    │
│  │         Sync Queue                  │    │
│  │   [Inspection] [Inspection] [...]   │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
                    │
                    │ Background Sync (when online)
                    ▼
           ┌───────────────┐
           │  APIS Server  │
           └───────────────┘
```

### Offline Capabilities

| Feature | Offline Behavior |
|---------|------------------|
| **View dashboard** | Cached data from last sync |
| **Create inspection** | Saved locally, queued for sync |
| **View past inspections** | Cached locally |
| **Voice transcription** | Local Whisper (if downloaded) |
| **Photos** | Stored locally, synced later |
| **View clips** | Only cached clips available |

### Sync Status Indicator

```
┌────────────────────────────────────┐
│ ⚡ Offline — 3 inspections pending │  ← Persistent banner
└────────────────────────────────────┘
```

```
┌────────────────────────────────────┐
│ ✓ Synced                          │  ← Dismisses after 3s
└────────────────────────────────────┘
```

---

## QR Code Navigation

### Purpose

Large apiaries (50+ hives) need fast hive selection. QR codes enable instant navigation.

### User Flow

```
┌─────────────────┐        ┌─────────────────┐
│  Hive List      │        │  QR on Hive     │
│  (scrolling...) │   OR   │  [=========]    │
│  Hive 47...     │        │  [  scan   ]    │
└─────────────────┘        └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │ Hive 47 Details │
                           │ [New Inspection]│
                           └─────────────────┘
```

### QR Code Content

```
apis://hive/{site_id}/{hive_id}

Example: apis://hive/abc123/hive-47
```

### QR Generation

- Dashboard provides printable QR codes for each hive
- Print → laminate → attach to hive
- Includes human-readable hive name below QR

### Scanner UI

```
┌────────────────────────────────────┐
│  ┌──────────────────────────────┐  │
│  │                              │  │
│  │      [Camera Viewfinder]     │  │
│  │                              │  │
│  │         ┌────────┐           │  │
│  │         │ target │           │  │
│  │         └────────┘           │  │
│  │                              │  │
│  └──────────────────────────────┘  │
│                                    │
│     Point at hive QR code          │
│                                    │
│     [Cancel]                       │
└────────────────────────────────────┘
```

---

## Photo Management

### Capabilities

| Action | Description |
|--------|-------------|
| **Attach from camera** | Take photo during inspection |
| **Attach from library** | Select existing photo |
| **View attached** | Thumbnail grid on inspection |
| **Delete photo** | Remove before or after save |
| **Full-screen view** | Tap to enlarge |

### Photo UI in Inspection

```
┌────────────────────────────────────┐
│  Photos (3)                        │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐      │
│  │ 📷 │ │ 📷 │ │ 📷 │ │ +  │      │  ← Thumbnails + Add button
│  │ ✕  │ │ ✕  │ │ ✕  │ │    │      │  ← Delete overlay
│  └────┘ └────┘ └────┘ └────┘      │
└────────────────────────────────────┘
```

### Delete Confirmation

```
┌────────────────────────────────────┐
│                                    │
│      Delete this photo?            │
│                                    │
│  ┌──────────────────────────────┐  │
│  │         [Photo]              │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌────────────┐  ┌──────────────┐  │
│  │   Cancel   │  │    Delete    │  │  ← 64px buttons
│  └────────────┘  └──────────────┘  │
└────────────────────────────────────┘
```

### Offline Photo Handling

- Photos stored in IndexedDB as blobs
- Compressed before storage (max 1920px, 80% JPEG)
- Synced to server when online
- Server stores original, serves optimized

---

## Future: Per-Hive Sensor Dashboard

### Planned Sensors

| Sensor | Data | Insight |
|--------|------|---------|
| **Inside temp** | °C continuous | Brood health, winter cluster |
| **Outside temp** | °C continuous | Weather correlation |
| **Humidity** | % continuous | Moisture/ventilation |
| **Weight** | kg continuous | Nectar flow, stores |
| **Sound** | Frequency analysis | Queen status, swarming |

### Per-Hive Sensor View

```
┌────────────────────────────────────────────────┐
│  Hive 3 — Sensors                              │
├────────────────────────────────────────────────┤
│  [Day] [Week] [Month] [Season] [Year] [All]    │  ← Same time selector
├────────────────────────────────────────────────┤
│                                                │
│  Temperature                                   │
│  ┌──────────────────────────────────────────┐  │
│  │  Inside: ████████████  35°C              │  │
│  │  Outside: ████████  22°C                 │  │
│  │  [Line chart over time]                  │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Weight                                        │
│  ┌──────────────────────────────────────────┐  │
│  │  Current: 42.3 kg                        │  │
│  │  [Area chart showing gains/losses]       │  │
│  │  +2.1 kg this week (nectar flow!)        │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Humidity                                      │
│  ┌──────────────────────────────────────────┐  │
│  │  Inside: 65%  |  Ideal range: 50-70%     │  │
│  └──────────────────────────────────────────┘  │
│                                                │
└────────────────────────────────────────────────┘
```

### Insight Generation

| Data Pattern | Beekeeper Insight |
|--------------|-------------------|
| Weight +3kg overnight | "Strong nectar flow — consider adding super" |
| Inside temp drop | "Cluster may have shrunk — check stores" |
| Humidity >80% | "Ventilation issue — check entrance" |
| Sound frequency shift | "Queen may be failing — schedule inspection" |

### Integration with Inspections

- Sensor data visible when creating inspection
- "At time of inspection" snapshot saved
- Historical correlation: "Last inspection weight was 38kg"

---

## Defining Experience (Revised)

### The Core Vision

> **"One place, one timeline: see your hive's full story — weather, hornets, sensors, inspections — all connected."**

The defining experience isn't "hornet protection" OR "inspection recording." It's **correlation** — understanding what's happening to your hive through connected data.

### What Users Tell Friends

> *"I finally UNDERSTAND my hive. Turns out hornets come on warm afternoons, the bees get loud, and if I check the weight I can see they're eating more stores those days. It's all right there."*

### The Magic Moment

User discovers a correlation they never noticed before — "I didn't know that!" becomes "Now I SEE it."

**Example insight:**
- On a sunny day there were lots of hornets
- AND the hive was making high-pitched noise
- The bees KNEW something was happening
- Late season: heavy hive, low hornet pressure = they're preparing well

### Success Criteria

| Interaction | Success Indicator |
|-------------|-------------------|
| Dashboard glance | Status understood in <2 seconds |
| Pattern discovery | User says "I didn't know that!" |
| Field inspection | Complete in <3 minutes with gloves |
| Voice notes | Transcription requires no corrections |
| Offline sync | Zero data loss, ever |

---

## Feature Architecture

### UI Modes (Not Paywalls)

```
┌─────────────────────────────────────────────────────────────┐
│  HOBBY (Default)                                            │
│  Everything a beekeeper needs                               │
│  • All features accessible                                  │
│  • Multi-site support ✓                                     │
│  • API access ✓ (open source)                               │
│  • BeeBrain AI ✓                                            │
│  • Clean, simple UI by default                              │
│  • Advanced features reveal contextually                    │
├─────────────────────────────────────────────────────────────┤
│  ENTERPRISE (UI Mode toggle)                                │
│  For 50+ hive operations                                    │
│  • Same features, denser UI                                 │
│  • Bulk operations                                          │
│  • Team/staff views                                         │
│  • Compliance report generators                             │
│  • Table-heavy layouts for data management                  │
└─────────────────────────────────────────────────────────────┘
```

### Module Toggle System

Users can enable specific advanced features without switching to Enterprise mode:

```
┌────────────────────────────────────────────────────────────┐
│  Settings → Features                                       │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  UI Mode                                                   │
│  ○ Simple (recommended for <10 hives)                      │
│  ● Standard                                                │
│  ○ Enterprise (dense tables, bulk operations)              │
│                                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                            │
│  Optional Modules              [Enable what you want]      │
│                                                            │
│  ☑ Queen Genetics & Lineage                                │
│  ☐ Financial Tracking                                      │
│  ☐ Compliance Reports                                      │
│  ☑ Swarm Predictions                                       │
│  ☐ Team/Staff Access                                       │
│  ☐ Pollination Contracts                                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Philosophy:** Hobby beekeeper into genetics? Check that one box. Everything else stays clean.

---

## Hive Structure Tracking

### Box Configuration

Beekeepers need to track brood boxes and honey supers:

```
┌────────────────────────────────────────────────────────────┐
│  Hive 3 — Configuration                                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────┐                                      │
│  │   Honey Super    │  ← Added June 15                     │
│  ├──────────────────┤                                      │
│  │   Honey Super    │  ← Added May 20                      │
│  ├──────────────────┤                                      │
│  │   Brood Box      │  ← Main brood chamber                │
│  ├──────────────────┤                                      │
│  │   Brood Box      │  ← Added April 10                    │
│  └──────────────────┘                                      │
│       ══════════                                           │
│       [Bottom Board]                                       │
│                                                            │
│  Structure: 2 brood + 2 supers                             │
│  [+ Add Box]  [- Remove Box]  [Edit History]               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Hive Data Model

| Field | Type | Notes |
|-------|------|-------|
| Hive name/number | Text | "Hive 3" |
| Queen age | Date | When introduced |
| Queen source | Text | Breeder, swarm, split, etc. |
| Brood boxes | Number | 1-3 typically |
| Honey supers | Number | 0-5+ depending on flow |
| Box history | Log | When added/removed |
| Current weight | kg | From scale if available |
| Location | Site reference | Which apiary |

---

## BeeBrain — Mini AI Assistant

### Overview

BeeBrain is APIS's built-in AI — a small, purpose-built model that understands beekeeping and YOUR data.

> *"Not a general AI. A beekeeping expert in your pocket."*

### Technical Approach

| Phase | Implementation |
|-------|----------------|
| **MVP** | Rule engine (hardcoded patterns, zero download) |
| **Phase 2** | Mini ML model (~300-500MB, fine-tuned on beekeeping) |
| **Future** | Community learning (anonymized pattern sharing) |

### Per-Section Analysis

BeeBrain provides contextual analysis in each section of the app:

```
┌────────────────────────────────────────────────┐
│  Financial Overview                            │
├────────────────────────────────────────────────┤
│  Revenue: €420  |  Costs: €180  |  Net: €240   │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 🧠 BeeBrain Analysis                     │  │
│  │ Last updated: 2 hours ago  [↻ Refresh]   │  │
│  │                                          │  │
│  │ "Your cost per kg of honey is €4.20,     │  │
│  │  which is below average. Hive 2 is your  │  │
│  │  most profitable at €2.80/kg."           │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

```
┌────────────────────────────────────────────────┐
│  Maintenance & Health                          │
├────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────┐  │
│  │ 🧠 BeeBrain Analysis                     │  │
│  │ Last updated: 14 hours ago  [↻ Refresh]  │  │
│  │                                          │  │
│  │ "Hive 1: Healthy, no action needed.      │  │
│  │  Hive 2: Varroa treatment due (92 days). │  │
│  │  Hive 3: Queen aging + stress. Priority."│  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

### Analysis Contexts

| Section | BeeBrain Analyzes |
|---------|-------------------|
| **Dashboard** | Today's summary + any concerns |
| **Hive Detail** | This hive's health + recommendations |
| **Financial** | Profitability per hive, cost analysis |
| **Maintenance** | What needs attention, priority order |
| **Season Review** | Year summary, learnings, prep for next year |
| **Hornet Patterns** | When they come, correlations found |

### Timestamp + Refresh Pattern

- Each analysis shows "Last updated: X ago"
- Refresh button for on-demand re-analysis
- Runs async — on slow hardware, may queue overnight
- No one left behind regardless of device capability

### Proactive Insights

BeeBrain doesn't just wait for questions — it surfaces insights:

```
┌────────────────────────────────────────────────┐
│  Hive 3                                        │
├────────────────────────────────────────────────┤
│  💡 BeeBrain noticed:                          │
│                                                │
│  "Queen is entering her 3rd year and           │
│   productivity dropped 23% vs last season.     │
│   Consider requeening in spring."              │
│                                                │
│  [Dismiss]  [Add to reminders]  [Tell me more] │
└────────────────────────────────────────────────┘
```

---

## Configurable Export System

### Dual Purpose Export

| Purpose | Use Case |
|---------|----------|
| **Human-readable** | Post on Reddit, forums, bee club |
| **Machine-readable** | Paste into ChatGPT, Claude, etc. |

### Export Configuration UI

```
┌────────────────────────────────────────────────────────────┐
│  Export Hive Data                                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Select hive(s): [Hive 3 ▼]  or  [☑ All hives]            │
│                                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                            │
│  What to include:                                          │
│                                                            │
│  BASICS                          DETAILS                   │
│  ☑ Hive name                     ☐ Full inspection log     │
│  ☑ Queen age                     ☐ Hornet detection data   │
│  ☑ Boxes (brood + supers)        ☐ Weight history          │
│  ☑ Current weight                ☐ Weather correlations    │
│  ☐ Location/GPS                  ☐ Sound data              │
│                                                            │
│  ANALYSIS                        FINANCIAL                 │
│  ☐ BeeBrain insights             ☐ Costs                   │
│  ☐ Health summary                ☐ Harvest revenue         │
│  ☐ Season comparison             ☐ ROI per hive            │
│                                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                            │
│  Format:                                                   │
│  ● Quick summary (for forums)                              │
│  ○ Detailed markdown (for AI)                              │
│  ○ Full JSON (for nerds)                                   │
│                                                            │
│  [Preview]  [Copy to Clipboard]  [Download]                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Export Examples

**Quick Summary (basics only):**
```
Hive 3 — Quick Summary
• Queen: 2 years old (local breeder)
• Setup: 2 brood boxes + 2 honey supers
• Weight: 28.1 kg
```

**Forum Post (basics + health):**
```
Hey r/beekeeping, question about my Hive 3:

Setup: 2 brood + 2 supers, queen is 2 years old
Current weight: 28kg
This season: 18kg harvested, 87 hornets deterred

Recent inspections noted defensive behavior 4x.
BeeBrain suggests queen may be aging.

Should I requeen now or wait for spring?
```

**Full JSON (everything):**
```json
{
  "hive": "Hive 3",
  "queen": { "age_years": 2, "source": "local breeder" },
  "structure": { "brood_boxes": 2, "honey_supers": 2 },
  "weight_kg": 28.1,
  "season_2026": {
    "harvested_kg": 18,
    "hornets_deterred": 87,
    "inspections": 12
  }
}
```

---

## Emotional Moments

### Celebrating Milestones

Beekeeping is emotional. The app acknowledges significant moments:

| Moment | App Response |
|--------|--------------|
| **First harvest** | 🎉 Celebration screen + photo prompt + yield tracker |
| **Successful overwintering** | 📊 Winter report — what worked, survival rate |
| **Swarm capture** | 🐝 "New hive" quick-add with source tracking |
| **Queen introduction** | 👑 Queen profile creation wizard |

### Acknowledging Losses

| Moment | App Response |
|--------|--------------|
| **Losing a hive** | 📝 "Post-mortem" wizard — record what happened, learn for next time |
| **Failed queen** | Guided replacement workflow |
| **Poor season** | Year review with "what to try next year" |

### Season Recap

End-of-year summary that beekeepers will want to share:

```
┌────────────────────────────────────────────────┐
│  🐝 2026 Season Recap: Hive 3                  │
├────────────────────────────────────────────────┤
│                                                │
│  Started spring at 12kg                        │
│  First honey flow: April 15 (+8kg in 2 weeks)  │
│  Hornet pressure: 47 deterred (peak September) │
│  You harvested 18kg across 3 extractions       │
│  Survived winter ✓                             │
│                                                │
│  [Share]  [Export]  [View Details]             │
│                                                │
└────────────────────────────────────────────────┘
```

---

## Treatment & Feeding Logs

### Feeding Tracking

| Field | Options |
|-------|---------|
| **Date** | When fed |
| **Hive** | Which hive(s) |
| **Feed type** | Sugar syrup, Fondant, Pollen patty, Pollen substitute, Honey, Custom... |
| **Amount** | kg or liters |
| **Concentration** | 1:1, 2:1, etc. (for syrup) |
| **Notes** | Observations |

### Varroa Treatment Tracking

| Field | Options |
|-------|---------|
| **Date** | When applied |
| **Hive** | Which hive(s) |
| **Treatment type** | Oxalic acid, Formic acid, Apiguard, Apivar, MAQS, Api-Bioxal, Custom... |
| **Method** | Vaporization, Dribble, Strips, Spray |
| **Dose** | Amount applied |
| **Mite count before** | Optional drop count |
| **Mite count after** | Optional follow-up count |
| **Notes** | Weather conditions, observations |

### Custom Labels System

Users can create their own categories for anything not built-in:

```
┌────────────────────────────────────────────────────────────┐
│  Settings → Custom Labels                                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Feed Types                          [+ Add]               │
│  • Sugar syrup (built-in)                                  │
│  • Fondant (built-in)                                      │
│  • Pollen patty (built-in)                                 │
│  • "My secret protein mix" (custom)           [Edit] [×]   │
│  • "Honey-B-Healthy syrup" (custom)           [Edit] [×]   │
│                                                            │
│  Treatment Types                     [+ Add]               │
│  • Oxalic acid (built-in)                                  │
│  • Formic acid (built-in)                                  │
│  • "Thymol gel strips" (custom)               [Edit] [×]   │
│                                                            │
│  Equipment Types                     [+ Add]               │
│  • "Entrance reducer - small" (custom)        [Edit] [×]   │
│  • "Mouse guard" (custom)                     [Edit] [×]   │
│  • "Robbing screen" (custom)                  [Edit] [×]   │
│                                                            │
│  Issue Types                         [+ Add]               │
│  • DWV (built-in)                                          │
│  • Chalkbrood (built-in)                                   │
│  • "Laying workers" (custom)                  [Edit] [×]   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Treatment Calendar & Reminders

```
┌────────────────────────────────────────────────────────────┐
│  Treatment Schedule                                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Upcoming                                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ⏰ Hive 2: Oxalic acid due in 3 days                 │  │
│  │    Last treatment: 87 days ago                       │  │
│  │    [Mark Done]  [Snooze]  [Skip]                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  History                                                   │
│  • 2026-10-15: Hive 1, 2, 3 — Oxalic acid vaporization    │
│  • 2026-08-01: Hive 2 — Formic acid (MAQS)                │
│  • 2026-07-15: All hives — Mite count (sugar roll)        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Equipment Log

Track what's installed on each hive:

| Equipment | When Added | When Removed | Notes |
|-----------|------------|--------------|-------|
| Entrance reducer | Oct 15 | — | Winter prep |
| Mouse guard | Nov 1 | — | Overwintering |
| Queen excluder | May 10 | Sep 20 | Season use |
| Robbing screen | Aug 5 | Oct 1 | Dearth protection |

---

## Flow Hive Integration

### Harvest Tracking

For Flow Hive users, track honey extraction with precision:

| Field | Data |
|-------|------|
| Date | When extracted |
| Hive | Which hive |
| Frame(s) | Which Flow frames |
| Amount | kg or liters |
| Notes | Quality, color, taste |

### Yield Analytics

- Total harvest per hive per season
- kg per frame performance
- Year-over-year comparison
- Best performing hives identified

---

## Summary: The One Portal Vision

APIS is not just a hornet detector. It's **the beekeeper's portal** — everything beekeeping-related that touches technology, in one place.

| Data Stream | Source | Value |
|-------------|--------|-------|
| Hornet detections | APIS hardware | Know your hives are protected |
| Weather | API | Understand conditions |
| Inspections | Manual entry | Record what you see |
| Harvests | Manual entry | Track your yields |
| Sensors | Future hardware | Continuous monitoring |
| BeeBrain analysis | Mini AI | Understand the patterns |

**The promise:**
> *"If you're going to attach technology to beekeeping, it all goes through one portal. One login, one timeline, one story about your hives."*

---

## Visual Design Foundation

### Color System

**Primary Palette (from Honey Beegood):**

| Token | Hex | Usage |
|-------|-----|-------|
| **Sea Buckthorn** | `#f7a42d` | Primary actions, CTAs, active states |
| **Coconut Cream** | `#fbf9e7` | Page backgrounds, light surfaces |
| **Brown Bramble** | `#662604` | Text, headings, dark elements |
| **Salomie** | `#fcd483` | Cards, elevated surfaces, secondary accent |

**Semantic Color Mapping:**

| Semantic | Color | Hex |
|----------|-------|-----|
| `--color-primary` | Sea Buckthorn | `#f7a42d` |
| `--color-background` | Coconut Cream | `#fbf9e7` |
| `--color-text` | Brown Bramble | `#662604` |
| `--color-surface` | Salomie | `#fcd483` |
| `--color-success` | Forest green | `#2e7d32` |
| `--color-warning` | Amber | `#f9a825` |
| `--color-error` | Deep red | `#c62828` |
| `--color-info` | Blue | `#1976d2` |

### Typography System

**Font Stack:** System UI (fast loading, native feel)

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont,
             'Segoe UI', Roboto, sans-serif;
```

**Type Scale:**

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 | 32px | 600 | 1.2 |
| H2 | 24px | 600 | 1.3 |
| H3 | 20px | 600 | 1.4 |
| Body | 16px | 400 | 1.5 |
| Small | 14px | 400 | 1.5 |
| Caption | 12px | 400 | 1.4 |

**Mobile (Glove Mode):**

| Element | Size | Notes |
|---------|------|-------|
| Body | 18px | Larger for outdoor visibility |
| Buttons | 18px bold | Clear tap targets |
| Labels | 16px | Readable at arm's length |

### Spacing & Layout Foundation

**Base Unit:** 8px

**Spacing Scale:**

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Tight gaps, inline elements |
| `--space-sm` | 8px | Between related elements |
| `--space-md` | 16px | Section padding, card gaps |
| `--space-lg` | 24px | Major sections |
| `--space-xl` | 32px | Page margins |
| `--space-2xl` | 48px | Hero sections |

**Border Radius:**

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Buttons, inputs |
| `--radius-md` | 8px | Cards, panels |
| `--radius-lg` | 12px | Modals, large containers |
| `--radius-full` | 50% | Avatars, icons |

**Layout Principles:**

1. **Warm, not clinical** — Soft corners (8-12px radius), subtle shadows
2. **Breathing room** — Generous padding, content not cramped
3. **Touch-first mobile** — 64px minimum tap targets, 16px gaps

**Desktop Layout: Sidebar Navigation**

```
┌──────────────────────────────────────────────────────────────┐
│ ┌─────────┐                                                  │
│ │ 🐝 APIS │                    Main Content Area             │
│ ├─────────┤                                                  │
│ │         │  ┌────────────────────────────────────────────┐  │
│ │ □ Dash  │  │                                            │  │
│ │ □ Hives │  │   [Site ▼] [Hive ▼]    [< Day >] [Week]    │  │
│ │ □ Clips │  │                                            │  │
│ │ □ Stats │  │   ┌─────────┐ ┌─────────┐ ┌─────────┐     │  │
│ │         │  │   │ Weather │ │ Hornets │ │ Hardware│     │  │
│ │         │  │   └─────────┘ └─────────┘ └─────────┘     │  │
│ │         │  │                                            │  │
│ │         │  │   ┌─────────────────────────────────┐     │  │
│ │         │  │   │      Activity Clock / Charts    │     │  │
│ │         │  │   └─────────────────────────────────┘     │  │
│ ├─────────┤  │                                            │  │
│ │ ⚙ Set.  │  └────────────────────────────────────────────┘  │
│ │ 👤 User │                                                  │
│ └─────────┘                                                  │
└──────────────────────────────────────────────────────────────┘
```

**Sidebar Contents:**
- Logo + app name (top)
- Main navigation (Dashboard, Hives, Clips, Statistics, Diary)
- Spacer (pushes bottom items down)
- Settings (bottom)
- User profile card (bottom corner)

**Ant Design Pro Layout:** Use `ProLayout` with `siderWidth` and collapsible sidebar. Refine integrates with this pattern.

### Accessibility Considerations

**Contrast Ratios:**

| Combination | Ratio | WCAG |
|-------------|-------|------|
| Brown Bramble on Coconut Cream | 10.2:1 | AAA ✓ |
| Brown Bramble on Salomie | 7.1:1 | AAA ✓ |
| Sea Buckthorn on Coconut Cream | 2.4:1 | Decorative only |

**Guidelines:**

- Text always in Brown Bramble (`#662604`) for readability
- Sea Buckthorn (`#f7a42d`) only for decorative elements, not text
- Success/Error colors meet 4.5:1 minimum contrast
- Focus states visible and consistent
- Mobile: 18px minimum body text for outdoor use

---

## Design Direction Decision

### Chosen Direction

**Ant Design Pro + Honey Beegood Theme** with sidebar navigation layout.

### Key Elements

| Element | Decision |
|---------|----------|
| **Framework** | Ant Design Pro (ProLayout) + Refine |
| **Layout** | Sidebar navigation (left), content area (right) |
| **Color theme** | Honey Beegood palette via ConfigProvider |
| **Charts** | @ant-design/charts with custom colors |
| **Mobile** | Responsive collapse, glove-friendly mode |

### Design Rationale

1. **Ant Design Pro** provides production-ready dashboard components
2. **Refine** handles data management, CRUD, and API integration
3. **Sidebar layout** is familiar, scalable for growing feature set
4. **Honey Beegood theme** maintains warm, non-clinical feel
5. **ProLayout** supports collapsible sidebar for mobile

### Implementation Approach

- Use Refine's Ant Design preset as base
- Override theme tokens via ConfigProvider
- Customize ProLayout for branding
- Build custom components only where Ant Design lacks (Activity Clock, BeeBrain card)

### Reference Mockup

Visual direction captured in: `_bmad-output/planning-artifacts/apis-dashboard-mockup.html`

Note: Mockup shows concept/feel, not final implementation. Stories will specify exact components and behavior.
