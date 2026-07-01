# Infrastructure instructions

These rules extend the root `AGENTS.md`. Read that first.

## Before any infra task

- Read `docs/architecture/OVERVIEW.md` for the system map.
- Read `docs/product/AUTH_AND_SECURITY.md` for security constraints.
- Feature module specs are out of scope for infra work — do not load them.

## Rules

- Production exposes only nginx through the external `traefik` network. The API,
  PostgreSQL, and MinIO containers must have no host-bound ports in production.
- Preserve `brain.zero-five.space`, the `letsencrypt` resolver, and the Traefik
  Hub label contract.
- Pin all deployable image versions explicitly. Never use `latest` in production config.
- Never run deployment commands, SSH into the VPS, push images, or mutate any
  shared infrastructure without explicit owner approval in the current conversation.
- Any infra change that is not yet applied (pending VPS owner approval) must be
  documented in `docs/history/` with status "pending approval".
