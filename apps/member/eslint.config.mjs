import base from "@intu/config/eslint";

export default [
  ...base,
  { ignores: ["dist/**", ".expo/**", "expo-env.d.ts", "playwright-report/**", "test-results/**", "metro.config.js"] },
  { files: ["scripts/**/*.mjs"], languageOptions: { globals: { console: "readonly", process: "readonly", URL: "readonly" } } },
];
