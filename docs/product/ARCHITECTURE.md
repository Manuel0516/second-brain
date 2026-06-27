# Second Brain — Project Architecture & Outline

> Personal life-OS: Calendar + Notes/Pages + Finances + Fitness + Food + AI capture,
> all cross-linked, self-hosted on Contabo VPS.

---

## 1. Core Principles

1. **One graph, many views.** Everything (event, note, transaction, workout, meal) is a *node*
   that can link to any other node. The Calendar, Notes, Finance and Fitness pages are just
   different *views* over the same underlying graph — not separate silos.
2. **Calendar is the spine.** Almost everything has a date. Notes, expenses, workouts and meals
   should be able to show up on the calendar even if they "live" in their own module.
3. **Capture friction must be near zero.** If logging a meal or expense takes more than a few
   seconds, you won't do it for long. This is why AI-assisted capture (photo → structured data)
   is a first-class feature, not an afterthought.
4. **Local-first feel, server-backed truth.** Single user (you) for now, but built so Molly or
   future collaborators could get scoped access later without a rewrite.
5. **Tax-readiness by construction.** Every income/expense entry can carry a document
   (invoice, receipt, contract) from the moment it's created — not reconstructed in April.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite | Matches your existing skillset and project hub |
| Styling | Tailwind CSS + CSS variables for theme | Fast iteration, easy to make it feel "designed" not "bootstrapped" |
| Rich content editor | BlockNote or Tiptap (block-based) | Gives you Notion-style blocks, nested pages, tables, drag-and-drop natively |
| Calendar UI | Custom component on top of `date-fns` + `rrule` (not FullCalendar — its theming fights you when you want a very specific aesthetic) |
| Backend | FastAPI (Python) | You already know Python deeply; also the natural home for AI integration and data analysis (e.g. spending trends, macro tracking) |
| Database | PostgreSQL | Relational integrity for linking + JSONB for flexible block content + full-text/pgvector search later |
| Auth | JWT, same pattern as your project hub | Proven, reusable |
| File/document storage | MinIO (S3-compatible) container on the VPS | Receipts, payslips, contracts, food photos — versioned and backed up independently of the DB |
| Background jobs | APScheduler (simple) → Celery+Redis later if needed | Recurring event generation, Google Calendar sync polling, AI job queue |
| AI integration | Anthropic API (Claude) — vision for food photos, text parsing for quick capture | Structured-output prompting (JSON mode) for macros, categorization, tagging |
| Calendar sync | Google Calendar API, OAuth2, two-way sync via webhook + polling fallback |
| Reverse proxy / deploy | Traefik + Docker Compose, same as your current VPS setup |

---

## 3. Monorepo Structure

```
secondbrain/
├── apps/
│   ├── web/                 # React frontend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── calendar/
│   │   │   │   ├── notes/
│   │   │   │   ├── finance/
│   │   │   │   ├── fitness/
│   │   │   │   ├── food/
│   │   │   │   └── ai-capture/
│   │   │   ├── components/  # shared UI primitives (buttons, modals, theming)
│   │   │   └── lib/         # api client, hooks, types
│   └── api/                  # FastAPI backend
│       ├── app/
│       │   ├── modules/
│       │   │   ├── calendar/
│       │   │   ├── notes/
│       │   │   ├── finance/
│       │   │   ├── fitness/
│       │   │   ├── food/
│       │   │   ├── auth/        # login, session/JWT issuance, 2FA, login-attempt log — single account, no signup
│       │   │   └── ai/
│       │   ├── core/         # config, db session, shared security utils
│       │   └── graph/        # generic linking system shared by all modules
│       └── alembic/          # DB migrations
├── packages/
│   └── shared-types/         # TS types generated from backend schemas (keeps FE/BE in sync)
├── infra/
│   ├── docker-compose.yml
│   ├── traefik/
│   └── minio/
└── docs/
    ├── ARCHITECTURE.md        # this file
    ├── CALENDAR_MODULE.md
    ├── NOTES_MODULE.md
    ├── FINANCE_MODULE.md       # next up
    ├── DESIGN_SYSTEM.md
    └── AUTH_AND_SECURITY.md
```

---

## 4. Data Model (high level)

The key architectural decision: a **generic `Link` table** is what makes "notes connected to
events connected to expenses" possible without every module needing bespoke foreign keys.

```
User
Workspace (future-proofing for Molly / multi-user)

CalendarEvent
  - title, description, location
  - start_at, end_at, all_day
  - rrule (recurrence rule, iCal RFC 5545 standard — same format Google uses)
  - color, calendar_source ("local" | "google")
  - google_event_id (nullable, for synced events)

Page
  - title, icon, parent_page_id (nullable → nesting, like Notion)
  - type: "page" | "database" | "table"
  - content (JSONB blocks: text, heading, table, embed, file, checklist...)

Tag
PageTag / EventTag (many-to-many)

Link  ←── the generic graph edge
  - source_type, source_id
  - target_type, target_id
  - relation (e.g. "mentions", "documents", "logged_from")

FinanceTransaction
  - amount, currency, date
  - type: "income" | "expense"
  - category, source ("salary" | "freelance" | "job_X" | ...)
  - document_id (nullable → linked receipt/invoice in MinIO)
  - tax_relevant (bool), tax_category

FitnessLog
  - date, type (strength/cardio/...), exercises (JSONB), feeling/notes
  - linked_event_id (nullable)

FoodLog
  - date, meal_type, items (JSONB: name, macros, calories), photo_id
  - linked_event_id (nullable)

Attachment
  - file_path (MinIO key), mime_type, linked_to (generic via Link table)
```

This generic `Link` table is what lets a calendar event, a note, a receipt, and a workout log
all point at each other without each module knowing about the others' internals.

---

## 5. Phased Roadmap

You already sequenced this well — here's it formalized, with status as of now:

**Phase 0 — Foundations** *(spec'd: see `AUTH_AND_SECURITY.md`)*
Repo scaffold, Docker Compose stack (Postgres, MinIO, Traefik), single-user login + 2FA,
rate-limiting, base CI/deploy to VPS.

**Phase 1 — Calendar (main view)** ✅ *spec'd — see `CALENDAR_MODULE.md`*
Local CRUD events with recurrence, multi-calendar (decided: yes, from day 1), clean event
detail panel, color system, then Google Calendar two-way sync (OAuth, webhook + polling).

**Phase 2 — Notes / Pages** ✅ *spec'd — see `NOTES_MODULE.md`*
Block-based editor (polymorphic, shared with event descriptions), nested pages,
databases/tables vs. true spreadsheet blocks, page↔event linking, backlinks panel.

**Phase 2.5 — Visual Design** ✅ *mockup approved, refinement moved to Claude Design*
Dark-mode-default Zero-Five system (Neon Planet mark, simplified line icons, light mode for
daytime use), responsive down to mobile, motion system for interactions.

**Phase 3 — Finances** ← *up next*
Transaction tracking, income sources/jobs as entities, document attachment, category/tax
tagging, export view for tax season.

**Phase 4 — Fitness & Food** ✅ *spec'd — see `FITNESS_MODULE.md` and `FOOD_MODULE.md`*
Logs linked to calendar, progress-bar goals, statistics (PRs, volume, progression charts),
wearable data import (Mi Band 9, via manual export — see module doc for why), recipes as a
Notes database with TikTok-sourced recipe previews.

**Phase 5 — AI Assistant** ✅ *spec'd — see `AI_ASSISTANT_MODULE.md`*
Grew from "photo → macros capture" into a full Notion-AI-style agent: tool-calling over the
existing module APIs (no new backend logic, just a new client), semantic search via
pgvector, ask-before-write safety model, pluggable provider (Claude/GPT/local).

**Settings** ✅ *spec'd — see `SETTINGS_MODULE.md`*
Reminders (email, via a transactional provider rather than self-hosted SMTP), password/2FA,
general app settings, AI provider configuration, data export.

---

## 6. What's next

Once you confirm this structure, the next sessions go module by module — starting with
**Calendar**, since it's your main view. For each module we'll define: exact data fields,
UI behavior (what happens on click, drag, hover), edge cases (timezones, recurring event
exceptions, etc.), and only then move to visual design.
