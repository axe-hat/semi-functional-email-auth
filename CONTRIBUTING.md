# Contributing

Thanks for helping out! Bug reports, docs fixes and pull requests are all welcome.

## Setup

Requirements: Node.js 20.19+ (22 or 24 recommended).

```bash
npm install
npm --prefix server install
npm --prefix demo install
npm --prefix e2e install && npm --prefix e2e run install-browser   # only for end-to-end tests
```

## Before you open a pull request

```bash
npm run check              # lint, typecheck, tests, build, package checks (library)
npm --prefix server test   # backend
npm run test:e2e           # demo + backend in a real browser (Playwright)
E2E_BROWSERS=chromium,firefox,webkit npm run test:e2e
npm --prefix e2e run test:docker   # the same tests against the Docker images
npm run format             # Prettier
```

- Keep pull requests focused on one change, and add tests for it.
- If the published library changes, add a changeset: `npm run changeset` (pick patch, minor or
  major and describe the change for users). It becomes the CHANGELOG entry at release time.
- If an endpoint changes, update `server/openapi.json` too (a test checks that its routes exist).
- Security-sensitive changes: please read [docs/security-design.md](docs/security-design.md) first.

## Commit messages

Short imperative subject (e.g. "Add passkey sign-in"), with a body explaining why when it isn't
obvious.

By contributing you agree that your work is released under the [MIT License](LICENSE) and that you
follow the [Code of Conduct](CODE_OF_CONDUCT.md).
