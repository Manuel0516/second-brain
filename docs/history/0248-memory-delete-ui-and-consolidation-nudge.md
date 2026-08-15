# 0248 — Delete-a-memory UI + proactive consolidation nudge

Date: 2026-08-15
Status: accepted

## What changed

**Settings UI**: the Memory card in AI settings listed facts but had no way to remove
one — the backend `DELETE /api/ai/memories/{id}` route already existed, just unused by
the frontend. Added a "✕ Forget" `IconButton` per row.

**Proactive, time-aware consolidation**: the system prompt's "Recent facts" list now
shows each fact's age (`- fact text (Nd ago)`). When 8 or more raw `fact`-category
entries are 14+ days old, the prompt adds a "Memory cleanup" nudge telling the agent to
run the existing `memory-consolidation` skill unprompted, that turn.

This is deliberately NOT a silent background cron job that rewrites memory on its own.
`remember`/`forget` are `is_write: True` tools — under the default `ask_before_write`
autonomy, running them (even for the agent's own memory store) still shows the user a
confirm/reject card, exactly like every other AI-made change (see
`docs/product/AI_ASSISTANT_MODULE.md` §3: "never a silent edit"). A headless job
bypassing that would contradict the product's own safety model for a feature the user
asked to be handled automatically but wasn't asking to be exempted from visibility.
Making the *trigger* automatic (age-aware, proactive) while keeping the *write* visible
gets both.

## Why

Follow-up user request in the same session as 0247: "add the option to remove a fact
from the AI setting memory in the settings part," and "make it summarize the memory
information after certain time, and clean it to keep it up to date and nice."

## Files touched

- `apps/web/src/modules/settings/AISettings.tsx` — `deleteMemory()` calling the
  existing DELETE route; a `✕` `IconButton` per memory row.
- `apps/web/src/styles.css` — `.ai-memory-row-fact` (grow) / `.ai-memory-row-delete`
  (pinned right) so the delete button doesn't crowd short facts.
- `apps/web/src/modules/settings/AISettings.test.tsx` — `mockFetch` takes a `memories`
  override; new test clicks Forget and asserts the DELETE call + row removal.
- `apps/api/app/modules/ai/prompts.py` — `_age_days()` helper (handles both tz-aware
  Postgres and tz-naive SQLite-test datetimes); `facts_block` now shows `(Nd ago)`;
  `_STALE_FACT_DAYS`/`_STALE_FACT_THRESHOLD` constants gate a new `consolidation_hint`
  appended to the prompt.
- `apps/api/tests/test_ai.py` — asserts age rendering, that the hint stays absent below
  threshold, and appears once the threshold is crossed.

## How the pieces connect

The nudge references the `memory-consolidation` starter skill (already existed, from
0215) — it doesn't duplicate its logic, just makes the agent reach for it unprompted
instead of waiting for the user to ask "clean up my memory." The skill's own steps
(`remember`/`forget` calls) still flow through the normal write-confirmation pipeline
`agent.run` already has (see 0246 for how that pipeline now survives disconnects too).

## How to modify this later

To change how aggressively cleanup triggers, adjust `_STALE_FACT_DAYS` /
`_STALE_FACT_THRESHOLD` in `prompts.py`. To make consolidation fully unattended instead
(no confirm card), you'd need a background job calling `tools.execute` directly for
`remember`/`forget`, bypassing the `AIAction` pending-approval flow — deliberately not
done here since it conflicts with the app's "every AI write is visible" design; if the
user explicitly wants that tradeoff later, gate it behind an opt-in autonomy setting
rather than making it silent by default.
