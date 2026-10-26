#!/usr/bin/env bash
# Applies the API's Drizzle migrations to the database in $DATABASE_URL.
# Used by .github/workflows/api-deploy.yml before each deploy, and runnable by
# hand against a throwaway database to dry-run that step (see CI.md).
#
# Forward-only and safe to re-run: Drizzle records applied migrations in
# `drizzle.__drizzle_migrations` and only runs the ones not recorded yet, so a
# second run on an up-to-date database changes nothing.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

# Log the target without the credentials.
echo "Migrating database: $(printf '%s' "$DATABASE_URL" | sed -E 's#//[^@/]*@#//***@#')"
echo "Migration files: $(ls apps/api/drizzle/*.sql | wc -l)"

pnpm --filter @depanini/api db:migrate

echo "Migrations applied"
