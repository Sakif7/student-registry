# Student Registry

The Registry module of a student management system, with a Staff view and a
Student view. It covers four workflows: student enrolment, fees and payments,
assessment submissions, and marks and results. Built with Next.js 16 (App
Router), PostgreSQL and Prisma.

## Features

- **Enrolment:**
  - student records with IDs allocated per intake year, such as
    SMS-2026-0001, without gaps even under concurrent enrolments;
  - statuses Enrolled, Deferred, Withdrawn and Completed, with a reason and
    history for every change;
  - search, filters and paging.
- **Fees and payments:**
  - a fee per programme and academic year, with corrections;
  - payments with amount, date and reference, corrected by reversal;
  - a balance that is always current;
  - overdue balances flagged on the dashboard and in the student list.
- **Assessments:**
  - staff set work per module with a deadline in college time;
  - students upload a PDF or Word document, checked by its content, and can
    replace it until the deadline;
  - late work is accepted and flagged until staff close the assessment.
- **Marks and results:**
  - marks from 0 to 100, classified Fail, Pass (40+), Merit (60+) and
    Distinction (70+);
  - staff publish a student's marks, or withhold all of them with a reason
    such as outstanding fees;
  - students only ever receive marks that are published and not withheld.
- **Sign-in:**
  - staff and students sign in with their email address and a password;
  - sessions are stored in the database, so signing out ends them at once;
  - an account page changes one's password and lists the devices one is
    signed in on, any of which can be signed out;
  - a forgotten password is replaced through a link sent by email;
  - five wrong passwords lock the email address for 15 minutes, on top of
    rate limits per client address;
  - nobody signs up: staff accounts come with the system, and each
    student's is created at enrolment and activated from an emailed link;
  - staff can resend that link, email a password reset link, or turn a
    student's sign-in off, which signs them out everywhere;
  - every page and API call checks the role.
- **Interface:** an app shell with a sidebar of the section's pages, which
  collapses to icons or, on a phone, slides in; breadcrumbs on deeper pages;
  a menu for one's account and signing out; a search (Ctrl/⌘+K) for pages,
  actions and students; and each student's record in tabs (overview, fees,
  assessments, results, history, sign-in), with its actions in dialogs.
- **Audit trail:** every change records who made it and when, in the same
  transaction, and the trail can't be edited. Staff see it on each
  student's record and in an Activity log.

## Tech stack

Next.js 16 (App Router, Cache Components) with React 19 and strict TypeScript,
PostgreSQL 18 with Prisma 7, and shadcn/ui on Base UI with Tailwind CSS 4.
Sign-in uses Better Auth. Forms use React Hook Form with Zod, sharing their
validation schemas with the API. Tests use Vitest and Playwright with axe, and CI runs on GitHub Actions.

## Prerequisites

- Node.js 24 LTS (22.12 or later also works)
- Docker, for PostgreSQL and Mailpit (Docker Desktop on Windows and macOS)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

   npm's summary reports high-severity vulnerabilities. They come from three
   advisories in development tooling and the Prisma CLI, none of them
   reachable by the app. Each is reviewed in
   [DECISIONS.md](.docs/DECISIONS.md#dependency-audit), and
   `npm run audit:deps` fails if any new one appears.

2. Create your environment file from the example. The defaults work with the
   bundled database.

   ```bash
   cp .env.example .env              # macOS, Linux, Git Bash
   Copy-Item .env.example .env       # Windows PowerShell
   ```

3. Start PostgreSQL 18 and Mailpit in Docker, apply the migrations and load
   the demo data:

   ```bash
   npm run setup
   ```

4. Start the app and open <http://localhost:3000>:

   ```bash
   npm run dev
   ```

5. Sign in with one of the demo accounts listed on the sign-in page: Registry
   staff, or a fictitious student. Every demo password is
   `demo-password-2026`. The [testing guide](.docs/TESTING.md#demo-data)
   describes the demo data and walks through every workflow.

## Environment variables

| Variable                     | Purpose                                                                                     | Default in `.env.example`                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`               | The app's PostgreSQL database                                                               | `postgresql://registry:registry@localhost:5432/registry`      |
| `TEST_DATABASE_URL`          | The disposable database for integration and end-to-end tests. Its name must end in `_test`. | `postgresql://registry:registry@localhost:5432/registry_test` |
| `APP_TIME_ZONE`              | The college's time zone, for deadlines, "today", overdue checks and every displayed time    | `Europe/London`                                               |
| `UPLOAD_DIR`                 | Where submitted files are stored (created on first upload)                                  | `./storage/uploads`                                           |
| `SMTP_HOST`, `SMTP_PORT`     | The mail server for activation and password-reset emails                                    | `localhost`, `1025` (Mailpit)                                 |
| `MAIL_FROM`                  | The sender of those emails                                                                  | `Student Registry <registry@college.example>`                 |
| `SMTP_USER`, `SMTP_PASSWORD` | Credentials for a real mail service (optional)                                              | not set                                                       |
| `BETTER_AUTH_SECRET`         | Signs session cookies. At least 32 characters; generate one with `openssl rand -base64 32`. | a value for local development only                            |
| `BETTER_AUTH_URL`            | The app's public address: sign-in only accepts requests from it, and emailed links use it   | `http://localhost:3000`                                       |
| `SHOW_DEMO_ACCOUNTS`         | Lists the demo accounts and their password on the sign-in page. Off unless set.             | `true`                                                        |

`.env` is git-ignored and never committed. The example holds no real secrets:
the database credentials are the local Docker database's own, and the sign-in
secret is only for local development. A real deployment generates its own
secret and leaves `SHOW_DEMO_ACCOUNTS` unset.

Every email the app sends goes to Mailpit, which keeps it in a web inbox at
<http://localhost:8025> instead of delivering it. Nothing reaches a real
address.

## Scripts

| Command                    | What it does                                                                |
| -------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`              | Start the development server                                                |
| `npm run build`, `start`   | Build and serve the production app                                          |
| `npm run check`            | Format check, type-check and lint, all with zero warnings                   |
| `npm run format`           | Apply Prettier, including Tailwind class order                              |
| `npm test`                 | Unit and integration tests with coverage, then end-to-end tests             |
| `npm run test:unit`        | Unit tests only (no database needed)                                        |
| `npm run test:integration` | Integration tests against the test database                                 |
| `npm run test:e2e`         | End-to-end and accessibility tests in Chromium                              |
| `npm run audit:deps`       | Fail on any high or critical advisory not on the reviewed allowlist         |
| `npm run setup`            | Start PostgreSQL and Mailpit, apply migrations and load the demo data       |
| `npm run db:up`, `db:down` | Start or stop PostgreSQL and Mailpit in Docker (the data stays in a volume) |
| `npm run db:deploy`        | Apply any pending migrations                                                |
| `npm run db:seed`          | Replace all data, uploaded files included, with the demo data               |
| `npm run db:migrate`       | Create a migration after editing `prisma/schema.prisma`                     |
| `npm run db:studio`        | Browse the data in Prisma Studio                                            |

## Tests

With PostgreSQL running (`npm run db:up`), and Chromium installed once with
`npx playwright install chromium`:

```bash
npm test
```

This runs the unit and integration tests with a coverage report (over 90% of
lines; the run fails below 80%), then the end-to-end tests, including an axe
accessibility scan of every kind of page. The tests use a separate
`registry_test` database and never touch your data. Git hooks run lint,
formatting, the type-check and the unit tests before every commit, and CI runs
everything on every push. The [testing guide](.docs/TESTING.md) also has manual
test scenarios with exact inputs and expected results, and curl examples for
the API.

## Project structure

```text
src/
  app/          pages ((auth)/, staff/ and student/) and API route handlers (api/)
  components/   UI by feature; shadcn/ui primitives in ui/
  domain/       business rules: pure functions, unit-tested beside the code
  lib/          display formatting and the browser's API and sign-in clients
  server/       server-only code: database, sign-in and session, services,
                email, file storage
  proxy.ts      sends visitors without a session to the sign-in page
prisma/         schema, migrations, demo data and sample documents
tests/          integration tests and their helpers
e2e/            end-to-end and accessibility tests
.docs/          decisions, testing guide and AI log
```

## API

Every write goes through these Route Handlers, which the pages use too, so the
API behaves exactly as the UI does. Each request is authorised by the session
cookie that signing in sets (`POST /api/auth/sign-in/email`). Errors come back
as RFC 9457 problem details, with an error per field where it applies. "Self"
means the student whose record it is.

| Method      | Path                                         | Who           | Purpose                                                             |
| ----------- | -------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| GET, POST   | `/api/auth/*`                                | Anyone        | Better Auth: sign in, sign out, read the session                    |
| POST        | `/api/account/password`                      | Signed in     | Change one's password, signing out other devices                    |
| GET, DELETE | `/api/account/sessions`                      | Signed in     | The devices one is signed in on; sign out all but this one          |
| DELETE      | `/api/account/sessions/{id}`                 | Signed in     | Sign out on one other device                                        |
| GET         | `/api/programmes`, `/api/modules`            | Signed in     | Reference data for forms                                            |
| GET, POST   | `/api/students`                              | Staff         | Search and filter students; enrol one, emailing the activation link |
| GET, PATCH  | `/api/students/{number}`                     | Staff or self | Read a record (staff edit it)                                       |
| POST        | `/api/students/{number}/status`              | Staff         | Change the enrolment status                                         |
| GET, PATCH  | `/api/students/{number}/sign-in`             | Staff         | A student's sign-in account; turn sign-in off or on                 |
| POST        | `/api/students/{number}/sign-in/link`        | Staff         | Email an activation or password reset link                          |
| GET         | `/api/students/{number}/account`             | Staff or self | Charges, payments, balance and overdue amount                       |
| POST        | `/api/students/{number}/fees`                | Staff         | Charge a fee for an academic year                                   |
| POST        | `/api/students/{number}/payments`            | Staff         | Record a payment                                                    |
| PATCH       | `/api/fees/{id}`                             | Staff         | Correct a fee charge                                                |
| POST        | `/api/payments/{id}/reversal`                | Staff         | Reverse a payment                                                   |
| GET, POST   | `/api/assessments`                           | Staff         | List assessments; set one                                           |
| GET, PATCH  | `/api/assessments/{id}`                      | Staff         | Read with its marksheet; edit, close or reopen                      |
| PUT         | `/api/assessments/{id}/submission`           | Student       | Submit or replace work (multipart, field `file`)                    |
| PUT         | `/api/assessments/{id}/marks`                | Staff         | Save marks, keyed by student number                                 |
| GET         | `/api/students/{number}/assessments`         | Staff or self | A student's assessments, with their own work                        |
| GET         | `/api/submissions/{id}/file`                 | Staff or self | Download a submitted file                                           |
| GET         | `/api/students/{number}/results`             | Staff or self | Results (students: published only, unless withheld)                 |
| POST        | `/api/students/{number}/results/publication` | Staff         | Publish all unpublished marks                                       |
| PUT, DELETE | `/api/students/{number}/results/hold`        | Staff         | Withhold results with a reason; lift the hold                       |
| GET         | `/api/students/{number}/history`             | Staff         | Everything done to a student's record, and by whom                  |
| GET         | `/api/activity`                              | Staff         | The audit trail: every change, newest first (`page`)                |

## Documentation

- [Decisions](.docs/DECISIONS.md): every product and technical decision, with
  its reasoning, the known limitations, and what would come next
- [Testing guide](.docs/TESTING.md): automated suites, manual test scenarios
  and curl examples
- [AI usage log](.docs/ai-log.md): each step of the build, how it was checked,
  and what was caught along the way
- [Agent instructions](AGENTS.md): the conventions any coding agent working on
  this repository must follow

## AI usage

This project was built with Claude Code, an AI coding agent, working from the
brief and from decisions agreed before any code was written.

- **Planning came first.** The agent asked its clarifying questions, then
  proposed the structure, dependencies, tooling, test strategy and commit
  plan. Every product rule and technical choice was confirmed before
  implementation began, and is recorded with its reasoning in
  [DECISIONS.md](.docs/DECISIONS.md).
- **The agent wrote the code, tests and documentation** in small steps, one
  Conventional Commit each. Git hooks ran lint, formatting, the type-check and
  the unit tests on every commit. The full checks and test suites were run
  before each one too; once, early on, a failing check was missed, and the AI
  log records how.
- **Its output was checked, not trusted.** Each step was covered by automated
  tests against a real database, and exercised in a real browser against the
  production build. That caught bugs that had already passed the type-check and
  unit tests:
  - a page telling a deferred student they could still submit;
  - a colour-contrast failure;
  - a prerender error that showed only in the production server's log.

  The [AI log](.docs/ai-log.md) records, step by step, what the agent did,
  how it was checked and what was caught.

- **Guardrails were set for the agent.**
  - Dependencies may only be installed through npm, never hand-edited.
  - Destructive database commands are off-limits, and tests may only touch
    databases whose names end in `_test`.
  - The repository holds fictitious data only, and no credentials.
  - Tests must never be weakened to make them pass.

  These rules live in [AGENTS.md](AGENTS.md), which the agent read at the start
  of every session.

## Licences

The project depends on open-source packages under these licences:

- **MIT:** Next.js, React, Better Auth, Base UI, shadcn/ui (whose components
  are copied into `src/components/ui`), Tailwind CSS, Zod, React Hook Form,
  sonner, cmdk, file-type, Vitest, ESLint, typescript-eslint, Prettier,
  Husky, lint-staged and tsx; Mailpit (run in Docker for development only)
- **MIT-0:** Nodemailer
- **Apache 2.0:** Prisma, Playwright, TypeScript and class-variance-authority
- **ISC:** Lucide icons
- **MPL 2.0:** axe-core (development only, for the accessibility tests)
- **SIL Open Font License 1.1:** the Geist fonts

Every person, email address and payment reference in the demo data is
fictitious.
