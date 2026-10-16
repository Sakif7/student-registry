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
  failing exit code: ESLint was linting the generated coverage report. The
  commit itself was sound, because the pre-commit hook lints only staged files
  and the report isn't tracked. But `npm run check` failed in any working copy
  that had a coverage report, until the next commit (f2a21aa) excluded it.
  Checks now run with `pipefail`, so a failure can't be hidden that way again.

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

## Completing the demo data

**What the AI did:**

- **The seed:** gained eight assessments in every state (open, past the
  deadline but still accepting late work, closed), eleven submissions stored
  as real PDF and Word files (on time, late, replaced, and one from a student
  who later withdrew), and marks in every classification, published and not.
  Amelia's results are withheld for outstanding fees.
- **Reseeding:** before replacing the data, the seed deletes the stored files
  of the submissions it is about to remove, and nothing else.
- **The testing guide:** the demo data table and scenarios 9 to 12 now use
  the seeded assessments, including late work, a closed assessment, a
  deferred student and a completed student's results.

**Checked by:**

- running the seed twice: the upload folder held exactly the 11 current files
  each time, and the files left over from manual testing were removed;
- **in a real browser:** the assessments list showed every state and count as
  intended, including a deadline on the day the clocks go back, correctly
  shown in GMT.

**Caught along the way:** a deferred student viewing an assessment past its
deadline would have been told "You can still submit", alongside the notice
that only enrolled students can submit. The deadline note now only promises
what the student can actually do.

## End-to-end and accessibility tests

**What the AI did:** added Playwright end-to-end tests that build the app and
drive it in Chromium, against the test database and the demo data:

- choosing a view and access control, including file downloads;
- enrolment, the duplicate-email check, search and a status change;
- fees and the dashboard;
- the assessment journey: setting an assessment, refusing a disguised file,
  submitting, replacing, late work and marking;
- publishing and withholding results;
- an axe accessibility scan (WCAG 2.1 A and AA) of every kind of page.

`npm test` now runs all three suites, and CI runs the end-to-end tests with
the report uploaded on failure.

**Caught along the way:**

- **Server errors:** the production server logged "encountered the unstable
  value `new Date()` while prerendering" for the dashboard and assessments
  pages. With partial prefetching, cookies resolve while a route's shell is
  prerendered, so the session check no longer stopped the prerender, and those
  pages read the clock before their first query. `requirePageRole` now calls
  `io()` after the role check, as the Next.js documentation recommends. The
  errors are gone, and the reasoning is in DECISIONS.md.
- **Contrast:** axe found one failure, a muted label on the red "Overdue"
  figure of a student record. It now uses dark red.
- **Error messages:** an empty name gave "Enter at least 2 characters", and
  an empty email or date of birth gave "valid"/"real" wording. Empty fields now
  ask for the detail by name.
- **Hidden previous page:** one test matched text twice because Next.js keeps
  the previous page mounted but hidden. The test now counts visible matches
  only.

## Final checks

**What the AI did:** completed the README (setup, environment variables,
scripts, API, AI usage and licences), the "With more time" section of
DECISIONS.md and the agent instructions, then verified the result as a
reviewer would meet it.

**Checked by:**

- **A fresh clone, set up from the README:**
  - `npm install`, which also generates the Prisma client;
  - migrations and the demo data, against a database of its own;
  - `npm run check`;
  - `npm test`: 370 unit and integration tests at 91% line coverage, then 21
    end-to-end tests;
  - `npm run audit:deps`.

  Everything passed. The only step skipped was `npm run db:up`, because
  PostgreSQL was already running and a second checkout would have started a
  second container on the same port. The rehearsal's database was dropped
  afterwards.

- **The testing guide's scenarios,** run against freshly seeded data: by the
  end-to-end suite, and in the browser for the steps it doesn't cover (a
  closed assessment, a deferred student's assessment page, a withdrawn
  student on a marksheet, a completed student's results).

**Caught along the way:**

- **Install output:** `npm install` reports "9 high severity
  vulnerabilities": the three reviewed advisories, counted once per package
  that carries them. The README now says so, so the line doesn't alarm a
  reviewer.
- **Dated example:** a curl example used a fixed deadline that would be
  refused once the date had passed. It now says to use a future date.

## Planning the second version, 16 October 2026

**Task:** after trying the first version, the user asked for two changes and
for suggestions and questions about them:

- real sign-in with production-style sessions instead of the view picker.
  Staff accounts come from the seed, with their details on the sign-in page,
  and staff create student accounts;
- an interface that feels like a real application, with a sidebar and tabs.
  A student's record, for example, should be split into tabs rather than one
  long page.

**What the AI did:** proposed options and asked its questions through Claude
Code's question interface. The user chose:

- **Sign-in:**
  - Better Auth (the agent had recommended hand-written database sessions);
  - email addresses as the login for everyone;
  - activation and password-reset links by email, caught locally by Mailpit,
    each working for 72 hours;
  - two or three named staff with the same permissions, and demo staff and
    students listed on the sign-in page;
  - "forgot password", an account page listing signed-in devices, and an
    audit trail of who did what, but no two-factor authentication.
- **Interface:**
  - the current look, restructured: a sidebar, and tabs kept in the URL
    (`?tab=`);
  - actions in dialogs, toasts with undo, sortable tables and a command
    palette;
  - a dashboard with figures, charts and to-do lists, and a home page for
    students.
- **Order:** sign-in first, then the interface.

## Email with Mailpit

**What the AI did:** the first step of real sign-in:

- added Mailpit to Docker Compose and to CI;
- added the SMTP settings to the configuration and `.env.example`;
- added a small nodemailer-based mailer for the activation and
  password-reset emails to come.

**Checked by:** starting the new Compose file, with both services healthy,
then sending a message with the same SMTP settings and reading it back
through Mailpit's API.

## Forms that wait for hydration

**What the AI did:** fixed an end-to-end test that failed in one run out of
several. The test chose a module on "Set an assessment" the instant the form
appeared, and the choice was gone when it submitted. The trace showed why:

- the form arrived as server-rendered HTML;
- the choice landed before React had hydrated it;
- React Hook Form then reset the field to its default.

Every form now marks itself `aria-disabled` until React has hydrated it, which
Playwright waits for, and which tells assistive technology the form isn't
ready. A person could still type in that fraction of a second; DECISIONS.md
explains why the fields aren't disabled outright.

**Checked by:**

- a unit test of the server-rendered form;
- the end-to-end suite, where every form journey now depends on the forms
  becoming available once hydrated;
- `npm run check`.

## Signing in with Better Auth

**What the AI did:** replaced the view picker with real sign-in:

- Better Auth, with email and password, sessions stored in PostgreSQL, and
  rate limits;
- a sign-in page that can list the demo accounts, a redirect to it for
  visitors without a session cookie, and sign-out;
- password-reset links by email (the pages that use them come next);
- sign-in accounts in the demo data, in every state: active, waiting for
  activation, and turned off;
- tests that sign in for real. Integration requests carry a signed cookie
  for a real session, and the end-to-end tests use the sign-in form for the
  sign-in journeys.

Before writing code, the agent read the parts of Better Auth's source it
would depend on: how a reset link creates a password for an account that has
none, which checks the origin and the rate limit make, and the format of the
signed cookie.

**Checked by:**

- `npm run check`;
- 406 unit and integration tests (92% of lines), 34 more than before: sign-in,
  sessions and reset links, called through Better Auth's own endpoints, plus
  the mailer, the email templates and the redirect for visitors without a
  session;
- 27 end-to-end tests, including five sign-in journeys through the form and
  an axe scan of the sign-in page;
- in a browser against the production build: the sign-in page, its errors,
  signing in with a demo account, signing out and pressing Back, and every
  sign-in curl example in the testing guide.

**Caught along the way:**

- **Timing:** Better Auth waits for the reset email to be sent before it
  answers. A request for a real account would then take noticeably longer
  than one for an unknown address, giving the account away. The email now
  goes out after the response, with Next.js `after()`.
- **Sessions that couldn't slide:** Better Auth extends a session in the
  database as it's used, but pages read the session on the server, where the
  renewed cookie can't reach the browser. The browser would have signed
  people out 8 hours after sign-in anyway, while the database said
  otherwise. Sessions now last a fixed 8 hours, and DECISIONS.md says why.
- **Rate limits behind a proxy:** Better Auth only trusts an
  `X-Forwarded-For` header holding a single address. Behind a proxy that
  appends to the header, every visitor would share one limit. DECISIONS.md
  now records what a deployment must do.
- **Endpoints left open:** Better Auth's defaults let any signed-in user
  rename themselves through `/api/auth/update-user`. That and the other
  endpoints this app doesn't use are switched off, and a test checks it.
- **Tests that raced:** two concurrency tests signed their users in as part
  of the racing requests, so the race no longer tested the write it was
  meant to. They now sign in first and race only the writes.
- **A limit that would lock out a campus:** in the browser check, the sixth
  sign-in in a minute from one machine was refused. That was the limit
  working, but a college network can put thousands of students behind one
  address. The limits per address are now generous (30 sign-ins a minute),
  and a limit per account is the next step.
- **A curl example that couldn't work:** signing out with curl got a 415.
  Better Auth only accepts JSON bodies, even an empty one, and then wants an
  `Origin` header. The integration test had passed because its request had
  no body at all, unlike a browser's. Both now send what a browser sends.
- **A test that failed once:** in one full run, a form lost a choice made
  before React had hydrated it. That was an older problem, fixed in its own
  commit just before this one.

## Locking an address after failed sign-ins

**What the AI did:** added the limit per account that the previous step had
left for later:

- five failed sign-ins with one email address within 15 minutes lock it,
  from any client address, and the sign-in page says for how many minutes;
- failures for addresses without an account count the same way, so a lock
  reveals nothing;
- a successful sign-in or a new password clears them;
- an account receives at most three password-reset emails an hour.

The rule itself is a pure function in `src/domain/accounts.ts`; Better
Auth's `before` and `after` hooks check and record the failures.

**Checked by:**

- unit tests of the rule, including failures that arrive out of order;
- integration tests through Better Auth's endpoints: the lock even against
  the right password, letter case and client addresses, unknown addresses,
  other accounts unaffected, expiry, clearing on sign-in and on a reset, and
  the email cap;
- an end-to-end test of the message on the sign-in page.

**Caught along the way:** a unit test expected the lock to lift a minute too
late. Working through the six failures by hand showed the code was right:
the lock lifts as soon as fewer than five failures remain in the window.

## Unique ids for form fields

**What the AI did:** fixed duplicate element ids. While building the
forgot-password page, an end-to-end test typed into an "Email" field and
waited forever: the label led to the sign-in page's "Email" field, which
Next.js had kept in the document, hidden, after the link was followed. Both
fields had the id `email`. The same could happen between any two forms that
share a field name, and it broke the label for screen readers too, not only
for the test. `FormField` now prefixes its ids with React's `useId()`, as do
the marksheet and the student filters, and AGENTS.md forbids hard-coded ids.

**Checked by:**

- unit tests: two instances of a field get distinct ids, each label points at
  its own control, and the hint and error still describe it;
- the full test suites and `npm run check`.

## Password pages

**What the AI did:** added the pages that use the emailed links:

- "Forgot your password?" on the sign-in page, which asks for a link and
  answers the same whether or not the address has an account;
- a page for choosing a new password from a reset link, and one for
  activating an account, which the next step's activation emails will use;
- a "This link no longer works" notice for an expired or used link, with a
  way to ask for a new one.

The session and link lifetimes moved into `src/domain/accounts.ts`, so the
pages can state them.

**Checked by:**

- `npm run check`;
- an end-to-end journey that reads the email from Mailpit: asking for a
  link, choosing a new password with it, signing in with the new password,
  and finding the used link refused;
- an end-to-end test that the two passwords must match;
- the axe scan, now covering the new pages in both states.

**Caught along the way:**

- **Contrast:** the axe scan of the "no longer works" notice failed. The
  shadcn/ui alert set its error text in red at 90% opacity, which falls
  short of the AA contrast ratio on white. It now uses full-strength red,
  wherever the alert appears.
- **Duplicate ids:** following "Forgot your password?" exposed fields that
  shared an id with the hidden sign-in page. That was fixed in its own
  commit, just before this one.
- **A test racing a link:** following a link renders the next page in place,
  and Playwright doesn't wait for that. The journey typed the email into the
  sign-in page's field just before the forgot-password page replaced it. It
  now waits for each new page's heading, and types into the visible "Email"
  field only, as the sign-in page's stays in the document, hidden. It then
  passed three runs in a row.

## Students' sign-in accounts

**What the AI did:** gave every student an account:

- enrolment creates it in the same transaction as the record, and emails an
  activation link. The enrolment stands if the email fails, and staff are
  told;
- a Sign-in card on the student's record shows where the account stands,
  emails an activation or password reset link (the newest link replacing
  the rest), and turns sign-in off, with a confirmation and an undo, or back
  on;
- editing a student's name or email updates the account, and a new address
  cancels links sent to the old one;
- a data migration gave existing students accounts.

Better Auth's reset endpoint only logs a failed email, which would have
hidden failures from staff. So for links staff send, the app asks Better
Auth for the link without emailing it, then sends and checks its own email.

**Checked by:**

- `npm run check`;
- integration tests through the API: the account and activation email at
  enrolment, following the link to activate and sign in, enrolment
  surviving a failed email, staff-only access, link replacement, the 503,
  turning sign-in off (sessions ended, sign-in refused, links cancelled) and
  on, record edits moving the account, and a student with no account yet;
- unit tests of the account's states;
- end-to-end journeys through Mailpit: staff enrol a student, who activates
  the account in a separate browser and signs in; staff turn a student's
  sign-in off, and the student is signed out even after Undo.

**Caught along the way:** the enrolment journey's check for the student's
email address now found it three times, on the record, in the Sign-in card
and in the confirmation. It now looks only among the record's details.

## Account page

**What the AI did:** added an account page for staff and students, reached
from their name in the header:

- their details, read-only, as the Registry holds them;
- changing their password, which needs the current one and signs out every
  other device;
- the devices they are signed in on, each described from its browser's user
  agent, and signing out on any of them, or on all but this one.

A wrong current password counts as a failed sign-in for the address, so a
stolen session can't be used to guess the password. The session's own ID now
travels with the app's `Session`, to tell this device from the others.

**Checked by:**

- `npm run check`;
- unit tests of the device descriptions (real user-agent strings for
  Chrome, Edge, Safari, Firefox and Android, and ones the code doesn't
  recognise) and of the form's rules;
- integration tests through the account routes, signing in through Better
  Auth from two devices: the change itself, the other device signed out and
  this one kept, the wrong current password and the lock it leads to, the
  new password's rules, the list of devices, signing out one or all others,
  and refusing someone else's session or this one;
- an end-to-end journey with two browsers, and the account pages in the axe
  scan.

**Caught along the way:** the second end-to-end test signed in with Tom's
demo password, which the first had just changed. It now uses another staff
member's session.

## Audit trail

**What the AI did:** added an audit trail of who did what:

- an `audit_events` table: the action, who did it, the student it
  concerns, and the details needed to describe it later;
- every service that changes something records an event in the same
  transaction: enrolments and edits, status changes, fees, payments,
  assessments, marks, results, submissions and sign-in controls;
- a database trigger that refuses to update or delete an event;
- an Activity log for staff, and a History on each student's record;
- the demo data's own trail, written by the seed from the records it
  creates.

**Checked by:**

- `npm run check`;
- unit tests of every event's wording;
- integration tests: each kind of change records the right event and actor,
  an edit names only the details it changed, requests that change nothing
  record nothing, a failed change leaves no event, the trigger refuses an
  update and a delete made directly in the database, and only staff can read
  the trail;
- an end-to-end journey: a payment appears in the student's History and at
  the top of the Activity log, with who recorded it;
- the Activity page in the axe scan.

**Caught along the way:** an enrolment test looked for a deferral's reason
anywhere on the page, and now found it twice: in the status history and in
the new History. It now looks in the status history, which it is about.

**Design note:** recording "by" columns on each table would have shown who
made each change in place, but left no single trail to browse. The event log
gives staff both the Activity page and each student's history.

## App shell

**What the AI did:** the first step of the interface the user asked for:

- a sidebar for staff and students, from shadcn/ui, listing the section's
  pages with icons and the current one marked. It collapses to icons on a
  desktop and slides in on a phone;
- a user menu at the foot of the sidebar, with the account page and signing
  out, replacing the name and button in the old header;
- breadcrumbs in the page header of deeper pages, naming the record.

The components were added with the shadcn CLI. It wanted to overwrite six
components the project already had; after formatting, its versions were the
same as ours, so nothing of ours changed.

**Checked by:**

- `npm run check`;
- in a browser, on a desktop and at phone width: the sidebar, its collapse,
  the user menu and its links, and the breadcrumbs;
- the end-to-end suite, with the tests that signed out or opened the account
  page now going through the user menu, and the axe scan of every page.

**Caught along the way:**

- **A random width in a prerender:** the development server reported
  `Math.random()` in a prerendered client component. It was shadcn's menu
  skeleton, used as the user menu's placeholder; a fixed-size placeholder
  replaced it.
- **Lint:** the generated `use-mobile` hook set state inside an effect, which
  the React lint rules refuse. It now reads the media query through
  `useSyncExternalStore`.
- **Contrast:** the axe scan failed on the user menu's avatar: shadcn's
  initials are grey on light grey. They are now white on the sidebar's
  near-black.

## Search palette

**What the AI did:** added a search for every signed-in page, opened with
Ctrl/⌘+K or a button in the top bar. It finds pages and actions by name and,
for staff, students by name, ID or email, through the existing student
search API.

**Checked by:**

- `npm run check`;
- end-to-end tests, run twice in a row: a student found by name and by ID,
  an action opened with Enter, and a student finding only their own pages.

**Caught along the way:**

- **Stale results:** a test searched for one student, closed the search,
  then searched for "enrol" and pressed Enter. It opened the first
  student's record: the earlier results were still listed until the new
  search returned. Students now show only for the words they were found
  for.
- **A shortcut before hydration:** pressing Ctrl+K before React has
  hydrated the page does nothing, so the button is `aria-disabled` until
  then, as forms are, and the tests wait for it.
- **A button name shared:** an older test clicked the student list's
  "Search" button by name, which now also matched "Search…" in the top bar.
  It matches the name exactly.

## A student's record in tabs

**What the AI did:** rebuilt the staff view of a student's record, which the
user had singled out: everything was on one page.

- A header with the student's status, fees, results and sign-in at a
  glance, and **Edit details** and **Change status**, each in a dialog. The
  separate edit page went.
- Tabs for Overview, Fees, Assessments, Results, History and Sign-in, kept
  in the address as `?tab=`.
- On the Fees tab, recording a payment and charging a fee became dialogs
  too.

**Checked by:**

- `npm run check`;
- in a browser: each tab, the address following the tab, a payment recorded
  through its dialog, and the status and edit dialogs;
- the end-to-end suite, with the record's journeys now using its tabs and
  dialogs, and an axe scan of every tab and of each dialog open.

**Caught along the way:** the demo data showed Amelia Hart's mark published
two days after Amelia's results were withheld, which the app itself refuses. The
seed is fixed in the next commit.

## Demo data in a believable order

**What the AI did:** two fixes to the seed, found while checking the new
History tab:

- Amelia Hart's results were withheld five days ago, but Amelia's coursework mark
  was published two days ago, which the app refuses while results are
  withheld. The hold now comes the day after publication.
- Every activated student showed today as their activation date. Their
  password is now set the day after their enrolment.

**Checked by:** running the seed, `npm run check`, and the end-to-end suite,
which loads the demo data for every spec.

## Sortable student list

**What the AI did:** made the student list's column headings sort it (by
name, ID, programme, academic year or status, either way), with `aria-sort`
and an arrow on the sorted column, and gave each row a menu leading to a tab
of the record, or an email to the student. Sorting happens on the server, in
the address, so it works across pages and with the filters.

A link to another tab of the record being viewed didn't change tab: the page
stayed mounted and kept its state. The tabs are now keyed by the tab asked
for.

**Checked by:**

- `npm run check`;
- integration tests of each sort, either way, of ties staying in name order,
  and of an unknown column or direction falling back to name order;
- an end-to-end journey: sorting by name, then opening a record's Fees tab
  from a row's menu; and the axe scan of the list.

## A slow sign-in test

**What the AI did:** gave the integration test that makes 32 sign-in attempts
a 30-second timeout. Each attempt hashes a password, which is slow on purpose,
so on a busy machine the test ran past the default 5 seconds. A timed-out
test keeps running in the background: its last, successful sign-in then
cleared the failed attempts the next test had just recorded, and that test
failed too. The assertions are unchanged.

**Checked by:** the full unit and integration run with coverage, and the
end-to-end suite.

## Dashboard: figures, charts and worklists

**What the AI did:** rebuilt the staff dashboard around the day's work:

- figures for enrolled students, overdue fees, the year's fees collected,
  marks to publish, work to mark and accounts waiting for activation;
- charts of students by programme and status, the academic year's fees
  (paid, overdue, not yet due) and its marks by classification, with each
  chart's figures also in text;
- worklists of marks to publish, work to mark, assessments past their
  deadline and students waiting to activate their account, each leading to
  the record or assessment concerned;
- the overdue worklist, and the assessments open for submissions.

It added shadcn's chart component with the shadcn CLI. The CLI's dry run
listed a package called `cn` among the dependencies, which looked like a
mistake until the AI checked: the app already uses `cn`, shadcn's own class
name helper, in every component.

Found and fixed along the way:

- The PostgreSQL adapter sends a `Date` in a raw query without its offset,
  so the database would read it in its own time zone. Instants now go in as
  ISO text with a cast, and AGENTS.md says so.
- On a phone, the overdue table widened the whole page: the dashboard's
  grids sized their single column to the widest content. They now use
  `minmax(0, 1fr)` columns, and the table scrolls inside its card.
- The axe scan found the fees ring in the tab order although it is hidden
  from screen readers. Recharts gives a pie's root a tab index by default;
  it is now `-1`.
- The demo data stamped every mark with the time the seed ran, so every
  mark seemed to have just been saved. Marks now carry the time the audit
  trail says they were entered.

**Checked by:**

- unit tests of the year's fee totals (payments clearing older years first,
  credit counting for nothing) and of counting marks by classification;
- integration tests of every figure and worklist, including a deadline that
  falls on 1 September in London but 31 August in UTC (a test that fails if
  the query compares UTC dates, which the AI tried);
- end-to-end tests: publishing from the worklist removes the student from
  it, and the worklists and the chart of students lead to the right pages;
- the axe scan of the dashboard, and screenshots at desktop, laptop and
  phone widths.

## Student home page

**What the AI did:** gave students a home page in the shell: their next
deadline (and whether they have submitted, or why they can't), their fees
(what is left to pay, anything overdue, the next payment due), their latest
published marks (or why results are withheld), and every assessment still
taking work. The details, status history and account that used to make up
the home page moved to new **My record** and **Fees** pages in the sidebar.

The old home page sent a student whose record had gone back to `/`, a
leftover from the first version's demo role picker. With real sign-in,
`/` would have sent them straight back: a redirect loop, had it ever
happened. The student pages now show the 404 page instead, like the rest
of the app.

The end-to-end check that a student sees no staff controls looked for a
"Record payment" button, but the staff button is "Record a payment", so the
check would have passed even if it were there. It now looks for the real
button names.

**Checked by:**

- unit tests of the next charge due and of "today", "tomorrow" and "in 3
  days";
- end-to-end tests: a student's home shows their deadline, fees, results
  and work, and leads to an assessment; a student with fees overdue and
  results withheld is told both, and **Your fees** leads to their account;
- the axe scan of every student page, and screenshots of three students'
  home pages.

## A contrast check that caught a dialog fading in

**What the AI did:** made the axe scans wait for opening animations to
finish. Dialogs fade in over 100 ms; one full run scanned the "Charge a
fee" dialog before it had finished, while its text was still partly
transparent, and reported its descriptions as too faint. The scan now waits
for every animation that ends (an endless one, such as a pulse, would never
finish) and then checks what users see.

**Checked by:** the accessibility spec, every scan of which still passes.

## Undo for reversible actions

**What the AI did:** gave the actions that can be reversed straight away an
**Undo** button in their confirmation: withholding results, lifting a hold
(Undo puts it back with the same reason), and closing or reopening an
assessment. Turning a student's sign-in off already had one; all of them
now share one helper, which makes the opposite request, says so and
refreshes the page. Publishing has no Undo, because the student sees the
marks at once; payments and status changes are corrected with a reason.

No end-to-end test closed an assessment through the page before; the new
one closes it and undoes that. The helper that finds a demo assessment's
page moved into the shared end-to-end helpers for it.

**Checked by:** end-to-end tests that withhold results and undo it, lift a
hold and undo that (the reason comes back), and close an assessment and
undo it; and the existing test of turning sign-in off and undoing it.

## A results list link left behind by the record's tabs

**What the AI did:** pointed each student's link on the **Results** page at
their record's Results tab (`?tab=results`). It still pointed at a heading
anchor from before the record was split into tabs, so it opened the record
at the top, on the Overview tab.

**Checked by:** an end-to-end test that follows the link and finds the
Results tab selected.

## Every page within a phone's width

**What the AI did:** added an end-to-end test that opens every page at 390
pixels wide and checks that none scrolls sideways. It found the assessment
page wider than the screen: the marksheet's table had widened the page's
grid, as the overdue table had on the dashboard, pushing the deadline card
off the edge too. The grid now has `minmax(0, 1fr)` columns, so the table
scrolls inside its box. AGENTS.md now says so for any grid that holds a
table.

The same page labelled its marksheet section with a fixed id, against the
project's rule for ids; it is now named directly.

**Checked by:** the new test, which passes on every staff, student and
signed-out page.

## Sortable assessments list

**What the AI did:** made the staff list of assessments sortable by title,
programme, deadline, state or how much has been submitted, either way, with
the order in the address as on the student list. The list isn't paged, so a
pure function sorts it after it is read, keeping the usual order (open
first, soonest deadline first) for ties; sorting by state is that order
itself. The sort direction moved into a small module both lists share.

**Checked by:** unit tests of each column and direction and of ties, and an
end-to-end test that sorts by programme and back.

## Curriculum and module registration

**What the AI did:** answered the owner's questions about how programmes and
modules are made, who takes which module, and semesters. The first version
seeded modules that each belonged to one programme, and every student on a
programme took every module. Asked to go the whole way, the AI modelled the
curriculum:

- programmes with a length and the credits each year carries, built from a
  shared module catalogue (credits, semester), with a structure of core
  modules and options for each year of study;
- academic years with semester dates, and a switch that lets students
  choose their own options;
- students with a year of study, registered on modules for each academic
  year: core modules automatically (on enrolment, on returning to
  Enrolled, and on moving programme, year or academic year), options by
  staff or the student, within the year's credits;
- assessments for the students registered on the module in the academic
  year of the deadline, instead of everyone on the programme.

The rules are pure functions in `src/domain`, with the services, the API
and an audit event for every change. A migration moves existing data
without changing what it meant. The demo data was rebuilt around years of
study, so some assessments moved to modules of the right year, and the
manual scenarios follow.

Found along the way:

- `prisma migrate diff` wrote a migration that dropped modules' programme
  before anything could copy it. The AI reordered it by hand so the data
  moves first, and ran it on a copy of the demo data to check.
- The first test of two registrations at once passed even without the row
  lock it was meant to prove, because each request signed in first and so
  ran after the other. It now signs in first and then fires the
  registrations together, and fails without the lock.

**Checked by:**

- unit tests of the curriculum rules (credits, years, semester dates) and
  the registration rules (what moving year changes, what can be added and
  dropped);
- integration tests of every curriculum and registration endpoint, of
  enrolment and moving year re-registering students, of students choosing
  only while allowed, and of the race;
- the migration run on the demo data, and Prisma's diff confirming the
  database then matches the schema;
- the end-to-end suite against the rebuilt demo data.

## Curriculum pages

**What the AI did:** gave staff pages for the curriculum, in a second
sidebar group, Curriculum, which the search (Ctrl/⌘+K) also lists:

- **Programmes:** the list, and each programme's structure year by year,
  with what its core modules take of the year's credits;
- **Modules:** the catalogue, with each module's programmes and how many
  students take it this year;
- **Academic years:** the semester dates, the next year ready to set up,
  and the switch that lets students choose their options.

Each change is made in a dialog through the API of the previous step.
Taking a module out of a programme, and the students' switch, can be
undone from the message that confirms them. A module's credits field is
read-only once students have taken it, as the API would refuse a change.

Found along the way: the AI's first draft of the manual scenario showed
the credit limit with a module that brought year 1 to exactly 120 credits,
which is allowed. It now uses a 60-credit module, which is refused.

**Checked by:** an integration test of the catalogue (each module's
programmes, this year's students, and credits locked by any registration,
however old); end-to-end tests that set up a module (correcting its
credits first), make it an option in a programme, remove it and undo, and
that set up the next academic year (correcting the semester dates first)
and let students choose, then undo; axe scans of the four pages and their
dialogs; and the check that every page fits a phone. The sorting test
needed the exact name of its Module link, now that the sidebar has a
Modules link too.

## Modules on the record and for students

**What the AI did:** brought module registration into the interface:

- a **Modules** tab on each student's record, with this year's modules by
  semester, the semester dates, the credits against the year's, the options
  of the student's year and earlier years' modules; staff add and drop
  options there, with Undo;
- the credits in the record's header, flagged while some are left to
  choose;
- a **My modules** page for students with the same view, where they add and
  drop options while staff let them choose, and a note on their home page
  asking them to choose while credits are left.

The service now says whether the viewer may change the modules, and if not,
why, so the pages can explain instead of only hiding buttons. Building the
tab showed a gap in the rules: staff could drop a withdrawn student's
options, though nothing could be added. Dropping now needs an enrolled
student too, so a student who isn't enrolled keeps their modules as they
were.

**Checked by:** unit tests of the drop rule for each status; integration
tests that a withdrawn student's modules can't be dropped, and of what each
viewer is told; end-to-end tests of staff adding an option and undoing it,
and of a student choosing once staff open choosing, from the note on their
home page; axe scans and the phone-width check of the new tab and page; and
screenshots of the tab and page. The axe scan of every staff page had
grown past the 30 seconds a test may take, so it is now three tests (the
Registry pages, the record's tabs and the curriculum pages), scanning the
same pages.

## Demo students by name

**What the AI did:** reworded three steps of the dashboard scenario and two
test comments that called fictitious students "he" or "she", so that they
use the students' names, as the rest of the documents do, instead of
guessing anyone's pronouns.

**Checked by:** a search of the documents, code and tests for gendered
pronouns, which now finds none.
