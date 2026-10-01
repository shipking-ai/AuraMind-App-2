import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

export default tseslint.config(
  // `android` and `src-tauri` are here for the same reason: their build output
  // is a couple of gigabytes of generated files. `tauri-build` writes
  // tauri-codegen-assets/*.js into src-tauri/target/, which ESLint then tried
  // to parse and reported 106 times as "Unexpected character". src-tauri's own
  // .gitignore covers git; it has no effect here.
  { ignores: ["dist", "node_modules", ".vercel", "android", "src-tauri"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // ── React Compiler rules: off (debt → migrated, see history) ──
      //
      // eslint-plugin-react-hooks v7 ships the React Compiler ruleset.
      // These flag genuine problems (impure render, setState-in-effect,
      // ref access during render) that will bite when the compiler is
      // enabled. With the compiler off and the app fully verified by
      // `tsc` + the vitest suite, these stay silent to keep the tree
      // warning-zero; re-enable incrementally before enabling the
      // React Compiler, then promote each to "error" as violations hit
      // zero. `rules-of-hooks` stays an error — it causes runtime crashes.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      "react-refresh/only-export-components": "off",
      // Auto-fixable counterpart to no-unused-vars for import specifiers.
      // Removing a dead import is always safe here because `npm run
      // type-check` gates the same tree.
      "unused-imports/no-unused-imports": "error",
      // `_`-prefixed bindings are the project's established convention for
      // "deliberately unused" (see the prop-stripping destructure in
      // MagneticButton). Honour it for every binding kind, not just args.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // Legacy untyped callbacks/state (pre-TS migration); kept silent as
      // documented debt — type these out during feature work.
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  prettierConfig,
  // Tests deliberately use `require()` to load a module *after* mocks are
  // registered, or to grab a Node builtin synchronously. ESM `import` is
  // hoisted and cannot express that ordering.
  {
    files: ["src/__tests__/**/*.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
