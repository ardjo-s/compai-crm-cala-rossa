# Setup for this install (Cala Rossa)

This repo is `ardjo-s/compai-crm-cala-rossa`, default branch `release`.
**It is the Cala Rossa project CRM only.** Comp AI is single-tenant and has
no organisations, so a second business needs a second install — not a second
org inside this one.

Read `docs/setup.md` and `docs/environment.md` first. This file only adds the
values that belong to this install. **Do not commit real secrets.**

Workspace timezone: **Europe/Paris**.
Primary sign-in: **hi@ardjo.design**.
Allow-list domain: **ardjo.design**.

A personal Gmail exists. Do not put it in git. Add it to `ALLOWED_SIGN_IN` in
the local `.env` or in Vercel only if that address must sign in.

## Two installs, two databases

| | This repo | The other repo |
| --- | --- | --- |
| GitHub | `ardjo-s/compai-crm-cala-rossa` | `ardjo-s/compai-crm` |
| What it is | Cala Rossa project CRM | THEWHATIF.COMPANY / GojiberryAI CRM |
| Database | Its own Neon (or local Postgres) | A **different** Neon |
| Vercel | Its own three projects (app, api, agent) | A **different** trio |
| Secrets | Its own `.env` / Vercel env | Its own, never copied from here |

**Never share `DATABASE_URL` between installs.** One connection string in both
places writes Cala Rossa rows into the company CRM, or the reverse. Generate
`BETTER_AUTH_SECRET`, `AGENT_BRIDGE_SECRET` and `CRON_SECRET` separately too.

The same Google OAuth client **is** fine. Add **both** API redirect URIs on
that client:

| Install | Redirect URI |
| --- | --- |
| This Cala Rossa API, local | `http://localhost:3001/api/auth/callback/google` |
| This Cala Rossa API, deployed | `https://<CALA_ROSSA_API_HOST>/api/auth/callback/google` |
| Main company API, deployed | `https://<COMPANY_API_HOST>/api/auth/callback/google` |

If both installs run locally at once, they cannot share `:3000` / `:3001` /
`:2000`. Stop one, or give the second install different ports and a second
local redirect URI.

`scripts/cala-rossa/` is the **local** isolated Postgres for this project
(`cala_rossa_crm` on `127.0.0.1:55432`). That is this install's data, not a
sidecar next to a company workspace. The company CRM lives in the other repo.

## Tool map

| Already in Cursor | This CRM |
| --- | --- |
| Gmail (`hi@ardjo.design`) | Native Google OAuth + mailbox sync. Primary evidence path. |
| Google Calendar | Same Google client. Meetings are `crm.meeting-attendance`. |
| Google Drive | Not wired. Attach files by URL or paste. See below. |
| Notion | Agent tool `search_notion_pages` when `NOTION_API_KEY` is set. |
| Linear | Agent tool `search_linear_issues` when `LINEAR_API_KEY` is set. Issue **create** stays in Cursor. |
| X | Agent tool `lookup_x_posts` when `X_BEARER_TOKEN` is set. Profile verify is still `set_contact_socials`. |
| Granola | Not an agent API. Calendar sync + CRM notes. Cursor MCP reads transcripts. |
| Resend | No outbound send from this product. Drafts only. |
| Qonto | Out of CRM scope. Do not wire. |
| Slack / Salesforce | Not installed. Skip. |
| ChatPRD / Figma / GitHub | Low priority. Use only when a public URL is already on the record. |

The research agent reports **observed facts only**. It does not guess a person,
a title, an email, or a funding round.

## Local first run

```sh
cp .env.ardjo.example .env
# then paste secrets. Never commit .env.

bun install
docker compose up -d
bun run db:deploy
bun run db:seed          # optional demo pipeline; skip for a clean Cala Rossa DB
bun run dev              # app :3000, api :3001, agent :2000
```

For the isolated local profile (loopback Postgres on `:55432`), use
`scripts/cala-rossa/` instead of `docker compose`. See
`scripts/cala-rossa/README.md`.

Generate the secrets yourself. Do not reuse values from `ardjo-s/compai-crm`.

```sh
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # AGENT_BRIDGE_SECRET
openssl rand -base64 32   # CRON_SECRET (min 16 chars)
```

`ALLOWED_SIGN_IN` in `.env.ardjo.example` is already:

```
ardjo.design,hi@ardjo.design
```

`ardjo.design` admits every address at that domain. `hi@ardjo.design` is listed
so a one-address read of the file still shows who this install is for.

Set the Google pair in `.env`. Leave Microsoft empty unless you add Entra later.

## Google Cloud (Gmail + Calendar + sign-in)

One OAuth client does sign-in **and** mailbox sync. There is no extra redirect
for Gmail. The same client may serve this install and `ardjo-s/compai-crm` if
every API origin is listed.

1. Open [Google Cloud credentials](https://console.cloud.google.com/apis/credentials).
2. Create (or reuse) a project for Ardjo's Comp AI installs.
3. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   and the [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
4. OAuth consent screen:
   - If `ardjo.design` is a Google Workspace domain, set **User type: Internal**.
   - If it is External, add **hi@ardjo.design** as a test user. `gmail.readonly`
     is restricted; going External for production needs Google's verification.
5. Create an OAuth client ID → **Web application**.
6. Authorised redirect URIs — **API origin**, never the app origin. List every
   install you actually run (see the table above).
7. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in **this** install's
   `.env` (and later in **this** Vercel project). Both or neither.

Sign in at `http://localhost:3000` with **hi@ardjo.design**. Grant Gmail and
Calendar. Sync is forward-only: the first pass records the current Gmail
history id and the current time on Calendar. It does not import old mail.

Mailbox grant is per install. Signing in here does not grant the company CRM,
and the reverse is also true.

### Google Drive

Drive is not a CRM connection. Do not add Drive scopes to this OAuth client —
that would widen a restricted Gmail app for no product path.

To attach a file: put a sharing link in a note, or paste the observed text.
The agent must not scrape Drive.

## Agent bridge

Same value in the root `.env` (one file, all three processes):

```
AGENT_URL="http://127.0.0.1:2000"
AGENT_BRIDGE_SECRET="<generated>"
```

Open a contact → Agent tab. Errors: `docs/setup.md` (503 / 401 / 502).

`eve dev` does not fire cron. The poke needs `AGENT_BRIDGE_SECRET`. Queued
work while the agent was down:

```
bun run --filter=agent dispatch
```

## Mailbox cron

`CRON_SECRET` guards `POST /internal/sync/mailboxes`. Unset, the route refuses.

Locally you can hit it by hand:

```
curl -X POST http://localhost:3001/internal/sync/mailboxes \
  -H "authorization: Bearer $CRON_SECRET"
```

On Vercel the API project already lists that path every five minutes in
`apps/api/vercel.json`. Minute-level cron needs Pro. Hobby silently becomes
daily. Set the Vercel project's **cron timezone** to `Europe/Paris`.

## Optional agent sources

Set none of these and the agent still runs from Gmail, Calendar, and the CRM.

| Variable | Where to mint | What turns on |
| --- | --- | --- |
| `PERPLEXITY_API_KEY` | Perplexity API settings | Open-web research with citations |
| `NOTION_API_KEY` | Notion integrations | `search_notion_pages` |
| `LINEAR_API_KEY` | Linear Settings → API | `search_linear_issues` (read) |
| `X_BEARER_TOKEN` | X developer portal, app bearer | `lookup_x_posts` |
| `GITHUB_TOKEN` | Classic token, no scopes | Higher GitHub rate limit |
| Context.dev key | **Settings → General** in the app | Brand + LinkedIn. Not an env var. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | Stored photos |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway | Needed off Vercel only |
| `REDIS_URL` | Redis | Shared cache across instances |

A missing key removes a place to look. It never throws.

Notion: share the Cala Rossa target databases with the integration or search
returns nothing. Do not point this key at the company CRM's Notion workspace
unless that overlap is deliberate.

Linear: the agent **searches**. It does not create issues. Create from Cursor
with a derived title, never with a pasted mail body. See
`apps/agent/agent/skills/linear.md`.

Granola: Cursor MCP. File a note on the contact after you read the transcript.
See `apps/agent/agent/skills/granola.md`.

Resend: this CRM does not send mail. Draft in the Agent tab or in Cursor.
A human sends.

## Vercel (do not deploy from this agent)

Three deployments plus Postgres, same as upstream README. Create **new**
Vercel projects for this repo. Do not attach this git repo to the company
CRM's projects.

| Process | What to set |
| --- | --- |
| All three + migrate | `DATABASE_URL` (Cala Rossa Neon only) |
| App + API | `BETTER_AUTH_SECRET`, `ALLOWED_SIGN_IN`, `API_URL`, `APP_URL` |
| API + App | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| API | `CRON_SECRET`, optional `REDIS_URL` |
| App + Agent | `AGENT_URL`, `AGENT_BRIDGE_SECRET` |
| Agent | optional research keys above |
| Cookie across subdomains | `AUTH_COOKIE_DOMAIN=.your.parent` |

`API_URL` is the auth origin. Add that host's Google redirect URI before the
first production sign-in.

Preview deploys share production `DATABASE_URL` in this product. Do not test
migrations on a preview. `docs/setup.md`.

Pull env with `vercel env pull .env.vercel`, never onto `.env.local`. Pulling
the **company** project's env into this repo is how the two databases get
swapped.

## Dual-install checklist

- [ ] This repo uses a Cala Rossa Neon URL, not the company one.
- [ ] `ardjo-s/compai-crm` uses a different Neon URL.
- [ ] Each install has its own `BETTER_AUTH_SECRET` / `AGENT_BRIDGE_SECRET` / `CRON_SECRET`.
- [ ] Google OAuth lists this API callback **and** the company API callback.
- [ ] Vercel projects for this repo are not the company projects.
- [ ] Workspace onboarding name here is Cala Rossa, not the company name.

## Secrets checklist (paste locally / in this Vercel project)

Names only. Generate or copy from the provider console. Do not paste values
from the company install.

**Required to sign in**

- [ ] `BETTER_AUTH_SECRET`
- [ ] `ALLOWED_SIGN_IN` (`ardjo.design,hi@ardjo.design`)
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `DATABASE_URL` (Cala Rossa only)

**Required for Agent tab + dispatch poke**

- [ ] `AGENT_BRIDGE_SECRET`
- [ ] `AGENT_URL` (local default `http://127.0.0.1:2000`)

**Required for mailbox cron**

- [ ] `CRON_SECRET`

**Optional**

- [ ] `PERPLEXITY_API_KEY`
- [ ] `NOTION_API_KEY`
- [ ] `LINEAR_API_KEY`
- [ ] `X_BEARER_TOKEN`
- [ ] `GITHUB_TOKEN`
- [ ] `BLOB_READ_WRITE_TOKEN`
- [ ] `REDIS_URL`
- [ ] `AI_GATEWAY_API_KEY`
- [ ] Context.dev key in **Settings → General** (not env)

Do not put `ardjo.Shahadat@gmail.com` app passwords, Qonto tokens, or Resend
keys in this repo.
