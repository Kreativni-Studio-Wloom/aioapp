#!/usr/bin/env bash
# Creates all tables in the production (Supabase) database and seeds the exercise library.
# Usage: put DATABASE_URL (Supabase transaction pooler, port 6543) into .env.production.local, then:
#   npm run db:setup:prod
set -euo pipefail

if [ ! -f .env.production.local ]; then
  echo "Chybí .env.production.local – zkopíruj .env.example a doplň DATABASE_URL se svým heslem." >&2
  exit 1
fi

PROD_URL=$(grep -E '^DATABASE_URL=' .env.production.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
if [ -z "$PROD_URL" ] || [[ "$PROD_URL" == *"YOUR-PASSWORD"* ]]; then
  echo "DATABASE_URL v .env.production.local chybí nebo obsahuje [YOUR-PASSWORD]." >&2
  exit 1
fi

# DDL goes through the session pooler (same host, port 5432) – transaction mode can't run migrations reliably.
SESSION_URL="${PROD_URL/:6543\//:5432/}"

echo "→ Vytvářím tabulky…"
DIRECT_DATABASE_URL="$SESSION_URL" npx drizzle-kit push --force

echo "→ Nahrávám knihovnu cviků…"
DATABASE_URL="$SESSION_URL" npx tsx scripts/seed-exercises.ts

echo "✓ Databáze je připravená."
