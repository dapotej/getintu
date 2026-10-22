import base from "@intu/config/eslint";

export default [
  ...base,
  { ignores: [".next/**", "out/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  // Build and preview scripts run in Node; the service worker runs in the browser's worker scope.
  { files: ["scripts/**/*.mjs"], languageOptions: { globals: { console: "readonly", process: "readonly", URL: "readonly" } } },
];
