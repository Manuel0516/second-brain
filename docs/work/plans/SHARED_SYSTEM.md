
  # Notes PDF export and account sharing

  ## Summary

  Add a print-optimized PDF export for individual notes, plus direct
  sharing between existing accounts for whole calendars and individual
  notes. Calendar and note owners can grant viewer or editor access
  immediately by email; notes support CRDT-backed live collaboration for
  editors.

  ## Key changes

  - Add a Notes “Export PDF” action that opens a dedicated print layout
    containing the full rendered note, title, and relevant metadata while
    excluding application chrome. Invoke the browser print dialog so the
    user can save/download a PDF without a server-side PDF service or
    dependency.

  - Add a reusable resource-sharing data model for calendar and note
    resources: resource ID, recipient user ID, role (viewer/editor),
    timestamps, unique recipient-per-resource constraint, and indexes for
    recipient lookups.

  - Add owner-only sharing management endpoints/UI: share with an existing
    account email, change role, list collaborators, and revoke access.
    Invitations grant immediate access; no email delivery, acceptance
    workflow, groups, or public links.

  - Enforce permissions in every calendar/note read, write, sharing, and
    real-time endpoint:
      - Owners manage sharing and retain full control.
      - Editors can create/update calendar events or edit note content,
        but cannot change sharing.

      - Viewers have read-only access, including note PDF export.
      - Revoked users immediately lose API and WebSocket access.

  - Surface shared calendars alongside owned calendars, clearly labeled
    with permission state; render shared notes in the normal Notes
    experience with owner/role indicators and a collaborator management
    control for owners.

  - Implement real-time note editing with Yjs-compatible CRDT documents
    and a minimal authenticated FastAPI WebSocket relay/persistence layer.
    Store collaboration updates durably in PostgreSQL and hydrate notes
    through the existing note API, so concurrent edits merge safely
    instead of overwriting each other.

  - Add connection/presence indicators sufficient to show collaboration
    state, but exclude comments, mentions, revision history, folder/
    workspace sharing, and granular event sharing from this release.

  - Update the required docs/history/ entry and docs/history/CHANGELOG.md.

  ## Interfaces and data behavior

  - Calendar and note responses include the caller’s effective role and
    enough collaborator metadata for the sharing UI.

  - Sharing APIs accept an existing user email and requested role;
    nonexistent/self recipients return a safe validation error without
    disclosing unrelated account details.

  - Calendar list/read and note list/read endpoints return resources the
    caller owns or is explicitly shared on, always filtered by effective
    permission.

  - Note collaboration WebSocket connections are authenticated, authorized
    for the requested note, and reject viewers from submitting updates.
    The canonical persisted note representation is derived from the CRDT
    document so normal rendering, search, and PDF export remain
    consistent.

  ## Test plan

  - Export a text-, media-, and long-content note; verify the print view
    contains all rendered content and excludes navigation/editor controls.

  - Verify owner, editor, viewer, and revoked-user access for both
    calendars and notes, including role changes and access removal.

  - Verify shared-calendar viewers cannot modify events; editors can;
    neither can alter sharing.

  - Verify two editors make overlapping note changes and both changes
    converge after reconnect; viewers receive updates but cannot submit
    them.

  - Run the existing backend test suite and npm run check; add focused
    API, WebSocket, and UI tests for the above behavior.

  ## Assumptions

  - Sharing is per whole calendar and per individual note, only between
    already-registered accounts.

  - Browser “Save as PDF” fulfills download/export without introducing a
    server-side renderer.

  - Adding focused CRDT collaboration dependencies is approved; no other
    new dependencies will be added without a separate rationale and
    approval.