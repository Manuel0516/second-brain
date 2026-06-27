# Infrastructure instructions

- Load architecture and auth/security only; feature specifications are out of scope.
- Production exposes only nginx through the external `traefik` network.
- Keep API, PostgreSQL, and MinIO on the private application network with no host ports.
- Preserve `brain.zero-five.space`, the `letsencrypt` resolver, and the Hub label contract.
- Pin deployable image versions; never use `latest` in production configuration.
- Do not run deployment or VPS commands without explicit approval.
