# Bulk Review Summary - Epic 2

**Generated:** 2026-01-25 07:12
**Stories Reviewed:** 5

## Overview

| Story | Status | High | Medium | Low |
|-------|--------|------|--------|-----|
| 2-1 Create and Manage Sites | NEEDS_WORK | 0 | 3 | 4 |
| 2-2 Register APIS Units | NEEDS_WORK | 1 | 2 | 4 |
| 2-3 Unit Heartbeat Reception | PASS | 0 | 1 | 4 |
| 2-4 Unit Status Dashboard Cards | NEEDS_WORK | 0 | 2 | 5 |
| 2-5 Live Video WebSocket Proxy | NEEDS_WORK | 2 | 2 | 2 |

## Stories Needing Work

### 2-1: Create and Manage Sites
- [ ] **I1 (MEDIUM)**: Mini-map thumbnail not implemented (AC3 requires map, text shown)
- [ ] **I2 (MEDIUM)**: Map visualization is placeholder only (AC4 requires map)
- [ ] **I6 (MEDIUM)**: No frontend component tests for Sites pages

### 2-2: Register APIS Units
- [ ] **I3 (HIGH)**: Connection leak risk in UnitAuth middleware under panic conditions
- [ ] **I1 (MEDIUM)**: N+1 query problem in ListUnits handler
- [ ] **I4 (MEDIUM)**: IP spoofing vulnerability in extractClientIP

### 2-4: Unit Status Dashboard Cards
- [ ] **I1 (MEDIUM)**: Missing test coverage for UnitStatusCard component
- [ ] **I3 (MEDIUM)**: Missing accessibility attributes on status badge

### 2-5: Live Video WebSocket Proxy
- [ ] **I2 (HIGH)**: No backend tests for stream.go handler
- [ ] **I4 (HIGH)**: Stale closure issue in reconnection logic (retryCount)
- [ ] **I1 (MEDIUM)**: LiveStream component not exported from barrel file
- [ ] **I3 (MEDIUM)**: No frontend tests for LiveStream component

## Passing Stories

- **2-3**: Unit Heartbeat Reception - All acceptance criteria met, 5 minor issues (deferrable)

## Issue Summary

| Severity | Count |
|----------|-------|
| HIGH | 3 |
| MEDIUM | 10 |
| LOW | 19 |
| **Total** | **32** |

## Next Steps

1. Address HIGH severity issues first (stories 2-2 and 2-5)
2. Run `/remediate` on individual stories to auto-fix issues
3. Or run `/bulk-remediate` to fix all at once
4. Re-run bulk-review after fixes to verify resolution
