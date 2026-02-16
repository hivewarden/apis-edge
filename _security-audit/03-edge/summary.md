# APIS Edge Device Security Audit Summary

**Audit Date:** 2026-01-31
**Auditor:** Claude Opus 4.5 Security Audit
**Scope:** `/Users/jermodelaruelle/Projects/apis/apis-edge/`
**LOC Analyzed:** ~32,000 (C code)

---

## Executive Summary

The APIS edge device firmware has **critical security vulnerabilities** in three areas:

1. **Communication Security**: No TLS implementation - all API keys and data transmitted in plaintext
2. **Laser Safety**: Targeting module bypasses safety layer, race conditions in disarm
3. **Memory Safety**: Buffer handling issues, missing bounds checks

The firmware demonstrates good practices in many areas (snprintf usage, mutex protection, fail-safe GPIO init), but the critical vulnerabilities could lead to **credential theft**, **unauthorized device control**, or **physical safety hazards**.

**Overall Security Posture: CRITICAL - IMMEDIATE ACTION REQUIRED**

---

## Risk Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| Critical | 5 | No TLS, No cert validation, Safety layer bypass, Race conditions, HTTP API no auth |
| High | 6 | Plaintext API key storage, Content-Length overflow, HTTP request truncation, Hardware watchdog |
| Medium | 7 | gethostbyname thread safety, Buffer handling, Detection validation, Key rotation |
| Low | 3 | Error message sanitization, Log credential exposure, Path truncation |

**Total Findings: 21**

---

## Findings by Category

### Communication Security (COMM-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| COMM-001-1 | CRITICAL | No TLS/SSL - plaintext credential transmission | Open |
| COMM-001-2 | HIGH | API key stored in plaintext on filesystem | Open |
| COMM-001-3 | CRITICAL | No certificate pinning or validation | Open |
| COMM-001-4 | MEDIUM | API key potentially logged in errors | Open |
| COMM-001-5 | MEDIUM | No key rotation support | Open |
| COMM-001-6 | MEDIUM | Insecure fallback on auth failure | Open |
| COMM-001-7 | HIGH | Local HTTP API lacks authentication | Open |

### Laser Safety (SAFETY-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| SAFETY-001-1 | CRITICAL | Targeting module bypasses safety layer | Open |
| SAFETY-001-2 | CRITICAL | HTTP API arm command lacks safety pre-checks | Open |
| SAFETY-001-3 | CRITICAL | Race condition between disarm and laser fire | Open |
| SAFETY-001-4 | HIGH | No hardware watchdog for laser GPIO | Open |
| SAFETY-001-5 | HIGH | Missing mutex protection for safety_is_initialized | Open |
| SAFETY-001-6 | HIGH | Emergency stop can be bypassed via HTTP | Open |
| SAFETY-001-7 | HIGH | Callback use-after-free risk | Open |
| SAFETY-001-8 | MEDIUM | No validation of detection box coordinates | Open |
| SAFETY-001-9 | MEDIUM | safety_laser_pulse misleading behavior | Open |

### Memory Safety (MEMORY-001)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| MEMORY-001-1 | MEDIUM | HTTP path truncation without error | Open |
| MEMORY-001-2 | HIGH | Missing Content-Length bounds check | Open |
| MEMORY-001-3 | LOW | Format string in error message | Open |
| MEMORY-001-8 | HIGH | HTTP request truncation not detected | Open |
| MEMORY-001-9 | MEDIUM | gethostbyname thread safety issue | Open |

---

## Critical Remediation Priorities

### Immediate (P0 - Stop Ship)

1. **COMM-001-1, COMM-001-3: Implement TLS with certificate validation**
   - Add mbedTLS or OpenSSL to the build
   - All server communication must use TLS 1.2+
   - Implement certificate pinning for production server

2. **SAFETY-001-1: Replace laser_controller_on() with safety_laser_on()**
   - In targeting.c lines 382, 450
   - Safety layer must not be bypassable

3. **SAFETY-001-3: Fix race condition in disarm**
   - Set g_armed = false BEFORE turning off laser
   - Ensures atomic disarm operation

4. **COMM-001-7: Add authentication to local HTTP API**
   - Generate random token on first boot
   - Require token for arm/disarm/config endpoints

### High Priority (P1 - This Sprint)

5. **COMM-001-2**: Restrict config file permissions to 0600
6. **SAFETY-001-4**: Implement hardware watchdog
7. **SAFETY-001-6**: HTTP arm must check emergency stop state
8. **MEMORY-001-2**: Validate Content-Length header properly

### Medium Priority (P2)

9. **COMM-001-5**: Implement API key rotation protocol
10. **SAFETY-001-5**: Use atomic or mutex for initialized check
11. **MEMORY-001-9**: Replace gethostbyname with getaddrinfo

---

## Positive Observations (Secure Patterns Found)

1. **snprintf Usage**: Consistent use of bounded string functions
2. **Null Termination**: strncpy followed by explicit null termination
3. **Mutex Protection**: Most modules properly use mutex locks
4. **Tilt Safety Check**: Correctly prevents upward laser firing
5. **Maximum On-Time**: 10-second limit enforced correctly
6. **Cooldown Period**: 5-second cooldown between activations
7. **Kill Switch**: Immediate off with re-enable block
8. **GPIO Fail-Safe**: Initialized to OFF at startup

---

## Safety Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Control                              │
│  Button Handler (physical) ───┬─── HTTP API (network)       │
└──────────────────────────────┬┴──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                   Safety Layer (REQUIRED)                    │
│  - Tilt validation        - Brownout detection              │
│  - Watchdog monitoring    - Detection active check          │
│  - Safe mode enforcement  - Max on-time tracking            │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                   Laser Controller                           │
│  - GPIO control           - Cooldown enforcement            │
│  - State tracking         - Kill switch                     │
└─────────────────────────────────────────────────────────────┘

VULNERABILITY: Targeting module currently bypasses safety layer!
```

---

## Test Requirements

After remediation, these tests MUST pass:

```bash
# 1. TLS Required
curl http://device:8080/status  # Should fail or require HTTPS

# 2. Certificate Validation
curl --cacert /wrong/ca.pem https://device/status  # Should fail

# 3. Local Auth Required
curl http://device:8080/arm -X POST  # Should return 401

# 4. Safety Layer Integration
# Arm, set upward tilt, trigger detection
# Laser must NOT fire

# 5. Race Condition Test
# Rapid arm/disarm during tracking
# No unexpected laser activation

# 6. Emergency Override
# Press E-stop, then send HTTP /arm
# Must reject with error
```

---

## Hardware Safety Considerations

The laser system is **life-safety critical**:

- **Eye Damage Risk**: Laser can cause permanent eye injury
- **Fire Hazard**: Continuous activation could start fires
- **Physical Access**: Beekeepers may be near device when active

All software safety controls must be verified before deployment.

---

## Files Reviewed

| Category | Files |
|----------|-------|
| Server Comm | `server_comm.c`, `clip_uploader.c` |
| HTTP Server | `http_server.c`, `http_utils.c` |
| Laser Control | `laser_controller.c`, `targeting.c`, `coordinate_mapper.c` |
| Safety | `safety_layer.c`, `button_handler.c` |
| Configuration | `config_manager.c` |
| Storage | `event_logger.c`, `storage_manager.c` |

---

## Revision History

| Date | Change |
|------|--------|
| 2026-01-31 | Initial edge device security audit |
