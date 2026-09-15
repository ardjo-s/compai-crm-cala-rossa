#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$SCRIPT_DIR/env.sh"

SOURCE_DIR=${CALA_ROSSA_SOURCE_DIR:-/Users/ardjo/CODE/repos/cala-rossa/research/non-waterfront-enrichment}

"$SCRIPT_DIR/start-db.sh"
cd "$CRM_ROOT"
bun run --filter=@crm/db db:deploy
bun scripts/cala-rossa/import.ts "$SOURCE_DIR"
