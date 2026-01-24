-- Migration: Add telemetry columns to units table
-- Epic 2, Story 2.3: Unit Heartbeat Reception
-- Code Review Remediation: HIGH severity - telemetry data not persisted

-- Add telemetry columns for heartbeat data
-- These are updated on each heartbeat from the device
ALTER TABLE units ADD COLUMN IF NOT EXISTS uptime_seconds BIGINT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS cpu_temp DECIMAL(5, 2);
ALTER TABLE units ADD COLUMN IF NOT EXISTS free_heap BIGINT;

-- Note: detection_count_since_last is not stored per-unit as it's
-- aggregated in the detections table. The heartbeat receives it
-- for logging/metrics but we don't persist it on the unit record.
