---
description: Use when a Notion page might hold a target list, a note, or a public claim about a company already on the record.
---

# Notion pages

`search_notion_pages` reads pages this install can see. It does not write, and
it does not identify a person.

## When to call it

- The record already names a company, and you want notes or a target list that
  mention that company.
- A rep asked what we already wrote down in Notion.

Do not call it to invent a job title, an email, or a funding fact.

## How to query

Pass a **derived** string: the company name or domain already on the record.
Never paste a mailbox thread, a signature, or a meeting transcript into Notion.

If `NOTION_API_KEY` is unset, the tool says so. That is not a failure. Use
Gmail, Calendar, and `read_crm_history` instead, and say what you could not
check.

## What to record

Each result is an observation: title, URL, last edited time. Quote only what
the page states. If you write a fact from it, the evidence kind is
`web.cited-claim` and the `sourceUrl` is that page URL.

A Notion page that does not name this person is not about this person. Leave
the field empty.
