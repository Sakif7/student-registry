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

3. Start PostgreSQL 18 in Docker and wait until it is healthy:

   ```bash
   npm run db:up
   ```

   `npm run db:down` stops it again; your data is kept in a Docker volume.

## Documentation

- [Decisions](.docs/DECISIONS.md): every product and technical decision, with
  its reasoning
- [AI usage log](.docs/ai-log.md): how AI tools were used and how their output
  was checked
