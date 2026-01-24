-- Migration: 0003_email_index.sql
-- Description: Add index on users.email for efficient email lookups
-- Created: 2026-01-22

-- Add index on email column for queries filtering by email
-- This improves performance for user lookups and duplicate checks
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
