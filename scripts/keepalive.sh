#!/usr/bin/env bash
# GET /rest/v1/rpc/health. SUPABASE_URL and SUPABASE_ANON_KEY come from the environment.
set -euo pipefail
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "missing URL or anon key"
  exit 1
fi
code="$(curl -sS -o /tmp/health-body -w '%{http_code}' \
  --max-time 30 \
  "${SUPABASE_URL%/}/rest/v1/rpc/health" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Accept: application/json")"
echo "status ${code}"
if [ "${code}" -lt 200 ] || [ "${code}" -ge 300 ]; then
  echo "health check failed"
  exit 1
fi
