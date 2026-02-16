#!/bin/sh
# Initialize YugabyteDB with required databases for APIS
# This script is run by the yugabytedb-init container before APIS services start

set -e

YSQL_HOST="${YSQL_HOST:-yugabytedb}"
YSQL_PORT="${YSQL_PORT:-5433}"
YSQL_USER="${YSQL_USER:-yugabyte}"
YSQL_PASSWORD="${YSQL_PASSWORD:-yugabyte}"
APIS_DB_USER="${APIS_DB_USER:-apis}"
APIS_DB_PASSWORD="${APIS_DB_PASSWORD:-apisdev}"
KEYCLOAK_DB_USER="${KEYCLOAK_DB_USER:-}"
KEYCLOAK_DB_PASSWORD="${KEYCLOAK_DB_PASSWORD:-}"

# Escape single quotes in SQL string values to prevent injection
sql_escape() {
    printf '%s' "$1" | sed "s/'/''/g"
}

echo "Waiting for YugabyteDB to be ready..."
until PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c '\q' 2>/dev/null; do
    echo "YugabyteDB is unavailable - sleeping"
    sleep 2
done

echo "YugabyteDB is ready!"

# Create APIS application role (least-privileged, non-superuser)
echo "Ensuring ${APIS_DB_USER} role exists..."
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
    SELECT 'User ${APIS_DB_USER} exists' WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APIS_DB_USER}');
" | grep -q "exists" || {
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE USER ${APIS_DB_USER} WITH PASSWORD '$(sql_escape "$APIS_DB_PASSWORD")';"
    echo "Created ${APIS_DB_USER} role"
}
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "ALTER USER ${APIS_DB_USER} WITH PASSWORD '$(sql_escape "$APIS_DB_PASSWORD")';"

# Create apis database if it doesn't exist (owned by APIS role)
echo "Creating apis database..."
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
    SELECT 'Database apis exists' WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'apis');
" | grep -q "exists" || {
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE DATABASE apis OWNER ${APIS_DB_USER};"
    echo "Created apis database"
}

# Ensure ownership + privileges are correct (idempotent)
echo "Ensuring apis database ownership and privileges..."
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "ALTER DATABASE apis OWNER TO ${APIS_DB_USER};"
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "GRANT ALL PRIVILEGES ON DATABASE apis TO ${APIS_DB_USER};"

# Enable pgcrypto extension in apis database for gen_random_uuid()
echo "Enabling pgcrypto extension in apis database..."
PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d apis -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
echo "pgcrypto extension enabled"

# Create Keycloak application role and database (SaaS mode only)
# AI/LLM Context: Only runs when KEYCLOAK_DB_USER is set. Standalone mode
# does not set this variable, so Keycloak database creation is skipped.
if [ -n "${KEYCLOAK_DB_USER}" ]; then
    echo "Ensuring ${KEYCLOAK_DB_USER} role exists..."
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
        SELECT 'User ${KEYCLOAK_DB_USER} exists' WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${KEYCLOAK_DB_USER}');
    " | grep -q "exists" || {
        PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE USER ${KEYCLOAK_DB_USER} WITH PASSWORD '$(sql_escape "$KEYCLOAK_DB_PASSWORD")';"
        echo "Created ${KEYCLOAK_DB_USER} role"
    }
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "ALTER USER ${KEYCLOAK_DB_USER} WITH PASSWORD '$(sql_escape "$KEYCLOAK_DB_PASSWORD")';"

    # Create keycloak database if it doesn't exist
    echo "Creating keycloak database..."
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "
        SELECT 'Database keycloak exists' WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak');
    " | grep -q "exists" || {
        PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "CREATE DATABASE keycloak OWNER ${KEYCLOAK_DB_USER};"
        echo "Created keycloak database"
    }

    # Ensure ownership + privileges
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "ALTER DATABASE keycloak OWNER TO ${KEYCLOAK_DB_USER};"
    PGPASSWORD="$YSQL_PASSWORD" psql -h "$YSQL_HOST" -p "$YSQL_PORT" -U "$YSQL_USER" -d yugabyte -c "GRANT ALL PRIVILEGES ON DATABASE keycloak TO ${KEYCLOAK_DB_USER};"
    echo "Keycloak database ready"
fi

echo "Database initialization complete!"
