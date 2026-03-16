# Architecture Review (Codex) — APIS — 2026-01-22

## Overall Take
The document is thorough and self-consistent in many areas, but several security, operability, and realism gaps could threaten a production deployment or the stated ESP32-first goal. The biggest risks are video streaming over HTTPS (mixed content), weak device identity, lack of OTA/update strategy, and unproven ESP32 performance vs. the 5 FPS/<500 ms requirement.

## Findings

1. **Critical — Live video will be blocked in production**  
   - **Details:** Dashboard is expected to be served over HTTPS, while live MJPEG is fetched directly from `http://{unit_ip}:8080/stream` (no TLS, no proxy). Modern browsers block active mixed content, so live view fails whenever the dashboard is on HTTPS (SaaS or reverse-proxied).  
   - **Recommendation:** Terminate video through the server (reverse proxy/WebRTC/HLS) on the same origin, or enable TLS on devices with certificate pinning.

2. **High — Device identity and key management are underspecified**  
   - **Details:** Single `X-API-Key` shared via env var; no per-unit keys, rotation, or binding between unit ID and key. Enrollment is only via serial; replay or leaked key allows arbitrary clip injection/heartbeat spoofing.  
   - **Recommendation:** Per-device credentials (unique keypair or HMAC key), signed heartbeats/clips (device_id, nonce, HMAC), rotation + revocation list, and an enrollment flow that mints keys server-side.

3. **High — No OTA/update or firmware versioning path**  
   - **Details:** Device management supports status/reboot only; “Design for ESP32” requires frequent security and model updates. Without OTA and signed artifacts, units will drift and remain vulnerable.  
   - **Recommendation:** Add signed OTA channel (version metadata, rollback protection, staged rollout), surface firmware version in heartbeats, and block outdated/unknown firmware from posting clips.

4. **High — ESP32 performance vs. 5 FPS/<500 ms is unproven**  
   - **Details:** Requirements target ESP32, but detection pipeline details are absent. ESP32 lacks headroom for real-time CV unless using a tiny model or dedicated accelerator; servo response depends on detection latency.  
   - **Recommendation:** Provide measured benchmarks per target (ESP32-CAM, Pi 5), specify the algorithm/model, and define a fallback path (e.g., Pi-only detection, ESP32 as sensor) if targets miss the SLA.

5. **Medium — Session-cookie auth clashes with offline PWA sync**  
   - **Details:** `/api/sync` relies on session cookies; no refresh-token flow or background re-auth. A session expiring while offline causes queued sync to fail silently and lose drafts.  
   - **Recommendation:** Introduce long-lived refresh tokens or device-scoped tokens for sync, and service-worker logic to handle 401 → re-auth prompt.

6. **Medium — Upload resilience/backpressure not defined**  
   - **Details:** Clip/photo uploads are simple POSTs; no chunking, resume, or backpressure signals. Edge retention is unspecified; network flakiness will stall uploads and fill device storage.  
   - **Recommendation:** Add bounded on-device spool with eviction policy, chunked/resumable uploads, exponential backoff, and server-side limits with 429/503 hints.

7. **Medium — SaaS-readiness claimed but multi-tenant design absent**  
   - **Details:** Schema ties data to `user_id`; no tenant/org separation, RBAC, or tenant-scoped secrets. Migrating to Postgres alone won’t prevent cross-tenant leakage.  
   - **Recommendation:** Introduce `tenant_id` (or org) across tables, enforce row-level scoping, define roles (owner/admin/read), and namespace webhooks/api keys per tenant.

8. **Medium — CSRF and brute-force protections missing**  
   - **Details:** Session cookies are used but CSRF mitigations aren’t specified; login/transcribe lack rate limiting. Public dashboard origin plus cookie auth is CSRF-prone.  
   - **Recommendation:** SameSite=Lax/Strict plus CSRF token for mutating endpoints, request size limits, and IP/user-based rate limiting on auth, transcribe, and upload routes.

9. **Medium — Observability is limited to logs**  
   - **Details:** Structured logging exists, but no metrics/tracing/health endpoints. Difficult to detect FPS drops, queue buildup, or sync errors; log retention/rotation is unspecified for a single container.  
   - **Recommendation:** Add Prometheus metrics (ingest latency, clip failures, sync backlog, heartbeat freshness), liveness/readiness probes, and log rotation defaults in the container.

10. **Medium — Offline conflict resolution risks data loss**  
   - **Details:** Sync uses last-write-wins without per-record versioning. Concurrent edits (e.g., two inspectors offline) will silently overwrite.  
   - **Recommendation:** Add per-record version (etag/updated_at), detect conflicts, surface them in UI, and optionally merge per-field for diary entries.

11. **Medium — Time synchronization not addressed**  
   - **Details:** Analytics and sync depend on accurate timestamps, but there’s no NTP/RTC plan for units; ESP32 often drifts minutes per day.  
   - **Recommendation:** Sync time during heartbeat, reject out-of-window timestamps, and expose clock status in `/status` and dashboard alerts.

12. **Low — Retention/quotas incomplete**  
   - **Details:** Auto-pruning is defined for clips only; photos, exports, logs, and Dexie caches lack limits. A small disk (or mobile IndexedDB quota) can fill and break uploads.  
   - **Recommendation:** Add per-type quotas and age-based pruning for photos/logs, and cap IndexedDB usage with graceful degradation messaging.

## Recommendations by Priority
1. Fix live video delivery for HTTPS (proxy/TLS) before SaaS deployment. 
2. Implement per-device credentials with signing + OTA update channel. 
3. Benchmark and, if needed, re-scope ESP32 detection to meet latency targets. 
4. Harden auth: CSRF protection, rate limits, and a token model that survives offline. 
5. Add upload resilience/backpressure and storage quotas on device and server. 
6. Add metrics/health endpoints and conflict-aware sync to make failures visible. 
7. Design multi-tenant schema and RBAC before advertising “SaaS-ready.”
