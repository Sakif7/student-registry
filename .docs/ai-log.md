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

## Commit 1: formatting and type-aware linting

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

## Commit 2: pre-commit hook

**What the AI did:** set up Husky and lint-staged: ESLint and Prettier run on
staged files, then the whole project is type-checked.

**Checked by:**

- **Failure path:** a staged file containing an unawaited promise was rejected
  by the hook's lint step, and lint-staged rolled the index back cleanly.
- **Success path:** this commit itself went through the hook.
