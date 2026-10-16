<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

Student Registry is the Registry module of a student management system:
enrolment, fees and payments, assessment submissions, and marks and results,
with a Staff view and a Student view. `.docs/DECISIONS.md` explains every product rule.
Read it before changing behaviour, and add to it when you make a new decision.

## Commands

- `npm run check`: format check, type-check (runs `next typegen` first, because
  route types are generated) and lint with zero warnings.
- `npm run format`: apply Prettier, including Tailwind class order.
- `npm run db:up`, then `npm run setup`: start PostgreSQL and Mailpit, migrate
  and seed. Every demo account's password is `demo-password-2026`.
- `npm test`: unit and integration tests with coverage, then the end-to-end
  tests. Use `npm run test:unit`, `npm run test:integration` or
  `npm run test:e2e` for one suite. Integration and end-to-end tests need
  PostgreSQL running and only touch the `*_test` database. End-to-end tests
  need Chromium (`npx playwright install chromium`) and build the app first.
- `npm run audit:deps`: fail on high or critical advisories not on the
  reviewed allowlist (`scripts/audit-allowlist.json`).

## Rules

- **Next.js 16 with Cache Components.**
  - Never use `use cache` on registry data.
  - Put every request-time read inside `<Suspense>`.
  - Every page reads its data after `requirePageRole`, which ends with
    `io()`. With partial prefetching, cookies resolve while a route's shell
    is prerendered, so `io()` is what keeps clock reads and queries out of
    prerenders.
  - Check `node_modules/next/dist/docs/` before using an API you haven't
    verified.
- **Writes go through Route Handlers in `src/app/api`,** never Server Actions.
  The single exception is the action that only calls `refresh()`.
- **Sign-in is Better Auth,** configured in `src/server/auth.ts`.
  - Read the session only through `src/server/session.ts`; services take the
    `Session` it returns and check the role themselves.
  - Pages call `requirePageRole`, API routes go through `handle()`. The
    redirect in `src/proxy.ts` is only a shortcut, never the check.
  - Tests sign in for real: `signIn()` in `tests/helpers/requests.ts`, and
    `viewAs()` in the end-to-end helpers.
- **Layers:**
  - Business rules live in `src/domain`: pure and unit-tested.
  - I/O lives in `src/server`: server-only.
  - Route handlers and pages stay thin.
- **Data formats:**
  - Money is integer pence.
  - Calendar dates are `YYYY-MM-DD` strings.
  - Instants are `Date` objects, displayed in the college time zone.
  - Deadlines are entered as wall-clock times in the college time zone and
    converted by the API.
- **Uploads:** stored under random keys in `UPLOAD_DIR` by
  `src/server/storage.ts`, and served only as attachments through
  `download()` in `src/server/http.ts`.
- **Forms:** use `Form` from `src/components/forms/form.tsx`, never a bare
  `<form>`. It stays `aria-disabled` until React has hydrated it.
- **Element ids:** never hard-code one. `FormField` makes its own; build any
  other id from `useId()`, because hidden pages stay in the document.
- **Students only ever receive marks that are published and not withheld:**
  filter on the server, never only in the page.
- **Dependencies:**
  - Install them with `npm install` or `npx shadcn@latest add`. Never hand-edit
    dependency names or versions in `package.json`.
  - Prisma stays on major version 7 (`npm install -D prisma@7`).
- **Database safety:**
  - Never run `prisma migrate reset` or other destructive commands against the
    development database unless asked.
  - Tests only touch databases whose names end in `_test`.
- **Commits:**
  - Use Conventional Commits, one logical step per commit.
  - All checks must pass before committing.
  - Never delete, skip or weaken a test to make it pass.
- **Documentation:** project documents live in `.docs/` (README.md, AGENTS.md
  and CLAUDE.md stay at the root). Keep `.docs/DECISIONS.md`,
  `.docs/TESTING.md` and `.docs/ai-log.md` current
  with each change.
