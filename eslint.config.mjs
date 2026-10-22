import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
export default ts.config(
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      ".local/**",
      "**/.data/**",
      ".wrangler/**",
      "work/**",
      "app/**",
      "lib/**",
      "components/**",
      "hooks/**",
      "examples/**",
      "vendor/**",
      "build/**",
      "db/**",
      "drizzle/**",
      "scripts/connector-preview/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: [
      "apps/**/*.{js,ts,tsx}",
      "packages/**/*.ts",
      "scripts/*.ts",
      "tests/**/*.mjs",
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
