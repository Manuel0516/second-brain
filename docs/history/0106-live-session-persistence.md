# 0106 — Live session persistence across navigation/reload/logout

Date: 2026-07-06
Status: accepted

## What changed
The active workout session (in-progress sets, notes, and the DB session id it's
tied to) is now persisted to `localStorage` on every change and restored on
mount. Previously it lived only in React state in `Fitness`, so navigating
away from the fitness page, reloading, or getting logged out silently
discarded whatever the user had logged so far. The session is only cleared
from storage once `handleFinishSession` successfully completes.

## Why
User report: an in-progress live session should survive page changes, reloads,
and logout — it should only go away when the user explicitly hits Finish.

## Files touched
- `apps/web/src/modules/fitness/Fitness.tsx` — added `LIVE_SESSION_KEY` +
  `loadStoredLiveSession()`; `activeSession`/`activeSessionId`/
  `activeSessionNote` now lazy-init from `localStorage`; a new `useEffect`
  writes them back on every change and removes the key once `activeSession`
  becomes `null` (i.e. after Finish).

## How the pieces connect
Same pattern already used by `Sidebar.tsx` (`sb-calendar-order`) and
`Calendar.tsx` (`sb-cal-row-h`, `sb-note-pane-width`) — plain
`localStorage.getItem`/`setItem` with JSON, no new dependency or storage
abstraction. `ActiveSession` is already plain serializable data (name/prev/
category/sets), so no encoding changes were needed.

## How to modify this later
If the stored shape of `ActiveSession` changes in a breaking way, bump the
key name (e.g. `sb-fitness-live-session-v2`) rather than trying to migrate
old JSON — stale/malformed JSON is already handled by the try/catch in
`loadStoredLiveSession`, returning `null`.
