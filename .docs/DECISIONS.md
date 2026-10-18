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

Staff choose a student's academic year from a window around today, and the
API refuses others, as the forms offer no others:

- a new student is enrolled into last year (a record entered late), this
  year or next;
- a record moves to, and a fee is charged for, a year from three back (to
  correct a record) to next year. A record can always keep the year it
  has, however old, and be charged for it.

### Enrolment statuses

| From \ To |      Enrolled      | Deferred | Withdrawn |    Completed     |
| --------- | :----------------: | :------: | :-------: | :--------------: |
| Enrolled  |         —          |   yes    |    yes    | yes (final year) |
| Deferred  |        yes         |    —     |    yes    |                  |
| Withdrawn | yes (re-admission) |          |     —     |                  |
| Completed |                    |          |           |        —         |

- A new record starts as Enrolled, or Deferred for a deferred entry. Starting
  as Withdrawn or Completed makes no sense for a new enrolment.
- Completed is final, and only a student in the final year of their
  programme completes it. A completed record's programme, year of study and
  academic year stay as they were: they are the history of the award.
- **A return to Enrolled names its year.** A deferred or withdrawn student
  returns in this academic year or next, never one that has ended, whose
  modules are history, and in a year of study staff choose; the dialog asks
  for both, and the change registers them on that year's modules in the same
  transaction. If staff had turned the student's sign-in off, the dialog
  says so, as returning doesn't turn it back on.
- A student still in a year that has ended changes programme or year of
  study only by moving on to a new academic year in the same edit, as the
  ended year's modules can't be redone.
- Deferral and withdrawal need a reason. Every change, including the initial
  status, is kept with its date in `enrolment_status_changes`: Registry teams
  need deferral and withdrawal dates, for example to work out fee liability.
  Students see their own status history, reasons included, on their record,
  and the form says so: what is written there is theirs to read.
- Records are never deleted. Withdrawal is a status, not a delete.
- The status dialog says what the chosen change means before it is made:
  Completed can't be undone; withdrawal and deferral leave fees as they are;
  a returning student is registered on the modules of the year they return
  in, and asked for its fee.

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
- **Names in one form:** accented letters are stored in one Unicode form
  (NFC), as "é" can be typed as one character or as "e" and an accent, and
  a search finds a name whichever apostrophe it holds or is searched with
  (O'Connor, O’Connor).

## Curriculum and module registration

The brief asked for students on a programme, and for assessments set for a
module; it didn't ask how programmes are made of modules, who takes which,
or when. The first version answered with seeded modules that each belonged
to one programme, and every student on the programme took every module.
That isn't how a registry works, so the curriculum is now modelled.

### Programmes and modules

- **A programme** has a code (which never changes, like a student ID), a
  title, a standard annual fee, a length in years of study, and the credits
  a student takes each year (e.g. 120 for an undergraduate, 180 for a
  one-year MSc).
- **A module** has a code, a title, its credits (in multiples of 5, as in
  UK credit frameworks) and when it is taught: semester 1, semester 2 or all
  year. Modules are a catalogue that programmes share: a module such as
  Introduction to Artificial Intelligence can be an option in two
  programmes.
- **A programme's structure** places modules in each year of study, as
  **core** (every student in that year takes it) or **optional** (students
  take some). A module appears once in a programme. Core modules can't take
  more credits than a year carries; options can offer more, since students
  take only some.
- **Changes are checked against what depends on them.** A programme can't
  get shorter than its structure or its students' years, nor carry fewer
  credits than a year's core modules. A module's credits can't change once
  students are registered on it, because their totals were worked out with
  the old figure: a new module is set up instead.
- **Changing a structure doesn't touch existing registrations.** A new core
  module reaches students when they are next registered, e.g. when they move
  year. Rewriting registrations behind staff's backs would surprise them;
  an action to apply a structure to everyone is listed under "With more
  time".
- **A core module is registered even past the year's credits,** because
  every student in the year takes it. That can happen when one is added
  after students chose their options. The record and My modules then say
  how many credits over the year is, so staff can drop an option.

### The academic calendar

- Each academic year has two semesters, with dates staff set: one after the
  other, without overlapping, inside the year (1 September to 31 August).
  A CHECK constraint holds the database to the same rule.
- **What has passed stays as it was.** Students and staff have lived by a
  calendar's past dates, so a semester date that has passed can't change,
  and no date can move into the past; a year that has ended can't change
  at all. A year set up late may still start in the past. A change records
  the dates it moved, before and after, in the audit trail.
- An academic year without dates is allowed: pages then name semesters
  without dates.
- Each academic year also has a switch that lets students choose their own
  optional modules. It is off until staff turn it on, and once the year has
  ended it can only be turned off.

### Module registration

- **Students have a year of study,** from 1 to their programme's length,
  and are registered on modules for each academic year: their current
  session.
- **Registering for the year is automatic.** Enrolling a student, a return
  to Enrolled, and a change of programme, year of study or academic year
  register the student for their programme and year, in the same
  transaction:
  - the core modules they lack are added;
  - modules from outside the year are dropped, unless the student has
    submitted work or has a mark for them that year, which keeps them;
  - options in the year stay as they are;
  - registrations of earlier academic years stay, as the student's history;
  - registrations of a later academic year, which only moving a student
    forward and back again leaves behind, go unless the student has work
    in them, as they would otherwise make the student expected for that
    year's assessments.
- **Options are added by staff,** within the year's credits: a registration
  that would take the year past them is refused. A row lock on the student
  serialises registrations, so two made at once can't both fit; a test
  runs them together to prove it.
- **Students choose their own options** while their academic year's switch
  is on, under the same rules; staff can change an enrolled student's
  registrations at any time.
- **Dropping** is for options and for modules from outside the year. Core
  modules can't be dropped, and nor can a module the student has work for,
  or one with a deadline that passed while they were registered on it: they
  were expected to submit, and dropping it would erase the missed work from
  the assessment's tracker.
- Only an enrolled student's modules change. Deferred, withdrawn and
  completed students keep the registrations they had, and none can be
  added or dropped.
- **A year that has ended keeps its modules.** They are history, with that
  year's work and marks, so nobody adds or drops them, even if the year's
  choosing switch was left on, and registering for the year automatically
  changes nothing in it. A student still in such a year is moved on first.
- Every registration and drop goes into the audit trail, by whoever made
  it, including the student choosing an option.

### Assessments follow registration

- An assessment belongs to the academic year its deadline falls in, by the
  college's calendar, and is for the students registered on its module that
  year. They can submit (if enrolled), they are expected to submit, and
  marks can be given to them, or to anyone who already has work for it.
- A student sees the assessments of their modules for each year they were
  registered, and any they submitted work for, even after dropping the
  module.

### The curriculum pages

The sidebar has a second group for staff, **Curriculum**, with three pages:

- **Programmes:** each programme's length, credits a year, fee, modules and
  enrolled students. A programme's page shows its structure year by year:
  the core modules, then the options, with what the core modules take of
  the year's credits and how many more students choose from the options.
  Staff set up programmes, edit them, and add modules to a year as core or
  optional, each in a dialog.
- **Modules:** the catalogue, with the programmes each module is part of
  and how many students take it this year. Its credits field is read-only
  once students have been registered on it, as the API would refuse a
  change.
- **Academic years:** each year's semesters, with the current year marked
  and the next one ready to set up. A button lets students choose their
  own options, or stops them.

Taking a module out of a programme, and the students' choice switch, say
what they did with an Undo button, like the other actions that can be
reversed at once.

### Modules on the record and for students

- **A student's record has a Modules tab:** this academic year's modules
  by semester, with the semester dates and the credits they come to out of
  the year's; then the options of the student's year, and earlier years'
  modules. Staff add an option that fits the credits left, or drop one,
  and can undo either from the message that confirms it. The record's
  header shows the credits, flagged while some are left to choose.
- **Students have a My modules page** with the same view. While their
  academic year lets students choose, they add and drop their options
  there, and their home page asks them to choose while credits are left;
  otherwise the page tells them to contact the Registry.
- **The pages say why a change can't be made,** such as a student who
  isn't enrolled, or choosing being closed, rather than only hiding the
  buttons: the service works out what the viewer may do, and why not.
- Dropping a module from outside the student's year has no Undo, as it
  couldn't be added back.

### Moving the existing data

The migration keeps what existing data meant. Every module becomes a core
module in the first year of the programme it belonged to; programmes become
three years of 120 credits and modules 30-credit, all-year modules, until
staff say otherwise; and every student is registered on their programme's
modules for their academic year. The same students take the same
assessments as before.

## Fees and payments

### One fee charge per student per academic year

Each programme has a standard annual fee. Charging a student copies that amount
into a fee charge for one academic year, so a later change to the programme's
fee never rewrites charges already raised. A student has at most one charge per
academic year (a database unique constraint).

- The charge is created automatically when a student record is created as
  Enrolled, so a new enrolment can't be left unbilled, and the audit trail
  records it like any other charge. In every other case (a deferred student
  returning, a new academic year) the student's record prompts staff to assign
  it. Only an Enrolled student is prompted: a deferred, withdrawn or completed
  student isn't attending, so there is nothing to charge for the year yet.
- Staff can correct a charge's amount (for example a scholarship) or its due
  date. A charge is the college's own claim, so correcting it is legitimate. A
  payment records money that actually moved, so it is never edited.
- A correction's audit entry keeps the amount and due date before and after,
  and the note giving the reason, so a scholarship down to £0 still shows what
  was waived and why. The note can be removed only once the amount is back at
  the standard fee. Saving a charge unchanged records nothing.
- A charge corrected to £0 is shown as Waived, not Paid: nothing was paid.
- The default due date is 30 days after the charge is raised, or after the
  first day of its academic year if that is later, so a fee charged ahead for
  next year isn't overdue before the year begins. Staff can change it.
- The currency is GBP. Money is stored as integer pence everywhere, never as a
  floating-point number.

### Payments are append-only and corrected by reversal

- A payment needs an amount above zero, a date that is not in the future in the
  college's time zone, and a reference that no other payment still counting
  has, regardless of case. That catches the same bank transfer being entered
  twice. A reversed payment's reference can be recorded again, because
  reversing a payment keyed with the wrong amount, or against the wrong
  student, is followed by recording the same transfer correctly. A lock on the
  reference lets only one of two simultaneous entries through.
- Overpayment is accepted and shown as credit: money arrives when it arrives.
- Payments are never edited or deleted. A mistake is corrected by one reversal
  entry with a reason; the reversed payment stays visible to staff but no
  longer counts. A student's own account leaves reversed payments out: they
  are the Registry's corrections, not money the student paid or got back, and
  one keyed against the wrong student is someone else's payment.
- No single amount may exceed £100,000. This catches a mistyped extra digit
  without getting in the way of any real tuition fee. Amounts are typed in
  pounds and converted to pence with string arithmetic, never floating point.
- References are compared ignoring case and spacing ("bacs 0042" and
  "BACS 0042" are the same transfer).

### Balance and overdue

- The balance is charges minus valid payments. It is computed from the stored
  rows on every request and never stored itself, so it can't drift, and it is
  current the moment a payment is recorded.
- Payments clear the oldest academic year's charge first (then the earliest
  due date), so moving a charge's due date never moves money between years.
  The overdue amount is whatever is still unpaid on charges whose due date has
  passed; a charge due today is not
  yet overdue. Days overdue count from the oldest unpaid due date.
- Overdue students are flagged on the Registry dashboard, in the student list
  and on the student's record.
- The dashboard's overdue list is a worklist for chasing debts: longest overdue
  first, then largest amount. It includes withdrawn and completed students,
  because leaving doesn't cancel what is owed. Hiding them would make the
  oldest debts the easiest to forget.

## Assessments and submissions

### Who can submit, and when

An assessment is open to Enrolled students registered on its module for the
academic year of its deadline (see "Module registration"). It stays open
after the deadline (late work is accepted and flagged) until staff close it,
or its academic year ends: an assessment never closed takes no more work
after the 31 August that ends its year, and can't be reopened, as that
year's work is history. Staff can reopen an assessment or extend its
deadline until then.

- A deadline must be in the future when it is set or moved. A deadline
  already past would make every submission late, and is far more likely to be
  a typo than a real intention.
- A deadline moves to another academic year only while nothing has been
  submitted or marked, and the assessment then becomes that year's
  students'. That is how a year typed wrongly (2027 for 2026) is put right,
  as assessments are never deleted. Once there is work, the deadline stays
  within its year: moving it past 31 August would hand the work to the next
  year's students. For another year, staff set a new assessment. The same
  rule means a September deadline belongs to the year starting that
  September, so a dissertation due after the summer can't yet be set for the
  year before (see "Known limitations").
- As a deadline is typed, the form says the academic year it falls in, how
  many students are registered on the module that year, and when it falls
  outside the semester the module is taught in, so a wrong year or semester
  shows before it is saved.
- Deadlines are typed in college time. A time inside the hour the clocks skip
  in spring is refused with an explanation, rather than silently moved. A time
  inside the hour that happens twice in autumn means its first occurrence
  (BST), the earlier and so the safer reading for students.
- The submission tracker expects work from the students registered on the
  module that year who are enrolled. Until the deadline that means enrolled
  now; once it has passed, registered and enrolled at the deadline, from the
  registration's date and the status history. So a past assessment goes on
  counting the students who were due, even after they complete or withdraw,
  and a student who joined the module after the deadline, or had deferred or
  withdrawn by then, isn't counted as missing work. Anyone else who submitted
  or has a mark is still listed with it, marked "Not expected to submit".
- A student who joins a module after a deadline can still submit while the
  assessment takes late work, and the work is flagged Late, but the tracker
  lists them as not expected to submit, so staff can judge the flag.
  Individual deadlines are not modelled yet (see "With more time").
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
    doesn't know, and so is "text/plain", the type a form part sent without
    one has by definition (RFC 7578), as API clients send it. Any other
    declared type must match the extension;
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
  downloads, cleaned of folders, quotes and control characters, and of the
  marks that reorder text, which could make "essay.pdf" display as a name
  ending ".docx".
- **Times to the second:** submission times are shown with seconds, since
  work that arrives at 17:00:03 is late for a 17:00 deadline. How far away
  a deadline is, is always rounded down, so a student is never told they
  have longer than they do: under two days, in hours or minutes ("in 7
  hours"), since by the calendar one at midnight is a day further away than
  it is ("in 2 days" for 25 hours); beyond that, in whole days. The upload's
  confirmation takes the late flag from the server's reply, not from the
  page, which may have been opened before the deadline passed.
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
- Marks can be entered once the deadline has passed, or once staff close the
  assessment. Until then students can still submit or replace their work, so
  a mark could describe a file since replaced, or sit beside "Not submitted
  yet". The marksheet says so, with its fields disabled.
- Saves of one assessment's marks happen one at a time, each reading the
  marks as the last one left them, so two at once can't trip over each
  other, and the audit trail's "from" is always the mark that was there.

### Publishing and withholding

- Marks are published two ways. An assessment's marks can be published to
  all its students at once, from the assessment's page or the Results page,
  as a registry releases a cohort's marks together. A student's marks can
  be published on their own, from the Results page or their record, which
  releases all of that student's unpublished marks. Each mark records when
  it was published.
- Publishing an assessment's marks leaves out the students whose results
  are withheld: their marks stay unpublished, and the confirmation says how
  many. It takes the same lock as a marksheet save, so no mark is saved
  between counting the marks and publishing them. Each student's record
  shows its own "Published 1 mark for …".
- Editing a published mark makes it unpublished again until staff publish once
  more, so a student never sees a mark that hasn't been reviewed.
- "Withhold results" takes a reason; a preset covers outstanding tuition fees.
  It hides all of the student's results, including ones already published, and
  blocks publishing until the hold is lifted. The student sees a notice with the
  reason.
- Where the student's account stands (paid, due or overdue) is shown next to
  these controls, but nothing is withheld automatically: withholding is a
  staff decision.
- The server never sends an unpublished or withheld mark to a student. Hiding it
  in the interface alone would not be enough.
- Publication and holds are independent. A mark is shown to a student only if
  it is published and their results aren't withheld, checked every time
  results are read. Even a hold placed at the same moment as publishing still
  hides everything.
- Publishing asks for confirmation, because there is no "unpublish": a mark
  can only be hidden again by changing it, or by withholding. The request
  carries the number of marks the confirmation showed; if a colleague has
  saved another since, nothing is published, and staff are asked to look
  again, so no mark is released unseen.
- Withholding again changes the reason but keeps the original date. Lifting a
  hold shows previously published marks again; unpublished marks still need
  publishing.
- The Results page lists the assessments with marks waiting first, the
  longest waiting first, each with a publish button and a count of any
  withheld. Then it lists every student with marks or a hold: students with
  marks to publish first, each with a publish button and their fee
  standing. The dashboard counts students with marks to publish and with
  results withheld.

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
- **Or a password set at enrolment:** staff can set the student's first
  password instead, when the student is in front of them or can't receive
  email yet. The account is active at once; staff give the student the
  password, which the student can change on their account page. The audit
  trail records that staff set it. With more time, the student would be asked
  to choose their own at first sign-in.
- **In the demo** (`SHOW_DEMO_ACCOUNTS`), the enrolment form starts with a
  password set, filled in with the demo password, so a reviewer can sign in
  as a new student straight away without opening the emails. Switching on
  "Send an activation link" sends the email to Mailpit, and the confirmation
  links to its inbox. Outside the demo, the form starts with the email, as a
  registry would use it.
- **If the email fails:** the enrolment still stands, as the record matters
  more than the email. Staff see a warning that stays until dismissed, and
  can send the email again from the record. The mail server gets seconds,
  not minutes, to answer, so staff aren't left waiting on one that is down.
- **Staff controls,** on the student's record:
  - the account's state: waiting for activation, active or turned off, with
    when the latest link went and until when it works;
  - emailing a link: an activation link until the student has activated the
    account, a password reset link after. A new link replaces any earlier
    one once it has been emailed, so only the latest email works; if the
    email fails, the link the student already has keeps working;
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
- The address shows only when it says something. Better Auth reads it from
  a proxy's X-Forwarded-For header. Without one, as when signing in on the
  same computer, it records the unspecified address (all zeros), which the
  list leaves out.

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
  - Each attempt is counted as a failure before its password is checked,
    one at a time per address (a database lock), and forgotten if it
    succeeds. Otherwise a burst of simultaneous guesses would all pass the
    check before any was counted. Confirming the current password to change
    it counts the same way.
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
  `verifications`, that works once and for 72 hours. Setting a password
  with one link cancels every other link the account was sent, so an older
  email can't be used to set the password again.
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
  change when the record does later. A correction keeps the value before as
  well as after: a mark's old and new value, a fee's old amount and due
  date with the note explaining it, an assessment's old title and deadline,
  and a student's old and new programme, year of study and academic year,
  so their years can be traced. An appeal about a late flag needs to know
  what the deadline was. `src/domain/audit.ts` lists every kind of event and
  its details; `src/lib/audit.ts` words them.
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
  - emails are lower-case and payment references upper-case, so the checks
    for a duplicate can't be dodged;
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
- Generated files were changed where the app needed it, so re-adding one
  with the CLI would undo the change. The button, alert, badge, checkbox,
  input, native select, switch and table follow the styling conventions
  below ("Controls that look like what they are"). Three more were changed
  to fit the app's rules: `use-mobile.ts`
  reads the screen width through `useSyncExternalStore` rather than setting
  state in an effect, which the React lint rules refuse; the sidebar's user
  menu uses a fixed-size placeholder, because shadcn's menu skeleton picks a
  random width, which a prerender may not do; and `chart.tsx` reads chart
  keys and colours through small typed helpers instead of `any` values and
  template strings, which the type-checked lint rules refuse. Its tooltip
  also passes a value formatter the whole payload, as Recharts' type says,
  rather than one data point.

### Controls that look like what they are

A review of every page and dialog, at desktop and phone widths, found
controls that didn't look like controls, starting with a file field whose
"Choose File" button was the colour of the field. These conventions came
out of it:

- **Buttons:** `buttonVariants()` merges its classes. A link styled as an
  outline button (Cancel, "Back to sign in", the page links) had lost its
  outline, because unmerged, the base's transparent border could win.
- **Row actions** in a table (Correct, Reverse, Add, Drop, Remove, Edit) are
  small outline buttons. As borderless ghost buttons, they read as bold
  text, and mixed sizes made some rows taller.
- **A confirmation that can't be undone** ("Reverse payment") is solid red
  with white text: red text on a red tint fell below 4.5:1.
- **Every dialog ends the same way:** Cancel, then the action, on a footer
  band. A form in a dialog ends with `FormDialogFooter`.
- **Fields:**
  - Field borders (`--input`) are a step darker than table rules and card
    edges, so an empty field never reads as a blank table cell. Outline
    buttons share them, so a button beside a field isn't the fainter.
  - A file field's button is a grey button inside the field.
  - A switch's "off" track and a checkbox's border are dark enough to see on
    white.
  - A select's placeholder ("Choose a programme", a disabled empty option)
    is muted like a text field's. "All programmes" in a filter is a real
    choice, and isn't.
- **Notices** are tinted, so one never looks like an empty field: grey to
  inform, amber (`warning`) for something to act on or work around (a late
  submission, withheld results, a deferral, an uncharged fee), red for
  errors. Each tint has text dark enough for 4.5:1 on it.
- **Badges:** neutral states (Withdrawn, Closed, Reversed, No fees,
  Optional, Current) share one grey, from the theme's neutral greys rather
  than Tailwind's bluish zinc.
- **Links:**
  - A row's title (a student's name, an assessment) is a medium-weight link,
    underlined on hover, in every table.
  - A number or code that is a link, such as an enrolled count or a
    programme code, is underlined at rest, since nothing else marks it.
  - A card's "see all" link ends with an arrow.
- **Tables:**
  - A table wider than its box fades out at the side it scrolls towards, so
    a phone shows there is more. The fade follows the scroll position, and
    browsers that can't animate with scrolling show none.
  - Tables stacked on one page with the same columns (a programme's years, a
    student's modules and options) share fixed column widths, so the columns
    line up.
- **The sidebar** marks the current page in a darker grey than shadcn's. The
  home item marks only itself, not pages outside the menu such as the
  account page.
- **Not found:** a page that can't find a record shows "Not found" inside
  the staff or student pages, with a way back. An unknown address gets a
  page in the look of the signed-out pages, instead of Next.js's unstyled
  default.
- **Something went wrong:** a page that fails unexpectedly, say with the
  database out of reach, shows "Something went wrong" in its place, with
  **Try again** and the error's reference for matching a report to the
  server's log. Inside the staff and student pages the sidebar keeps
  working; elsewhere the page keeps the signed-out look, and a failure of
  the root layout itself gets a page of its own.
- **Long names:** a page title breaks a long word rather than widen the
  page on a phone.
- **Errors in a form:** the page's scroll padding is the height of the
  sticky top bar, so the first field with an error scrolls into view below
  it, not under it.
- **Text** wraps with `text-wrap: pretty`, set once on the body, so a
  paragraph or a help line doesn't end on a lone word. A date, "(in 3
  days)" or "105 of 120" stays on one line.
- **Codes and IDs** (student IDs, module and programme codes) are in
  monospace wherever they stand on their own. In running text, such as the
  audit trail's sentences, they stay in the text's font.

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
  The shortcut checks a key press has a key before reading it: choosing a
  saved value from a browser's autofill sends key presses without one.
- **On a phone,** every page fits the screen's width: a wide table scrolls
  inside its own box, and the rest wraps or stacks. A record's tabs scroll
  sideways in one row, fading at an edge with more beyond it, and the open
  tab is scrolled into view. Filters take the full width, each label stays
  with its value, and a long value (a file name, an address) breaks rather
  than widening its box. The search button hides its keyboard shortcut,
  which means nothing on a touch screen. A grid that holds a
  table has `minmax(0, 1fr)` columns (`grid-cols-1`), because a grid's
  default column grows to fit its widest content and would widen the page.
  An end-to-end test checks every page at 390 pixels wide.
- The sidebar remembers whether it was collapsed for as long as the page is
  open. Reading its cookie on the server would make every page wait on a
  request-time read before the shell could render, so a full reload opens
  it again.

### A student's record

The record was one long page, with details, status, fees, results and history
one after another. It is now a header and tabs.

- **The header** names the student, with their programme, year of study and
  academic year, and holds the two actions on the record as a whole: editing
  the details and changing the status.
- **A summary under it** gives the facts staff check first, one to a cell
  (see "Summaries at the top of a page"): status and since when, the year's
  credits, fees (what is overdue or due), results (withheld, or how many
  marks wait to be published) and sign-in. Each fact opens the tab that
  explains it, in place, and moves focus to that tab. A plain link wouldn't
  always work: the page stays mounted, so after a tab is chosen by hand,
  following a link back to the tab the page was opened on would change
  nothing.
- **Tabs:** Overview (details and status history), Modules, Fees,
  Assessments (the student's work for each), Results, History (the audit
  trail) and Sign-in.
- **Every tab's content arrives with the page,** which reads it all in one go
  anyway, so switching is instant. The chosen tab goes into the address as
  `?tab=`, through `history.replaceState`, which Next.js keeps its router in
  step with. A link or a reload opens that tab, and Back leaves the record
  rather than stepping back through its tabs.
- **Actions are dialogs:** editing the details (which replaced the separate
  edit page), changing the status, recording a payment and charging a fee,
  as correcting a fee and reversing a payment already were. A dialog closes
  once its form has saved, and the record refreshes behind it.

### Summaries at the top of a page

Key facts that used to run together in a line of text, or sit in a card of
their own, are now a summary strip (`src/components/summary-strip.tsx`),
one fact to a cell:

- each cell has a label with an icon, the value, and a line of detail;
- a dot, or a bar for a share such as credits, shows the fact's tone (fine,
  needs attention, overdue, for information, or neither). The words always
  say the same, so colour is never the only cue, and the bar is hidden from
  screen readers;
- a fact can link to where it is explained. Its label is the link,
  stretched over the cell, so the whole cell can be clicked while screen
  readers hear a short link named after the label;
- cells wrap onto more rows on narrow screens, two to a row on a phone, and
  the cells of the last row widen to fill it, so the strip has no gaps.

The strip heads a student's record, a programme (length, credits, fee,
modules and students), an assessment (deadline, whether it takes work, what
has been submitted, and the marks), the Modules tab and My modules (credits
and both semesters), and the Fees tab and My fees (charged, paid, the
balance with where the account stands, and what is overdue).

### Searching and paging lists

Every list page has a search, filters that suit its contents, and pages of
20 (the activity log, 50):

| List                       | Search                              | Filters                                           |
| -------------------------- | ----------------------------------- | ------------------------------------------------- |
| Students                   | name, student ID or email           | programme, status, academic year                  |
| Assessments                | title, module code or module        | state, academic year                              |
| Results: assessments       | title, module code or module        | (only those with marks waiting)                   |
| Results: students          | name or student ID                  | marks to publish, results withheld, all published |
| Activity                   | the student (name or ID), who acted | kind of change                                    |
| Programmes                 | code or title                       |                                                   |
| Modules                    | code or title                       | when taught, programme (or none)                  |
| My assessments, My results | assessment or module                | state; classification                             |

- **Searches are live:** a moment after typing stops (300 ms), the search
  goes into the address and the server narrows the list, so a search can
  still be bookmarked or shared and the server stays the one that filters.
  Typing replaces the address rather than adding to the browser's history,
  so Back leaves the list instead of undoing a letter at a time. The box
  keeps its text while the list catches up, and follows the address when
  it changes from elsewhere (Back, "Clear filters"). It is never
  remounted, so nothing typed is lost: only a select remounts, to show a
  filter applied from elsewhere. Its address is built from the form's
  fields as they are, so a filter chosen a moment before typing is kept
  even while its own navigation is still on its way. The form still works
  without JavaScript, and Enter searches at once.
- **Selects apply at once,** as a GET form, so Back undoes a filter.
- **One search rule:** every search matches part of a word, ignoring case,
  how accented letters were typed, and which apostrophe a name holds. In
  the database, typed `%` and `_` are characters, not wildcards.
- **Settings live in the address,** and sorting and page links keep them.
  A changed search or filter goes back to the first page, and a page past
  the end shows the last one. The Results page has two lists, so each has
  its own search and page in the address (`aq` and `apage` for the
  assessments).
- **Where it's done:** students and the activity log are searched and paged
  in the database. The other lists are read whole and narrowed by pure
  functions in `src/domain`, as they stay in the hundreds; a list that grew
  past that would move into the query, as the student list's did.
- **Short lists inside a record** (a student's fees, modules, results and
  history, a programme's structure) aren't paged: they are one record's
  few rows, and the record's tabs load together.

### The student list

- Column headings sort the list: name, student ID, programme, academic year
  or status, either way. They are links (`?sort=year&dir=desc`), so the
  server sorts across every page, searching and filtering keep the order,
  and the address can be bookmarked. Ties go by name, then student ID, so
  paging never shuffles students between pages.
- Status sorts in the order the statuses are listed everywhere else
  (Enrolled, Deferred, Withdrawn, Completed), not alphabetically.
- The fees column doesn't sort: standing and overdue amounts are worked out
  per page (see "Balances at scale" under Known limitations), so sorting by
  them would mean computing every student's account on every visit.
- Each row has a menu that opens the record on a given tab (Fees, Results,
  History or Sign-in), or emails the student.

### The assessments list

- Column headings sort the list by title, module, deadline, state or
  how much has been submitted (the share of the students expected), either
  way, with the order in the address as on the student list.
- The list is read whole, then searched, filtered, sorted and cut into
  pages by pure functions in `src/domain/submissions.ts` and
  `src/domain/lists.ts`. Ties keep the usual order: open assessments
  first, soonest deadline first, then the rest, most recent deadline
  first. Sorting by state is that usual order, and the default.

### Setting an assessment

- Staff choose a programme, then one of its modules, listed year by year
  with when it is taught and whether it is core or optional. A long list
  of every module gave no sign of which programme each belonged to.
- The programme only narrows the choice. An assessment belongs to a
  module, and is for every student registered on it that year, whichever
  programme they are on; a module two programmes share is listed under
  both.

### The dashboard

The first dashboard counted students by status and listed overdue fees. It
now answers the two questions Registry staff start the day with: where do
things stand, and what needs doing.

- **Figures** across the top: students enrolled, fees overdue, the year's
  fees collected, marks to publish, work to mark and accounts waiting for
  activation, each with a line of context.
- **Charts:**
  - students by programme, split by status, whose legend opens the student
    list filtered to a status, and whose programme names open it filtered
    to the programme (the old status counts live on in that legend);
  - the academic year's fees: paid, overdue and not yet due;
  - the year's marks by classification;
  - the assessments open for submissions, with how many of the students
    expected have submitted.
- **Needs attention:** five worklists, each showing the first five items,
  linking to the work, and linking to the full page where there is one.
  - Marks to publish: students with marks not yet published and no hold,
    longest waiting first. A changed mark becomes unpublished again, so it
    waits from its last save.
  - Work to mark: submissions without a mark, counted only once the deadline
    has passed, because until then the student can replace their work.
  - Past the deadline: assessments still taking late work, oldest deadline
    first, as a reminder to close them.
  - Waiting for activation: enrolled students who haven't set a password,
    those without a link that still works first. Their Sign-in tab sends a
    new one. Students who have left aren't chased to activate.
  - Options to choose: enrolled students whose modules come to fewer
    credits than their year carries, in their own academic year, most
    credits left first. Each opens on the student's Modules tab.
- **Overdue fees,** the worklist from before, unchanged.

How the figures are worked out:

- **The year's fees** apply each student's payments to their oldest charges
  first, as the account does, so a payment counts towards this year only
  once older debts are paid. Credit left over counts towards nothing.
- **The year's marks** are those for assessments whose deadline falls in the
  academic year by the college's calendar: the query converts each deadline
  to the college's time zone before comparing dates, so a deadline at 00:30
  on 1 September (23:30 the day before in UTC) counts in the new year.
- Raw SQL is used where Prisma can't express the query: matching
  submissions to marks on both student and assessment, the time zone
  conversion, and adding up registrations in each student's own academic
  year. Instants go in as ISO text with a cast: the PostgreSQL adapter
  sends a `Date` without its offset, to be read in the session's time zone.
- **Every connection uses UTC.** For the same reason, each connection to
  PostgreSQL (the app's, the seed's and the end-to-end tests') sets its
  session time zone to UTC (`src/lib/postgres.ts`). The Docker database
  runs in UTC already, but one installed on a machine set to London time
  doesn't, and would otherwise store every instant an hour early in summer.

How the charts are drawn:

- The ring and the columns use shadcn's chart component, which wraps
  Recharts. Programme names are too long for a chart's axis, so the
  programme bars are plain HTML, drawn on the server.
- Every chart's figures are in text: the fees legend lists every amount, the
  programme bars carry a line such as "2 enrolled · 1 withdrawn", and the
  columns have a list that only screen readers get. The drawings themselves
  are hidden from screen readers, with nothing inside them in the tab order.
- Colours follow the badges' hues (enrolled green, deferred amber, overdue
  red), in shades with at least 3:1 contrast against the card. They are
  defined once in `globals.css`, because Tailwind only emits its palette's
  variables for the colours the app's classes use.
- Each card is a section named by its heading, with an id from `useId()`.
  On a phone the cards stack, and the overdue table scrolls inside its card
  rather than widening the page.

### The student's pages

Students have the same shell, with their own pages: Home, Modules,
Assessments, Results, Fees and My record.

- **Home** answers "what do I need to do?":
  - the next deadline: the soonest assessment still open, and whether the
    student has submitted, or why they can't;
  - fees: what is left to pay, anything overdue, and the next payment due;
  - the latest three published marks, or why results are withheld;
  - every assessment still taking work, including those past their deadline
    that still accept late work.
- The old home page was the student's details, status history and account
  on one page. Those moved to **My record** and **Fees**, so Home stays
  short.
- Every page reads through the same services as the staff pages, which give
  a student only their own data, and only marks that are published and not
  withheld.

### Undo

- Actions that can be reversed straight away confirm with a message that
  has an **Undo** button for eight seconds: withholding results, lifting a
  hold, closing or reopening an assessment, and turning a student's sign-in
  off.
- Undo makes the opposite request through the same API, so the audit trail
  records both changes, and a hold put back or an assessment closed again is
  dated from the undo. Lifting a hold remembers the hold's reason, so Undo
  puts it back as it was. A second click on Undo does nothing, so a double
  click can't undo twice.
- Publishing marks has no Undo: the student sees them at once. Payments and
  status changes have none either: they are corrected by a reversal or
  another status change, each with a reason.

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

### Setting up

- **One command:** `npm run setup` (`scripts/setup.mjs`) creates `.env`
  from the example when there is none, starts PostgreSQL and Mailpit with
  Docker Compose (`compose.yaml`), applies the migrations and loads the demo
  data. Whatever can be missing (a Node.js too old, dependencies not
  installed, Docker not installed or not running, a port taken) stops it
  with a message saying what to do, instead of a raw error.
- **Docker is optional:** it only runs PostgreSQL and Mailpit.
  `npm run setup -- --no-docker` uses the PostgreSQL that `DATABASE_URL`
  names. It must be PostgreSQL 18, because two migrations use its
  `uuidv7()`.
- **The app's port is checked before `npm run dev`**
  (`scripts/check-port.mjs`). Sign-in only accepts requests from the address
  in `BETTER_AUTH_URL`. If port 3000 were taken, Next.js would start on
  another port, where every sign-in would be refused, so it stops with a
  message instead.

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
  its due date, and again for the year's fees, on every visit. That is fine
  for a college of a few thousand students. Much beyond that, the
  calculation would move into a database view, so that only overdue rows are
  read.
- **Activations at scale:** the dashboard shows the first five students
  waiting to activate their account, with how many more there are. There is
  no page listing them all yet: a sign-in filter on the student list would
  be one.
- **File storage:** submissions live on the server's own disk. Several
  servers, or a host whose disk is wiped on deploy, would need object storage
  such as S3. Only the three functions in `src/server/storage.ts` would change.
- **No virus scanning:** uploads are checked for type, not for malware. A real
  deployment would scan files (e.g. with ClamAV) before staff download them.
- **Accents in search:** search matches accents exactly, so `Chloe` doesn't
  find "Chloé". PostgreSQL's `unaccent` extension would fix this.
- **An assessment's year comes from its deadline:** a postgraduate
  dissertation due in September, after the academic year has turned, can't
  be set for the students who started the previous September. Storing the
  academic year on the assessment, chosen when it is set, would fix this.
- **Assessments can't be deleted or moved to another module:** one set in
  error stays on its students' lists. Deleting one with no submissions or
  marks would be safe to add.
- **Search speed:** search scans names, IDs and emails with `ILIKE`, which is
  fine for thousands of records. Beyond that, a trigram index (`pg_trgm`)
  would keep it fast.
- **Two people editing at once:** a status change made from a stale page is
  refused, but editing a student's details or correcting a fee saves every
  field, so it can undo a colleague's change made in between. A version
  check on each record would refuse it instead.
- **A new enrolment's year** defaults to the current academic year, so an
  August enrolment for September needs the year changed by hand.
- **Registrations dated by the curriculum migration:** on a database that
  already held students when the curriculum was modelled, the migration
  registered them on their modules dated the moment it ran. Expected
  students are decided from registration dates, so an assessment whose
  deadline came before then counts none of them. Re-dating those
  registrations from the start of their academic year would fix it. New
  databases and the demo data aren't affected.

### Registry practice not modelled yet

An edge-case review against how UK registries work found these. Each is a
deliberate scope limit, not an oversight:

- **Fee liability on withdrawal:** a status change is dated when staff
  record it, and can't be backdated to the last day of attendance, and
  withdrawal leaves the year's fee as it is. Under Student Finance England's
  rules, a student who leaves in the first term is liable for a quarter of
  the fee, so staff correct the charge themselves; the status dialog
  reminds them. An effective date on each status change, with the charge
  worked out from it, would follow.
- **Who pays:** a charge has no payer. Student Finance pays tuition loans in
  three instalments (25%, 25%, 50%), and sponsors pay on invoice, so a
  loan-funded student's single due date reads as overdue until the last
  instalment. Funding sources with instalment schedules would fix this.
- **Refunds:** credit from an overpayment is shown but can't be paid back:
  a reversal only cancels a payment entered by mistake. A refund entry,
  capped at the credit, would be next.
- **Fee status and mode of study:** each programme has one standard fee, so
  an international or part-time fee is a correction with a note. Registries
  set fees by fee status (Home or International) and mode of study.
- **Releasing results:** an assessment's marks can be published to its
  whole cohort at once, but there is no moderation step or exam board, and
  no release on a set date. A registry usually releases a module's marks
  together once the board has confirmed them. Scheduling a module's release
  would come next (see "With more time").
- **Module results, progression and awards:** there are no weighted module
  marks or credits achieved, moving to the next year is an edit, and
  Completed records no award or classification. The pass mark is 40 at
  every level, where a master's usually needs 50.
- **Resits, late penalties and misconduct:** a student has one submission
  and one mark per assessment, so a resit would replace the first attempt.
  Late work is flagged, not penalised, and misconduct has no process beyond
  withholding results.
- **Interruption and deferral:** Deferred covers both a deferred start and
  a break in study. The expected return is free text in the reason, and no
  list shows who is due back.
- **Holds beyond results:** owing fees can lead staff to withhold results,
  but blocks nothing else, such as re-admission or completion.
- **Completed can't be undone:** a completion made by mistake can't be
  reversed in the app. Allowing it with a reason would be safe once staff
  roles are narrower.
- **Records in error and returning students:** a record can't be voided or
  merged, so a duplicate can only be withdrawn, and a graduate returning
  for a master's needs a second record with another email address.
- **Special-category data:** a reason for deferral or withdrawal is free
  text that may hold health details, and it is copied into the append-only
  trail, where it can't be corrected or erased. Structured reasons, with any
  details kept where a retention policy can delete them, would fix this.
- **What an edit changed:** the trail keeps the old and new programme, year
  of study and academic year, but only names a changed name, email address
  or date of birth: those are personal details, and recording their values
  would need the same care as the reasons above.

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
  - releasing a module's marks together on a set date, after an exam
    board confirms them;
  - exporting marksheets.
- **Notifications:** emails when results are published or a deadline is
  near, and reminders for overdue fees.
- **Individual deadline extensions** for students with mitigating
  circumstances, and **payment plans** with instalments, rather than moving
  a charge's single due date.
- **More registration tools:** progressing a whole year's students to the
  next year at once; registering a student on a module from outside their
  programme (an elective from another programme, or a resit); applying a
  changed structure to the students already registered; prerequisites,
  module capacities, and dates for when students may choose.
- **More from the lists:** sorting the results list too, a sign-in filter on
  the student list (to see everyone waiting to activate), and row actions
  on the assessments list.
- **Trends on the dashboard:** payments and submissions over the weeks of
  the year, rather than only where things stand today.
- **Production hardening:**
  - object storage and virus scanning for uploads;
  - balances computed in a database view;
  - trigram and accent-insensitive search;
  - structured logging with error reporting.
- **A full accessibility review** with a keyboard and a screen reader, beyond
  the automated axe checks.
