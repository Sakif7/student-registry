# Decisions

This file records the product and technical decisions behind the Registry
module: what was decided, why, and what was traded away. Where the brief left a
question open, it is settled here with a stated assumption rather than left
implicit in the code.

## Context

- The module covers the four workflows a Registry team uses daily: student
  enrolment, fees and payments, assessment submission, and marks and results,
  with a Staff view and a Student view.
- Conventions follow UK further and higher education: programmes and modules,
  academic years written `2026/27`, Pass/Merit/Distinction, deferral and
  withdrawal as normal registry events, and results withheld (often for unpaid
  fees).
- Stack: Next.js 16.4 with the App Router (the brief asks for 14 or later),
  React 19.3, PostgreSQL 18 and Prisma 7.10, on Node.js 24 LTS.

## Enrolment

### Student IDs: a per-year counter, allocated in the create transaction

IDs look like `SMS-2026-0001`. The year is the start year of the academic year
the student first enrols into, so a 2026/27 intake gets `2026` and the prefix
identifies the cohort. The sequence restarts each year, is zero-padded to four
digits, and widens after 9999 instead of failing.

A counter table holds one row per year. Creating a student runs a single atomic
upsert in the same transaction as the student insert:

```sql
INSERT INTO student_number_counters (year, last_value) VALUES ($1, 1)
ON CONFLICT (year) DO UPDATE
  SET last_value = student_number_counters.last_value + 1
RETURNING last_value;
```

Concurrent creates for the same year queue on that row's lock, and if the
insert fails the increment rolls back with it, so numbers are unique and have
no gaps. A unique constraint on the student number is the final backstop. This
is the pattern used for invoice series and patient numbering, with the year as
the scope.

- Rejected: a PostgreSQL sequence per year (lock-free, but a rolled-back insert
  leaves a gap) and `MAX() + 1` (races under concurrency and needs retry logic).
- An ID never changes once issued, even when the student's academic year
  changes on deferral or progression.

### Academic year

Written `2026/27` and stored as text, with a format check in the database. A
new academic year starts on 1 September in the college's time zone. A student's
academic year is their current session: it changes on progression or deferral,
and fee charges are raised per academic year.

### Enrolment statuses

| From \ To |      Enrolled      | Deferred | Withdrawn | Completed |
| --------- | :----------------: | :------: | :-------: | :-------: |
| Enrolled  |         —          |   yes    |    yes    |    yes    |
| Deferred  |        yes         |    —     |    yes    |           |
| Withdrawn | yes (re-admission) |          |     —     |           |
| Completed |                    |          |           |     —     |

- A new record starts as Enrolled, or Deferred for a deferred entry. Starting
  as Withdrawn or Completed makes no sense for a new enrolment.
- Completed is final.
- Deferral and withdrawal need a reason. Every change, including the initial
  status, is kept with its date in `enrolment_status_changes`: Registry teams
  need deferral and withdrawal dates, for example to work out fee liability.
- Records are never deleted. Withdrawal is a status, not a delete.

### What students who are not enrolled can do

Only Enrolled students can submit work. Deferred, Withdrawn and Completed
students can still see their record, their fees and their published results.
Status changes never alter fees: a withdrawn student still owes their balance
and stays on the overdue list.

## Fees and payments

### One fee charge per student per academic year

Each programme has a standard annual fee. Charging a student copies that amount
into a fee charge for one academic year, so a later change to the programme's
fee never rewrites charges already raised. A student has at most one charge per
academic year (a database unique constraint).

- The charge is created automatically when a student record is created as
  Enrolled, so a new enrolment can't be left unbilled. In every other case (a
  deferred student returning, a new academic year) the student's record prompts
  staff to assign it.
- Staff can correct a charge's amount (for example a scholarship) or its due
  date. A charge is the college's own claim, so correcting it is legitimate. A
  payment records money that actually moved, so it is never edited.
- The default due date is 30 days after the charge is raised, and can be changed.
- The currency is GBP. Money is stored as integer pence everywhere, never as a
  floating-point number.

### Payments are append-only and corrected by reversal

- A payment needs an amount above zero, a date that is not in the future in the
  college's time zone, and a reference that is unique across all payments
  regardless of case. The unique reference catches the same bank transfer being
  entered twice.
- Overpayment is accepted and shown as credit: money arrives when it arrives.
- Payments are never edited or deleted. A mistake is corrected by one reversal
  entry with a reason; the reversed payment stays visible but no longer counts.

### Balance and overdue

- The balance is charges minus valid payments. It is computed from the stored
  rows on every request and never stored itself, so it can't drift, and it is
  current the moment a payment is recorded.
- Payments clear the oldest charge first. The overdue amount is whatever is
  still unpaid on charges whose due date has passed; a charge due today is not
  yet overdue. Days overdue count from the oldest unpaid due date.
- Overdue students are flagged on the Registry dashboard, in the student list
  and on the student's record.

## Assessments and submissions

### Who can submit, and when

Modules belong to a programme; they are seeded, with no admin screens. An
assessment is open to Enrolled students on its module's programme. It stays
open after the deadline (late work is accepted and flagged) until staff close
it. Staff can reopen an assessment or extend its deadline.

### Resubmission and late work

- One submission per student per assessment, enforced by a unique constraint.
- Before the deadline, a new upload replaces the file and the attempt count goes
  up.
- After the deadline, a first submission is accepted and flagged Late, and
  resubmission is refused.
- Late is computed from the deadline, never stored, so extending a deadline
  clears the flag on its own.
- Deadlines are stored as UTC instants, and entered and shown in the college's
  time zone.

### Uploads

PDF or DOCX only, up to 10 MB. The file extension, the declared type and the
file's actual content must all agree; the content check uses `file-type`, which
also recognises macro-enabled `.docm` files so they can be refused. Files are
stored under random names outside the public folder and are only ever served as
downloads, with `X-Content-Type-Options: nosniff`.

## Marks and results

### Marks and classification

Marks are whole numbers from 0 to 100. A mark can be entered without a
submission (a non-submission, or work marked outside the system), and the
marksheet shows "No submission" beside it. The classification is derived and
never stored: Fail below 40, Pass from 40, Merit from 60, Distinction from 70.

### Publishing and withholding, per student

- "Publish results" acts per student and releases all of that student's
  unpublished marks at once; each mark records when it was published.
- Editing a published mark makes it unpublished again until staff publish once
  more, so a student never sees a mark that hasn't been reviewed.
- "Withhold results" takes a reason; a preset covers outstanding tuition fees.
  It hides all of the student's results, including ones already published, and
  blocks publishing until the hold is lifted. The student sees a notice with the
  reason.
- The student's fee status is shown next to these controls, but nothing is
  withheld automatically: withholding is a staff decision.
- The server never sends an unpublished or withheld mark to a student. Hiding it
  in the interface alone would not be enough.

## Roles

The brief allows a simple role toggle instead of authentication. The toggle sets
an HttpOnly, SameSite=Lax session cookie naming either "staff" or one specific
student. Every service checks the role from that session, so a student session
can't call staff actions or read another student's data, even with hand-made
requests. Replacing the toggle with real authentication would only change how
the session is read.

The role picker lists students by name so that a reviewer can switch between
them. In production this screen would be the login page.

## Time zone

All dates and times use the college's time zone, Europe/London, set by
`APP_TIME_ZONE`: deadlines, "today", overdue checks and everything displayed.
Staff working from another country still set deadlines in London time, and
times are labelled GMT or BST.

## Technical decisions

### Versions

- Prisma is installed with an explicit major version (`prisma@7`). npm's `latest`
  tag for `prisma` points at a Prisma 8 release candidate, which is a rewritten
  ORM; its CLI breaks `prisma generate` against a 7.x client.
- ESLint stays on 9, as scaffolded. ESLint 9 reached end of life in August 2026,
  but the React, import and jsx-a11y plugins bundled with eslint-config-next
  don't declare ESLint 10 support yet, so version 10 installs with
  peer-dependency errors. Revisit once they do.
- TypeScript stays on 5, because typescript-eslint doesn't support TypeScript 7
  yet.

### Rendering and caching

Cache Components (the scaffold's default, and the default in the next major
version of Next.js) stays on. Registry data must always be current, so nothing
uses `use cache`: every database read happens at request time inside a
`<Suspense>` boundary with a loading skeleton, and the build fails if a boundary
is missing.

### One write path: Route Handlers

Every write goes through a Route Handler under `/api`, and the UI calls those
handlers with `fetch()`. The API a reviewer can try with curl is exactly the one
the UI uses, integration tests exercise it directly, and file uploads avoid the
1 MB body limit on Server Actions. Server Components read through the same
service layer directly, without an internal HTTP request.

After a successful write, the UI calls a one-line Server Action that runs
`refresh()`. `router.refresh()` only refreshes the current page, and the
browser's Back button reuses cached pages, so without this a dashboard visited
before recording a payment could still show the old balance. The action
contains no business logic.

### Errors

API errors use RFC 9457 problem details (`application/problem+json`):

| Status    | When                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- |
| 400       | Invalid input, with a message per field                                                              |
| 401       | No session                                                                                           |
| 403       | Wrong role, or someone else's record                                                                 |
| 404       | Unknown record                                                                                       |
| 409       | Duplicates and state conflicts, e.g. a disallowed status change or a resubmission after the deadline |
| 413 / 415 | Upload too large / wrong file type                                                                   |

Unexpected errors are logged on the server and return a generic 500 without
internal details.

### Dates without a date library

Dates use `Intl` plus a small helper that converts a London wall-clock time into
an instant:

- A time inside the hour skipped when the clocks go forward is rejected.
- A time inside the hour repeated when the clocks go back resolves to its first
  occurrence.

`@date-fns/tz` was considered, but it resolves the repeated hour differently
depending on the server's own time zone.

Date-only values (date of birth, payment and due dates) travel as `YYYY-MM-DD`
strings and are stored in `date` columns. This avoids the classic bug where a
date shifts by one day on machines east of UTC, and the unit tests run in the
Asia/Dhaka time zone to catch it.

### Environment variables

Next.js loads `.env` for the app. The Prisma, Vitest and Playwright
configuration files load it with Node's built-in `process.loadEnvFile`, so
there is no dotenv dependency.

### Dependency audit

`npm audit` reports one high-severity advisory, GHSA-vfj7-8cjw-p6xm, in
`braces`: a denial of service through deeply nested glob patterns. It is
reached only through ESLint's Next.js plugin.

- No patched version of `braces` exists yet.
- It is a development dependency and only ever processes glob patterns from our
  own configuration.
- Production dependencies audit clean, and CI fails on any high-severity
  advisory in them.

## Known limitations

Recorded as features land.

## With more time

Recorded at the end of the build.
