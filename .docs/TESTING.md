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

### 1. Choosing a view

1. Open <http://localhost:3000>. The page "Choose a view" offers **Registry
   staff** and **Student**.
2. Select **Continue as staff**. You land on **Registry dashboard**, and the
   header reads "Viewing as Registry staff".
3. Select **Switch view** in the header. You are back on "Choose a view".
4. Open <http://localhost:3000/staff> in a private window, which has no session.
   You are sent to "Choose a view".

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
```
