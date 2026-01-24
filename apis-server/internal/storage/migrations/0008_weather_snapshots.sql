-- Migration: Create weather_snapshots table for caching weather data
-- Epic 3, Story 3.3: Weather Integration

-- Weather snapshots cache weather data from Open-Meteo API
-- Used for current weather display and historical correlation analysis
CREATE TABLE weather_snapshots (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    site_id TEXT NOT NULL REFERENCES sites(id),
    temperature_c REAL NOT NULL,               -- Current temperature in Celsius
    feels_like_c REAL,                         -- "Feels like" temperature
    humidity INTEGER,                          -- Relative humidity percentage (0-100)
    weather_code INTEGER,                      -- WMO weather condition code
    wind_speed_kmh REAL,                       -- Wind speed in km/h
    recorded_at TIMESTAMPTZ NOT NULL,          -- When this weather data was captured
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row-Level Security for tenant isolation
ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access weather data belonging to their tenant
CREATE POLICY tenant_isolation ON weather_snapshots
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Performance indexes
-- Primary query: latest weather for a site
CREATE INDEX idx_weather_site_time ON weather_snapshots(tenant_id, site_id, recorded_at DESC);

-- Cleanup: keep only last 24 hours of snapshots per site (for correlation charts)
-- This will be managed by application-level cleanup job
