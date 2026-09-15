#!/bin/sh

set -eu

. "$(dirname "$0")/env.sh"

cd "$CRM_ROOT"

branch=$(git branch --show-current)
version=$(node -p "require('./package.json').version")
commit=$(git rev-parse HEAD)

if [ "$branch" != "release" ] || [ "$version" != "1.15.3" ]; then
	printf 'BROKEN: expected release version 1.15.3, got %s version %s.\n' "$branch" "$version" >&2
	exit 1
fi

printf 'PASS upstream release: %s version %s commit %s\n' "$branch" "$version" "$commit"

if [ -e .env ] || [ -e .env.local ]; then
	printf 'BROKEN: a root environment file persists secrets or configuration.\n' >&2
	exit 1
fi

if [ "$CRM_CALA_ROSSA_PORT" != "55432" ] || [ "$CRM_CALA_ROSSA_DB" != "cala_rossa_crm" ]; then
	printf 'BROKEN: database isolation values changed.\n' >&2
	exit 1
fi

printf 'PASS isolated database: %s on port %s, no root environment file\n' "$CRM_CALA_ROSSA_DB" "$CRM_CALA_ROSSA_PORT"
