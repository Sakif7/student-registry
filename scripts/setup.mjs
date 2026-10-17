// `npm run setup`: everything needed before `npm run dev`, in one command.
// It creates .env from .env.example if there is none, starts PostgreSQL and
// Mailpit in Docker (compose.yaml), applies the migrations and loads the
// demo data. With `npm run setup -- --no-docker` it uses the PostgreSQL that
// DATABASE_URL names instead. Each failure says what to do next, so someone
// trying the project for the first time isn't left with a raw error.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

const NO_DOCKER = process.argv.includes("--no-docker");

/** Prints a step. */
function step(message) {
  console.log(`\n> ${message}`);
}

/** Prints what went wrong and what to do about it, then stops. */
function fail(message) {
  console.error(`\nSetup stopped: ${message}\n`);
  process.exit(1);
}

/** Runs an npm script, showing its output. True if it succeeded. */
function npmRun(script) {
  // A shell finds npm's .cmd launcher on Windows; the arguments are fixed.
  return (
    spawnSync(`npm run ${script}`, { stdio: "inherit", shell: true }).status ===
    0
  );
}

/** The host and port of a database URL, for messages. */
function serverOf(url) {
  try {
    const { hostname, port } = new URL(url);
    return `${hostname}:${port || "5432"}`;
  } catch {
    return "the address in DATABASE_URL";
  }
}

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  fail(
    `Node.js ${process.versions.node} is too old. Install Node.js 24 LTS (22.12 or later also works), then run npm install and npm run setup again.`,
  );
}
if (!existsSync("node_modules")) {
  fail("the dependencies aren't installed. Run npm install first.");
}

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  step(
    "Created .env from .env.example. Its defaults work with the database Docker starts.",
  );
}
process.loadEnvFile(".env");
const database = serverOf(process.env.DATABASE_URL);

if (NO_DOCKER) {
  step(
    `Skipping Docker, and using the PostgreSQL at ${database}. Without Mailpit no email can be read, so enrol students with a password rather than an activation link.`,
  );
} else {
  if (spawnSync("docker", ["--version"]).error) {
    fail(
      "Docker isn't installed. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), start it and run npm run setup again. Or use your own PostgreSQL 18: set DATABASE_URL in .env, then run npm run setup -- --no-docker.",
    );
  }
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    fail(
      "Docker is installed but not running. Start Docker Desktop, wait until it says it's running, then run npm run setup again.",
    );
  }
  step("Starting PostgreSQL and Mailpit in Docker (compose.yaml)...");
  const up = spawnSync("docker", ["compose", "up", "-d", "--wait"], {
    stdio: ["ignore", "inherit", "pipe"],
    encoding: "utf8",
  });
  if (up.status !== 0) {
    process.stderr.write(up.stderr ?? "");
    if (/already allocated|already in use|address in use/i.test(up.stderr)) {
      fail(
        "a port the containers need is in use: 5432 (PostgreSQL), or 1025 or 8025 (Mailpit). It's usually a PostgreSQL installed on this computer. Stop it and run npm run setup again, or use it instead (it must be PostgreSQL 18): set DATABASE_URL in .env, then run npm run setup -- --no-docker.",
      );
    }
    fail("Docker couldn't start the containers. The message above says why.");
  }
}

step("Applying the database migrations...");
if (!npmRun("db:deploy")) {
  fail(
    `the database at ${database} couldn't be migrated. Check that PostgreSQL 18 is running there, and that DATABASE_URL in .env is right.`,
  );
}

step("Loading the demo data (this resets the database to it)...");
if (!npmRun("db:seed")) {
  fail("the demo data couldn't be loaded. The message above says why.");
}

const app = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
console.log(`
Ready. Start the app with

    npm run dev

then open ${app} and pick a demo account on the sign-in page.
Every demo password is demo-password-2026.${
  NO_DOCKER
    ? ""
    : "\nEmails the app sends arrive in Mailpit at http://localhost:8025."
}
`);
