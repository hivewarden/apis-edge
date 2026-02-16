-- Migration: 0022_reminders.sql
-- Create reminders table for treatment due dates, follow-up reminders, and custom reminders

CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT REFERENCES hives(id) ON DELETE CASCADE,  -- NULL for tenant-wide reminders
    reminder_type TEXT NOT NULL,          -- 'treatment_due', 'treatment_followup', 'custom'
    title TEXT NOT NULL,                  -- "Oxalic acid treatment due", "Check mite count"
    due_at DATE NOT NULL,                 -- When the reminder is due
    completed_at TIMESTAMPTZ,             -- NULL unless marked done
    snoozed_until DATE,                   -- If snoozed, hidden until this date
    metadata JSONB DEFAULT '{}',          -- Additional data: {treatment_type: 'oxalic_acid', days_since: 92}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for calendar queries
CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(tenant_id, due_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_hive ON reminders(hive_id);

-- Row Level Security for tenant isolation
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminders_tenant_isolation ON reminders
    USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY reminders_tenant_insert ON reminders
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY reminders_tenant_update ON reminders
    FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY reminders_tenant_delete ON reminders
    FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));

-- Check constraint for valid reminder types
ALTER TABLE reminders ADD CONSTRAINT chk_reminder_type
    CHECK (reminder_type IN ('treatment_due', 'treatment_followup', 'custom'));
