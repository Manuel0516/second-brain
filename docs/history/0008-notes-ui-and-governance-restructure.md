# 0008 — Notes UI fixes + project governance restructure

Date: 2026-07-01
Status: accepted

## What changed

Two categories of work:

**1. Notes UI CSS fixes**
- Fixed missing accent glow on `.editor-icon-custom:focus` (border-color was incorrectly
  set to `--border-strong` instead of `--accent`).
- Fixed double-border effect on `.editor-icon-custom` inside the notes page-head popover
  (added a scoped `:focus` override in `notes.css` that keeps `border-color: transparent`
  in that context while preserving the box-shadow glow).
- Fixed incorrect `background` on `.editor-icon-custom` (was `--bg-elevated`, now
  `--bg-base` to match calendar field inputs and give contrast inside the elevated popover).
- Fixed missing indentation on `width: 100%` in `.editor-icon-custom`.
- Changed hardcoded `border-radius: 7px` to `var(--r-md)` on `.editor-icon-custom`.

**2. Project governance restructure**
- Rewrote `AGENTS.md` as a universal guide applicable to Claude Code, Codex, and GitHub
  Copilot — single source of truth, no tool-specific sections.
- Created `.github/copilot-instructions.md` as a thin pointer to `AGENTS.md`.
- `CLAUDE.md` already pointed to `AGENTS.md` — unchanged.
- Created `docs/design/STYLE_GUIDE.md` — comprehensive UI rules extracted from
  `styles.css` and the calendar/settings component patterns.
- Created `docs/architecture/` with four files: OVERVIEW.md, FRONTEND.md, BACKEND.md,
  DATABASE.md — quick-read system documentation.
- Created `docs/work/` (replaces `docs/plans/`) with NOW.md, FIXES.md, and `plans/`.
- Created `docs/history/` (replaces `docs/decisions/`) with all seven prior entries
  converted to the new richer format + this entry (0008).

## Why

The project was growing faster than the documentation and governance structures could track.
Multiple AI tools (Claude, Codex, Copilot) were working without a shared rulebook, leading
to inconsistent UI, undocumented changes, and coordination overhead falling on the owner.

The UI fixes were needed because a previous session incorrectly changed the focus border
behavior on the icon picker input field.

## Files touched

**CSS fixes:**
- `apps/web/src/styles.css` — `.editor-icon-custom` base styles and `:focus` rule
- `apps/web/src/modules/notes/notes.css` — added scoped `:focus` override inside
  `.notes-page-head .editor-icon-popover`

**Governance (new files):**
- `AGENTS.md` — universal AI guide (complete rewrite)
- `.github/copilot-instructions.md` — Copilot pointer to AGENTS.md (new)
- `docs/design/STYLE_GUIDE.md` — UI style guide (new)
- `docs/architecture/OVERVIEW.md` — system map and request lifecycle (new)
- `docs/architecture/FRONTEND.md` — React app structure (new)
- `docs/architecture/BACKEND.md` — FastAPI + auth + migrations guide (new)
- `docs/architecture/DATABASE.md` — every table documented (new)
- `docs/work/NOW.md` — current work status (new)
- `docs/work/FIXES.md` — bug queue (new)
- `docs/work/plans/NOTES_MODULE_PLAN.md` — moved from `docs/plans/`
- `docs/history/CHANGELOG.md` — history index (new)
- `docs/history/0001–0008` — all history entries (converted + new)

## How the pieces connect

**CSS fix — how the icon picker focus works:**
The `.editor-icon-custom` input appears in two contexts:
1. Inside `EventEditor.tsx` (event editor card) — here the full accent border + glow is
   correct and desired.
2. Inside the notes page-head `EmojiPicker` popover — here the popover container already
   has a `border: 1px solid var(--border-strong)`, so showing the input's accent border
   on focus creates a visual double-ring.

The fix: `styles.css` defines the canonical focus style with `border-color: var(--accent)`.
`notes.css` adds `.notes-page-head .editor-icon-popover .editor-icon-custom:focus { border-color: transparent; }`
to suppress only the border (not the `box-shadow` glow) in the notes context. Specificity
of the notes rule beats the styles.css rule because it has a longer selector.

**Governance — how the three AI tools connect to the rules:**
```
AGENTS.md (single source)
  ├── CLAUDE.md → @AGENTS.md (Claude Code reads this natively)
  └── .github/copilot-instructions.md → "read AGENTS.md" (Copilot agent mode reads the file)
  (Codex reads AGENTS.md directly at the repo root)
```

## How to modify this later

- **Change a UI rule:** update `docs/design/STYLE_GUIDE.md` AND update `styles.css` if a
  token or pattern changes. They must stay in sync.
- **Add a new architecture section:** add a file to `docs/architecture/` and link it from
  `OVERVIEW.md`.
- **Add a new governance rule for all AIs:** edit `AGENTS.md`. The change automatically
  applies to all three tools on their next session.
- **Change Copilot's instructions:** only edit `AGENTS.md` — the copilot-instructions file
  is intentionally minimal so it never diverges.
- **Fix the icon picker double-border in a new context:** follow the same pattern — add a
  scoped `:focus { border-color: transparent }` rule in the module's CSS file, scoped to
  the container that already has a border.
