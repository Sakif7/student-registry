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
- `npm run db:up`, then `npm run setup`: start PostgreSQL, migrate and seed.
- `npm test`: unit and integration tests with coverage. Use
  `npm run test:unit` or `npm run test:integration` for one suite. Integration
  tests need PostgreSQL running and only touch the `*_test` database.

## Rules

- **Next.js 16 with Cache Components.**
  - Never use `use cache` on registry data.
  - Put every request-time read inside `<Suspense>`.
  - Read the session cookie before any Prisma call.
  - Don't call `new Date()` or `Date.now()` before the first request-data read
    in a Server Component.
  - Check `node_modules/next/dist/docs/` before using an API you haven't
    verified.
- **Writes go through Route Handlers in `src/app/api`,** never Server Actions.
  The single exception is the action that only calls `refresh()`.
- **Layers:**
  - Business rules live in `src/domain`: pure and unit-tested.
  - I/O lives in `src/server`: server-only.
  - Route handlers and pages stay thin.
- **Data formats:**
  - Money is integer pence.
  - Calendar dates are `YYYY-MM-DD` strings.
  - Instants are `Date` objects, displayed in the college time zone.
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
