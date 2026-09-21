# Outbound prospecting → this CRM

An external outbound bot may **file** companies and contacts here. It may not
invent people. Intelligence stays in `apps/agent`. This document is the contract
the bot must satisfy.

Schema: `@crm/validation/prospect-intake`
(`packages/validation/src/prospect-intake.ts`).

## What the bot may push

A batch:

```json
{
  "source": "outbound-prospecting",
  "items": [
    {
      "company": {
        "name": "Acme",
        "domain": "acme.test",
        "website": "https://acme.test",
        "facts": [
          {
            "field": "industry",
            "value": "security",
            "sourceUrl": "https://acme.test/about",
            "observation": "the about page says security software"
          }
        ]
      },
      "contacts": [],
      "accountType": "Prospect",
      "lifecycleStage": "Lead",
      "dealStages": []
    }
  ]
}
```

Rules the schema enforces:

- `source` is the literal `outbound-prospecting`.
- Company `name` and `domain` are required. The domain is a real host, not a
  free-mail suffix guessed from a person.
- A **contact is omitted** when no email was observed. First name without an
  address is allowed only as a skipped row — `contactsWithoutEmail` names them
  so the bot can report the gap instead of patterning `first.last@domain`.
- `email` must parse as an email. `ada@` fails.
- Every fact has a `sourceUrl` and an `observation` in the source's words.

Do not send titles, funding, or headcount the bot did not read.

## How to file (no Nest vendor client)

There is no public HTTP intake for this payload yet. Three legal doors:

1. **Signed-in tRPC** — `companies.create` then `contacts.create` with an
   observed email. Empty email is allowed; a duplicate email 409s. This is the
   same path a rep uses. `bun run --filter=api dev:session` mints a local
   cookie; it refuses `NODE_ENV=production`.
2. **Prisma import script** — `scripts/cala-rossa/import.ts` is the pattern:
   parse at the boundary, write `RecordSource.IMPORT`, create **no contact**
   until a public source verifies the person. Point a GojiberryAI importer at
   a JSON file that already passed `parseProspectIntake`.
3. **A human in the UI** — paste the observed company, then add the person
   when the email is on a page.

Do not POST this payload at the tracking collector. Tracking is first-party
form submit on *our* site, not a prospecting dump.

## Who to exclude before the push

Call `outboundExclusion` on **CRM state**, not on the bot's hope.

Blocked:

- Company **Account type** `Customer` or `Churned`
- Company **Lifecycle stage** `Customer`
- Any deal in an open stage (`DEMO_BOOKED`, `QUALIFIED_TO_BUY`,
  `DECISION_MAKER_BOUGHT_IN`, `CONTRACT_SENT`)
- Any deal `CLOSED_WON`

A `CLOSED_LOST` deal on a Prospect account is eligible again.

The bot must read those fields from this CRM (tRPC list, or a SQL read of
`FieldValue` keys `account_type` and `lifecycle_stage` plus `Deal.stage`)
**before** it inserts. Pushing a second prospecting row onto an open deal is
how a customer gets another cold sequence.

`list_deals` with `status: "open"` is the agent-side sweep of the same rule.

## After a row lands

The API queues research (`contact.created`). The agent fills blanks from
evidence. It will not invent the email the bot withheld. That is correct.

Outbound lists should also drop anyone who has replied — `read_crm_history`
shows `crm.thread-reply`. A replied contact is not a cold row.

## Resend

This product does not send mail. The bot may draft. A human sends, from Gmail
or from a later outbound tool. Putting a Resend key in this CRM would be a
second sender with no grant UI.
