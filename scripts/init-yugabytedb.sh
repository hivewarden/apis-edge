#!/bin/sh
# Initialize YugabyteDB with required databases for APIS
# This script is run by the yugabytedb-init container before Zitadel starts

set -e

YSQL_HOST="${YSQL_HOST:-yugabytedb}"
YSQL_PORT="${YSQL_PORT:-5433}"
YSQL_USER="${YSQL_USER:-yugabyte}"
YSQL_PASSWORD="${YSQL_PASSWORD:-yugabyte}"

echo "Waiting for YugabyteDB to be ready..."
until PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c '\q' 2>/dev/null; do
    echo "YugabyteDB is unavailable - sleeping"
    sleep 2
done

echo "YugabyteDB is ready!"

# Create zitadel database if it doesn't exist
echo "Creating zitadel database..."
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
    SELECT 'Database zitadel exists' WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'zitadel');
" | grep -q "exists" || {
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE DATABASE zitadel;"
    echo "Created zitadel database"
}

# Create zitadel_user if it doesn't exist
echo "Creating zitadel_user..."
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
    SELECT 'User zitadel_user exists' WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'zitadel_user');
" | grep -q "exists" || {
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE USER zitadel_user WITH PASSWORD 'zitadel_user' SUPERUSER;"
    echo "Created zitadel_user"
}

# Grant privileges on zitadel database
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "GRANT ALL PRIVILEGES ON DATABASE zitadel TO zitadel_user;"

# Create apis database if it doesn't exist
echo "Creating apis database..."
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
    SELECT 'Database apis exists' WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'apis');
" | grep -q "exists" || {
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE DATABASE apis;"
    echo "Created apis database"
}

# Enable pgcrypto extension in apis database for gen_random_uuid()
echo "Enabling pgcrypto extension in apis database..."
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d apis -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
echo "pgcrypto extension enabled"

echo "Database initialization complete!"
