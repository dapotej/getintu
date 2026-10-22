import base from "@intu/config/eslint";

export default [
  ...base,
  { ignores: [".vercel/**"] },
  // Build scripts run in Node.
  { files: ["scripts/**/*.mjs"], languageOptions: { globals: { console: "readonly", URL: "readonly" } } },
];
