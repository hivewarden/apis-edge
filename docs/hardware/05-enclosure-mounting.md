# Enclosure & Mounting Guide

This document provides quick-reference guidance for weatherproofing and mounting your APIS unit outdoors. For comprehensive details, see [hardware-specification.md](../hardware-specification.md) Sections 10.5, 11, and 12.

## Quick Start Checklist

Before deploying outdoors:

- [ ] Enclosure is IP65 rated or better (see [IP Rating Guide](#ip-ratings))
- [ ] Camera window installed and sealed
- [ ] Cable glands installed for all cable entries
- [ ] Strain relief in place for all cables
- [ ] Power source has GFCI/RCD protection
- [ ] Mounting hardware ready (pole or suspended)
- [ ] Lens hood or shade solution if facing sun

---

## IP Ratings

IP ratings indicate protection against dust and water. Format: **IP[X][Y]**

| Rating | Meaning | Suitable for APIS? |
|--------|---------|-------------------|
| IP54 | Dust-protected, splash-proof | Minimum |
| **IP65** | Dust-tight, water jets | **Recommended** |
| IP66 | Dust-tight, powerful jets | Good |
| IP67 | Dust-tight, immersible | Overkill |

**IPX4** = Only water rating given, no dust test performed.

See [hardware-specification.md Section 11.1](../hardware-specification.md#111-requirements) for complete IP rating education.

---

## Enclosure Options

### Option 1: 3D Printed (Custom Fit)

**Materials:**
- **PETG** - Recommended. Weather resistant, easy to print
- **ABS** - More durable but harder to print
- **Avoid PLA** - Degrades in sunlight and heat

STL files: `hardware/enclosure/` (when available)

### Option 2: Commercial Enclosure (Easier)

Recommended products:

| Product | Size | IP Rating | Price |
|---------|------|-----------|-------|
| Gewiss GW44206 | 150x110x70mm | IP56 | ~€10 |
| Spelsberg TK PS | 180x130x77mm | IP65 | ~€15 |
| Hammond 1554W | 160x160x90mm | IP66 | ~€20 |

**Where to buy:** Amazon, AliExpress, RS Components, local electrical supply

**Modifications needed:**
1. Cut camera window hole
2. Drill cable gland holes
3. Install mounting hardware

See [hardware-specification.md Section 11.3](../hardware-specification.md#113-materials) for full commercial options list.

---

## Camera Positioning

**Distance:** 1-2 meters from hive entrance
**Angle:** 10-15 degrees downward
**Frame composition:**
- Bottom 25%: Hive entrance
- Middle 60-70%: Detection zone (where hornets hover)
- Top: Minimal sky

**Key requirement:** Hornets should appear as 50+ pixels for reliable detection.

```
Ideal frame:
┌─────────────────────────────────────┐
│  (minimal sky)                      │
├─────────────────────────────────────┤
│░░░░░░░░ Detection zone ░░░░░░░░░░░░░│
│░░░░░░░░ (60-70% of frame) ░░░░░░░░░░│
├─────────────────────────────────────┤
│  ╔═══════════════════════════╗      │
│  ║ Hive entrance (bottom)    ║      │
│  ╚═══════════════════════════╝      │
└─────────────────────────────────────┘
```

See [hardware-specification.md Section 10.5](../hardware-specification.md#105-camera-positioning) for detailed examples.

---

## Mounting Options

### Pole Mount (Recommended)

Mount enclosure on a pole 1-2m from hive:

- **Pole options:** Fence post, metal conduit, camera pole
- **Mounting hardware:** U-bolts or stainless hose clamps
- **Height:** Eye level for easy maintenance

### Suspended Mount

Hang from roof beam or structure:

- Install eye bolt on enclosure top
- Use stainless carabiner or S-hook
- Camera points downward

See [hardware-specification.md Section 11.7](../hardware-specification.md#117-mounting-options) for diagrams and hardware recommendations.

---

## Cable Management

### Cable Entry

Use cable glands (cord grips) for weatherproof cable entry:

- **PG7** (3-6.5mm) - Small wires
- **PG9** (4-8mm) - USB cables
- **PG11** (5-10mm) - Power cables

### Strain Relief

All cables must be secured so pulling force doesn't reach connections inside. Cable glands provide this automatically when properly tightened.

### Drip Loops

Route cables to form a low point before entering enclosure - water drips off instead of following cable inside.

### Outdoor Power Safety

**CRITICAL:** All outdoor power must be GFCI/RCD protected.

**Options (safest to riskiest):**
1. Existing outdoor GFCI outlet
2. Weatherproof outlet box extension
3. Low-voltage DC from indoor power supply (5V/12V)
4. Long extension cord (temporary only)

See [hardware-specification.md Section 11.5](../hardware-specification.md#115-cable-management-for-outdoor-installation) for complete cable management guide.

---

## Sun & Shade

### Camera Glare

- Position camera facing **north** (northern hemisphere) when possible
- Add lens hood if sun can shine directly into lens
- Recess camera slightly inside enclosure window

### Heat Management

- Use **white or light-colored** enclosure (20°C cooler than black)
- Add ventilation (louvered vents at top and bottom)
- Mount in shade when possible

Signs of overheating: Random reboots, image glitches, works morning/evening but not midday.

See [hardware-specification.md Section 11.6](../hardware-specification.md#116-sun-and-shade-considerations) for detailed guidance.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Water inside enclosure | Poor cable gland seal | Tighten or replace glands |
| | Missing drip loop | Add loop before entry |
| Random reboots | Overheating | Add ventilation, shade |
| Washed-out camera image | Sun glare | Add lens hood |
| Unit won't power on | Water in connector | Dry out, improve sealing |
| Cable pulled loose | No strain relief | Secure cables properly |

---

## Related Documentation

- [Full Hardware Specification](../hardware-specification.md) - Complete technical details
- [01-concepts.md](01-concepts.md) - Electrical concepts for beginners
- [02-pi5-assembly.md](02-pi5-assembly.md) - Raspberry Pi assembly guide
- [04-xiao-assembly.md](04-xiao-assembly.md) - XIAO/ESP32 assembly guide
