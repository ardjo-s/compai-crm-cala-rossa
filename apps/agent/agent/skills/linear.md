---
description: Use when checking whether a follow-up from a reply or meeting already exists as a Linear issue.
---

# Linear issues

`search_linear_issues` reads issues. It does not create them. Creating an
issue from customer mail would send their words to a third party, which this
agent must not do.

## When to call it

- A meeting or a reply produced a follow-up, and you need to know whether an
  issue already exists.
- A rep asked what is already tracked for this company.

The query is a **derived** string: the company name on the record, or a short
public identifier. Never a pasted email, never a Granola transcript.

## What this agent does with a hit

Return the identifier, title, URL, state, and created time as observed. Tell
the rep the issue already exists. Do not open a second one.

## What this agent does not do

- It does not POST to Linear.
- It does not put mailbox text, meeting notes, or personal email into Linear.
- It does not guess a title for a person.

Turning a reply or a meeting into a **new** issue is a Cursor-side action for
the human (Linear MCP in Cursor). Suggest a title made only from the company
name and the kind of follow-up ("Acme — send contract"), then stop.

If `LINEAR_API_KEY` is unset, say you could not search Linear. Use the CRM
tasks and notes instead.
