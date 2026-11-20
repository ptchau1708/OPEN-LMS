#!/usr/bin/env bash
# Chạy kiểm thử CSDL (pgTAP) cho schema v2.
#
#   tools/run-db-tests.sh            # Supabase CLI + Docker: supabase start → db reset → test db
#   tools/run-db-tests.sh --plain    # Postgres thường có pgTAP (không cần Docker): tạo CSDL tạm,
#                                    # nạp shim Supabase + migrations, chạy pg_prove. Dùng biến PG* chuẩn
#                                    # (PGHOST, PGPORT, PGUSER…). CSDL: $TEST_DB (mặc định openedu_test, bị XÓA và tạo lại).
#   tools/run-db-tests.sh --plain --migrate   # thêm: kiểm thử ETL tools/migrate-v1 trên dữ liệu mẫu
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE=cli; MIGRATE=0
for a in "$@"; do
  case "$a" in
    --plain) MODE=plain ;;
    --migrate) MIGRATE=1 ;;
    -h|--help) sed -n 2,9p "$0"; exit 0 ;;
    *) echo "Tham số lạ: $a" >&2; exit 2 ;;
  esac
done

if [[ $MODE == cli ]]; then
  command -v supabase >/dev/null || { echo "Cần Supabase CLI (https://supabase.com/docs/guides/cli) và Docker." >&2; exit 1; }
  cd "$ROOT"
  supabase start
  supabase db reset          # chạy lại toàn bộ supabase/migrations (+ seed nếu có)
  supabase test db           # chạy supabase/tests/database/*.test.sql bằng pg_prove
  exit 0
fi

DB="${TEST_DB:-openedu_test}"
command -v psql >/dev/null || { echo "Cần psql." >&2; exit 1; }
psql -X -q -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\"" -c "create database \"$DB\"" >/dev/null
run() { psql -X -q -d "$DB" -v ON_ERROR_STOP=1 -f "$1" 2>&1 | grep -vE "^(NOTICE|WARNING|HINT|DETAIL)|^$" || true; }
psql -X -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/shim/supabase-shim.sql" >/dev/null 2>&1
for f in "$ROOT"/supabase/migrations/*.sql; do
  out=$(run "$f"); if grep -q ERROR <<<"$out"; then echo "LỖI migration $(basename "$f"):" >&2; echo "$out" >&2; exit 1; fi
done
echo "✓ migrations đã nạp vào $DB"

fail=0
if command -v pg_prove >/dev/null; then
  pg_prove -d "$DB" "$ROOT"/supabase/tests/database/*.test.sql || fail=1
else
  for t in "$ROOT"/supabase/tests/database/*.test.sql; do
    out=$(psql -X -At -d "$DB" -f "$t" 2>&1); echo "$out" | grep -E "^(ok|not ok)" || true
    grep -qE "^not ok|ERROR|Looks like" <<<"$out" && { echo "$out" | grep -E "not ok|ERROR|Looks like" >&2; fail=1; }
  done
fi

if [[ $MIGRATE == 1 ]]; then
  node --test "$ROOT/tools/migrate-v1/test/lib.test.mjs" || fail=1
  node "$ROOT/tools/migrate-v1/test/fixture-test.mjs" --db "$DB" || fail=1
fi
exit $fail
