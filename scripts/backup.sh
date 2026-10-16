#!/usr/bin/env bash
# Schema + data dump, gzip, then age-encrypt. The private key stays offline.
set -euo pipefail
if [ -z "${SUPABASE_DB_URL:-}" ] || [ -z "${BACKUP_AGE_PUBLIC_KEY:-}" ]; then
  echo "missing database URL or age public key"
  exit 1
fi
mkdir -p dump out
supabase db dump --db-url "${SUPABASE_DB_URL}" --schema public,auth -f dump/schema.sql
supabase db dump --db-url "${SUPABASE_DB_URL}" --data-only --use-copy --schema public,auth -f dump/data.sql
tar -C dump -czf dump.tar.gz schema.sql data.sql
printf '%s\n' "${BACKUP_AGE_PUBLIC_KEY}" > recipient.pub
age -R recipient.pub -o out/backup.tar.gz.age dump.tar.gz
rm -rf dump dump.tar.gz recipient.pub
