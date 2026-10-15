# Testing

This guide covers the automated test suites and how to run them. Manual test
scenarios, with exact inputs and expected results for each workflow, are added
as the features are built.

## Automated tests

| Suite       | What it covers                                                      | Where                               | Command                    |
| ----------- | ------------------------------------------------------------------- | ----------------------------------- | -------------------------- |
| Unit        | Pure rules, with no database or network                             | `src/**/*.test.ts`, beside the code | `npm run test:unit`        |
| Integration | Route handlers and services against a real PostgreSQL test database | `tests/integration/`                | `npm run test:integration` |

`npm test` runs both suites with a coverage report.

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

### 1. Choosing a view

1. Open <http://localhost:3000>. The page "Choose a view" offers **Registry
   staff** and **Student**.
2. Select **Continue as staff**. You land on **Registry dashboard**, and the
   header reads "Viewing as Registry staff".
3. Select **Switch view** in the header. You are back on "Choose a view".
4. Open <http://localhost:3000/staff> in a private window, which has no session.
   You are sent to "Choose a view".

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
   - Her ID is **SMS-2026-0008**, the next number after the seeded 0001–0007.
   - Her email is shown in lower case.
   - Her status history reads "Record created as Enrolled".

4. Select **Enrol a student** again. Enter another name, the email
   `GRACE.THOMPSON@student.example` and the same other details. Select
   **Enrol student**. "Another student already uses this email address" appears
   under **Email**, and no record is created.
5. Enter a date of birth less than 16 years ago. "Students must be at least 16"
   appears under **Date of birth**.
6. Choose **2025/26** as the academic year and enrol a new student. Their ID
   starts with **SMS-2025-** and continues that year's sequence (0003).

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
3. Select **Students** in the header. Oliver shows as Deferred. Open his
   record, change his status back to **Enrolled**, then press the browser's
   **Back** button. The list shows him as **Enrolled**: pages visited earlier
   never show stale data after a change.
4. Open **Mohammed Al-Farsi** (Completed). The status card reads "Completed is
   final: this record's status can no longer change."
5. On Oliver's record, select **Edit details**. Change **Academic year** to
   **2027/28** and select **Save changes**. His student ID is still
   SMS-2026-0001.

### 5. A student's own record

1. Select **Switch view**, choose **Sofia Rossi · SMS-2026-0003 · Deferred**
   and select **Continue as student**.
2. **My record** shows Sofia's details and status history. A note explains
   that her enrolment is deferred and that she can't submit work. There are
   no edit or status controls.
3. Open <http://localhost:3000/staff> as Sofia. You are sent to "Choose a
   view", because the staff pages are for staff only.

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
6. Record a payment of £20,000.00 for **Liam O'Connor**. His account shows
   **In credit**.
7. Switch to **Liam O'Connor** as a student. **My record** shows the same
   account, with no forms.

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

## Trying the API with curl

Every write in the app goes through these routes, so the API behaves exactly
as the UI does. The session is a cookie, so keep it in a cookie jar. On
Windows, use `curl.exe` in PowerShell, because `curl` there is an alias for
`Invoke-WebRequest`.

```bash
# Start a staff session and keep the cookie in cookies.txt
curl -i -c cookies.txt -H "Content-Type: application/json" \
  -d '{"role":"staff"}' http://localhost:3000/api/session

# Show the current session
curl -b cookies.txt http://localhost:3000/api/session

# Errors come back as RFC 9457 problem details, e.g. an unknown student:
curl -i -H "Content-Type: application/json" \
  -d '{"role":"student","studentNumber":"SMS-2026-9999"}' \
  http://localhost:3000/api/session
# HTTP/1.1 404 Not Found
# {"type":"about:blank","title":"Not Found","status":404,
#  "detail":"There is no student with ID SMS-2026-9999.","instance":"/api/session"}

# List the programme codes
curl -b cookies.txt http://localhost:3000/api/programmes

# Enrol a student (staff session); the response includes the new ID
curl -i -b cookies.txt -H "Content-Type: application/json" \
  -d '{"fullName":"Grace Thompson","email":"grace.thompson@student.example",
       "dateOfBirth":"2005-03-12","programmeCode":"BSC-CS","academicYear":"2026/27"}' \
  http://localhost:3000/api/students
# HTTP/1.1 201 Created
# {"student":{"studentNumber":"SMS-2026-0008", ...}}

# Search and filter students; the same parameters as the page
curl -b cookies.txt "http://localhost:3000/api/students?q=har&status=ENROLLED&page=1"

# Read a record; the student ID is case-insensitive
curl -b cookies.txt http://localhost:3000/api/students/sms-2026-0008

# Edit details (any subset of fields)
curl -i -b cookies.txt -X PATCH -H "Content-Type: application/json"   -d '{"academicYear":"2027/28"}' http://localhost:3000/api/students/SMS-2026-0008

# Change status; deferral and withdrawal need a reason
curl -i -b cookies.txt -H "Content-Type: application/json"   -d '{"status":"WITHDRAWN","reason":"Moved abroad"}'   http://localhost:3000/api/students/SMS-2026-0008/status

# A student's account: charges, payments, balance and overdue amount
curl -b cookies.txt http://localhost:3000/api/students/SMS-2025-0001/account

# Record a payment; amounts are in pence and the response has the new balance
curl -i -b cookies.txt -H "Content-Type: application/json"   -d '{"amountPence":500000,"paidOn":"2026-10-15","reference":"BACS 0042"}'   http://localhost:3000/api/students/SMS-2025-0001/payments

# Charge a fee for an academic year (the programme's standard fee by default)
curl -i -b cookies.txt -H "Content-Type: application/json"   -d '{"academicYear":"2027/28"}'   http://localhost:3000/api/students/SMS-2025-0001/fees

# Correct a fee charge (IDs are in the account response)
curl -i -b cookies.txt -X PATCH -H "Content-Type: application/json"   -d '{"dueDate":"2026-11-30","note":"Payment plan agreed"}'   http://localhost:3000/api/fees/<fee-id>

# Reverse a payment; a second reversal of the same payment returns 409
curl -i -b cookies.txt -H "Content-Type: application/json"   -d '{"reason":"Keyed against the wrong student"}'   http://localhost:3000/api/payments/<payment-id>/reversal

# A change the rules forbid returns 409 with an explanation
curl -i -b cookies.txt -H "Content-Type: application/json"   -d '{"status":"DEFERRED"}' http://localhost:3000/api/students/SMS-2023-0001/status
```
