#!/usr/bin/env bash
set -euo pipefail

postgres_container="$1"
source_db=auraseal
restore_db=auraseal_restore

snapshot_query=$(cat <<'SQL'
select json_build_object(
  'certificates', (select count(*) from auraseal.certificates),
  'exports', (select count(*) from auraseal.render_assets),
  'auditEvents', (select count(*) from auraseal.audit_events),
  'mp4Bytes', (select coalesce(sum(octet_length(mp4)), 0) from auraseal.render_assets),
  'credentialFingerprint', (select md5(string_agg(verification_id || status || content_digest, ',' order by verification_id)) from auraseal.certificates),
  'assetFingerprint', (select md5(string_agg(md5(png) || md5(pdf) || coalesce(md5(mp4), ''), ',' order by certificate_id)) from auraseal.render_assets)
)
SQL
)

snapshot() {
  docker exec "$postgres_container" psql -X -At --set ON_ERROR_STOP=1 -U postgres -d "$1" -c "$snapshot_query"
}

before=$(snapshot "$source_db")
docker exec "$postgres_container" createdb -U postgres -O auraseal "$restore_db"
docker exec "$postgres_container" pg_dump -U postgres -Fc "$source_db" |
  docker exec -i "$postgres_container" pg_restore -U postgres -d "$restore_db" --exit-on-error --single-transaction
DATABASE_URL="postgresql://auraseal:local_only@127.0.0.1:5432/$restore_db" npm run db:migrate
after=$(snapshot "$restore_db")
test "$before" = "$after"
mkdir -p evidence/G6
printf '%s\n' "{\"restoreVerified\":true,\"isolatedDatabase\":true,\"snapshot\":$after}" > evidence/G6/restore.json
cat evidence/G6/restore.json
