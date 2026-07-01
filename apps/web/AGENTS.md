# Web application instructions

These rules extend the root `AGENTS.md`. Read that first.

## Before any frontend task

- Read `docs/design/STYLE_GUIDE.md` — mandatory for any visual change, no exceptions.
- Read `docs/architecture/FRONTEND.md` for structural questions.
- The calendar page and settings page are the visual gold standard. Match them exactly.

## Component rules

- **Build components to be reused.** Before writing UI logic in a module, check `src/components/`
  for an existing component that does it. If one doesn't exist but a second consumer is plausible
  within the project scope, build it as a shared component from the start.
- A component lives in `src/components/` when two or more modules use it, OR when it is a
  clear self-contained UI primitive (picker, button group, toggle, modal wrapper, etc.).
- A component lives in `src/modules/<name>/` when it is tightly coupled to that module's
  domain logic and unlikely to be reused.
- Never duplicate UI logic between modules — extract to `src/components/` and import.

## Code rules

- Use semantic HTML. Every interactive element must be keyboard-accessible.
- Visible focus states are required on all focusable elements — never suppress outline without
  replacing it with a visible alternative.
- Touch targets must be at least 44×44px on any element the design requires to be touchable.
- Keep server state at API boundaries (`src/lib/api.ts`). Local interaction state stays in
  the component that owns it — never lift unnecessarily.
- Same-origin `/api` calls only. Never construct absolute API URLs in component code.

## Verification

Run `npm run check --workspace @secondbrain/web` before declaring any task complete.
