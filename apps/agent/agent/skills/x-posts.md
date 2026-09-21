---
description: Use when an X profile is already on the record and you need dated public posts as research hooks.
---

# X posts

`lookup_x_posts` reads recent public posts from a profile URL or handle you
already hold. It is not how you discover the profile. `find_contact_socials`
and `set_contact_socials` still own identity.

## When to call it

- `twitterUrl` is already on the contact, verified.
- A rep asked what they posted recently, before a call.

Do not call it with a name guess. Do not call it to fill a missing handle.

## What comes back

Each post has text, a created time, and a permalink. Those three are the
observation. A post is dated research context, not a job title and not an
email.

If you write a public claim from a post, the evidence kind is
`web.cited-claim` and the `sourceUrl` is that permalink. Do not infer a role
from a joke, a retweet, or a reply.

## If the key is missing

`X_BEARER_TOKEN` unset means this source is off. Do not scrape x.com through
`web_fetch` as a workaround — that is not an observed profile API, and it
will lie. Note that you could not read posts, and use the CRM and LinkedIn
instead.
