#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$SCRIPT_DIR/env.sh"

"$SCRIPT_DIR/start-db.sh" >/dev/null
cd "$CRM_ROOT"
bun scripts/cala-rossa/verify.ts
