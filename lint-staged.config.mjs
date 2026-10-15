// Pre-commit checks on staged files only: ESLint fixes what it can and fails
// on anything left, then Prettier formats. Ignored files (e.g. the npm lock
// file) are skipped by both tools.
import { defineConfig } from "lint-staged/config";

export default defineConfig({
  "*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}": [
    "eslint --fix --max-warnings=0 --no-warn-ignored",
    "prettier --write",
  ],
  "*.{json,css,md,yml,yaml}": "prettier --write",
});
