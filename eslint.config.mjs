// ESLint flat config: Next.js rules, type-aware TypeScript rules, and
// Prettier compatibility (formatting is Prettier's job, not ESLint's).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Type-aware rules (floating promises, unsafe `any`, ...) need the
  // TypeScript program, so they only apply to files tsconfig covers.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Last among rule configs, so it can switch off rules that fight Prettier.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated output: the Prisma client and the test reports.
    "src/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    // Local browser-automation artefacts (git-ignored).
    ".playwright-mcp/**",
  ]),
]);

export default eslintConfig;
