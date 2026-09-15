#!/bin/sh

set -eu

. "$(dirname "$0")/env.sh"

if [ -s "$CRM_CALA_ROSSA_DATA_DIR/PG_VERSION" ] && pg_ctl -D "$CRM_CALA_ROSSA_DATA_DIR" status >/dev/null 2>&1; then
	pg_ctl -D "$CRM_CALA_ROSSA_DATA_DIR" stop >/dev/null
	printf 'PASS database stopped\n'
else
	printf 'PASS database already stopped\n'
fi
