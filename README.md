# APIS Edge

Standalone firmware and hardware repository for the Hive Warden Edge device.

This repo now owns the device side only: ESP32 firmware, shared C modules, board bring-up, hardware manuals, and the onboarding/connectivity contract used to talk to Hive Warden SaaS.

## Start Here

- [docs/README.md](docs/README.md) for the documentation index.
- [docs/operator-setup-guide.md](docs/operator-setup-guide.md) if you are a beekeeper, installer, or self-hoster who just wants to get the device online.
- [docs/esp32-usb-flashing.md](docs/esp32-usb-flashing.md) for the board bring-up path an AI can use over USB.
- [docs/onboarding-and-connectivity.md](docs/onboarding-and-connectivity.md) for Wi-Fi setup, claiming, local discovery, and SaaS fallback.
- [docs/business-telemetry-and-sync.md](docs/business-telemetry-and-sync.md) for durable activation/encounter journals, stable IDs, and the heartbeat-vs-business telemetry split.
- [docs/field-lifecycle-and-recovery.md](docs/field-lifecycle-and-recovery.md) for first install, unattended field behavior, factory reset, reclaim, and the open-source/self-host lifecycle model.
- [docs/high-mount-three-hive-prototype-spec.md](docs/high-mount-three-hive-prototype-spec.md) for the current default install target: high-mount, three-hive coverage, and the current 720p prototype stance.
- [docs/shadow-mode-validation.md](docs/shadow-mode-validation.md) for the current camera-only shadow-mode workflow, indoor scene tool, and the gate before servo/laser work.
- [docs/local-edge-to-saas-acceptance.md](docs/local-edge-to-saas-acceptance.md) for the full local runbook with the sibling Hive Warden SaaS repo.
- [docs/hardware-manual.md](docs/hardware-manual.md) for the current hardware entry point.
- [docs/hardware-archive-index.md](docs/hardware-archive-index.md) for the relevant BMAD/epic artifacts about servo, laser, safety, and enclosure work.
- [docs/documentation-map.md](docs/documentation-map.md) for current-vs-historical source guidance.

## Companion Repo

The SaaS/backend lives separately:

- Local workspace: `/Users/jermodelaruelle/Projects/hivewarden-saas`
- GitHub: `https://github.com/hivewarden/hivewarden-saas.git`

## Current Scope

- Shared C firmware in `src/` and `include/`
- ESP32 platform bootstrapping in `platforms/esp32/`
- HAL implementations in `hal/`
- Host-side tests in `tests/`
- Hardware and enclosure documentation in `docs/` and `hardware/`
- Static operator tooling in `tools/`
- Helper scripts for ESP32 bring-up in `scripts/`
- Historical planning material in `_bmad-output/` and archived leftovers in `archive/`

## Platform Stance

- Production target: XIAO ESP32S3 Sense / ESP32-S3
- Secondary documented path: ESP32-CAM
- Legacy/dev path only: Raspberry Pi 5
- Core mission: detect hornets, track/deter with servo + laser hardware, work locally when no server is available

## Current Prototype Install Target

The current prototype target is explicit:

- mount height around `1.8 m`
- tolerance target `1.6 m` to `1.9 m`
- `3` Dadant hives with about `10 cm` between them
- hornet-only detection, not bee detection
- `720p` as the current prototype resolution target for that geometry

Use [docs/high-mount-three-hive-prototype-spec.md](docs/high-mount-three-hive-prototype-spec.md)
for the engineering stance. The short version is: `720p` is the watch-mode
target we are validating, and the device must either report `ready` or
explicitly report `unsupported`. Silent watch-mode downgrade is not considered a
pass.

## Quick Operator Path

If you are not here to develop firmware and you just want to connect a device:

1. Flash and power on the board.
2. Join the temporary Wi-Fi network named `HiveWarden-XXXX`.
3. Open `http://192.168.4.1/setup`.
4. Enter the beekeeper's normal Wi-Fi details.
5. In Hive Warden, register a unit and open that unit's claim QR / claim token.
6. Prefer the short-lived claim token flow: scan the QR during setup, paste the token into setup, or let the device camera scan it after Wi-Fi joins.
7. If the camera is stubborn after Wi-Fi joins, open the device's local claim page at `http://<device-ip>:8080/claim` and paste the same one-time token.
8. Confirm the device appears online in Hive Warden.

Use [docs/operator-setup-guide.md](docs/operator-setup-guide.md) for the full
non-technical setup manual, including hosted Hive Warden and self-hosted flows.

## Build And Flash

### Host Build

```bash
cmake -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

The top-level CMake now defaults to `APIS_PLATFORM=test` on desktop machines. Use `-DAPIS_PLATFORM=pi` only when you intentionally want the legacy Pi path.

### ESP32 / XIAO Bring-Up

Preferred path:

```bash
./scripts/esp32/flash.sh
```

Manual path:

```bash
source ~/esp/esp-idf/export.sh
cd platforms/esp32
ESP_PY="$(find ~/.espressif/python_env -path '*/bin/python' | head -n 1)"
"${ESP_PY}" "${IDF_PATH}/tools/idf.py" build
"${ESP_PY}" "${IDF_PATH}/tools/idf.py" -p /dev/cu.usbmodem1101 flash monitor
```

See [docs/esp32-usb-flashing.md](docs/esp32-usb-flashing.md) for USB port detection, bootloader fallback, and troubleshooting.

## Runtime Summary

1. No Wi-Fi credentials: the device starts an open hotspot named `HiveWarden-XXXX` and serves a captive portal on `http://192.168.4.1/setup`.
2. Wi-Fi saved: the device reboots into STA mode and joins the beekeeper's network.
3. Server resolution order: saved `server.url` -> mDNS `_hivewarden._tcp` -> `ONBOARDING_DEFAULT_URL` -> `ONBOARDING_FALLBACK_URL` -> local-only operation.
4. Claiming: the preferred path is a short-lived one-time claim token from Hive Warden. The setup page can store that token for automatic exchange after reboot, the device camera can scan it from the dashboard QR, and unclaimed devices on Wi-Fi expose `GET/POST /claim` as a secure fallback.
5. Advanced/manual recovery can still use a raw unit API key, but that is no longer the recommended operator flow.
6. Wi-Fi-connected units expose local HTTP control/status endpoints on port `8080`. `POST /capture`, `/config`, `/arm`, `/disarm`, and `/stream` use `Authorization: Bearer <local_auth_token>`, while `GET /status`, `GET /qr-preview.bmp`, and `GET/POST /claim` are intentionally reachable without local auth while the device is unclaimed.
7. The deterrent contract is explicit: `shadow` mode keeps detection and targeting live while suppressing servo and laser output; `live` mode is the later actuator-enabled path.
8. `GET /status` includes both `manual_capture` and `deterrent` objects plus QR/claim diagnostics so a local operator can see dry-run targeting decisions, onboarding progress, and evidence artifact paths.
9. Heartbeat is now liveness-only. Durable activation/encounter telemetry syncs separately before clips.
10. Heartbeats, journal sync, and clip uploads all use the unit API key with `X-API-Key`.
11. Tenant resolution is server-side. The device only knows the server URL and the unit API key; the server maps that key back to the correct unit, tenant, and usually site.

## Camera-Only Validation

Before you attach a motor or laser, use the current shadow-mode path:

1. Leave `deterrent_mode` set to `shadow`.
2. Put the board on a fixed stand facing a laptop or tablet.
3. Run the static indoor test scene in [`tools/indoor-scene/`](tools/indoor-scene/).
4. Watch `GET /status` for the `deterrent` object and confirm target coordinates, hover duration, and `would_move` / `would_fire`.
5. Watch `GET /status` for the `vision` object and confirm the `high_mount_three_hive_v1` profile plus `watch_mode_state`.
6. Inspect the saved clip and annotated frame.

Use [docs/shadow-mode-validation.md](docs/shadow-mode-validation.md) for the full workflow and the physical test steps that should happen later.

## Open-Source Deployment Model

The intended open-source deployment model is:

- local-first discovery for self-hosted Hive Warden instances on the LAN
- cloud fallback when no local server is available
- server-side tenant routing through the enrolled unit API key, not a tenant setting on the device

So if many beekeepers share the same hosted domain, the boards can all phone the
same server URL while still landing in the right tenant because each board uses
its own unit API key.

## Repository Layout

```text
apis-edge/
├── src/                  shared firmware modules
├── include/              public headers
├── hal/                  hardware abstraction layer
├── platforms/esp32/      ESP-IDF project and ESP32 entrypoint
├── tests/                host-side unit tests
├── docs/                 current docs and hardware guides
├── hardware/             enclosure/mechanical references
├── scripts/              helper scripts for bring-up/flash
├── archive/              moved historical prototype/mockup/review material
└── _bmad-output/         historical planning archive retained for archaeology
```

## Historical Material

This repo still retains mixed historical material from the old mono-repo era. Treat it as archive, not source of truth:

- `archive/pi-legacy/` is the old Python prototype.
- `archive/ui-mockups/stitch_apis_v2/` is a portal/UI mockup archive.
- `_bmad-output/planning-artifacts/` contains mixed Edge and SaaS planning documents.
