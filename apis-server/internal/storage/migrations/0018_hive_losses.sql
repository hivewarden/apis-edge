-- Migration: 0018_hive_losses.sql
-- Description: Creates hive_losses table for post-mortem records and adds status to hives
-- Epic: 9 - Data Export & Emotional Moments
-- Story: 9.3 - Hive Loss Post-Mortem

-- Add status column to hives table if not exists
ALTER TABLE hives ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE hives ADD COLUMN IF NOT EXISTS lost_at DATE;

-- Add check constraint for valid status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'hives_status_check'
    ) THEN
        ALTER TABLE hives ADD CONSTRAINT hives_status_check
            CHECK (status IN ('active', 'lost', 'archived'));
    END IF;
END $$;

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_hives_status ON hives(tenant_id, status);

-- Hive losses table for post-mortem records
CREATE TABLE IF NOT EXISTS hive_losses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    discovered_at DATE NOT NULL,
    cause TEXT NOT NULL CHECK (cause IN ('starvation', 'varroa', 'queen_failure', 'pesticide', 'swarming', 'robbing', 'unknown', 'other')),
    cause_other TEXT,      -- If cause is 'other', user can specify
    symptoms TEXT[],       -- Array of symptom codes
    symptoms_notes TEXT,   -- Free text notes about observations
    reflection TEXT,       -- Optional: what could have been done differently
    data_choice TEXT NOT NULL DEFAULT 'archive' CHECK (data_choice IN ('archive', 'delete')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_hive_losses_tenant ON hive_losses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hive_losses_hive ON hive_losses(hive_id);
CREATE INDEX IF NOT EXISTS idx_hive_losses_cause ON hive_losses(tenant_id, cause);
CREATE INDEX IF NOT EXISTS idx_hive_losses_date ON hive_losses(tenant_id, discovered_at DESC);

-- Enable RLS on hive_losses table
ALTER TABLE hive_losses ENABLE ROW LEVEL SECURITY;

-- RLS policy for hive_losses (tenant isolation)
DROP POLICY IF EXISTS hive_losses_tenant_isolation ON hive_losses;
CREATE POLICY hive_losses_tenant_isolation ON hive_losses
    USING (tenant_id = current_setting('app.tenant_id', true));
