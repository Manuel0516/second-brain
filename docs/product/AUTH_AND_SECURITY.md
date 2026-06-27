# Auth & Security

Single-user app, but reachable on the open internet via your VPS — so the login isn't a
formality, it's the only thing standing between your entire life data and anyone who finds
the URL. Treat it accordingly.

## 1. Login Model
- **No signup flow** — exactly one account, seeded at deploy time (via a CLI command or env
  var on first boot), not through a public registration form.
- **Credentials**: email (or just a username) + password, hashed with `argon2` (preferred
  over bcrypt for new projects — better resistance to GPU cracking).
- **Optional TOTP 2FA** — strongly recommended given public exposure. Standard
  authenticator-app flow (Google Authenticator/Authy/1Password all work), stored as an
  encrypted secret, enabled from a settings page.

## 2. Session Handling
- **JWT access token**, short-lived (~15 min), stored in an `httpOnly`, `Secure`,
  `SameSite=Strict` cookie — never in `localStorage` (XSS-exposed).
- **Refresh token**, longer-lived (~30 days), rotated on each use, also `httpOnly` cookie.
  "Remember this device" just extends refresh lifetime rather than introducing a separate
  mechanism.
- Logout invalidates the refresh token server-side (a `revoked_at` column), not just
  client-side cookie deletion.

## 3. Brute-force Protection
- Rate limit login attempts per IP (e.g. 5 attempts / 5 minutes, exponential backoff after).
- Track failed attempts in a `LoginAttempt` table (timestamp, IP, success bool) — gives you
  a small audit log and the data needed for the rate limiter.
- At the infrastructure level: **fail2ban** watching Traefik's access logs for repeated 401s
  on the login endpoint, banning the IP at the firewall after a threshold — defense in depth
  below the application layer.

## 4. Transport & Infra
- HTTPS-only via Traefik + Let's Encrypt, HSTS header enabled.
- Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Content-Security-Policy` scoped to your own domain + the few third parties you actually
  use (Google Calendar API, Anthropic API).

## 5. Optional Extra Layer (worth seriously considering)

Since this is genuinely single-user, you don't strictly need the app reachable on the public
internet at all. Two options, not mutually exclusive with the above:

- **Tailscale/WireGuard**: put the VPS on a private mesh network; the app is only reachable
  from your own devices, full stop. Most robust option — removes the public attack surface
  entirely, login becomes a second layer rather than the only layer.
- **HTTP Basic Auth at the Traefik level**, in front of the app's own login. Cheap to set up,
  blocks unauthenticated requests before they even reach your application code (so a zero-day
  in your own auth logic isn't immediately exploitable from the internet).

My recommendation: app-level login + 2FA is the baseline either way (don't skip it even with
Tailscale, in case you ever want to share read-only access with someone later). Tailscale on
top is the highest-leverage single addition if you want to stop thinking about this entirely.
