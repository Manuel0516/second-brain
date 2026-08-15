# 0224 — AI settings page CSS rework + chat launcher/feedback polish

Date: 2026-08-15
Status: accepted

## What changed

Three UX fixes, all presentation-only (no behavior changes to data/handlers):

1. **AI settings page (`Settings → AI assistant`) — full CSS rework.** The page
   (`AISettings.tsx`) was styled entirely with ad-hoc inline `style={{...}}` objects on
   every field, and its two structural classes (`settings-page`, `settings-page-header`)
   had **no CSS at all** anywhere in the codebase — the header rendered with zero spacing/
   typography. Added real classes to `styles.css` (`.settings-page`, `.settings-field`,
   `.ai-memory-row`, `.ai-capability-row`, `.ai-skill-card`, `.ai-action-row`,
   `.settings-empty`, `.settings-card-saved`) matching `STYLE_GUIDE.md` tokens exactly, and
   rewrote the page to use them — same six `SettingsCard` sections, same state/handlers,
   only the markup/classes changed. Skills now get a visibly distinct treatment as
   requested: each is a bordered card (`.ai-skill-card`) with a bold name field and a
   monospace, raised-background content textarea (these are markdown procedures, not
   prose — they should read as "code the agent runs"), plus a proper `ToggleRow` enabled
   switch instead of a bare checkbox. Capabilities get a custom toggle-switch row
   (self-contained CSS, not sharing `.toggle-row`'s `!important` rules — see "how to modify
   this later"). Also fixed a real UX bug found along the way: the "Provider" field's label
   text was being replaced by "Saved" after saving, so the field's own label disappeared —
   the saved indicator is now a separate transient message, matching the pattern already
   used elsewhere in `modules/settings/`.
2. **Floating assistant launcher button z-index.** `.assistant-launcher` was `z-index: 80`,
   higher than every modal backdrop in the app (`.calendar-backdrop` and friends sit at 50)
   — so opening the event editor (or any other modal) left the launcher floating on top of
   it. Lowered to `z-index: 45`: above ordinary page content, below any modal.
3. **Chat message feedback arrows.** The ↑/↓ helpful/unhelpful buttons were full boxed
   26×26 buttons stacked below the timestamp. Wrapped `<time>` and the feedback buttons in
   a shared footer row (`.assistant-message-footer`, flex space-between) so the arrows sit
   at the bottom-right of the bubble next to the timestamp, and stripped them down to bare
   16×16 glyphs — no border, no background, color-only hover/pressed state.

## Why

Direct user request: "the entire page for AI assistant needs a completely reworkout... just
keep the structure, but rewrite the entire css for that page," plus two separate,
explicitly-scoped chat-widget fixes (launcher z-index, feedback arrow sizing/position).

## Files touched

- `apps/web/src/styles.css` — new AI-settings-page CSS section (see class list above).
- `apps/web/src/modules/settings/AISettings.tsx` — rewritten to use the new classes;
  removed the inline `fieldStyle` object; fixed the saved-indicator-overwrites-label bug;
  capabilities/skills use `ToggleRow`-style switches.
- `apps/web/src/modules/assistant/assistant.css` — `.assistant-launcher` z-index; `.assistant-message-footer`;
  `.assistant-feedback` restyled to bare small arrows.
- `apps/web/src/modules/assistant/AssistantPanel.tsx` — wraps `time` + feedback buttons in
  the new footer row.

## How the pieces connect

`.settings-card`/`.settings-card-save`/`ToggleRow`/`.integration-status` already existed as
shared building blocks used across `modules/settings/*` — the new AI-settings classes
extend that same vocabulary rather than inventing a parallel one, so the page now actually
matches its siblings instead of being the one page held together by inline styles. The
capability row's checkbox deliberately does **not** reuse the `.toggle-row` class: that
rule sets `display: flex !important` and `justify-content: space-between`, which would
fight a differently-shaped 3-child row (checkbox + code + risk badge) in ways that can't be
predicted without a browser to render it in — since none was available this session, the
safer, self-contained duplicate was worth the few extra CSS lines. Skills' own "Enabled"
toggle uses the real `ToggleRow` component directly instead, since it's a plain
label+switch and fits that component's API exactly.

## How to modify this later

- If a future settings page needs the same field pattern, reuse `.settings-field` rather
  than re-inlining styles — it's now the real, documented pattern for this app (unlike
  `GeneralSettings.tsx`'s inline styles, which predate this and weren't touched here — out
  of scope for this request).
- This was verified via `npm run check --workspace @secondbrain/web` (format, lint, 156
  tests, build) only — no browser was available this session to visually confirm the
  rendered layout. If anything looks off (particularly the capability row's custom switch,
  or the skill card spacing), that's the first place to check.
