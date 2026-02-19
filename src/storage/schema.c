/**
 * SQLite database schema for event storage.
 *
 * This schema is used by the event logger to store detection events
 * locally on the edge device.
 */

const char *EVENT_SCHEMA_SQL =
    "-- Detection events table\n"
    "CREATE TABLE IF NOT EXISTS events (\n"
    "    id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
    "    timestamp TEXT NOT NULL,\n"
    "    confidence TEXT NOT NULL,\n"
    "    x INTEGER NOT NULL,\n"
    "    y INTEGER NOT NULL,\n"
    "    w INTEGER NOT NULL,\n"
    "    h INTEGER NOT NULL,\n"
    "    area INTEGER NOT NULL,\n"
    "    centroid_x INTEGER NOT NULL,\n"
    "    centroid_y INTEGER NOT NULL,\n"
    "    hover_duration_ms INTEGER DEFAULT 0,\n"
    "    laser_fired INTEGER DEFAULT 0,\n"
    "    clip_file TEXT,\n"
    "    synced INTEGER DEFAULT 0,\n"
    "    created_at TEXT DEFAULT CURRENT_TIMESTAMP\n"
    ");\n"
    "\n"
    "-- Indexes for common queries\n"
    "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);\n"
    "CREATE INDEX IF NOT EXISTS idx_events_synced ON events(synced);\n"
    "CREATE INDEX IF NOT EXISTS idx_events_confidence ON events(confidence);\n"
    "CREATE INDEX IF NOT EXISTS idx_events_synced_timestamp ON events(synced, timestamp);\n";
