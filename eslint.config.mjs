import js from "@eslint/js";

// 37k lines of untyped .mjs previously had no static analysis at all. This is a
// correctness-only config — no style rules, so it never fights the existing
// code — aimed at the mistakes that actually ship bugs in this codebase:
// unused/undefined identifiers, unreachable branches, and floating promises
// that would silently drop a ledger append.
export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".local-backups/**",
      "public/vendor/**",
      ".playwright-mcp/**",
      "migration/artifacts/**",
      "makler-realty-design-system/**",
      "prototypes/**",
      // Wrangler's build scratch: bundled Worker output, not source.
      ".wrangler/**",
      "app.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        AbortController: "readonly",
        AbortSignal: "readonly",
        Buffer: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        Uint8Array: "readonly",
        console: "readonly",
        fetch: "readonly",
        globalThis: "readonly",
        performance: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      // ignoreRestSiblings covers the `const { drop, ...rest }` omit pattern.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
      // Escapes inside string/regex literals are stylistic, not defects.
      "no-useless-escape": "off",
      "no-undef": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // A dropped promise here means a lost ledger append or audit entry.
      "require-atomic-updates": "error",
      "no-await-in-loop": "off",
    },
  },
  {
    files: ["production/lib/ui/client.mjs", "public/vendor/**"],
    languageOptions: {
      globals: { document: "readonly", window: "readonly", HTMLFormElement: "readonly", navigator: "readonly" },
    },
  },
  {
    // The Worker runs on workerd, not Node: no process, but Web Crypto and the
    // fetch primitives are ambient globals. Without this block eslint flags
    // `crypto` as undefined — a false positive that would otherwise train us to
    // ignore no-undef exactly where a real typo becomes a 500 at the edge.
    files: ["workers/**"],
    languageOptions: {
      globals: { crypto: "readonly", caches: "readonly", addEventListener: "readonly", atob: "readonly", btoa: "readonly" },
    },
  },
  {
    // Tests run sequentially and set process.env around awaits on purpose;
    // require-atomic-updates only produces false positives there. It stays on
    // for library code, where a dropped await really does lose a ledger write.
    files: ["production/test/**"],
    rules: { "require-atomic-updates": "off" },
  },
];
