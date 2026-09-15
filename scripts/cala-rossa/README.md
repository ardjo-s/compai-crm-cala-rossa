# Entré Business Cala Rossa

This profile keeps Cala Rossa in one isolated Comp AI CRM database.

The upstream CRM is single tenant. Use another database or deployment for each additional business.

## Current profile

- Workspace: `Entré Business Cala Rossa`
- Database: `cala_rossa_crm`
- PostgreSQL: `127.0.0.1:55432`
- Ranked buyer accounts: 29
- Qualified opportunities: 71
- Confirmed non-waterfront villas: 37
- Provisional villas with no waterfront claim: 27
- Inventory classes needing one exact unit: 7
- Contacts: none until a decision maker has verified public evidence
- Outreach: human approval required before every send
- Paid enrichment: disabled
- Telemetry: disabled in the local profile

## Commands

```sh
scripts/cala-rossa/import.sh
scripts/cala-rossa/verify.sh
scripts/cala-rossa/status.sh
scripts/cala-rossa/stop-db.sh
```

The scripts do not create `.env` files or authentication secrets. The database runs with local trust authentication on loopback only.

The source audit contains 99 rows and 153 exact property URLs. Confirmed waterfront, ambiguous waterfront, adjacent and non-villa rows stay outside the active CRM pipeline.

Source directory: `/Users/ardjo/CODE/repos/cala-rossa/research/non-waterfront-enrichment`

The web interface still needs one allowed sign-in address and a generated auth secret stored in macOS Keychain. That step is intentionally not automatic.
