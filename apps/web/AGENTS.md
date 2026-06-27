# Web application instructions

- Load `docs/product/DESIGN_SYSTEM.md` for visual work and only the affected feature specification.
- Use semantic HTML, visible focus states, keyboard support, and touch targets of at least 44px where the design requires touch interaction.
- Keep server state at API boundaries and local interaction state close to the component that owns it.
- Do not create a shared component until two real consumers need the same behavior.
- Preserve same-origin `/api` calls in development and production.
- Verify with `npm run check --workspace @secondbrain/web`.
