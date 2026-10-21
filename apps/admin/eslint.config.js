import base from "@intu/config/eslint";

export default [
  ...base,
  { ignores: [".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "demo/dist/**"] },
  // The demo build's stand-in data, like test fixtures, may assert that seed rows exist.
  { files: ["demo/**/*.ts", "demo/**/*.tsx"], rules: { "@typescript-eslint/no-non-null-assertion": "off" } },
];
