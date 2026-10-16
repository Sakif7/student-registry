# Testing

This guide covers the automated test suites and how to run them, then manual
test scenarios for every workflow, with exact inputs and expected results, and
examples of calling the API with curl.

## Automated tests

| Suite       | What it covers                                                                     | Where                                  | Command                    |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------- | -------------------------- |
| Unit        | Pure rules and server-rendered components, with no database or network             | `src/**/*.test.ts(x)`, beside the code | `npm run test:unit`        |
| Integration | Route handlers and services against a real PostgreSQL test database                | `tests/integration/`                   | `npm run test:integration` |
| End-to-end  | Journeys through the production build in Chromium, with accessibility checks (axe) | `e2e/`                                 | `npm run test:e2e`         |

`npm test` runs all three: the unit and integration suites with a coverage
report, then the end-to-end suite.

### Before running the integration tests

The integration tests need PostgreSQL running (`npm run db:up`) and
`TEST_DATABASE_URL` set. `.env.example` provides it. Every run then:

1. Checks that the database name ends in `_test`, and refuses to start
   otherwise. The tests empty every table, so they must never point at the
   app's own database.
2. Applies all migrations with `prisma migrate deploy`, which creates the test
   database on the first run.
3. Empties every table before each test, so each test sets up exactly the data
   it needs. Test files run one at a time because they share one database.

Unit tests run in the Asia/Dhaka time zone (UTC+6), so date-only values that
shift by a day east of UTC fail locally instead of passing on a UTC CI runner.

### Before running the end-to-end tests

The end-to-end tests use the same test database, and read the app's emails
from Mailpit, so both must be running (`npm run db:up` starts them). Install
the browser once with `npx playwright install chromium`. Each run then:

1. Builds the app and starts it on port 3100, pointed at the test database and
   a temporary upload folder, so nothing touches your own data.
2. Applies the migrations, and reloads the demo data before each spec file, so
   every file starts from the same state. Journeys that aren't about signing
   in start from a session created in the database rather than the sign-in
   form, which keeps them quick and independent of the form.
3. Runs one test at a time. If a test fails, `npx playwright show-report` opens
   the report, with a screenshot and a trace of the failure.

The specs cover signing in and out, resetting a forgotten password by email,
access control, enrolment and the student list, fees and the dashboard, the assessment journey (setting, submitting,
replacing, late work, marking), publishing and withholding results, the audit trail, and an axe
accessibility scan of every kind of page.

### Coverage

`npm test` writes a coverage report for `src/domain`, `src/server` and
`src/app/api`. Open `coverage/index.html` in a browser for line-by-line detail.
The run fails if lines, branches, functions or statements drop below 80%.
React components aren't measured: their behaviour is covered by the end-to-end
tests.

## Manual test scenarios

Run these against the demo data: `npm run setup` once, then `npm run dev` and
open <http://localhost:3000>. `npm run db:seed` resets the data to the
starting point at any time.

### Demo data

The seed loads three programmes (each with its modules) and ten fictitious
students. Dates are relative to the day the seed runs. The IDs below assume
the 2026/27 academic year; in a later year the years in them move on by the
same amount.

| Student           | ID            | Programme                     | Status    | Fees (on the day the seed runs)                                |
| ----------------- | ------------- | ----------------------------- | --------- | -------------------------------------------------------------- |
| Mohammed Al-Farsi | SMS-2023-0001 | BSc (Hons) Computer Science   | Completed | Paid in full                                                   |
| Amelia Hart       | SMS-2025-0001 | BSc (Hons) Computer Science   | Enrolled  | Second year; this year's £9,535.00 overdue by 20 days          |
| Kwame Mensah      | SMS-2025-0002 | BA (Hons) Business Management | Enrolled  | Second year; £4,535.00 overdue by 10 days after a part-payment |
| Oliver Bennett    | SMS-2026-0001 | BSc (Hons) Computer Science   | Enrolled  | Paid in full                                                   |
| Priya Natarajan   | SMS-2026-0002 | BSc (Hons) Computer Science   | Enrolled  | Paid in full                                                   |
| Sofia Rossi       | SMS-2026-0003 | BA (Hons) Business Management | Deferred  | Deferred 12 days ago; fee corrected to £0.00 with a note       |
| Liam O'Connor     | SMS-2026-0004 | MSc Data Science              | Enrolled  | Overpaid: £250.00 in credit                                    |
| Hannah Kowalski   | SMS-2026-0005 | MSc Data Science              | Withdrawn | Withdrew 8 days ago; still owes £9,950.00, overdue by 6 days   |
| Chloé Dubois      | SMS-2026-0006 | BA (Hons) Business Management | Enrolled  | Paid in full after a payment recalled by the bank was reversed |
| Arjun Mehta       | SMS-2026-0007 | MSc Data Science              | Enrolled  | £11,950.00 due in 5 days, not yet overdue                      |

Each programme has assessments in every state. Deadlines are at 17:00 college
time; "late" means submitted after the deadline.

| Assessment              | Module | Deadline           | State                                    | Submissions and marks                                                                                |
| ----------------------- | ------ | ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Web project proposal    | CS5003 | in 10 days         | Open                                     | Priya                                                                                                |
| Data pipeline design    | DS7002 | in 14 days         | Open                                     | None                                                                                                 |
| Accounting test         | BM4002 | in 20 days         | Open                                     | None                                                                                                 |
| Database design report  | CS4002 | 2 days ago         | Past deadline, still accepting late work | Oliver (81, not published)                                                                           |
| Management essay        | BM4001 | 7 days ago         | Past deadline, still accepting late work | Kwame (35, Fail, published); Chloé, late (62, Merit, not published)                                  |
| Machine learning report | DS7001 | 5 days ago         | Closed yesterday                         | Hannah, before withdrawing; Liam (71, Distinction, published); Arjun, late (45, Pass, not published) |
| Algorithms coursework   | CS4001 | 14 days ago        | Closed 3 days ago                        | Oliver (74, Distinction); Priya, late (58, Pass); Amelia, replaced once (66, Merit); all published   |
| Final year project      | CS5003 | about 7 months ago | Closed                                   | Mohammed (68, Merit, published)                                                                      |

Amelia Hart's results are withheld for outstanding tuition fees, so Amelia
sees none of them. Every submission is a real PDF or Word file that downloads.

Everyone signs in with their email address and, in the demo data, the
password `demo-password-2026`:

| Who             | Email                                                                                                                        | Can sign in                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Registry staff  | `jane.okafor@college.example`, `tom.reid@college.example`, `elena.petrova@college.example`                                   | Yes, all with the same permissions  |
| Students        | Their name in lower case, e.g. `amelia.hart@student.example`, `liam.oconnor@student.example`, `chloe.dubois@student.example` | Yes, apart from the two below       |
| Arjun Mehta     | `arjun.mehta@student.example`                                                                                                | No: the account isn't activated yet |
| Hannah Kowalski | `hannah.kowalski@student.example`                                                                                            | No: sign-in is turned off           |

The sign-in page lists five of these accounts with a **Use** button that fills
in the form.

Several scenarios move between staff and a student. Stay signed in as staff
in one window and sign in as the student in a private window, which keeps a
separate session; sign out there to change student. "As Amelia" means signed
in as Amelia Hart.

### 1. Signing in and out, and forgotten passwords

1. Open <http://localhost:3000>. You are sent to **Sign in**, which lists the
   demo accounts.
2. Select **Sign in** with the form empty. "Enter your email address" and
   "Enter your password" appear.
3. Enter `jane.okafor@college.example` with the password `wrong-password-1`.
   "The email address or password is incorrect." appears. Enter
   `nobody@college.example` with the demo password: the message is the same,
   so the form never reveals who has an account.
4. Select **Use** beside Jane Okafor, then **Sign in**. You land on **Registry
   dashboard**. The sidebar lists the staff pages, with **Dashboard** marked,
   and at its foot "Jane Okafor, Registry staff".
5. Select Jane Okafor at the foot of the sidebar, then **Sign out**. You are
   back on **Sign in**.
6. Open <http://localhost:3000/staff/students?q=har>. You are sent to sign in
   first. Sign in as Jane Okafor: you land on the student list, already
   searched for "har".
7. In a private window, sign in as `hannah.kowalski@student.example` with the
   demo password. "Sign-in is turned off for this account. Contact the
   Registry." appears.
8. Enter `elena.petrova@college.example` with a wrong password five times,
   then with the demo password. "Too many failed attempts to sign in with
   this email address. Try again in 15 minutes." appears. Jane Okafor can
   still sign in: only Elena's address is locked. `npm run db:seed` lifts
   the lock at once, along with resetting the data.
9. Sign out, then select **Forgot your password?** and enter
   `priya.natarajan@student.example`. "Check your email" appears.
10. Open Mailpit at <http://localhost:8025>. The email "Reset your Student
    Registry password" holds a link. Open it, and choose a new password of
    12 characters or more, typed twice. "Your password has changed" appears.
    Sign in as Priya with the new password.
11. Open the emailed link again. "This link no longer works" appears, with a
    way to ask for a new one. `npm run db:seed` restores Priya's demo
    password.

Sign-in allows 30 attempts a minute from one address. The integration tests
check the limit, as it is impractical to reach by hand.

### 1a. Your account

1. Sign in as `tom.reid@college.example` in your browser, and again in a
   private window.
2. In your browser, select Tom Reid at the foot of the sidebar, then **Your
   account**. **Your account** shows
   Tom's details, and **Where you're signed in** lists both browsers, with
   this one marked **This device**.
3. Under **Change your password**, enter a wrong current password and a new
   one twice. "That isn't your current password" appears.
4. Enter the demo password as the current one and a new one twice, then
   select **Change password**. "Password changed. Signed out on 1 other
   device." appears, and the list shows this browser only. Reload the private
   window: it is back on the sign-in page.
5. Sign out and sign in again with the new password. `npm run db:seed`
   restores Tom's demo password.

### 2. Enrolling a student

As staff:

1. On **Registry dashboard**, select **Enrol a student**.
2. Select **Enrol student** without filling anything in. Errors appear under
   **Full name**, **Email**, **Date of birth** and **Programme**, and nothing is
   saved.
3. Fill in the form:

   | Field            | Value                                                      |
   | ---------------- | ---------------------------------------------------------- |
   | Full name        | `Grace Thompson`                                           |
   | Email            | `Grace.Thompson@Student.Example`                           |
   | Date of birth    | 12 March 2005 (the date picker uses your browser's format) |
   | Programme        | BSc (Hons) Computer Science                                |
   | Academic year    | 2026/27 (the default)                                      |
   | Enrolment status | Enrolled (the default)                                     |

   Select **Enrol student**. You land on Grace's record:
   - The ID is **SMS-2026-0008**, the next number after the seeded 0001–0007.
   - The email is shown in lower case.
   - The status history reads "Record created as Enrolled".
   - A message confirms "An activation email went to
     grace.thompson@student.example".
   - **Sign-in** reads **Waiting for activation**, with when the email went
     and until when its link works.

4. Select **Enrol a student** again. Enter another name, the email
   `GRACE.THOMPSON@student.example` and the same other details. Select
   **Enrol student**. "Another student already uses this email address" appears
   under **Email**, and no record is created.
5. Enter a date of birth less than 16 years ago. "Students must be at least 16"
   appears under **Date of birth**.
6. Choose **2025/26** as the academic year and enrol a new student. Their ID
   starts with **SMS-2025-** and continues that year's sequence (0003).
7. Open Mailpit at <http://localhost:8025>. The email "Activate your Student
   Registry account" to Grace holds a link. Open it in a private window and
   choose a password: "Your account is ready". Sign in there as
   `grace.thompson@student.example`: you land on **My record** for Grace.
8. Back on Grace's record as staff, reload: **Sign-in** reads **Active**,
   with the date of activation and "Signed in on 1 device now."

### 2a. Managing a student's sign-in

As staff:

1. Open **Arjun Mehta** (SMS-2026-0007). **Sign-in** reads **Waiting for
   activation**, with no link waiting. Select **Send activation email**:
   "Activation email sent to arjun.mehta@student.example". The email is in
   Mailpit, and the card now says when it went.
2. Select **Resend activation email**. The new email's link works; the
   first one's now opens "This link no longer works".
3. Open **Liam O'Connor**, who is **Active**, and select **Email a password
   reset link**. Mailpit has "Reset your Student Registry password" for Liam.
4. Sign in as Liam in a private window. As staff, select **Turn sign-in
   off** on Liam's record, and confirm. **Sign-in** reads **Turned off**, and
   a message offers **Undo**. In the private window, reload: Liam is back on
   the sign-in page, and signing in says sign-in is turned off.
5. Select **Turn sign-in back on**. Liam can sign in again with the demo
   password.
6. Open **Hannah Kowalski** (withdrawn): sign-in is **Turned off**, as the
   demo data has it.

### 3. Finding students

As staff, open **Students**. The list shows every student by name, 11 after
scenario 2, or 10 on fresh demo data.

1. Type `har` in **Search** and press Enter. Only **Amelia Hart** is listed.
   The URL now holds the search, so the view can be bookmarked.
2. Search for `sms-2026-0005`. Searching by student ID ignores case, and finds
   **Hannah Kowalski**.
3. Select **Clear filters**, then choose **Withdrawn** under **Status**. The list
   updates at once and shows only Hannah Kowalski.
4. Choose **MSc Data Science** under **Programme** as well. The filters
   combine: still Hannah. Change **Status** to **Enrolled** to see Liam
   O'Connor and Arjun Mehta.
5. Search for `zzz`. The list says "No students match these filters", with a
   link to clear them.

### 4. Editing a record and changing status

As staff, open **Oliver Bennett** (SMS-2026-0001) from **Students**.

1. Under **Change status**, choose **Deferred** and select **Change status**
   without a reason. The label reads "Reason (required)" and the error "Give a
   reason for deferral or withdrawal" appears.
2. Enter the reason `Family circumstances` and select **Change status**. The
   badge becomes **Deferred**, and the status history gains "Enrolled →
   Deferred · Family circumstances". The form now offers only **Enrolled** and
   **Withdrawn**.
3. Select **Students** in the sidebar. Oliver shows as Deferred. Open the
   record, change the status back to **Enrolled**, then press the browser's
   **Back** button. The list shows Oliver as **Enrolled**: pages visited
   earlier never show stale data after a change.
4. Open **Mohammed Al-Farsi** (Completed). The status card reads "Completed is
   final: this record's status can no longer change."
5. On Oliver's record, select **Edit details**. Change **Academic year** to
   **2027/28** and select **Save changes**. The student ID is still
   SMS-2026-0001.

### 5. A student's own record

1. Sign in as **Sofia Rossi** (`sofia.rossi@student.example`), who is
   deferred.
2. **My record** shows Sofia's details and status history. A note explains
   that the enrolment is deferred, so no work can be submitted. There are no
   edit or status controls.
3. Open <http://localhost:3000/staff> as Sofia. You are sent back to **My
   record**, because the staff pages are for staff only.

### 6. Fees and payments

As staff, open **Amelia Hart** (SMS-2025-0001). Under **Fees and payments** the
account is **Overdue**:

- £19,070.00 charged, £9,535.00 paid, a balance of £9,535.00, all of it
  overdue for 20 days;
- last year's charge is **Paid**, this year's is **Overdue**.

1. Under **Record a payment**, enter Amount `5,000`, keep today's date, and
   enter Reference `bacs ah 2026-1`. Select **Record payment**. The figures
   update at once: £14,535.00 paid and £4,535.00 overdue. The payment is listed
   with the reference in capitals, "BACS AH 2026-1".
2. Record another payment with the reference `BACS  AH 2026-1` (different
   spacing). "A payment with reference BACS AH 2026-1 is already recorded"
   appears under **Reference**.
3. Try a date after today. "The payment date can't be in the future" appears.
4. Under **Charge a fee**, keep **2026/27** and select **Charge fee**. You are
   told the fee for 2026/27 is already charged.
5. Choose **2027/28**, change the amount to `4767.50` and select **Charge
   fee** without a note. "Explain why the amount differs from the standard fee
   of £9,535.00" appears under **Note**. Add the note `Half scholarship` and
   charge it again. The charge is listed with the note under it.
6. Record a payment of £20,000.00 for **Liam O'Connor**. Liam's account
   shows **In credit**.
7. As **Liam O'Connor**, **My record** shows the same account, with no
   forms.

### 7. Correcting a fee and reversing a payment

As staff, open **Kwame Mensah** (SMS-2025-0002). This year's fee is overdue
after a £5,000.00 card payment.

1. In **Payments**, select **Reverse** on **CARD KM 0001**. A dialog explains
   that the payment stays on record but stops counting. Select **Reverse
   payment** without a reason, and "Give a reason for the reversal" appears.
   Enter `Card payment charged back by the bank` and confirm. The payment now
   shows **Reversed** with the reason; Paid drops to £9,535.00, the overdue
   amount rises to £9,535.00, and the **Reverse** button for that payment is
   gone.
2. In **Fees charged**, select **Correct** on the 2026/27 charge. Change the
   due date to a date next month, add the note `Payment plan agreed`, and
   select **Save correction**. **Overdue** reads "Nothing overdue" and the
   account shows **Balance due**.
3. Select **Correct** again and change the amount to `4767.50` with the note
   field empty. "Explain why the amount differs from the standard fee of
   £9,535.00" appears.
4. **Chloé Dubois** shows a payment the seed already reversed ("Payment
   recalled by the bank"), followed by the payment that replaced it.

### 8. The dashboard and overdue fees

Reset the demo data first with `npm run db:seed`, because the days overdue
below are as of the day the seed runs. As staff:

1. Open **Dashboard**. Under **Students** it shows All students 10, Enrolled 7,
   Deferred 1, Withdrawn 1 and Completed 1. Select **Withdrawn**: the student
   list opens filtered to Withdrawn and shows Hannah Kowalski.
2. Back on **Dashboard**, **Overdue fees** reads "3 students owe £24,020.00 in
   total past the due date" and lists them, longest overdue first:

   | Student         | Status    | Overdue   | Overdue since   |
   | --------------- | --------- | --------- | --------------- |
   | Amelia Hart     | Enrolled  | £9,535.00 | 20 days overdue |
   | Kwame Mensah    | Enrolled  | £4,535.00 | 10 days overdue |
   | Hannah Kowalski | Withdrawn | £9,950.00 | 6 days overdue  |

   Hannah is listed despite having withdrawn, because the debt still needs
   chasing. Arjun Mehta isn't listed: that fee isn't due for another 5 days.

3. Open **Students**. The **Fees** column shows the same three students as
   **Overdue**, each with the amount and days overdue. Arjun shows **Balance
   due**, Liam **In credit**, Sofia **No fees**, and the rest **Paid in
   full**.
4. Open **Kwame Mensah** and record a payment of `4535` with the reference
   `CARD KM 0002`. Select **Dashboard**: Kwame is no longer listed, and the
   total reads "2 students owe £19,485.00".

### 9. Setting an assessment

As staff:

1. Open **Assessments**. The eight demo assessments are listed: open ones
   first, soonest deadline first, then the rest, latest deadline first.
   **Algorithms coursework** shows **Closed** and "3 of 3" submitted, "1 late".
2. Select **Set an assessment**, then **Set assessment** without filling
   anything in. "Choose a module", "Enter a title" and "Enter a date and time"
   appear.
3. Choose **CS4002 Databases**, enter the title `SQL lab test` and the
   deadline 28 March 2027 at 01:30. "The clocks go forward at that time, so it
   never happens. Choose another time." appears under **Deadline**: that night
   UK clocks jump from 01:00 to 02:00. A date in the past is refused too: "The
   deadline must be in the future".
4. Choose a date about four weeks ahead at 17:00 and select **Set
   assessment**. The assessment's page shows the deadline with its weekday and
   time zone, such as "Fri 20 Nov 2026, 17:00 GMT" (BST in summer), and
   **Open**. Under **Submissions and marks**, "0 of 3 enrolled students have
   submitted" lists Amelia Hart, Oliver Bennett and Priya Natarajan, the
   enrolled Computer Science students. Mohammed Al-Farsi has completed the
   programme, so isn't expected to submit.
5. Select **Edit title or deadline**, move the deadline a week later and save.
   The page shows the new deadline.
6. Select **Close to submissions**. A dialog asks you to confirm, with
   **Cancel** focused. Confirm: the assessment shows **Closed** with the time
   it closed. Select **Reopen to submissions**, and it is **Open** again.

### 10. Submitting work

Continue from scenario 9. You need a PDF and a Word document (.docx) of your
own, plus any other file, such as a text file.

1. As **Amelia Hart**, open **Assessments**. **SQL lab test** shows **Not
   submitted**. Open it.
2. Select **Submit my work** without choosing a file. "Choose a file to
   upload" appears under **Your work**.
3. Choose the text file. "Upload a PDF or a Word document (.docx)" appears
   before anything is sent.
4. Make a copy of the text file named `essay.pdf` and choose that. The server
   checks what the file contains and refuses it: "This file isn't a valid PDF
   or Word document, whatever its name says".
5. Choose your PDF and select **Submit my work**. **Your submission** shows
   the file, its size and when it was submitted, and the form becomes
   **Replace your work**. Select the file name to download it.
6. Choose your Word document and select **Replace my work**. **Your
   submission** now shows the Word document and "This is your 2nd upload. Only
   the latest file is kept."
7. Back on **Assessments**, open **Database design report**, whose deadline
   has passed. The page warns that work submitted now is marked late and can't
   be replaced afterwards. Submit your PDF: it shows **Late**, and no
   replacement is offered.
8. Open **Algorithms coursework**: "This assessment is closed to
   submissions", with Amelia's submission shown.
9. As **Sofia Rossi** (deferred), open **Assessments**, then **Management
   essay**: "Only enrolled students can submit work."
10. As staff, open **SQL lab test**. Amelia's row shows when the work was
    submitted, "Replaced 1 time", and the file, which downloads.

### 11. Entering marks

Continue from scenario 10, as staff, on **SQL lab test**.

1. Under **Submissions and marks**, type `72` as Amelia Hart's mark. The
   result reads **Distinction**, with "Not saved yet".
2. Type `3.8` for Oliver Bennett and select **Save marks**. "Enter a whole
   number from 0 to 100" appears beside Oliver's mark, focus moves to it, and
   nothing is saved.
3. Change Oliver's mark to `38` and enter `55` for Priya Natarajan, who
   hasn't submitted (a mark can be given without a submission). Select **Save
   marks**. "Saved 3 marks." appears, and the results read **Distinction**,
   **Fail** and **Pass**, each "Not published".
4. Clear Priya's mark and save. The mark is removed.
5. Open **Machine learning report**. Hannah Kowalski is listed as
   **Withdrawn**, with the work submitted before withdrawing: a student who
   submitted stays on the marksheet.

### 12. Publishing and withholding results

Continue from scenario 11, as staff.

1. Open **Amelia Hart**'s record. Under **Results**, the fees read **Overdue**
   with "£9,535.00 overdue", and a notice reads "Results withheld since …"
   with the reason "Outstanding tuition fees". **Algorithms coursework** shows
   66, **Merit**, published; **SQL lab test** shows 72, **Distinction**, "Not
   published".
2. As **Amelia Hart**, open **Results**. "Your results are being withheld"
   gives the reason, and no marks are shown.
3. As staff, select **Lift the hold** on Amelia's record. As Amelia,
   **Results** now lists **Algorithms coursework** only: the SQL lab test mark
   isn't published yet.
4. As staff, select **Publish 1 mark**. A dialog asks you to confirm, with
   **Cancel** focused. Confirm, and the section reads "Every mark is
   published." As Amelia, **Results** lists both marks.
5. As staff, open **Kwame Mensah** and select **Withhold results**. Choose
   **Another reason** and confirm with the box empty: "Give a reason" appears.
   Enter `Awaiting an academic misconduct panel` and confirm. As Kwame,
   **Results** shows that reason and no marks, although the Management essay
   mark (35, **Fail**) had been published.
6. As staff, open **Results**. Students with marks to publish come first, each
   with a **Publish** button: Arjun Mehta, Chloé Dubois and Oliver Bennett.
   Kwame shows **Withheld** with the reason. On **Dashboard**, **Results**
   counts 3 students with marks to publish and 1 with results withheld.
7. On **SQL lab test**'s marksheet, change Amelia's mark to `68` and save. It
   reads "Not published" again, and Amelia's **Results** no longer shows it
   until it is published again.
8. As **Mohammed Al-Farsi** (completed), **Results** lists **Final year
   project** with 68, **Merit**: completed students keep their results.

### 13. Who did what

As staff:

1. Open **Kwame Mensah**. **History**, at the foot of the record, lists
   everything done to the record, newest first: the demo data's own trail
   (Jane Okafor enrolled Kwame, Tom Reid charged the fees and recorded the
   payments, Elena Petrova entered and published the Management essay mark),
   each with when it happened.
2. Record a payment of `100` with the reference `CARD KM 0003`. **History**
   gains "Recorded a payment of £100.00 (CARD KM 0003)", by Jane Okafor (or
   whoever you are signed in as).
3. Select **Activity** in the sidebar. The same payment heads the list, with
   who made it and a link to Kwame's record. Further down are changes with
   no one student, such as "Set the assessment …".
4. Sign in as a student: there is no **Activity** page, and
   <http://localhost:3000/staff/activity> sends you to your own pages.

## Trying the API with curl

Every write in the app goes through these routes, so the API behaves exactly
as the UI does. Signing in sets a session cookie, so keep it in a cookie jar.
On Windows, use `curl.exe` in PowerShell, because `curl` there is an alias for
`Invoke-WebRequest`.

```bash
# Sign in as staff and keep the session cookie in cookies.txt
curl -i -c cookies.txt -H "Content-Type: application/json" \
  -d '{"email":"jane.okafor@college.example","password":"demo-password-2026"}' \
  http://localhost:3000/api/auth/sign-in/email

# Show the current session
curl -b cookies.txt http://localhost:3000/api/auth/get-session

# Without a session, the API answers 401
curl -i http://localhost:3000/api/students
# HTTP/1.1 401 Unauthorized

# Errors come back as RFC 9457 problem details, e.g. an unknown student:
curl -i -b cookies.txt http://localhost:3000/api/students/SMS-2026-9999
# HTTP/1.1 404 Not Found
# {"type":"about:blank","title":"Not Found","status":404,
#  "detail":"There is no student with ID SMS-2026-9999.",
#  "instance":"/api/students/SMS-2026-9999"}

# List the programme codes
curl -b cookies.txt http://localhost:3000/api/programmes

# Enrol a student (staff session); the response includes the new ID
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -d '{"fullName":"Grace Thompson","email":"grace.thompson@student.example",
       "dateOfBirth":"2005-03-12","programmeCode":"BSC-CS","academicYear":"2026/27"}' \
  http://localhost:3000/api/students
# HTTP/1.1 201 Created
# {"student":{"studentNumber":"SMS-2026-0008", ...}}

# Search and filter students; the same parameters as the page. Each student
# comes with their account standing (e.g. OVERDUE) and overdue amount.
curl -b cookies.txt "http://localhost:3000/api/students?q=har&status=ENROLLED&page=1"

# Read a record; the student ID is case-insensitive
curl -b cookies.txt http://localhost:3000/api/students/sms-2026-0008

# Edit details (any subset of fields)
curl -i -b cookies.txt -X PATCH -H "Content-Type: application/json" \
  -d '{"academicYear":"2027/28"}' \
  http://localhost:3000/api/students/SMS-2026-0008

# Change status; deferral and withdrawal need a reason
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -d '{"status":"WITHDRAWN","reason":"Moved abroad"}' \
  http://localhost:3000/api/students/SMS-2026-0008/status

# A student's sign-in account: where it stands, emailing a link (activation
# until it is active, then a password reset), and turning sign-in off or on
curl -b cookies.txt http://localhost:3000/api/students/SMS-2026-0007/sign-in
curl -i -b cookies.txt -X POST \
  http://localhost:3000/api/students/SMS-2026-0007/sign-in/link
curl -i -b cookies.txt -X PATCH -H "Content-Type: application/json" \
  -d '{"enabled":false}' \
  http://localhost:3000/api/students/SMS-2026-0007/sign-in

# A student's account: charges, payments, balance and overdue amount
curl -b cookies.txt http://localhost:3000/api/students/SMS-2025-0001/account

# Record a payment; amounts are in pence and the response has the new balance
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -d '{"amountPence":500000,"paidOn":"2026-10-15","reference":"BACS 0042"}' \
  http://localhost:3000/api/students/SMS-2025-0001/payments

# Charge a fee for an academic year (the programme's standard fee by default)
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -d '{"academicYear":"2027/28"}' \
  http://localhost:3000/api/students/SMS-2025-0001/fees

# Correct a fee charge (IDs are in the account response)
curl -i -b cookies.txt -X PATCH -H "Content-Type: application/json" \
  -d '{"dueDate":"2026-11-30","note":"Payment plan agreed"}' \
  http://localhost:3000/api/fees/<fee-id>

# Reverse a payment; a second reversal of the same payment returns 409
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -d '{"reason":"Keyed against the wrong student"}' \
  http://localhost:3000/api/payments/<payment-id>/reversal

# A change the rules forbid returns 409 with an explanation
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -d '{"status":"DEFERRED"}' \
  http://localhost:3000/api/students/SMS-2023-0001/status

# List the module codes, for setting assessments
curl -b cookies.txt http://localhost:3000/api/modules

# Set an assessment. The deadline is college time (Europe/London) and must be
# in the future, so adjust the date if this one has passed. Responses give it
# back as a UTC instant (17:00 GMT in winter is 17:00 UTC).
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -d '{"moduleCode":"CS4002","title":"SQL quiz","deadline":"2026-11-20T17:00"}' \
  http://localhost:3000/api/assessments
# HTTP/1.1 201 Created
# {"assessment":{"id":"...","deadline":"2026-11-20T17:00:00.000Z","state":"OPEN", ...}}

# List assessments, or read one with its marksheet
curl -b cookies.txt http://localhost:3000/api/assessments
curl -b cookies.txt http://localhost:3000/api/assessments/<assessment-id>

# Move the deadline, or close ("closed":true) or reopen ("closed":false)
curl -i -b cookies.txt -X PATCH -H "Content-Type: application/json" \
  -d '{"deadline":"2026-12-04T17:00"}' \
  http://localhost:3000/api/assessments/<assessment-id>
curl -i -b cookies.txt -X PATCH -H "Content-Type: application/json" \
  -d '{"closed":true}' \
  http://localhost:3000/api/assessments/<assessment-id>

# Sign in as a student, keeping that session in a second cookie jar
curl -i -c student.txt -H "Content-Type: application/json" \
  -d '{"email":"amelia.hart@student.example","password":"demo-password-2026"}' \
  http://localhost:3000/api/auth/sign-in/email

# The student's assessments, each with their own work and whether they can
# upload now
curl -b student.txt http://localhost:3000/api/students/SMS-2025-0001/assessments

# Submit work as multipart form data in the field "file": 201 the first time,
# 200 for a replacement, 415 for a file that isn't a genuine PDF or DOCX
curl -i -b student.txt -X PUT -F "file=@essay.pdf;type=application/pdf" \
  http://localhost:3000/api/assessments/<assessment-id>/submission

# Download a submission (staff, or the student who submitted it) under its
# original name
curl -OJ -b cookies.txt http://localhost:3000/api/submissions/<submission-id>/file

# Save marks on an assessment's marksheet, keyed by student ID; null removes
# a mark. The response is the updated marksheet.
curl -i -b cookies.txt -X PUT -H "Content-Type: application/json" \
  -d '{"marks":{"SMS-2025-0001":72,"SMS-2026-0001":38}}' \
  http://localhost:3000/api/assessments/<assessment-id>/marks

# A student's results: staff see every mark, the student only published ones
# (and none while withheld)
curl -b cookies.txt http://localhost:3000/api/students/SMS-2025-0001/results
curl -b student.txt http://localhost:3000/api/students/SMS-2025-0001/results

# Publish all of a student's unpublished marks; 409 while withheld
curl -i -b cookies.txt -X POST \
  http://localhost:3000/api/students/SMS-2025-0001/results/publication

# The audit trail: everything done to a student's record, and every change
# made in the Registry, newest first, a page at a time
curl -b cookies.txt http://localhost:3000/api/students/SMS-2025-0002/history
curl -b cookies.txt "http://localhost:3000/api/activity?page=1"

# Withhold a student's results with a reason, then lift the hold
curl -i -b cookies.txt -X PUT -H "Content-Type: application/json" \
  -d '{"reason":"Outstanding tuition fees"}' \
  http://localhost:3000/api/students/SMS-2025-0001/results/hold
curl -i -b cookies.txt -X DELETE \
  http://localhost:3000/api/students/SMS-2025-0001/results/hold

# Sign out. Better Auth takes only JSON bodies, and checks the Origin of any
# request that carries cookies (403 without it). The session is deleted on the
# server, so the old cookie no longer works.
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" -d '{}' \
  http://localhost:3000/api/auth/sign-out
curl -i -b cookies.txt http://localhost:3000/api/students
# HTTP/1.1 401 Unauthorized
```
