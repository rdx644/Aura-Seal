#!/bin/sh
(
  set -eu
  psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password AURASEAL_DB_PASSWORD
CREATE ROLE auraseal LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER DATABASE auraseal OWNER TO auraseal;
SQL
)
