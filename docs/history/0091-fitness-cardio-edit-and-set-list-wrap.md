# 0091 — Fitness history cardio edit labels and wrapped set list

Date: 2026-07-06
Status: accepted

## What changed
Updated the editable workout history card so cardio exercises show a cardio badge beside the name, and cardio set fields now render as Distance + Time instead of Reps + Weight. The set list also now wraps with flex so two sets can sit side by side when there is enough room.

## Why
The history edit view needed to match cardio semantics instead of showing strength-only labels, and the set rows should use horizontal space better on wider screens without forcing a single long column.

## Files touched
- `apps/web/src/modules/fitness/SessionForm.tsx` — loaded exercise categories for the editing view, showed the cardio badge in the exercise header, switched cardio rows to Distance/Time labels and update payloads, and preserved strength rows as Reps/Weight.
- `apps/web/src/modules/fitness/fitness.css` — made the history set list a flex container inside the fitness history section, gave each set card a flexible width for two-column wrapping, and added a small title-row flex helper for the exercise name and badge.

## How the pieces connect
`SessionForm.tsx` fetches exercises when a session enters edit mode, so it can use the backend category for each exercise instead of guessing from the name. That category controls both the icon shown beside the exercise name and which set fields are editable. The CSS then handles the wrapping layout: the list becomes a flex container, each set card grows to fill available space, and narrower screens naturally collapse to a single column.

## How to modify this later
If cardio should use different labels or units, change the conditional render block in `SessionForm.tsx` where the set fields are chosen. If you want a different break point for one-column mode, adjust the `.fit-history .fit-history-set-list` and `.fit-history-set` flex rules in `fitness.css`.
