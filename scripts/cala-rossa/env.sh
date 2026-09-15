#!/bin/sh

set -eu

CRM_ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
export CRM_ROOT
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
export CRM_CALA_ROSSA_PORT=55432
export CRM_CALA_ROSSA_DB=cala_rossa_crm
export CRM_CALA_ROSSA_DATA_DIR="$CRM_ROOT/.local/postgres"
export CRM_CALA_ROSSA_SOCKET_DIR="$CRM_ROOT/.local/socket"
export CRM_CALA_ROSSA_LOG="$CRM_ROOT/.local/postgres.log"
export DATABASE_URL="postgresql://$USER@127.0.0.1:$CRM_CALA_ROSSA_PORT/$CRM_CALA_ROSSA_DB?schema=public"
export CRM_TELEMETRY_DISABLED=1
export DO_NOT_TRACK=1
