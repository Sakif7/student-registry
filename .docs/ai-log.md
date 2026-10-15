# AI usage log

A running record of how AI tools were used to build this project: the task,
what the tool produced, what was kept, changed or rejected, and how the result
was checked. The README has a short summary.

**Tool:** Claude Code (Anthropic, model Claude Opus 5.5) in VS Code, using
sub-agents for parallel research.

## Planning, 15 October 2026

**Task:** read the brief and the fresh `create-next-app` scaffold, then propose
a folder structure, dependencies, tooling, a test strategy and a commit plan,
without writing code.

**What the AI did:** explored the scaffold and ran three research sub-agents in
parallel: one on the documentation bundled with Next.js 16.4, one on the
current Prisma 7 setup, and one on the tooling (shadcn/ui, Vitest 5,
Playwright, ESLint and Prettier, Husky, GitHub Actions). Most claims were tested
in throwaway copies of the project rather than taken on trust from
documentation.

**Findings that changed the plan:**

- npm's `latest` tag for `prisma` points at an 8.0 release candidate, which is
  a rewritten ORM. Pairing its CLI with `@prisma/client` 7.10 broke
  `prisma generate` (reproduced). Prisma is therefore installed with `@7`.
- Vitest 5 would not install alongside the scaffold's `@types/node@20`. The
  project moved to Node 24 LTS and `@types/node@24`.
- With Cache Components, uncached data outside `<Suspense>` works in
  `next dev` but fails `next build`, so every page is structured for it from
  the start.
- The browser's Back button reuses cached pages, while `router.refresh()` only
  refreshes the current one. This led to the `refresh()` Server Action
  described in DECISIONS.md.
- Prisma refuses `migrate reset` when an AI agent runs it, so the test setup
  applies migrations with `migrate deploy` and truncates tables instead.
- A `@db.Date` value built from a local-time date is stored one day early east
  of UTC (reproduced in the Asia/Dhaka time zone). Date-only values therefore
  travel as `YYYY-MM-DD` strings.
- `shadcn init` rewires the font variable so that the page falls back to Times
  New Roman (seen in a browser), which needs a one-line fix.
- A Windows clone with `core.autocrlf=true` fails `prettier --check` unless
  `.gitattributes` forces LF line endings.

**Decisions:** each open question in the brief was put to the developer as a
multiple-choice question with a recommended option and its trade-offs. The
answers are recorded in DECISIONS.md. The developer chose the counter-table
pattern for Student IDs and Route Handlers as the only write path.

**Suggestions rejected:**

- The Next.js research agent recommended Server Actions for small writes.
  Rejected, to keep one write path shared by the UI and the API.
- The tooling agent recommended ESLint 10 because ESLint 9 is end-of-life.
  Rejected: plugins bundled with eslint-config-next don't support it yet, and
  installs would show peer-dependency errors.
- The Prisma agent suggested pinning exact versions with `npm install -E`.
  Rejected in favour of a major-version pin (`@7`) plus the committed lockfile,
  which keeps the build reproducible while still allowing patch fixes.

## Formatting and type-aware linting

**What the AI did:** wrote the ESLint and Prettier configuration, the
`.gitattributes` line-ending rule and the npm scripts.

**Checked by:**

- `npm run check` passes with zero warnings.
- Printing the resolved ESLint config confirmed that the type-aware rules are
  active.
- The production build passes.
- A fresh clone on Windows, followed by `npm ci` and `npm run check`, passes.

**Caught along the way:** `npm audit` reports five high-severity findings, all
from one unpatched advisory in `braces` inside ESLint's Next.js plugin, which
is a development-only path. npm's suggested fix was to downgrade
`eslint-config-next` by two major versions. Instead, the finding is documented
in DECISIONS.md and CI audits production dependencies.

## Pre-commit hook

**What the AI did:** set up Husky and lint-staged: ESLint and Prettier run on
staged files, then the whole project is type-checked.

**Checked by:**

- **Failure path:** a staged file containing an unawaited promise was rejected
  by the hook's lint step, and lint-staged rolled the index back cleanly.
- **Success path:** this commit itself went through the hook.

## Decision log and agent conventions

**What the AI did:** drafted DECISIONS.md from the answers confirmed during
planning, started this log, and wrote the project's conventions into AGENTS.md
for future AI sessions. These conventions cover the Next.js 16 caching rules,
the single write path, money and date formats, and database safety.

## Documents moved into `.docs/`

The developer asked for the project documents to live in `.docs/`. The AI
flagged two exceptions, and the developer agreed to both:

- **README.md stays at the root,** because GitHub only renders a README from the
  root, `.github/` or `docs/`.
- **AGENTS.md stays at the root,** because `next dev` recreates it there and AI
  tools look for it at the root.

**Checked by:** confirming that `prettier .` and lint-staged both still cover
files inside the dot-folder.

## shadcn/ui and the app shell

**What the AI did:** ran `shadcn init` with its defaults, ejected shadcn's
stylesheet so the `shadcn` CLI is no longer a runtime dependency, and replaced
the starter page with a minimal shell (shared header, skip link, toasts).

**Changed from the generated code:**

- **Font variable:** `shadcn init` points `--font-sans` at itself, so the page
  fell back to Times New Roman. The root layout now defines `--font-sans`
  through `next/font`.
- **Toast theme:** the generated toast component reads the theme from
  `next-themes`. The app has a single light theme, so the component now fixes
  it to light and `next-themes` was uninstalled.

**Checked by:**

- `npm run check` passes and the production build passes.
- In a real browser, the computed font is `Geist, "Geist Fallback"`, the page
  language is `en-GB`, and the skip link is in place.

## PostgreSQL in Docker

**What the AI did:** wrote `compose.yaml` for PostgreSQL 18, the
`.env.example` file and the first README setup steps.

**Caught from research:** PostgreSQL 18 images keep their data under
`/var/lib/postgresql` and refuse to start if a volume is mounted at the old
`/var/lib/postgresql/data` path. Most examples online still use the old path.

**Checked by:** `npm run db:up` reaches a healthy container running PostgreSQL
18.6, with its data directory inside the mounted volume.

## Prisma schema, migration and seed

**What the AI did:** wrote the data model, the initial migration (including
hand-written CHECK constraints), the Prisma configuration, the lazily validated
environment module, the database client and the first seed data.

**Changed from the research suggestions:**

- **Configuration error handling.** The suggested
  `try { process.loadEnvFile() } catch {}` would also swallow a malformed
  `.env`. The config checks that the file exists instead.
- **Database URL.** Prisma's documented `env("DATABASE_URL")` helper throws when
  the variable is missing, which would break `prisma generate` during a fresh
  `npm install`. The config reads `process.env` directly instead.

**Checked by:**

- Running `prisma migrate dev` a second time reported no drift, which confirms
  Prisma ignores the CHECK constraints.
- All 14 constraints are present in the database.
- The seed loads 3 programmes and 7 modules.
- `npm run check` passes, including type-checking the generated client.

## Test infrastructure

**What the AI did:** configured Vitest 5 with two projects (unit and
integration), the test-database safety guard, per-test table truncation, data
factories, and the first tests: environment validation as unit tests, and the
database CHECK constraints as integration tests.

**Used from research:**

- Vitest 5 resolves the `@/` path alias through Vite 8's built-in
  `resolve.tsconfigPaths`, so the `vite-tsconfig-paths` plugin that the bundled
  Next.js docs still recommend isn't needed.
- `server-only` throws by design outside Next.js, so it is aliased to an empty
  module under Vitest.

**Checked by:**

- **All tests pass:** 12 tests, 4 unit and 8 integration.
- **Safety guard:** pointing `TEST_DATABASE_URL` at the app database makes the
  run refuse before any table is touched. The dev database kept its seeded rows.
- **Constraint names:** each constraint test asserts the specific constraint
  name, so it can't pass because of an unrelated error such as a foreign-key
  violation.

## Continuous integration

**What the AI did:** wrote the GitHub Actions workflow: a PostgreSQL 18 service
container, the separate check steps, tests with coverage uploaded as an
artefact, and the production dependency audit. Action versions (`checkout`,
`setup-node` and `upload-artifact` at v7) come from the research agent's query
of the GitHub API.

**Checked by:** running the same steps in a fresh clone with CI's environment
variables and no `.env` file. The workflow had not yet run on GitHub, because
the repository has not been pushed yet.

**Fixed after the rehearsal:** the fresh-clone run of the CI steps passed
everything except the production dependency audit. It reported advisories in
`deepmerge-ts` and `mysql2`, inside the Prisma CLI. npm counts the CLI as
production because `@prisma/client` declares it as an optional peer, so
`--omit=dev` can't exclude it, and `--omit=peer` turned out not to help
either. Weakening the gate to "critical only" was rejected. Instead, a
zero-dependency script fails on any high or critical advisory that isn't on an
explicit, reasoned allowlist.

The script was tested both ways. With the allowlist as written, it passes.
With one advisory removed, it fails. Its stale-entry check also caught a
mistake in the first allowlist: one listed advisory was only of moderate
severity, so it was removed.

## Domain rules

**What the AI did:** wrote the pure business rules in `src/domain`, each with
unit tests aimed at the boundaries (183 tests in total). The rules cover
academic years, money, college time, student IDs, enrolment statuses, student
details, fees and overdue balances, submissions and results. It also wrote the
shared display formatting in `src/lib/format.ts`.

**Checked by:**

- **Date conversion is independent of the server's time zone.** The
  daylight-saving conversions were run under four host time zones (UTC,
  America/New_York, Asia/Dhaka and Pacific/Auckland) and gave identical results:
  the skipped spring hour is rejected and the repeated autumn hour resolves to
  its first occurrence.
- **Every status transition is tested.** The status-change table is tested for
  all 16 pairs, so any change to the rules shows up as a failing row.

**Caught by the tests:** the first version of the date formatter used `Intl`'s
`en-GB` date style. A test showed that ICU writes "Fri, 20 Nov…" with a comma,
and that newer ICU data abbreviates September as "Sept". Node and browsers ship
different ICU versions, so the formatter now builds dates from fixed month and
weekday names. Server-rendered and browser-rendered text can no longer differ.

## Sessions, API plumbing and the role picker

**What the AI did:** wrote the demo session (cookie parsing and permission
checks), the Route Handler wrapper, the session API, the browser-side API
client, and the role picker with the staff and student layouts.

**Checked by:**

- **Unit tests** cover session parsing and permissions, input validation, and
  the wrapper: problem details, cross-site writes blocked, and a 500 that
  reveals nothing internal.
- **Integration tests** call `/api/session` against the database.
- **In a real browser,** against a production build:
  - Without a session, `/staff` redirects to the role picker.
  - Choosing staff sets the cookie and opens the dashboard.
  - The navigation marks the current page with `aria-current`.

**Caught along the way:**

- **Type error:** `tsc` caught one that the tests couldn't, because Vitest
  doesn't type-check. The role picker's student status was typed as a plain
  string instead of the enrolment status.
- **Active links:** the bundled Next.js docs say `usePathname` suspends on
  routes with dynamic parameters under Cache Components, which would fail the
  build. The navigation therefore renders plain links as the Suspense
  fallback and highlights the current page once the path is known.
- **Process slip:** one check run was piped through `tail`, which hid its
  failing exit code. The pre-commit hook caught the lint error before it was
  committed. Checks now run with `pipefail`.

## Enrolling students

**What the AI did:** wrote the enrolment service, which allocates the student
number in the same transaction as the insert. It also wrote the student API
routes, the enrolment form (React Hook Form, validated with the same zod
schema as the API), the student record page, and the seeded cast of ten
students.

**Checked by:**

- **Concurrency:** 20 enrolments sent at once received SMS-2026-0001 to 0020,
  with no duplicates and no gaps.
- **No gaps:** an enrolment that failed on a duplicate email didn't use up a
  number. The next student got the following one, because the counter
  increment rolls back with the failed insert.
- **Unique constraint name:** the research had warned that Prisma's PostgreSQL
  driver adapter reports the violated constraint under `driverAdapterError`
  rather than `meta.target`. The duplicate-email test confirms the code reads
  it from there.
- **In a real browser:**
  - Client-side errors are linked to their fields with `aria-describedby`.
  - A duplicate email returns 409, and the message appears under **Email**.
  - A new enrolment continues the seeded number sequence.

**Changed after review:** the student's status badge first sat inside the page
heading, so screen readers announced the title as "Grace Thompson Enrolled".
It now sits beside the student ID instead.

## Finding students

**What the AI did:** wrote the student search service (name, ID or email, with
combinable filters and pagination), `GET /api/students`, and the list page.
The page uses a GET `<Form>`, so the filters live in the URL and the page
works without JavaScript.

**Caught during review:** Prisma passes `contains` straight to ILIKE, so a
typed `%` or `_` would act as a wildcard. They are now escaped, and a test
checks it.

**Checked by:**

- Integration tests cover each filter alone and combined, malformed filters,
  paging 20 at a time (including a request beyond the last page), and staff-only
  access.
- In a real browser:
  - searching "har" finds only Amelia Hart and puts the search in the URL;
  - the status select applies as soon as it changes;
  - "Clear filters" resets the list.

## Editing records and changing status

**What the AI did:** wrote record editing, status changes (allowed changes
only, with a reason required for deferral or withdrawal, and every change kept
in the status history), the edit page, the status-change form, and the
student's own read-only record page.

**Checked by:**

- **Integration tests** cover these cases:
  - edits never change the student number;
  - duplicate emails are refused;
  - disallowed changes return explanatory 409s;
  - a withdrawn student can be re-admitted;
  - of two simultaneous status changes to the same record, exactly one wins,
    because the status is only updated if it is still the one that was read.
- **Browser check of the `refresh()` decision, with a control.** After a status
  change made through the form, which calls the Server Action, pressing Back
  showed the student list with the new status. After the same kind of change
  made through the API with no refresh, Back showed the old status. The action
  is needed, and stays.

**Caught by the type-aware lint:** Vitest's asymmetric matchers
(`expect.any`, `expect.stringMatching`) are typed `any`, which the
`no-unsafe-assignment` rule flags. The assertions were rewritten without them
rather than relaxing the rule for tests.

## Fees and payments

**What the AI did:**

- **Domain:** split oldest-charge-first payment allocation out of the account
  summary, so each charge shows what is paid and outstanding on it.
- **Fees service:**
  - a student enrolled straight away is charged the programme fee in the same
    transaction;
  - an amount different from the standard fee needs a note;
  - duplicate payment references are refused;
  - every write returns the recalculated account.
- **Interface and seed:** the account section on both record pages (forms for
  staff only), and seeded accounts covering every state.

**Checked by:**

- **Integration tests** run on a fixed clock: overdue begins the day after the
  due date, the balance updates as soon as a payment is recorded, overpayment
  becomes credit, and references are compared ignoring case and spacing.
- **In a real browser:**
  - a £5,000 payment cut Amelia's overdue amount from £9,535.00 to £4,535.00
    straight away;
  - the same reference, typed with different spacing, was refused under
    **Reference**;
  - Liam's student view shows the £250 credit, with no forms.

**Caught along the way:** a test fixture inserted SMS-2026-0001 directly,
bypassing the counter, and the counter then issued the same number. The app
always uses the counter, but this showed that imported data would need its
counters set. That is now a documented limitation.

## Fee corrections and payment reversals

**What the AI did:** wrote the code to correct a fee charge (its amount, due
date and note) and to reverse a payment. Both are offered as per-row dialogs
on the staff record page. A payment can be reversed once; its reversal is a
separate record, so the payment itself is never edited.

**Checked by:**

- **Integration tests:**
  - corrections recalculate the account, and moving the due date clears the
    overdue flag;
  - a non-standard amount needs a note;
  - of two simultaneous reversals of the same payment, exactly one succeeds,
    thanks to the unique constraint on `payment_reversals.payment_id`;
  - malformed IDs return 404 rather than a database error.
- **In a real browser:**
  - the reversal dialog has a proper dialog role and title, and moves focus
    into the reason field;
  - a reversal brought Kwame's overdue amount back to £9,535.00 and removed
    that payment's **Reverse** button;
  - a due-date correction cleared Kwame's overdue flag.

## Registry dashboard and overdue flags

**What the AI did:** wrote the Registry dashboard. It counts students by
status, each count linking to the filtered student list, and shows the overdue
worklist: every student with fees unpaid after the due date, longest overdue
first, including withdrawn and completed students. The student list gained a
**Fees** column with each student's account standing and overdue amount.
Accounts are summarised in two queries however many students there are, using
the same domain code as the record page, so the figures always agree.

**Checked by:**

- **Integration tests** on a fixed clock:
  - status counts include statuses with no students;
  - the worklist is ordered by days overdue and includes a withdrawn student;
  - accounts that are paid, in credit, due today or not yet due are left out;
  - a reversed payment counts as never made;
  - the dashboard is for staff only, and the student list reports each
    student's standing.
- **In a real browser,** on fresh demo data:
  - the dashboard showed 10 students (7 enrolled) and "3 students owe
    £24,020.00", listing Amelia, Kwame and Hannah in that order;
  - after a £4,535 payment on Kwame's record, the dashboard (reached by the
    navigation link, without a reload) read "2 students owe £19,485.00".

**Caught along the way:**

- In a window about 930 pixels wide, the new **Fees** column made the student
  list wider than the page and cut off the overdue amounts. Long programme
  titles now wrap.
- Several curl examples in TESTING.md had been joined onto single lines by an
  earlier scripted edit, which swallowed the line continuations. They are
  split again.

## Setting and managing assessments

**What the AI did:** wrote the assessments feature. Staff set an assessment
for a module with a title and a deadline typed in college time, move the
deadline, and close or reopen it. Each assessment page tracks who on the
programme has submitted, with late work flagged. Forms and API share one
deadline rule: the form checks it with the API's schema but sends the time as
typed, and the API converts it to an instant.

**Checked by:**

- **Unit tests** (run with the process in Asia/Dhaka, to catch any reliance on
  the server's own time zone):
  - deadlines read as London time in both GMT and BST;
  - a time in the hour skipped in March is refused;
  - an autumn time that happens twice resolves to its first occurrence;
  - a deadline must be in the future, judged when the form is submitted
    rather than when it was opened.
- **Integration tests:**
  - the list orders open assessments by deadline, then the rest;
  - counts only include students expected to submit;
  - the tracker lists a withdrawn student who had already submitted;
  - moving the deadline clears late flags at once;
  - closing twice keeps the first closing time;
  - malformed and unknown IDs return 404.
- **In a real browser:**
  - an empty form showed all three errors and moved focus to the first;
  - 01:30 on 28 March 2027 was refused with the explanation;
  - a 20 November deadline displayed as "Fri 20 Nov 2026, 17:00 GMT", and the
    tracker listed the three enrolled Computer Science students;
  - the edit dialog moved the deadline, and closing (after its confirmation,
    with Cancel focused) and reopening both worked.

**Caught along the way:** the first screenshot after a page load sometimes
showed loading skeletons even though the page had finished rendering. Checks
of the page itself, before and after the screenshot, showed the content in
place, and a second screenshot showed it too. The cause was a stale frame in
the automated browser, not a flicker in the app.

## Submitting work

**What the AI did:** wrote the submission feature:

- students upload a PDF or Word document for an assessment, replace it until
  the deadline, and submit late (flagged) until staff close the assessment;
- staff and the submitting student can download the file;
- the student view gained an **Assessments** list and a page per assessment,
  and the staff tracker gained download links;
- small but genuine sample documents (a one-page PDF and a minimal .docx) are
  built in code for the tests and, later, the demo data, so the repository
  holds no binary fixtures.

**Checked by:**

- **Unit tests:** the file checks. A renamed file, a contradicting declared
  type and a macro-enabled document disguised as .docx are all refused.
- **Integration tests,** against real files in a temporary folder that each
  test empties, so stray files would show:
  - a replacement keeps exactly one file on disk;
  - a late first submission is accepted and flagged, but can't be replaced;
  - a closed assessment, a deferred student and another programme's
    assessment are all refused, and none of them leaves a file behind;
  - a declared 20 MB upload is refused unread, and a body that never ends is
    abandoned soon after the limit;
  - of two simultaneous first uploads exactly one is kept;
  - downloads carry an attachment header that is safe for accented names;
  - a file missing from storage returns 404, not a crash.
- **In a real browser,** as Amelia:
  - no file and a text file were caught before sending;
  - a text file renamed `.pdf` was refused by the server's content check;
  - a PDF was submitted and then replaced by a Word document, leaving one
    file on disk;
  - the download had the right headers;
  - the staff tracker showed "Replaced 1 time" with a working link.
- **With curl:** the documented upload, refusal and download commands, run
  against the production build.

**Caught along the way:**

- A test bound on how far the server reads an oversized stream was too tight:
  streams read a few chunks ahead, so the bound now allows for that.
- A shell edit turned an escaped `\r\n` in a test into a real line break. It
  was spotted at once and fixed.
- The student page said a second upload "replaced the earlier ones". It now
  says only the latest file is kept.

## Entering marks

**What the AI did:** turned each assessment's submission tracker into a
marksheet with one mark per student. As a mark is typed, the classification
updates. Saving sends only the marks that changed, keyed by student ID, so any
error comes back next to the right student; a cleared mark is removed. A
changed mark goes back to unpublished. Dates and sizes on the marksheet are
formatted on the server, so the browser can't render them differently.

**Checked by:**

- **Unit tests:** the marksheet schemas, covering blank versus whole-number
  input, decimals, negatives and text, and student IDs as keys.
- **Integration tests:**
  - marks are saved with and without a submission;
  - saving an unchanged published mark keeps it published, while changing it
    unpublishes it;
  - a withdrawn student with a mark stays on the marksheet until the mark is
    removed;
  - unknown students and students on other programmes are refused, and
    nothing is saved.
- **In a real browser:**
  - typing 72 showed **Distinction** and "Not saved yet";
  - 3.8 was refused next to Oliver's mark, with focus moved there;
  - three marks saved at once, and one more on its own, with the expected
    messages.

## Publishing and withholding results

**What the AI did:**

- **Staff:** the student record gained a **Results** section with every mark
  and whether it is published. Beside the controls sit the fee standing,
  **Publish** (with a confirmation, because there is no unpublishing) and
  **Withhold results** (with the outstanding-fees preset or a reason of the
  staff member's own).
- **Students:** a **Results** page shows published marks only, or the reason
  for a hold.
- **Worklist:** a staff **Results** page lists students with marks to publish
  first, and the dashboard counts students with marks to publish and with
  results withheld.
- **Server-side filtering:** the filtering happens on the server, so an
  unpublished or withheld mark is never sent to a student at all.

**Checked by:**

- **Integration tests:**
  - staff see every mark, while the student gets only published ones;
  - publishing stamps only unpublished marks and leaves earlier publication
    dates alone;
  - publishing is refused while withheld;
  - a hold hides published marks too, and lifting it brings back only
    published ones;
  - withholding again keeps the original date;
  - the worklist orders and filters students correctly, with their fees;
  - the dashboard counts don't count a withheld student as waiting to be
    published.
- **In a real browser:**
  - Amelia's results were withheld for fees;
  - Amelia's own Results page showed only the notice, and the API response
    Amelia's browser received held no marks;
  - lifting the hold and publishing, after the confirmation, made the mark
    visible to Amelia;
  - the worklist and dashboard counts matched.

**Caught along the way:** some testing-guide steps and test comments used
gendered pronouns for the fictitious students. They now use names or neutral
wording.
