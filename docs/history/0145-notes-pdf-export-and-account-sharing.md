# 0145 — Notes PDF export and account sharing

Date: 2026-07-09
Status: accepted

## What changed

Notes now provide an **Export PDF** action that opens a print-only document containing the title, ownership metadata, update timestamp, and the already-rendered note body. The browser print dialog handles saving as PDF without a server renderer.

The print window is opened as a writable blank document, then invokes `print()` after that document has loaded. This avoids the `noopener` browser behavior that otherwise returns no window handle and silently prevents the export layout from being written.

Follow-up hardening keeps the export visually aligned with the note canvas: it clones the rendered page, retains the emoji beside the title, and removes only interactive controls before printing. Vite now forwards `/api` WebSocket upgrades to FastAPI, editor badges show the actual editor/viewer role, and the normal TipTap `setContent` path is disabled while the CRDT extension owns a document.

The production Nginx API proxy also forwards the WebSocket upgrade headers, so collaboration traffic is not limited to the Vite development server.

Connected collaborators now also receive immediate title, icon, and cover updates through the same authenticated relay; block content continues to merge through Yjs.

Calendars and individual notes can now be shared directly with existing accounts as viewers or editors. Owners can grant, change, and revoke access. Shared resources include role and owner metadata in normal responses, and owners see collaborator controls in the Notes and Calendar UI.

Notes use an authenticated WebSocket relay to broadcast saved page updates and presence to connected collaborators. The editor remains on its established Tiptap JSON path, so stored note content stays the canonical representation for normal reads, search, and printing.

## Why

The requested workflow needs portable note output and immediate collaboration without public links, invitation mail, or a separate PDF service. Resource-level grants keep the permission model small while allowing calendar collaboration and live concurrent note editing.

## Files touched

- `apps/api/app/models.py` and `apps/api/alembic/versions/025_resource_sharing_collaboration.py` — resource-share and durable collaboration-update schema.
- `apps/api/app/access.py`, `app/collaboration.py`, and API routes — effective roles, owner-only sharing endpoints, permission checks, WebSocket relay, and shared note media reads.
- `apps/web/src/components/ShareManager.tsx` and Notes/Calendar modules — sharing controls, role labels, print action, connection state, and live update listeners.
- `apps/api/tests/test_sharing.py` — viewer/editor/revocation API coverage.
- `docs/architecture/DATABASE.md` — documents the new storage model.

## How the pieces connect

`resource_shares` grants access to an existing user. Calendar and note route helpers resolve the owner or grant role before every read or write; viewer requests stop at the guard, editors can change content/events, and only owners reach share management. Saved note fields are broadcast over the authenticated note WebSocket, while calendar event changes emit a calendar-refresh signal to each connected owner or collaborator.

## How to modify this later

Add another shareable resource by extending the resource-type validation and using the existing `effective_role()` helper; retain the unique recipient-per-resource invariant. The WebSocket relay is intentionally single-process; introduce a Redis fan-out only when API WebSockets run across multiple workers. Keep PDF export browser-native unless a non-browser delivery requirement genuinely needs server-side rendering.

The first CRDT editor takeover was removed after it rendered an empty client document over stored note content. Do not re-enable it until a provider has a migration test proving existing Tiptap JSON initializes into the collaborative document without a write-back.
