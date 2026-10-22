// Copy guard (design/i18n-uncatalogued-copy-plan.md §3.3). Interface text belongs in the message
// catalogs, where review status and the catalog checks apply. Files that still hold copy in
// TypeScript are listed in copy-baseline.json with their count; the list may only shrink.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CopyScanner, copyClosure, copyScopeFiles, localImports } from "@/test/copy-scan";
import { indexableLocales } from "./config";
import baseline from "./copy-baseline.json";
import invariants from "./copy-invariants.json";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scanner = new CopyScanner(invariants.strings);
const listed: Record<string, number> = baseline.files;
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

/** Migrated accessors; their import closures hold no interface text outside JSON. */
const migratedScreens: string[] = [
  "src/features/discovery/copy.ts",
  "src/features/discovery/intent-copy.ts",
  "src/features/discovery/map-copy.ts",
  "src/features/privacy/copy.ts",
  "src/features/case-access/copy.ts",
  "src/features/cases/copy.ts",
  "src/features/cases/lifecycle-copy.ts",
  "src/features/cases/owner-preview-copy.ts",
  "src/features/document-requests/copy.ts",
  "src/features/files/copy.ts",
  "src/features/proposals/copy.ts",
  "src/i18n/fact-labels.ts",
];

describe("copy guard rules", () => {
  const rulesOf = (path: string, source: string) =>
    scanner.scan(path, source).map((hit) => `${hit.rule} ${hit.text}`);

  it.each([
    [
      "R1 locale-named dictionary",
      "a.ts",
      'const en = { title: "Search properties" };',
      ["R1 Search properties"],
    ],
    [
      "R1 locale-keyed values",
      "a.ts",
      'const x = { bg: "Изберете", en: "Choose" };',
      ["R1 Изберете", "R1 Choose"],
    ],
    [
      "R2 multi-script call",
      "a.ts",
      's("Купете", "Купить", "Buy");',
      ["R2 Купете", "R2 Купить", "R2 Buy"],
    ],
    [
      "R3 multi-script tuple",
      "a.ts",
      'const row = ["Имоти", "Properties"];',
      ["R3 Имоти", "R3 Properties"],
    ],
    [
      "R4 locale branch",
      "a.ts",
      'const close = locale === "bg" ? "Затвори" : "Close";',
      ["R4 Затвори", "R4 Close"],
    ],
    ["R5 JSX text", "a.tsx", "const a = <p>Search properties</p>;", ["R5 Search properties"]],
    [
      "R5 prose attribute",
      "a.tsx",
      'const a = <input placeholder="Your name" />;',
      ["R5 Your name"],
    ],
    [
      "R5 attribute branch",
      "a.tsx",
      'const a = <b aria-label={open ? "Close menu" : "Open menu"} />;',
      ["R5 Close menu", "R5 Open menu"],
    ],
    ["R6 label property", "a.tsx", 'const item = { label: "Inbox" };', ["R6 Inbox"]],
  ])("%s", (_name, path, source, expected) => {
    expect(rulesOf(path, source)).toEqual(expected);
  });

  it("ignores invariants, keys, classes, comparisons, errors and frozen metadata", () => {
    const source = [
      'export const metadata = { title: "Search properties" };',
      "export function A({ locale, copy, t }) {",
      '  if (locale === "bg") throw new Error("Unsupported locale");',
      '  const item = { label: "saved", text: copy["Search"] };',
      '  return <p className="text-body font-semibold">MS Realty · m² {t("nav.home")}</p>;',
      "}",
    ].join("\n");
    expect(rulesOf("a.tsx", source)).toEqual([]);
  });
});

describe("copy scanner syntax and import boundaries", () => {
  it("parses current TypeScript syntax and ignores type-only strings", () => {
    const hits = scanner.scan(
      "copy.tsx",
      `
      type Field = { label: "Not visible" };
      const en = { title: "Search properties" } satisfies Record<string, string>;
      export const view = <p>{("Choose a property" as string)}</p>;
    `,
    );
    expect(hits.map(({ rule, text }) => [rule, text])).toEqual([
      ["R1", "Search properties"],
      ["R5", "Choose a property"],
    ]);
  });

  it("fails closed when source syntax cannot be scanned", () => {
    expect(() => scanner.scan("broken.tsx", "const x = <p>")).toThrow();
  });

  it("does not hide new translated text behind styling, logs or metadata exclusions", () => {
    const hits = scanner.scan(
      "view.tsx",
      `
      console.info("Не се показва", "Not displayed");
      const classes = clsx("flex min-w-0");
      export const metadata = { title: "Metadata is frozen" };
      export const view = <p>{locale === "bg" ? "Изберете имот" : "Choose a property"}</p>;
    `,
    );
    expect(hits.map(({ rule, text }) => [rule, text])).toEqual([
      ["R4", "Изберете имот"],
      ["R4", "Choose a property"],
    ]);
  });

  it("follows local imports, re-exports and lazy imports once without following JSON or packages", () => {
    const root = mkdtempSync(join(tmpdir(), "msr-copy-guard-"));
    try {
      mkdirSync(join(root, "src/features"), { recursive: true });
      const files = {
        "src/features/entry.ts":
          'export * from "./screen"; import("@/features/lazy"); import "react"; import copy from "./copy.json" with { type: "json" };',
        "src/features/screen.tsx":
          'import "./entry"; export const screen = <p>Choose a property</p>;',
        "src/features/lazy.ts": 'export { screen } from "./screen";',
        "src/features/copy.json": '{"title":"Search properties"}',
      };
      for (const [path, source] of Object.entries(files)) writeFileSync(join(root, path), source);
      expect(
        localImports(root, "src/features/entry.ts", files["src/features/entry.ts"]).sort(),
      ).toEqual(["src/features/lazy.ts", "src/features/screen.tsx"]);
      const closure = copyClosure(root, ["src/features/entry.ts"]);
      expect(closure).toEqual([
        "src/features/entry.ts",
        "src/features/lazy.ts",
        "src/features/screen.tsx",
      ]);
      expect(
        closure
          .flatMap((path) => scanner.scan(path, readFileSync(join(root, path), "utf8")))
          .map((hit) => hit.text),
      ).toEqual(["Choose a property"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("copy guard (ratchet over copy-baseline.json)", () => {
  const files = copyScopeFiles(repoRoot);
  const counts = new Map(files.map((path) => [path, scanner.scan(path, read(path)).length]));

  it("finds no copy outside the files and counts the baseline allows", () => {
    const problems: string[] = [];
    for (const [path, count] of counts) {
      const allowed = listed[path];
      if (count > 0 && allowed === undefined)
        problems.push(`${path}: ${count} copy literals; move them to messages/<locale>/`);
      else if (allowed !== undefined && count > allowed)
        problems.push(`${path}: ${count} copy literals, baseline allows ${allowed}`);
    }
    for (const [path, allowed] of Object.entries(listed))
      if (!counts.get(path))
        problems.push(`${path}: baseline lists ${allowed}, now 0; remove it from the baseline`);
    expect(problems).toEqual([]);
  });

  it("migrated accessor closures contain only catalog copy", () => {
    const offenders = copyClosure(repoRoot, migratedScreens).flatMap((path) =>
      scanner.scan(path, read(path)).map((hit) => `${path}:${hit.line} ${hit.rule} ${hit.text}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps every translation non-indexable while public pages render TypeScript copy", () => {
    const publicRoutes = files.filter((path) => path.startsWith("app/public/"));
    const uncatalogued = copyClosure(repoRoot, publicRoutes).filter((path) => listed[path]);
    if (uncatalogued.length) expect(indexableLocales()).toEqual(["bg"]);
  });
});
