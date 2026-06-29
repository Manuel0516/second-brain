# ADR 0005: Settings module implementation decisions

Status: accepted
Date: 2026-06-29

## Context

Plan A (SETTINGS_IMPLEMENTATION_PLAN.md) was implemented and verified. The settings
module added a `/settings` area with General and Calendar pages, a `UserSettings`
table, and moved hardcoded icon/colour presets into user-editable saved settings.

## Decisions

**UserSettings table — lazy creation.** Settings rows are created on first write
rather than on user creation. Avoids a migration dependency and keeps the sign-up
path simple; the GET endpoint returns sensible defaults when no row exists yet.

**Favourite emojis and colours live in UserSettings, not a separate table.**
Single row per user, JSON columns. The data is always read and written together,
so normalising it into child rows would add joins with no benefit.

**EventEditor presets come from the API, not hardcoded constants.**
`modules/calendar/colors.ts` and the `ICON_PRESETS` array in `EventEditor.tsx`
are replaced by a settings API call. The editor now reflects the user's saved
picks instead of a compile-time list.

**Settings area reuses the existing rail → sidebar → canvas shell.**
No new layout component. The gear icon in the app-rail routes to `/settings`;
the contextual sidebar lists pages (General, Calendar, and stub "Soon" rows for
Fitness, Food, Notes, Security). Same visual pattern as the calendar sidebar.

**Non-working pages shown as disabled "Soon" rows.**
Fitness, Food, Notes, and Security(2FA) pages are present in nav but inert.
Consistent with the Google import button pattern already in the calendar sidebar.

**Username added to `User` with a backfill migration.**
Column added nullable, backfilled from the email local-part, unique index added,
then set NOT NULL — safe for an existing database with data.

## Consequences

- Event editor icon and colour pickers reflect user preferences without a redeploy.
- Adding new settings pages in future requires only a new sidebar row and route.
- The "Soon" stubs set a clear visual contract for upcoming work without shipping
  placeholder functionality.
