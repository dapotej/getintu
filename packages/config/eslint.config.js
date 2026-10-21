// Shared ESLint preset for every intu workspace.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "drizzle/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      // Money must never be a float: ban parseFloat and toFixed in app code.
      "no-restricted-properties": [
        "error",
        { object: "Number", property: "parseFloat", message: "Money is integer minor units. Use Number.parseInt or a minor-units helper." },
        { property: "toFixed", message: "Money is integer minor units. Format at the edge with Intl.NumberFormat." }
      ],
      "no-restricted-globals": ["error", { name: "parseFloat", message: "Money is integer minor units." }]
    }
  }
);
