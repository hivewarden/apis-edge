-- Migration 0001: Tenants and Users
-- Creates the core multi-tenant tables for user management.
-- Tenants are synced from Zitadel Organizations.
-- Users are synced from Zitadel Users.

-- Tenants table (synced from Zitadel Organizations)
-- The id is the Zitadel org_id from JWT claims
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (synced from Zitadel Users)
-- The zitadel_user_id is the "sub" claim from JWT
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    zitadel_user_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_zitadel ON users(zitadel_user_id);
