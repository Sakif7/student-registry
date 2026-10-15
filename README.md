# Student Registry

The Registry module of a student management system: student enrolment, fees
and payments, assessment submissions, and marks and results, with a Staff view
and a Student view. Built with Next.js 16 (App Router), PostgreSQL and Prisma.

## Prerequisites

- Node.js 24 LTS (22.12 or later also works)
- Docker, for PostgreSQL (Docker Desktop on Windows and macOS)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file from the example. The defaults work with the
   bundled database.

   ```bash
   cp .env.example .env              # macOS, Linux, Git Bash
   Copy-Item .env.example .env       # Windows PowerShell
   ```

3. Start PostgreSQL 18 in Docker, apply the migrations and load the demo
   data:

   ```bash
   npm run setup
   ```

4. Start the app and open <http://localhost:3000>:

   ```bash
   npm run dev
   ```

## Database commands

| Command              | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `npm run db:up`      | Start PostgreSQL in Docker and wait until it is healthy |
| `npm run db:down`    | Stop it; the data stays in a Docker volume              |
| `npm run db:deploy`  | Apply any pending migrations                            |
| `npm run db:seed`    | Replace all data with the demo data                     |
| `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` |
| `npm run db:studio`  | Browse the data in Prisma Studio                        |

## Tests

With PostgreSQL running (`npm run db:up`):

```bash
npm test
```

This runs the unit and integration suites with a coverage report. The
integration tests use a separate `registry_test` database and never touch your
data. See the [testing guide](.docs/TESTING.md) for each suite and the manual
test scenarios.

## Documentation

- [Decisions](.docs/DECISIONS.md): every product and technical decision, with
  its reasoning
- [Testing guide](.docs/TESTING.md): automated suites and manual test scenarios
- [AI usage log](.docs/ai-log.md): how AI tools were used and how their output
  was checked
