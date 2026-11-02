# Changelog

## 1.1.0 — 2026-10-22

### Added

- **Passkeys**: after verifying their email, users can add a passkey and sign in with it next time.
  Backend endpoints under `/passkeys` (SimpleWebAuthn, single-use 5-minute challenges, required
  user verification); `usePasskeys()` hook in the new `semi-functional-email-auth/passkeys` entry
  point (optional peer dependency `@simplewebauthn/browser`).
- **Hooks**: `useEmailVerification()` (headless version of the button) and `useSession()`
  (`status`, `session`, `refresh`, `logout`).
- Button customisation: `labels`, `classNames` and `unstyled` props; `DEFAULT_LABELS` export.
- `server/openapi.json` (OpenAPI 3.1), with a test that every documented route exists.
- Docker: `server/Dockerfile`, `demo/Dockerfile` (nginx, same-origin proxy; the API address is set
  with `API_UPSTREAM`) and `docker-compose.yml`.
- Playwright end-to-end tests (`e2e/`) in Chromium, Firefox and WebKit: sign-in, sign-out, replay,
  CSRF and a real passkey ceremony with a virtual authenticator. They also run against the Docker
  images (`npm --prefix e2e run test:docker`).
- `RATE_LIMIT_PER_MINUTE` server setting (default 10).
- Threat model (`docs/security-design.md`), `SECURITY.md`, `CONTRIBUTING.md`, Code of Conduct,
  issue and pull request templates.
- CI on Node 22 and 24 plus React 19, a check that installs the packed package into a fresh app,
  coverage gates, `publint` and `are-the-types-wrong` checks,
  CodeQL, OpenSSF Scorecard, Dependabot, SHA-pinned Actions, and a Changesets release workflow that
  publishes to npm with provenance.

### Security

- Each phone.email verification URL can sign in only once (replay protection, atomic under
  concurrent requests).
- CSRF and login-CSRF protection: `Origin` / `Sec-Fetch-Site` check on every state-changing
  request, and `/create-token` requires `application/json`.
- Logout revokes the session server-side (`jti` revocation list), and sends `Clear-Site-Data`.
- Session cookie is `__Host-session` over HTTPS and `SameSite=Strict` by default
  (`COOKIE_SAME_SITE` to change it).
- `helmet` security headers (`default-src 'none'` CSP, HSTS, `nosniff`, …) and
  `Cache-Control: no-store` on auth responses.

### Fixed

- The phone.email button disappeared after sign-out (or any remount) until the page was reloaded,
  because phone.email's script only draws its button once when it loads. The script now runs again
  when the button mounts into an empty element, and a verification reported twice is only handled
  once.
- The README claimed several buttons per page work; phone.email's widget only uses the first one.
- `require("semi-functional-email-auth")` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`: the
  `exports` map now uses the `default` condition, so CommonJS code (Node 20.19+, Jest in CommonJS
  mode) can load both entry points.
- The server now refuses to start with an invalid `PORT`, `SESSION_TTL_SECONDS` or
  `RATE_LIMIT_PER_MINUTE` instead of running with `NaN`.

### Changed

- **Server:** sessions issued by 1.0.0 (no session ID) are no longer accepted, so users sign in
  again once. Cookie name and `SameSite` changed as above. Requests with a foreign `Origin` now get
  `403`, and non-JSON bodies on `/create-token` get `415`.
- Node.js 20.19+ (22 or 24 recommended); Node 18 has reached end of life.
- Updated dependencies; fixed the critical `handlebars` advisory in the test tooling.

## 1.0.0 — 2026-10-05

### Added

- **Backend (`server/`)**: Express + TypeScript server. `POST /create-token` accepts only
  `https://user.phone.email/user_<id>.json`, reads the verified email from phone.email itself and
  sets a signed **httpOnly** session cookie; `GET /me`, `POST /logout`, `GET /health`; per-IP rate
  limit (10/min); requires a 32+ character `JWT_SECRET` in production.
- **Demo app (`demo/`)**: Vite + React app showing sign-in, session and sign-out.
- Component props: `clientId`, `apiUrl`, `onVerified`, `onError`, `className`, `scriptSrc`.
- Tests: component (React Testing Library), rate limiter, error handling, and backend (Supertest).
- Tooling: `tsconfig`, Jest, ESLint, Prettier, GitHub Actions CI, LICENSE.

### Changed

- The session token is no longer stored in `localStorage`; the backend sets an httpOnly cookie.
- The widget script loads once per page; multiple buttons and React StrictMode are handled, and a
  failed script load shows an error.
- `fetch` replaces axios (no runtime dependencies); `react`/`react-dom` are peer dependencies.
- Package ships ESM with type declarations (`exports`, `files`).
- Stricter email validation (single `@`, no leading/trailing/double dots, valid domain labels).
- `RateLimiter` moved from `src/middleware/` to `src/utils/` (it runs in the browser).

### Fixed

- `npm run build`, `npm test` and `npm run lint` now work (missing config and dependencies).
- The "longer than 254 characters" test was testing the 64-character local-part limit instead.
- `API_URL` was read from `process.env`, which browsers can't see; it is now a prop.

## 0.1.0

- Initial email verification button, validation utilities, rate limiter and error classes.
