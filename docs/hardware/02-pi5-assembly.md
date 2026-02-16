# Pi 5 Assembly Manual

> **Note:** This document serves as a navigation guide to the Pi 5 assembly content in the main hardware specification.

## Quick Navigation

The complete Pi 5 assembly instructions are consolidated in the main hardware specification document for easier maintenance and cross-referencing. Use this guide to find specific sections.

### Location: `docs/hardware-specification.md`

| Section | Topic | What You'll Learn |
|---------|-------|-------------------|
| **3.2** | [Pi 5 Parts List](#parts-list) | Components, part numbers, supplier links |
| **4.1** | [Why Pi 5](#why-pi5) | Advantages/disadvantages for development |
| **4.2** | [GPIO Pinout](#pinout) | 40-pin header diagram with pin functions |
| **4.3** | [Pin Assignments](#assignments) | Which GPIO for servo, laser, LED, button |
| **4.4** | [Wiring Diagram](#wiring) | Visual connection diagram |
| **4.5** | [Step-by-Step Assembly](#assembly) | 6-step guide with what/why/how format |
| **4.6** | [Pre-Power Checklist](#checklist) | Verify connections before power-on |
| **4.7** | [Component Tests](#tests) | Individual and integration test procedures |
| **9.1-9.4** | [Laser Safety](#laser) | Safety warnings, wiring, driver circuits |
| **14** | [Troubleshooting](#troubleshooting) | Common problems and solutions |

## Why Consolidated Documentation?

We chose to consolidate all hardware documentation into a single comprehensive file because:

1. **Cross-referencing** - Pi 5, ESP32-CAM, and XIAO share many concepts (power, GPIO, safety)
2. **Consistency** - Changes to shared components update once, not three times
3. **Beginner-friendly** - One document to bookmark and search
4. **Maintainability** - Easier to keep synchronized with code changes

## Quick Links

To jump directly to the main document sections:

```bash
# Open the main hardware specification
open docs/hardware-specification.md

# Or on Linux:
xdg-open docs/hardware-specification.md
```

## See Also

- `docs/hardware/01-concepts.md` - Electronics fundamentals for beginners
- `docs/hardware-specification.md` - Complete hardware build guide (all paths)
