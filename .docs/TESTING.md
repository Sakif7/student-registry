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
