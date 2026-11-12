#!/usr/bin/env bash
# Local/CI only: drop & recreate the schema, then apply migrations with psql.
# (Production uses `pnpm db:migrate` = prisma migrate deploy.)
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"
PGOPTIONS="-c client_min_messages=warning" psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
for f in prisma/migrations/*/migration.sql; do psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
echo "schema reset: $(ls -d prisma/migrations/*/ | wc -l) migration(s) applied"
