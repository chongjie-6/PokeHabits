#!/bin/sh
# Runs once, on an empty data volume. The migrations are applied as this role and
# so it owns every table — which is why 0006 has to FORCE row-level security.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v password="$OPENHABITS_DB_PASSWORD" <<'SQL'
CREATE ROLE openhabits LOGIN PASSWORD :'password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE openhabits OWNER openhabits;
SQL
