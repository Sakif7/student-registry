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

| Student           | ID            | Programme                     | Status    | Notes                                   |
| ----------------- | ------------- | ----------------------------- | --------- | --------------------------------------- |
| Mohammed Al-Farsi | SMS-2023-0001 | BSc (Hons) Computer Science   | Completed | Last session 2025/26                    |
| Amelia Hart       | SMS-2025-0001 | BSc (Hons) Computer Science   | Enrolled  | Second year                             |
| Kwame Mensah      | SMS-2025-0002 | BA (Hons) Business Management | Enrolled  | Second year                             |
| Oliver Bennett    | SMS-2026-0001 | BSc (Hons) Computer Science   | Enrolled  |                                         |
| Priya Natarajan   | SMS-2026-0002 | BSc (Hons) Computer Science   | Enrolled  |                                         |
| Sofia Rossi       | SMS-2026-0003 | BA (Hons) Business Management | Deferred  | Deferred 12 days ago on medical grounds |
| Liam O'Connor     | SMS-2026-0004 | MSc Data Science              | Enrolled  |                                         |
| Hannah Kowalski   | SMS-2026-0005 | MSc Data Science              | Withdrawn | Withdrew 8 days ago for a job offer     |
| Chloé Dubois      | SMS-2026-0006 | BA (Hons) Business Management | Enrolled  |                                         |
| Arjun Mehta       | SMS-2026-0007 | MSc Data Science              | Enrolled  |                                         |

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

# Read a record; the student ID is case-insensitive
curl -b cookies.txt http://localhost:3000/api/students/sms-2026-0008
```
