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

### Validating student details

- **Full name:** 2–120 characters, made of letters from any alphabet
  (accents included), spaces, hyphens, apostrophes (straight or typographic,
  as phones type them) and full stops, and starting with a letter. Runs of
  spaces are collapsed.
- **Email:** trimmed, lower-cased and unique. The database refuses a
  mixed-case email, so the same address can't be registered twice in
  different case.
- **Date of birth:** a real calendar date in the past, giving an age of 16 to
  100 on the day the record is saved. The lower bound reflects the youngest
  further-education students; the upper bound catches a mistyped year. A 29
  February birthday counts from 1 March in other years.
- **Programme:** identified by its code, e.g. `BSC-CS`, in forms, filters and
  the API.
- **Search filters** in the URL are lenient: a malformed value, such as an
  unknown status from an old bookmark, is ignored rather than turned into an
  error page.

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
- No single amount may exceed £100,000. This catches a mistyped extra digit
  without getting in the way of any real tuition fee. Amounts are typed in
  pounds and converted to pence with string arithmetic, never floating point.
- References are compared ignoring case and spacing ("bacs 0042" and
  "BACS 0042" are the same transfer).

### Balance and overdue

- The balance is charges minus valid payments. It is computed from the stored
  rows on every request and never stored itself, so it can't drift, and it is
  current the moment a payment is recorded.
- Payments clear the oldest charge first. The overdue amount is whatever is
  still unpaid on charges whose due date has passed; a charge due today is not
  yet overdue. Days overdue count from the oldest unpaid due date.
- Overdue students are flagged on the Registry dashboard, in the student list
  and on the student's record.
- The dashboard's overdue list is a worklist for chasing debts: longest overdue
  first, then largest amount. It includes withdrawn and completed students,
  because leaving doesn't cancel what is owed. Hiding them would make the
  oldest debts the easiest to forget.

## Assessments and submissions

### Who can submit, and when

Modules belong to a programme; they are seeded, with no admin screens. An
assessment is open to Enrolled students on its module's programme. It stays
open after the deadline (late work is accepted and flagged) until staff close
it. Staff can reopen an assessment or extend its deadline.

- A deadline must be in the future when it is set or moved. A deadline
  already past would make every submission late, and is far more likely to be
  a typo than a real intention.
- Deadlines are typed in college time. A time inside the hour the clocks skip
  in spring is refused with an explanation, rather than silently moved. A time
  inside the hour that happens twice in autumn means its first occurrence
  (BST), the earlier and so the safer reading for students.
- The submission tracker expects work from the students now enrolled on the
  programme. A student who submitted and then withdrew is still listed, with
  their work, but no longer counts towards "submitted of expected".
- Closing asks for confirmation, because it stops students submitting even
  late work. Reopening doesn't, because it only restores what was there.

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

- **Accepted files:** PDF or DOCX only, up to 10 MB.
- **Three checks that must agree:**
  - the file extension;
  - the type the browser declared. "application/octet-stream" or no type is
    accepted, because browsers send that for types the operating system
    doesn't know; any other declared type must match the extension;
  - the file's actual content, checked with `file-type`. It also recognises
    macro-enabled Word documents (`.docm`), so they are refused even when
    renamed to `.docx`.
- **Checks in two places:** the upload form checks the name and size before
  sending anything, and the server repeats every check.
- **Oversized uploads are never read into memory:** a declared Content-Length
  over the limit is refused at once. Otherwise the bytes are counted as they
  arrive, and reading stops just past 10 MB (plus a little room for the form's
  own framing).
- **Storage:** files are stored under random names in `UPLOAD_DIR`, outside
  the public folder. The name the student gave is kept for display and
  downloads, cleaned of folders, quotes and control characters.
- **Downloads only:** files are always served as attachments, with
  `X-Content-Type-Options: nosniff` and a sandboxing Content-Security-Policy.
  Only staff and the student who submitted can download a file.
- **Replacing and races:** a replacement deletes the previous file once the
  new one is safely recorded, and a failed upload deletes its own file. The
  rules are checked again at the moment of saving, in a transaction that locks
  the assessment and the student's submission. Neither a concurrent close nor
  a second upload can slip past them.

## Marks and results

### Marks and classification

Marks are whole numbers from 0 to 100. A mark can be entered without a
submission (a non-submission, or work marked outside the system), and the
marksheet shows "Not submitted" beside it. The classification is derived and
never stored: Fail below 40, Pass from 40, Merit from 60, Distinction from 70.

- Marks are entered on each assessment's marksheet and saved together. Only
  the marks that changed are sent, keyed by student ID, so any error shows
  beside the right student, and nothing is saved unless every mark is valid.
- Clearing a mark removes it, for a mark entered against the wrong student.
- A student keeps their place on the marksheet once they have a mark, even
  after withdrawing.

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
- Publication and holds are independent. A mark is shown to a student only if
  it is published and their results aren't withheld, checked every time
  results are read. Even a hold placed at the same moment as publishing still
  hides everything.
- Publishing asks for confirmation, because there is no "unpublish": a mark
  can only be hidden again by changing it, or by withholding.
- Withholding again changes the reason but keeps the original date. Lifting a
  hold shows previously published marks again; unpublished marks still need
  publishing.
- A Results page lists every student with marks or a hold. Students with marks
  to publish come first, each with a publish button and their fee standing.
  The dashboard counts students with marks to publish and with results
  withheld.

## Sign-in and sessions

The brief allowed a simple role toggle, and the first version had one. It was
replaced with real sign-in, so the app behaves like a production system.

### Better Auth, with sessions in PostgreSQL

Sign-in uses Better Auth 1.7 rather than hand-written session code. It brings
maintained, reviewed implementations of the parts that are easy to get
subtly wrong: password hashing (scrypt), signed cookies, single-use reset
tokens, rate limiting and origin checks. Its tables (`users`, `sessions`,
`accounts`, `verifications` and `rate_limits`) live in the app's database
with the same conventions as every other table: UUIDv7 keys from Prisma and
snake_case names. The migration adds CHECK constraints, as for the other
tables:

- a user is staff or a student;
- a student user always has a student number, and staff never do;
- email addresses are stored in lower case, as Better Auth looks them up.

Sessions are rows in the database, not self-contained tokens such as JWTs.
Signing out deletes the row, so a copied cookie stops working at once, and a
future "sign out everywhere" is one delete.

Better Auth's endpoints sit under one catch-all Route Handler,
`/api/auth/[...all]`, so every write still goes through a Route Handler. The
rest of the app reads the session only through `src/server/session.ts`, which
turns Better Auth's user into the same `StaffSession` or `StudentSession` the
services already used. No service changed.

### Accounts

- Everyone signs in with their email address. Staff and students use the
  same sign-in page, and the account's role decides where they land.
- Nobody signs up. There is no administrator: two or three Registry staff,
  all with the same permissions, come from the seed. Each student's account
  is made for them, linked to their record by student number.
- Role, student number and the date sign-in was turned off are Better Auth
  "additional fields" that requests can't set (`input: false`).
- Endpoints the app has no use for are switched off (`disabledPaths`): signing
  up, users changing their own name or email address, deleting an account,
  social sign-in and email verification. Names and addresses come from the
  Registry's records.
- Better Auth's admin plugin isn't used. It would add endpoints for
  impersonation, bans and role changes that this app doesn't need. Turning
  an account's sign-in off is a date on the user instead, which two checks
  enforce:
  - Better Auth's `session.create.before` hook refuses new sessions. It runs
    after the password check, so only someone who knows the password learns
    that the account exists and is turned off;
  - `session.ts` treats the account's existing sessions as signed out.

### Students' accounts

- **At enrolment:** the student's account is created in the same transaction
  as the record, waiting for activation, and an activation email goes to the
  student's address. Its link opens the activation page, where the student
  chooses a password.
- **If the email fails:** the enrolment still stands, as the record matters
  more than the email. Staff see a warning that stays until dismissed, and
  can send the email again from the record.
- **Staff controls,** on the student's record:
  - the account's state: waiting for activation, active or turned off, with
    when the latest link went and until when it works;
  - emailing a link: an activation link until the student has activated the
    account, a password reset link after. A new link replaces any earlier
    one, so only the latest email works;
  - turning sign-in off, after a confirmation. This signs the student out on
    every device at once and cancels any emailed link. A message offers to
    undo it, which turns sign-in back on but can't restore the sessions
    ended;
  - turning sign-in back on.
- **Withdrawn and completed students keep their sign-in,** so they can still
  see their fees and results. Staff turn it off when access should end, as
  the demo data has done for Hannah Kowalski.
- **The account follows the record:** a change of name or email address on
  the record changes the account's, in the same transaction. A new address
  cancels any link sent to the old one, so it can't be used by whoever reads
  the old inbox. An address another account uses, such as a member of
  staff's, is refused.
- **Existing students:** a data migration gave every student enrolled before
  sign-in existed an account waiting for activation.
- **Emails the Registry sends itself:** Better Auth's reset endpoint emails
  its link and only logs a mail failure, which is right for "forgot
  password" but would hide a failure from staff. For links staff send, the
  app asks Better Auth to create the link without emailing it (a flag in
  `AsyncLocalStorage` that the email callback checks), then sends its own
  email and reports a failure: a warning after enrolment, and a 503 from
  the link endpoint.

### Your account

- Staff and students each have an account page, reached from their name in
  the header. It shows their details, changes their password, and lists the
  devices they are signed in on. Names and email addresses can't be changed
  there: they come from the Registry's records.
- Changing a password needs the current one, and signs out every other
  device, so a password changed because it leaked also ends the sessions it
  opened. This device stays signed in.
- A wrong current password counts as a failed sign-in for the address, so a
  stolen session can't be used to guess the password: five lock it, as for
  sign-in. The service checks the password itself, with Better Auth's own
  scrypt helpers, because Better Auth's change-password endpoint, called
  from the server, skips its rate limit.
- Each device shows its browser and system (worked out from the user
  agent), address and sign-in time, and can be signed out, one at a time or
  all but this one. Sessions are signed out by their ID, so their tokens
  never reach the browser.

### Sessions and cookies

- The cookie, `registry.session_token`, is HttpOnly and SameSite=Lax, and
  Secure whenever the app's address is HTTPS.
- Its value is the session token signed with `BETTER_AUTH_SECRET`. Better
  Auth stores the token itself, unhashed, in `sessions`. Someone who read the
  database would still need the secret to forge a cookie, but the database
  deserves the same protection as the secret.
- A session lasts 8 hours from sign-in, a working day, or until the user
  signs out. Activity doesn't extend it: pages read the session on the
  server, where a renewed cookie can't be sent back, so the browser would
  drop the cookie after 8 hours anyway. A fixed limit is also the easier rule
  to explain.
- Signing in and signing out both end with a full page load rather than a
  client-side navigation, replacing the page in the browser's history.
  Nothing the router cached for one session carries over into the next.

### Pages and redirects

`src/proxy.ts` (the Next.js 16 name for middleware) sends visitors without a
session cookie to `/login?next=…` before any page renders. It only checks
that the cookie is there, as the Next.js authentication guide recommends:
every page (`requirePageRole`), service and API route checks the session
itself, so a stale or forged cookie gets no further than the sign-in page.
After sign-in, the app only follows `next` if it is a path on this site
(`safeNextPath`), so the sign-in page can't be used to send people to another
site.

### Passwords and attempts

- Passwords are 12 to 128 characters with no rules about character types,
  as NIST SP 800-63B recommends.
- A wrong password, an unknown address and an account that was never
  activated all get the same answer, so the form doesn't reveal who has an
  account.
- Rate limits are stored in PostgreSQL, so they hold across server instances
  and restarts. They count requests from one client address:
  - 30 sign-in attempts a minute;
  - 10 requests for a reset link a minute;
  - 100 requests a minute to the other sign-in endpoints.

  These limits are generous on purpose. A college network can put thousands
  of students behind one address, and a tight limit would lock out the whole
  campus at the start of a lecture. They only slow down a flood from one
  source.

- Each account is protected by a limit per email address instead. After 5
  failed sign-ins with one address within 15 minutes, it is locked: further
  attempts are refused, without checking the password, until fewer than 5
  failures in the last 15 minutes are left. The message says how many
  minutes remain.
  - Failures count whatever their client address, so spreading guesses
    across many machines doesn't help.
  - Failures are recorded for addresses with no account too, so a lock
    doesn't reveal whether an account exists.
  - A successful sign-in, or choosing a new password with a reset link,
    clears the address's failures.
  - The cost: someone who knows a person's address can lock them out for 15
    minutes, though a reset link clears the lock.

- **Deploying behind a proxy:** the limits are per client address, which
  Better Auth reads from `X-Forwarded-For`. Next.js fills that header in
  from the connection when it's missing. Better Auth only trusts a header
  holding a single address:
  - behind a proxy that sets the header to the client's address, as most
    hosts do, this works as it is;
  - a proxy that appends to the header needs Better Auth's `trustedProxies`
    option, or every visitor shares one limit;
  - when the app is reached directly, a client could send its own header to
    get a fresh limit. The limit per email address still holds.

### Password-reset links

- "Forgot password" uses Better Auth's reset link: a random token, stored in
  `verifications`, that works once and for 72 hours.
- Asking for a link gets the same answer whether or not the address has an
  account, and an account with sign-in turned off gets no email. The email
  goes out after the response, with Next.js `after()`, so the time the
  response takes doesn't give the answer away either.
- Someone who has never set a password gets an activation email instead of
  a reset email: the link is the same, the wording differs.
- The link opens a page for choosing the password, typed twice. Better Auth
  checks the token on the way there, so an expired or used link opens a
  "This link no longer works" notice, with a way to ask for a new one,
  before anyone has typed a password.
- Choosing a password with the link marks the email address as verified,
  since its owner received the email, and signs the account out on every
  device. It doesn't sign the person in: they sign in with the new
  password, which their password manager can then save.
- Requests for a link count towards the limit per client address (see
  "Passwords and attempts"). An account also receives at most 3 reset emails
  an hour, however many are requested, so the form can't be used to flood
  someone's inbox.

### Demo accounts

- The seed creates three Registry staff and an account for every student.
  Everyone who has set a password uses `demo-password-2026`.
- Two students show the other states: Arjun Mehta's account isn't
  activated yet, and sign-in is turned off for Hannah Kowalski, who has
  withdrawn.
- With `SHOW_DEMO_ACCOUNTS=true`, as in `.env.example`, the sign-in page
  lists two staff and three students with the password. The variable is off
  unless set, so a deployment that forgets it shows nothing.

### Testing sign-in

- Integration tests send real sessions. Each test request carries a cookie
  for a session created in the test database, signed with the test secret,
  and goes through the same checks as in production. The sign-in and reset
  tests call Better Auth's own endpoints, rate limits included.
- Integration tests replace the mailer with an in-memory outbox, so they read
  each email and follow its link without a mail server.
- End-to-end tests use the sign-in form for the sign-in journeys. Other
  journeys start from a session created in the database (`viewAs`), so the
  suite stays within the sign-in rate limit.

## Audit trail

Every change anyone makes records who made it, when, and what they did, in
an audit trail.

- **What is recorded:** enrolments and edits (naming the details that
  changed), status changes, fees charged and corrected, payments recorded
  and reversed, assessments set, edited, closed and reopened, each mark
  entered, changed or removed, results published, withheld and released,
  work submitted, and sign-in links sent or sign-in turned off and on.
  Requests that change nothing, such as publishing when no mark is waiting,
  record nothing.
- **Who:** the signed-in member of staff, or the student, for their own
  submissions.
- **In the same transaction as the change:** the trail can't miss a change,
  and a change that fails, such as a duplicate payment reference, leaves no
  event behind.
- **Append-only:** a database trigger refuses to update or delete an event,
  so neither a bug nor a mistaken script can rewrite history. TRUNCATE,
  which the seed and the tests use to start afresh, still works.
- **Self-describing:** each event keeps the details needed to describe it,
  such as the assessment's title at the time, so its description doesn't
  change when the record does later. `src/domain/audit.ts` lists every kind
  of event and its details; `src/lib/audit.ts` words them.
- **Who can see it:** staff, in the Activity log (every change, newest
  first, 50 to a page) and in each student's History. Students don't see
  it.
- **Not recorded:** reading, and signing in and out. Those are security
  events rather than changes to the Registry's records (see "With more
  time").
- **Demo data:** the seed writes the trail its records imply: Jane Okafor
  enrolled the students and changed their status, Tom Reid looked after
  fees, Elena Petrova set assessments and released results, and each
  student submitted their own work.

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

Partial prefetching is on too, so links prefetch each route's shell. Cookies
resolve while that shell is prerendered, so reading the session no longer
stops the prerender: it runs on until the first uncached read. Some pages read
the clock (`new Date()`) before their first database query, and Next.js
refuses that during a prerender. The end-to-end tests caught this in the
production server's log. Every page goes through `requirePageRole`, which now
calls `io()` after the role check, so prerendering stops there and the page's
data is always read at request time.

### Database

- **Access:** Prisma 7 with the PostgreSQL driver adapter. The client is
  generated into `src/generated/prisma` on install and is not committed.
- **Naming:** tables and columns use snake_case. Primary keys are UUIDv7, which
  are time-ordered. People are identified by their student numbers in URLs and
  in the UI.
- **Invariants:** CHECK constraints in the initial migration enforce rules the
  schema language can't express:
  - money is never negative and payments are positive;
  - marks lie between 0 and 100;
  - student numbers and academic years keep one format;
  - emails are lower-case and payment references upper-case, so uniqueness
    can't be dodged;
  - a results hold has both its date and its reason;
  - a status change actually changes the status.

  Prisma ignores CHECK constraints when it compares the schema with the
  database, so they cause no drift.

- **No cascading deletes:** foreign keys restrict deletes, so a student with
  fees, payments, submissions or results can't be deleted by accident.
- **Configuration:** it is validated when first used rather than when a module
  is imported. `next build` imports server modules without a database, and the
  first request that needs a missing variable fails with a message naming it.

### User interface: shadcn/ui on Base UI

- Components come from shadcn/ui with its current defaults: Base UI primitives
  (shadcn's default since July 2026) and the Nova preset.
- The components are copied into `src/components/ui` and owned like any other
  code: formatted, linted and type-checked.
- shadcn's stylesheet is ejected into `globals.css`. This removes the `shadcn`
  package, a CLI with its own dependency tree, from the runtime dependencies.
- The app has one light theme; dark mode is out of scope. The toast component
  therefore fixes its theme instead of depending on `next-themes`.
- Two generated files were changed to fit the app's rules: `use-mobile.ts`
  reads the screen width through `useSyncExternalStore` rather than setting
  state in an effect, which the React lint rules refuse; and the sidebar's
  user menu uses a fixed-size placeholder, because shadcn's menu skeleton
  picks a random width, which a prerender may not do.

### The app shell

The first version had a header with links. Signed-in pages now sit in an app
shell, as in most business applications:

- **A sidebar** lists the section's pages with icons, the current one
  marked. On a desktop it collapses to its icons (Ctrl/⌘+B, or the button
  in the top bar), with each page's name in a tooltip. On a phone it slides
  in from the left, and closes once a page is chosen.
- **A user menu** at its foot shows who is signed in, with their account
  page and signing out.
- **Breadcrumbs** on deeper pages, such as a student's record, lead back up.
  They belong to each page's header rather than the top bar, so they can
  name the record from the data the page has already read.
- **The top bar** holds the sidebar button and the search.
- **Search,** with Ctrl/⌘+K or the button, finds pages and actions by name
  and, for staff, students by name, ID or email, through the same search as
  the student list. It searches a moment after typing stops, and shows
  students only for the words they were found for: stale results let Enter
  open a student who didn't match. Like a form, the button is
  `aria-disabled` until React has hydrated it and can hear the shortcut.
- The sidebar remembers whether it was collapsed for as long as the page is
  open. Reading its cookie on the server would make every page wait on a
  request-time read before the shell could render, so a full reload opens
  it again.

### A student's record

The record was one long page, with details, status, fees, results and history
one after another. It is now a header and tabs.

- **The header** names the student with the facts staff check first: status,
  fees (with any amount overdue), results (withheld, or how many marks wait
  to be published) and sign-in. It holds the two actions on the record as a
  whole: editing the details and changing the status.
- **Tabs:** Overview (details and status history), Fees, Assessments (the
  student's work for each), Results, History (the audit trail) and Sign-in.
- **Every tab's content arrives with the page,** which reads it all in one go
  anyway, so switching is instant. The chosen tab goes into the address as
  `?tab=`, through `history.replaceState`, which Next.js keeps its router in
  step with. A link or a reload opens that tab, and Back leaves the record
  rather than stepping back through its tabs.
- **Actions are dialogs:** editing the details (which replaced the separate
  edit page), changing the status, recording a payment and charging a fee,
  as correcting a fee and reversing a payment already were. A dialog closes
  once its form has saved, and the record refreshes behind it.

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

This was checked in a browser against a production build, with a control. A
status change made through the API with no refresh left the student list
stale: pressing Back showed the old status. The same change made through the
form, which calls the action, showed the new status after Back.

A status change only goes through if the status is still the one that was
read. When two people change the same record at the same moment, one change
wins and the other gets a 409 asking them to reload. A test sends both changes
at once.

### Forms wait for hydration

Pages stream their forms in as server-rendered HTML, and React hydrates them a
moment later. Until then nothing handles their input. Once React Hook Form
takes over, it fills each field with its default, replacing anything typed or
chosen in between. So every form uses the `Form` component, which marks the
form `aria-disabled` until React has hydrated it:

- assistive technology announces the form as unavailable for that moment;
- Playwright treats controls inside an `aria-disabled` element as disabled,
  so the end-to-end tests wait for hydration instead of sometimes losing what
  they entered.

`aria-disabled` doesn't stop someone typing in that fraction of a second, as
`disabled` would, but `disabled` would also dim every field for a moment each
time a form appeared. An end-to-end test found the problem: it chose a module
the instant the form appeared, and the choice was gone when it submitted.

### Unique ids for form fields

Next.js keeps visited pages mounted while they are hidden (its `<Activity>`
component), so two forms can be in the document at once. With fixed ids, a
field called "email" on each would share an id, and the visible label would
point at the hidden page's control. `FormField` therefore prefixes every id
with React's `useId()`, which is unique to each form instance and the same
on the server and in the browser. The marksheet and the student filters build
their ids the same way.

An end-to-end test found this: after following a link from the sign-in page,
the new page's "Email" label led to the sign-in page's hidden field.

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

Displayed dates ("Fri 20 Nov 2026, 17:00 GMT") are assembled from fixed month
and weekday names rather than `Intl`'s date styles. ICU versions disagree on
punctuation and abbreviations, for example "Fri," versus "Fri", or "Sep"
versus "Sept". Node and each browser ship their own ICU, and a server-rendered
date that differed from the browser's would break React hydration.

### Testing

- **Unit tests** cover the pure rules in `src/domain` and small server helpers.
  They sit next to the code and run in milliseconds, including in the
  pre-commit hook.
- **Integration tests** call the Route Handlers directly with real requests,
  against a real PostgreSQL database rather than mocks. Most of the risk lives
  in queries, transactions and constraints, which mocks would hide.
- **End-to-end tests** (Playwright) drive the main journeys in a browser against
  a production build. They cover the React components, so there are no separate
  component tests and no jsdom. Each spec file reloads the demo data into the
  test database first, so every file starts from the same known state.
- **Accessibility checks** run axe (WCAG 2.1 A and AA) on every kind of page,
  as staff and as a student, inside the end-to-end suite. They catch missing
  labels and names and poor contrast. Focus handling in forms and dialogs, and
  the names of controls, were checked in the browser during the build; a full
  keyboard-only and screen-reader pass was not done.
- **The test database** is prepared with `prisma migrate deploy` and emptied
  before each test, never with `prisma migrate reset`. Prisma refuses `reset`
  when an AI agent runs it, so this keeps test runs identical whoever starts
  them. The setup refuses any database whose name doesn't end in `_test`.

### Continuous integration

GitHub Actions runs on every push and pull request. Each step is separate, so a
failure points at its cause:

1. format check;
2. type-check;
3. lint;
4. unit and integration tests with coverage, against a PostgreSQL 18 service
   container;
5. end-to-end tests in Chromium against the production build, including the
   accessibility checks;
6. the dependency audit.

The coverage report is uploaded as a build artefact, and so is the Playwright
report when an end-to-end test fails.

### Email

Account activation and password resets are sent as email over SMTP, with
nodemailer. In development and CI the SMTP server is Mailpit, a container in
`compose.yaml` (and a CI service). It keeps every message in a web inbox at
<http://localhost:8025> and never delivers it, so the demo can't email a real
address. A production deployment sets `SMTP_HOST`, `SMTP_PORT` and
credentials for a real mail service.

### Environment variables

Next.js loads `.env` for the app. The Prisma, Vitest and Playwright
configuration files load it with Node's built-in `process.loadEnvFile`, so
there is no dotenv dependency.

### Dependency audit

`npm run audit:deps` audits every dependency, development ones included, and
fails on any high or critical advisory that isn't on an explicit allowlist
(`scripts/audit-allowlist.json`). Each allowlist entry names one advisory and
the reason it is accepted. A new advisory still fails CI, even in a package
that's already on the list. The script also flags entries that no longer
apply.

Three advisories are accepted. None of them is reachable by a user of the app,
and no fixed release exists within the versions this project can use:

| Advisory            | Package        | Reached through                       | Why it is accepted                                                      |
| ------------------- | -------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| GHSA-vfj7-8cjw-p6xm | `braces`       | ESLint's Next.js plugin (development) | Only expands glob patterns from our own lint config; no patched release |
| GHSA-ggr8-5vv4-36mx | `deepmerge-ts` | Prisma CLI (build and deploy time)    | Only merges our own `prisma.config.ts`                                  |
| GHSA-3f6p-5ww8-9rcr | `mysql2`       | Prisma CLI                            | MySQL driver; this project only connects to PostgreSQL                  |

`npm audit --omit=dev` can't separate the Prisma CLI out: npm counts it as a
production dependency because `@prisma/client` declares it as an optional peer.
npm's only proposed fix is a downgrade to Prisma 6, which would undo the Prisma
7 decision above, so the allowlist is the honest option. Moderate and low
advisories are reviewed by hand rather than failing the build. At the last
review the only one was GHSA-rgwj-5xj2-c3m3 (moderate). It is in the same
unused `mysql2` driver inside the Prisma CLI, so it isn't reachable either.

## Known limitations

- **Importing records:** existing students must also initialise
  `student_number_counters` to the highest number per year, as the seed
  does. Otherwise the next enrolment for that year would collide with an
  imported number and fail.
- **Balances at scale:** balances are computed in the application from each
  student's charges and payments. The student list does this for one page of
  20 students, but the dashboard does it for every student with a charge past
  its due date, on every visit. That is fine for a college of a few thousand
  students. Much beyond that, the calculation would move into a database view,
  so that only overdue rows are read.
- **File storage:** submissions live on the server's own disk. Several
  servers, or a host whose disk is wiped on deploy, would need object storage
  such as S3. Only the three functions in `src/server/storage.ts` would change.
- **No virus scanning:** uploads are checked for type, not for malware. A real
  deployment would scan files (e.g. with ClamAV) before staff download them.
- **Accents in search:** search matches accents exactly, so `Chloe` doesn't
  find "Chloé". PostgreSQL's `unaccent` extension would fix this.
- **Search speed:** search scans names, IDs and emails with `ILIKE`, which is
  fine for thousands of records. Beyond that, a trigram index (`pg_trgm`)
  would keep it fast.

## With more time

In rough order of value to a real Registry:

- **Single sign-on and narrower roles:** sign-in through the college's
  identity provider (OpenID Connect, with Better Auth's generic OAuth
  plugin), and staff roles such as Registry, Finance and academic staff, each
  with narrower permissions. Only `src/server/session.ts` reads the session,
  so the services wouldn't change.
- **Stronger sign-in:** two-factor authentication for staff, and an email
  when an account signs in from a new device.
- **Security events in the audit trail:** sign-ins, failed attempts and
  password changes, and an export of the trail for the college's auditors.
- **Bulk work:**
  - importing students from a spreadsheet, initialising the ID counters;
  - publishing a whole assessment's marks at once;
  - exporting marksheets.
- **Notifications:** emails when results are published or a deadline is
  near, and reminders for overdue fees.
- **Individual deadline extensions** for students with mitigating
  circumstances, and **payment plans** with instalments, rather than moving
  a charge's single due date.
- **Modules by year of study:** today an assessment is open to everyone on
  the programme, whatever their year.
- **Production hardening:**
  - object storage and virus scanning for uploads;
  - balances computed in a database view;
  - trigram and accent-insensitive search;
  - structured logging with error reporting.
- **A full accessibility review** with a keyboard and a screen reader, beyond
  the automated axe checks.
