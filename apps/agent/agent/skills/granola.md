---
description: Use when a meeting on our calendar, or a Granola transcript already filed as a CRM note, is the evidence in front of you.
---

# Granola and meetings

This agent has no Granola API key and must not pretend it does. Granola lives
in Cursor for the human. What this agent can read is already in the CRM.

## Primary path — the calendar we sync

Google Calendar is connected through the same OAuth client as Gmail. Meetings
land on the record. `read_crm_history` returns them. Attendance is
`crm.meeting-attendance`. That is the source of truth for who was in the room.

## Granola transcripts

A Granola transcript is evidence only when it is already filed here: a CRM
note, an activity, or text the rep pasted into this conversation.

Quote what the note actually says. Do not reconstruct a meeting you did not
read. Do not invent who spoke, what they promised, or a next step they did
not state.

If the transcript has a URL, a public claim you write from it is
`web.cited-claim` with that URL. Attendance still comes from the calendar
row, not from the transcript.

## Cursor-side, not this agent

Pulling a fresh Granola transcript is a Cursor MCP action (`list_meetings`,
`get_meeting_transcript`). The human or Grok Bot does that, then files a note
on the contact or pastes the observed lines here. This agent does not call
Granola.

## Linear follow-ups from a meeting

If the meeting states a follow-up, search Linear with the company name (see
`linear.md`). Do not create the issue. Do not send the transcript to Linear.
