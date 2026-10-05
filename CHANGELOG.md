# Changelog

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
