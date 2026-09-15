#!/bin/sh

set -eu

. "$(dirname "$0")/env.sh"

for command in initdb pg_ctl pg_isready psql createdb; do
	command -v "$command" >/dev/null 2>&1 || {
		printf 'BROKEN: %s is unavailable.\n' "$command" >&2
		exit 1
	}
done

mkdir -p "$CRM_CALA_ROSSA_DATA_DIR" "$CRM_CALA_ROSSA_SOCKET_DIR"

if [ ! -s "$CRM_CALA_ROSSA_DATA_DIR/PG_VERSION" ]; then
	initdb -D "$CRM_CALA_ROSSA_DATA_DIR" --encoding=UTF8 --no-locale --auth=trust >/dev/null
fi

if ! pg_ctl -D "$CRM_CALA_ROSSA_DATA_DIR" status >/dev/null 2>&1; then
	pg_ctl -D "$CRM_CALA_ROSSA_DATA_DIR" -l "$CRM_CALA_ROSSA_LOG" -o "-p $CRM_CALA_ROSSA_PORT -h 127.0.0.1 -k $CRM_CALA_ROSSA_SOCKET_DIR" start >/dev/null
fi

if ! pg_isready -h 127.0.0.1 -p "$CRM_CALA_ROSSA_PORT" -d postgres >/dev/null 2>&1; then
	printf 'BROKEN: Cala Rossa Postgres did not become ready.\n' >&2
	exit 1
fi

if ! psql -h 127.0.0.1 -p "$CRM_CALA_ROSSA_PORT" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$CRM_CALA_ROSSA_DB'" | grep -qx 1; then
	createdb -h 127.0.0.1 -p "$CRM_CALA_ROSSA_PORT" "$CRM_CALA_ROSSA_DB"
fi

printf 'PASS isolated database: %s on 127.0.0.1:%s\n' "$CRM_CALA_ROSSA_DB" "$CRM_CALA_ROSSA_PORT"
