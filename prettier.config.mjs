// Prettier configuration: defaults everywhere, plus Tailwind class sorting
// driven by the project's own stylesheet (Tailwind v4 has no JS config).

/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./src/app/globals.css",
  // Also sort classes passed to shadcn's helpers.
  tailwindFunctions: ["cn", "cva"],
};

export default config;
