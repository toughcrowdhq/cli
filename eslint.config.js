import eslint from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

const sourceFiles = ["**/*.{js,mjs,cjs,ts,mts,cts}"];
const maintainedTypeScriptFiles = ["src/**/*.ts"];
const testFiles = ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"];
const typeCheckedRules =
  tseslint.configs.recommendedTypeCheckedOnly.at(-1).rules;

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    ...eslint.configs.recommended,
    files: sourceFiles,
  },
  ...tseslint.configs.recommended,
  {
    files: sourceFiles,
    languageOptions: {
      globals: globals.node,
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
      curly: ["error", "multi-line", "consistent"],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  {
    files: maintainedTypeScriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...typeCheckedRules,
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: testFiles,
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-disabled-tests": "error",
    },
  },
  {
    files: maintainedTypeScriptFiles,
    ignores: testFiles,
    rules: {
      "no-warning-comments": [
        "error",
        { terms: ["todo", "fixme", "xxx"], location: "start" },
      ],
    },
  },
);
