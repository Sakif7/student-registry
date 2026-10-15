// Dependency audit for CI. Fails on any high or critical advisory in any
// dependency, except those listed in audit-allowlist.json, where each entry
// records why it is accepted (see .docs/DECISIONS.md). A new advisory, even
// in an allowlisted package, still fails the build.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BLOCKING = new Set(["high", "critical"]);

const allowlist = JSON.parse(
  readFileSync(new URL("./audit-allowlist.json", import.meta.url), "utf8"),
);
const allowed = new Set(allowlist.map((entry) => entry.id));

const report = JSON.parse(runNpmAudit());
const found = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    // String entries point at another vulnerable package; objects are the
    // advisories themselves.
    if (typeof via === "object" && BLOCKING.has(via.severity)) {
      const id = via.url.split("/").pop();
      found.set(id, `${via.name}: ${via.title} (${via.severity})`);
    }
  }
}

for (const entry of allowlist) {
  if (!found.has(entry.id)) {
    console.log(
      `Note: ${entry.id} (${entry.package}) no longer applies; remove it from scripts/audit-allowlist.json.`,
    );
  }
}

const unexpected = [...found].filter(([id]) => !allowed.has(id));
if (unexpected.length > 0) {
  console.error("High or critical advisories not on the allowlist:");
  for (const [id, description] of unexpected) {
    console.error(`  ${id}  ${description}`);
  }
  process.exit(1);
}
console.log(
  `No unexpected high or critical advisories (${found.size} allowlisted).`,
);

/** Runs `npm audit --json` and returns its report. */
function runNpmAudit() {
  try {
    return execSync("npm audit --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // npm audit exits non-zero whenever it finds an advisory, but the JSON
    // report is still on stdout. Anything else is a real failure.
    if (error.stdout) return error.stdout;
    throw error;
  }
}
