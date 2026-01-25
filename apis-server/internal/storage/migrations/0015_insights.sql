-- BeeBrain Insights Table
-- Stores AI-generated insights from rule-based analysis of hive data.
-- Insights can be tenant-wide or hive-specific, with severity levels
-- and the ability to dismiss or snooze them.

CREATE TABLE insights (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hive_id TEXT REFERENCES hives(id) ON DELETE CASCADE,  -- NULL for tenant-wide insights
    rule_id TEXT NOT NULL,                                -- References rule from rules.yaml
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'action-needed')),
    message TEXT NOT NULL,
    suggested_action TEXT,
    data_points JSONB DEFAULT '{}',                       -- Evidence supporting the insight
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dismissed_at TIMESTAMPTZ,                             -- NULL if not dismissed
    snoozed_until TIMESTAMPTZ                             -- NULL if not snoozed
);

-- Enable Row Level Security for tenant isolation
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see/modify insights belonging to their tenant
CREATE POLICY tenant_isolation ON insights
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Index for tenant-based queries (most common access pattern)
CREATE INDEX idx_insights_tenant ON insights(tenant_id);

-- Index for hive-specific queries
CREATE INDEX idx_insights_hive ON insights(hive_id) WHERE hive_id IS NOT NULL;

-- Index for sorting by creation date (most recent first)
CREATE INDEX idx_insights_created ON insights(created_at DESC);

-- Composite index for active insights (not dismissed, not snoozed or snooze expired)
-- Used by dashboard queries to show current actionable insights
CREATE INDEX idx_insights_active ON insights(tenant_id, dismissed_at, snoozed_until)
    WHERE dismissed_at IS NULL;

-- Index for rule-based queries (e.g., finding all insights from a specific rule)
CREATE INDEX idx_insights_rule ON insights(rule_id);

-- Add comment for documentation
COMMENT ON TABLE insights IS 'BeeBrain AI-generated insights from rule-based hive analysis';
COMMENT ON COLUMN insights.rule_id IS 'ID of the rule from rules.yaml that generated this insight';
COMMENT ON COLUMN insights.severity IS 'info = informational, warning = should address soon, action-needed = requires immediate attention';
COMMENT ON COLUMN insights.data_points IS 'JSONB containing evidence that triggered this insight (e.g., days_since_treatment: 92)';
COMMENT ON COLUMN insights.snoozed_until IS 'If set, insight is hidden until this timestamp passes';
