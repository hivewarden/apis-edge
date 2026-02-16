# APIS Dashboard Design Key

> Reference document extracted from v2 mockups (85 designs) for implementation consistency.

---

## Color Palette

### Primary Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Sea Buckthorn** | `#f7a42d` | Primary actions, active states, highlights, CTAs |
| **Sea Buckthorn Dark** | `#d98616` / `#e5931b` | Hover states for primary buttons |
| **Coconut Cream** | `#fbf9e7` | Page background, input backgrounds |
| **Brown Bramble** | `#662604` | Headers, body text, primary text |
| **Salomie** | `#fcd483` | Active nav item background, secondary highlight |

### Secondary/Semantic Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Text Secondary** | `#8a5025` / `#8c7e72` | Muted text, labels, placeholders |
| **Soft Sage** | `#7c9082` | Health/success indicators |
| **Soft Clay** | `#f9f1ec` | Icon backgrounds, subtle containers |
| **Storm Gray** | `#6b7280` | Offline banner background |
| **Pure White** | `#ffffff` | Cards, sidebar, surfaces |
| **Muted Rose** | `#c4857a` | Destructive actions (delete modals) |

### Status Colors
| Status | Background | Text | Border |
|--------|------------|------|--------|
| Active/Healthy | `#E8F5E9` / `#eef5f0` | `#2E7D32` | `border-soft-sage/10` |
| Warning/Pending | `amber-50` | `amber-700` | `amber-100` |
| Error/Failing | `red-100` | `red-800` | - |
| Offline | `#6b7280` | `white` | - |

---

## Typography

### Font Family
```css
font-family: "Inter", "Epilogue", system-ui, -apple-system, sans-serif;
```
- **Inter**: Primary body font (most mockups)
- **Epilogue**: Display/heading alternative (some mockups)
- **Space Grotesk**: Modal headers (confirmation dialogs)

### Type Scale
| Element | Size | Weight | Line Height | Tracking |
|---------|------|--------|-------------|----------|
| H1 (Page Title) | 32px / `text-3xl` | 900 / `font-black` | tight | `-0.03em` |
| H2 (Section Title) | 24px / `text-2xl` | 700 / `font-bold` | tight | `tracking-tight` |
| H3 (Card Title) | 20px / `text-xl` | 700 / `font-bold` | normal | - |
| Body | 16px / `text-base` | 400 / `font-normal` | normal | - |
| Body (Mobile) | 18px | 400 | normal | - |
| Small/Label | 14px / `text-sm` | 500-600 / `font-medium` | normal | - |
| Caption/Meta | 12px / `text-xs` | 600-700 / `font-bold` | normal | `tracking-wider` |
| Uppercase Labels | 11-12px | 700 / `font-bold` | - | `tracking-widest` / `uppercase` |

---

## Spacing System

Base unit: **8px**

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight gaps |
| `sm` | 8px | Between related elements |
| `md` | 16px | Standard component padding |
| `lg` | 24px | Section spacing |
| `xl` | 32px | Large section gaps |
| `2xl` | 48px | Page sections |

### Common Patterns
- **Card padding**: `p-5` to `p-8` (20-32px)
- **Sidebar width**: 240px (`w-[240px]`) or 288px (`w-72`)
- **Page padding**: `px-8` to `px-10` (32-40px)
- **Section gaps**: `gap-6` to `gap-8` (24-32px)
- **Nav item padding**: `px-4 py-3` (16px / 12px)

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-lg` | 8px | Small elements, inputs |
| `rounded-xl` | 12px | Medium containers |
| `rounded-2xl` / `rounded-card` | 16px | **Cards (primary)** |
| `rounded-full` | 9999px | **Nav items, buttons, pills, avatars** |

**Key Pattern**: Navigation items and buttons use `rounded-full` (pill shape), while cards use `rounded-2xl` (16px).

---

## Shadows

```css
/* Soft shadow - cards, sidebar */
box-shadow: 0 4px 20px -2px rgba(102, 38, 4, 0.05);
/* or */
box-shadow: 0 4px 20px rgba(102, 38, 4, 0.05);

/* Deep shadow - modals */
box-shadow: 0 25px 50px -12px rgba(102, 38, 4, 0.15);
/* or */
box-shadow: 0 25px 50px -12px rgba(102, 38, 4, 0.25);

/* Navigation shadow (bottom nav) */
box-shadow: 0 -4px 24px rgba(102, 38, 4, 0.06);

/* Diffused shadow - hover states */
box-shadow: 0 20px 40px -4px rgba(102, 38, 4, 0.08), 0 8px 16px -4px rgba(0, 0, 0, 0.02);
```

**Key**: Shadows use Brown Bramble (`#662604`) as the color base with low opacity.

---

## Components

### Sidebar Navigation

```
┌─────────────────────────┐
│ [Logo] APIS             │  <- p-6, gap-3
│         Beekeeping...   │
├─────────────────────────┤
│ ● Dashboard (active)    │  <- rounded-full, bg-salomie
│ ○ Sites                 │  <- rounded-full, hover:bg-coconut-cream
│ ○ Units                 │
│ ○ Hives                 │
│ ○ Clips                 │
│ ...                     │
├─────────────────────────┤
│ [Avatar] User Name      │  <- border-t, p-6
│          email@...      │
│ [Logout]                │
└─────────────────────────┘
```

- **Width**: 240px
- **Background**: `bg-white`
- **Border**: `border-r border-orange-100` / `border-[#ece8d6]`
- **Active item**: `bg-salomie rounded-full shadow-sm`
- **Hover item**: `hover:bg-coconut-cream rounded-full`
- **Icons**: Material Symbols Outlined, 20-22px, weight 300

### Cards

```
┌──────────────────────────────────┐
│ [Icon]              [Badge]      │  <- flex justify-between
│                                  │
│ Label                            │  <- text-xs uppercase tracking-wider
│ 142 detections                   │  <- text-3xl font-bold
│ ▸ 98% Laser Success             │  <- text-xs with icon
└──────────────────────────────────┘
```

- **Background**: `bg-white`
- **Border**: `border border-orange-100` or none with shadow
- **Border radius**: `rounded-2xl` / `rounded-[16px]`
- **Padding**: `p-5` to `p-6`
- **Shadow**: `shadow-soft` (see above)
- **Hover**: `hover:border-[#fcd483]/30` or `hover:-translate-y-1`

### Buttons

**Primary (CTA)**
```css
bg-primary hover:bg-primary-dark text-white font-bold
px-6 py-3 rounded-full shadow-md hover:shadow-lg
```

**Secondary (Outline)**
```css
border border-primary text-primary hover:bg-primary/5
px-5 py-2.5 rounded-full
```

**Ghost/Cancel**
```css
border border-stone-300 text-bramble/80 hover:bg-white
px-8 py-3 rounded-xl
```

**Minimum tap target (mobile)**: 64px height, `min-h-[64px]`

### Form Inputs

```css
/* Text Input */
w-full h-[52px] px-5 rounded-xl
bg-white border border-stone-200
text-bramble placeholder-bramble/40
focus:ring-2 focus:ring-primary/20 focus:border-primary

/* Select */
Same as text input + appearance-none
Icon: expand_more positioned absolute right-4
```

### Status Pills/Badges

```html
<!-- Active/Success -->
<span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
  Active
</span>

<!-- Warning/Pending -->
<span class="bg-amber-50 text-amber-700 text-xs px-2.5 py-1 rounded-full font-medium border border-amber-100">
  <span class="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
  Pending Sync
</span>

<!-- Offline -->
<span class="bg-storm-gray text-white px-4 py-2 rounded-full">
  Offline
</span>
```

### Modals

- **Backdrop**: `bg-[#662604]/20 backdrop-blur-[2px]`
- **Container**: `bg-white rounded-[16px] shadow-deep max-w-md`
- **Padding**: `p-8`
- **Icon circle**: `h-14 w-14 rounded-full bg-primary` (centered)
- **Title**: `text-2xl font-bold`
- **Buttons**: Stacked on mobile, row on desktop (`sm:flex-row-reverse`)

### Tables

```html
<table class="w-full">
  <thead class="bg-[#fbf8f4] text-xs uppercase tracking-wider">
    <th class="px-6 py-4 text-left font-bold text-brown-bramble/50">
  </thead>
  <tbody class="divide-y divide-orange-100">
    <tr class="hover:bg-coconut-cream/30 transition-colors">
      <td class="px-6 py-4">
  </tbody>
</table>
```

---

## Mobile Patterns

### Bottom Navigation

```
┌─────────────────────────────────────────┐
│  Dashboard  Hives  Clips  Maint.  More  │
│     ●         ○      ○      ○      ○    │
└─────────────────────────────────────────┘
```

- **Height**: 64px (`h-16`) + safe area padding
- **Background**: `bg-white`
- **Shadow**: `shadow-nav` (upward shadow)
- **Active icon**: `text-primary`
- **Inactive icon**: `text-bramble/40`
- **Labels**: `text-[11px] font-semibold`

### Mobile Header

- Sticky top
- Logo + title left
- Notification + avatar right
- Height: ~60px with padding

### Offline Banner

```html
<div class="bg-storm-gray text-white px-8 py-3 flex items-center justify-center gap-3">
  <span class="material-symbols-outlined animate-pulse-slow">cloud_off</span>
  <span class="text-sm font-semibold">Offline — 3 inspections pending sync</span>
</div>
```

---

## Icons

**Library**: Google Material Symbols Outlined

**Default settings**:
```css
font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
```

**Filled variant** (for active nav items):
```css
font-variation-settings: 'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24;
```

**Common icons used**:
- `dashboard`, `grid_view` - Dashboard
- `location_on`, `map` - Sites
- `inventory_2`, `hexagon` - Hives/Units
- `movie`, `smart_display` - Clips
- `settings`, `build`, `handyman` - Settings/Maintenance
- `pest_control` - Detections
- `wb_sunny`, `thermostat` - Weather
- `notifications` - Alerts
- `cloud_off`, `sync`, `sync_problem` - Offline/Sync
- `add`, `delete`, `edit` - CRUD actions
- `expand_more`, `chevron_right` - Navigation

---

## Animations

### Transitions
```css
transition-colors  /* Color changes */
transition-all duration-300  /* Multi-property */
transition-transform hover:-translate-y-1  /* Lift effect */
active:scale-95  /* Press effect */
```

### Loading States
```css
animate-spin-slow { animation: spin 3s linear infinite; }
animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
```

### Celebration (Harvest)
```css
@keyframes confetti {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(600px) rotate(720deg); opacity: 0; }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
```

---

## Dark Mode

Dark mode colors (when implemented):
- **Background**: `#221b10` / `#1a150c`
- **Surface**: `#2e261d`
- **Text**: `white` / `gray-100`
- **Borders**: `white/5` / `neutral-800`

---

## Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Default | < 768px | Mobile-first |
| `md:` | ≥ 768px | Tablet |
| `lg:` | ≥ 1024px | Desktop |
| `xl:` | ≥ 1280px | Large desktop |

**Key patterns**:
- Sidebar hidden on mobile, shown on `md:`
- Bottom nav shown on mobile, hidden on `md:`
- Grid columns: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3/4`
- Max content width: `max-w-[1200px]` or `max-w-7xl`
