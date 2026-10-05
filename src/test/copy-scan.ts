// Finds interface copy written in TypeScript instead of the message catalogs: rules R1-R6 of
// design/i18n-uncatalogued-copy-plan.md §3.3. src/i18n/copy-guard.test.ts holds the result to a
// ratchet baseline. A hit is one string literal, template or JSX text node.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import ts from "typescript";

export type CopyRule = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";
export interface CopyHit {
  readonly rule: CopyRule;
  readonly line: number;
  readonly text: string;
}

const localeCodes = new Set(["bg", "en", "ru", "de", "nl", "el", "he"]);

/** UI code: the three hosts' routes and everything they render from. */
const roots = ["app/public", "app/client", "app/staff", "src/features", "src/ui", "src/i18n"];

/** Not interface copy, or governed elsewhere (SEO is frozen; endonyms are invariant by design). */
const outOfScope = [
  /\.d\.ts$/,
  /\.(test|spec|stories)\.tsx?$/,
  /\/(testing|fixtures?)\//,
  /(^|\/)(seed|fixtures?)[^/]*\.tsx?$/,
  /^src\/ui\/specimen\//,
  /^src\/ui\/form\/specimen/,
  /\/\(dev\)\//,
  /^src\/i18n\/(seo|structured-data)\.ts$/,
  /^src\/i18n\/config\.ts$/,
];

export function isCopyScope(path: string): boolean {
  return (
    /\.tsx?$/.test(path) &&
    roots.some((root) => path.startsWith(`${root}/`)) &&
    !outOfScope.some((pattern) => pattern.test(path))
  );
}

/** Repository-relative paths (forward slashes) of every file the guard reads. */
export function copyScopeFiles(repoRoot: string): string[] {
  return roots
    .flatMap((root) =>
      readdirSync(join(repoRoot, root), { recursive: true, encoding: "utf8" }).map(
        (entry) => `${root}/${entry.split("\\").join("/")}`,
      ),
    )
    .filter(isCopyScope)
    .sort();
}

const letter = /\p{L}/u;
const scriptPatterns = [
  /\p{Script=Cyrillic}/u,
  /\p{Script=Greek}/u,
  /\p{Script=Hebrew}/u,
  /\p{Script=Latin}/u,
];
function scriptCount(values: readonly string[]): number {
  return scriptPatterns.filter((pattern) => values.some((value) => pattern.test(value))).length;
}

/** Class lists, paths, identifiers, URLs and codes: strings with letters that are not prose. */
function isTechnical(text: string): boolean {
  // Lower-case tokens; parentheses are left out so "(optional)" still reads as a word.
  if (/^[a-z0-9_\-./:#@?=&%[\]{}*+,;|~^$!\\<>'"`]+$/.test(text)) return true;
  if (/^[A-Z0-9_\-./:]+$/.test(text)) return true;
  if (/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)+$/.test(text)) return true;
  if (/^(https?:|mailto:|tel:|\/|\.\/|#)/.test(text)) return true;
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(text)) return true;
  const tokens = text.split(/\s+/);
  return (
    tokens.length > 1 &&
    tokens.every((token) => /^[a-z0-9\-:[\]/.%()_!#,&>*~=@]+$/.test(token)) &&
    tokens.some((token) => /[-:[]/.test(token))
  );
}

export class CopyScanner {
  readonly #invariants: RegExp;

  /** `invariants`: brand, units, zone and other strings that read the same in every locale. */
  constructor(invariants: readonly string[]) {
    const alternatives = [...invariants]
      .sort((a, b) => b.length - a.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Whole words only: "PNG" is invariant, the letters of "PNGs" are not.
    this.#invariants = alternatives.length
      ? new RegExp(`(?<!\\p{L})(?:${alternatives.join("|")})(?!\\p{L})`, "gu")
      : /(?!)/gu;
  }

  /**
   * The text that would need translating, or null when only invariants and symbols remain.
   * "multiScript" (R2, R3: the same message in several scripts is copy by construction) keeps any
   * letters; "plain" also drops technical tokens (classes, paths, identifiers, codes); "prose"
   * also drops single lower-case words, which are keys ("saved"), not labels.
   */
  copyText(text: string, mode: "multiScript" | "plain" | "prose"): string | null {
    const rest = text.replace(this.#invariants, " ").replace(/\s+/g, " ").trim();
    if (!letter.test(rest)) return null;
    if (mode === "multiScript") return rest;
    if (isTechnical(rest)) return null;
    if (mode === "plain") return rest;
    const isProse =
      /\s/.test(rest) ||
      (rest.match(/[^\p{ASCII}]/gu)?.length ?? 0) >= 2 ||
      /^[A-Z][a-z]{2,}/.test(rest);
    return isProse ? rest : null;
  }

  scan(path: string, source: string): CopyHit[] {
    const file = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const labelled = path.endsWith(".tsx") || /(^|\/)actions\.ts$/.test(path);
    const hits: CopyHit[] = [];
    const claimed = new Set<ts.Node>();
    const record = (rule: CopyRule, node: ts.Node, text: string) => {
      if (claimed.has(node)) return;
      claimed.add(node);
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      hits.push({ rule, line, text: text.slice(0, 80) });
    };

    const visit = (node: ts.Node): void => {
      if (isIgnored(node)) return;
      if (ts.isArrayLiteralExpression(node)) claimMultiScript("R3", node.elements);
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression))
        claimMultiScript("R2", node.arguments);
      if (ts.isJsxText(node)) {
        const text = this.copyText(node.text, "plain");
        if (text) record("R5", node, text);
        return;
      }
      if (isStringNode(node)) classify(node);
      ts.forEachChild(node, visit);
    };

    // R2 `s(bg, ru, en)` calls and R3 tuples of 2, 3 or 7 strings in two or more scripts.
    const claimMultiScript = (rule: "R2" | "R3", items: ts.NodeArray<ts.Expression>) => {
      if (items.length < 2 || !items.every(isStringNode)) return;
      if (rule === "R3" && ![2, 3, 7].includes(items.length)) return;
      const values = items.map(stringValue);
      if (values.every((value) => localeCodes.has(value))) return;
      if (scriptCount(values) < 2) return;
      items.forEach((item, index) => {
        const text = this.copyText(values[index] ?? "", "multiScript");
        if (text) record(rule, item, text);
      });
    };

    const classify = (node: ts.Node) => {
      const value = stringValue(node);
      const plain = this.copyText(value, "plain");
      if (!plain) return;
      if (inLocaleContainer(node)) return record("R1", node, plain);
      const prose = this.copyText(value, "prose");
      if (!prose) return;
      if (inLocaleBranch(node)) return record("R4", node, prose);
      const jsx = jsxOwner(node);
      if (jsx === "child" || (jsx && proseAttributes.has(jsx))) return record("R5", node, prose);
      const owner = node.parent;
      if (
        labelled &&
        owner &&
        ts.isPropertyAssignment(owner) &&
        owner.initializer === node &&
        labelProperties.has(propertyName(owner) ?? "")
      )
        record("R6", node, prose);
    };

    visit(file);
    return hits;
  }
}

const proseAttributes = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
  "label",
  "hint",
  "description",
]);
const labelProperties = new Set(["label", "title", "message", "error", "body", "text"]);

function isStringNode(node: ts.Node): node is ts.StringLiteral | ts.TemplateLiteral {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  );
}

function stringValue(node: ts.Node): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  return "";
}

function propertyName(node: ts.PropertyAssignment): string | null {
  const name = node.name;
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current)
  )
    current = current.expression;
  return current;
}

function within(node: ts.Node, container: ts.Node | undefined): boolean {
  return (
    Boolean(container) && node.pos >= (container?.pos ?? 0) && node.end <= (container?.end ?? 0)
  );
}

/** Positions that never render: types, module names, keys, comparisons, errors, logs, classes. */
function isIgnored(node: ts.Node): boolean {
  if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    return true;
  const parent = node.parent;
  if (!parent) return false;
  if (isStringNode(node)) {
    if (
      (ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) ||
      (ts.isCaseClause(parent) && parent.expression === node) ||
      (ts.isBinaryExpression(parent) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken,
        ].includes(parent.operatorToken.kind)) ||
      ts.isExpressionStatement(parent)
    )
      return true;
  }
  if (ts.isNewExpression(node) && /Error$/.test(node.expression.getText())) return true;
  if (ts.isThrowStatement(node)) return true;
  if (
    ts.isCallExpression(node) &&
    /^(console\.|logger\.|cx$|clsx$|buttonClass$|cva$|twMerge$)/.test(node.expression.getText())
  )
    return true;
  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    /^generate(Metadata|Viewport)$/.test(node.name.text)
  )
    return true;
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    /^(metadata|viewport)$/.test(node.name.text)
  )
    return true;
  return (
    ts.isJsxAttribute(node) &&
    /^(className|href|src|id|key|name|type|rel)$/.test(node.name.getText())
  );
}

/** R1: inside `const en = {...}` or a `bg: ...` property of a locale-keyed object. */
function inLocaleContainer(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name) &&
      localeCodes.has(parent.name.text) &&
      within(node, parent.initializer)
    )
      return true;
    if (ts.isPropertyAssignment(parent) && localeCodes.has(propertyName(parent) ?? "")) {
      const value = unwrap(parent.initializer);
      if (!isStringNode(value)) return true;
      // `{ bg: "…", en: "…" }`: a single `en: "x"` property is not a dictionary.
      const siblings = (parent.parent as ts.ObjectLiteralExpression).properties.filter(
        (property) =>
          ts.isPropertyAssignment(property) &&
          localeCodes.has(propertyName(property) ?? "") &&
          isStringNode(unwrap(property.initializer)),
      );
      if (siblings.length >= 2) return true;
    }
  }
  return false;
}

const localeCondition =
  /\b(?:locale|lang|language|publicLocale|staffLocale)\s*(?:===|!==|==|!=)\s*["'`](\w\w)["'`]|["'`](\w\w)["'`]\s*(?:===|!==)\s*(?:locale|lang)\b/;

function isLocaleCondition(expression: ts.Expression): boolean {
  const match = expression.getText().match(localeCondition);
  return Boolean(match && localeCodes.has(match[1] ?? match[2] ?? ""));
}

/** R4: a branch of `locale === "bg" ? … : …` or `if (locale === "bg") …`. */
function inLocaleBranch(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isConditionalExpression(parent) &&
      !within(node, parent.condition) &&
      isLocaleCondition(parent.condition)
    )
      return true;
    if (
      ts.isIfStatement(parent) &&
      !within(node, parent.expression) &&
      isLocaleCondition(parent.expression)
    )
      return true;
  }
  return false;
}

/** R5: the JSX attribute a string is the value of, or "child" for `{"…"}` inside an element. */
function jsxOwner(node: ts.Node): string | "child" | null {
  let current: ts.Node = node;
  let parent = node.parent;
  while (
    parent &&
    (ts.isConditionalExpression(parent) ||
      ts.isParenthesizedExpression(parent) ||
      (ts.isBinaryExpression(parent) &&
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
        ].includes(parent.operatorToken.kind)))
  ) {
    if (ts.isConditionalExpression(parent) && parent.condition === current) return null;
    current = parent;
    parent = parent.parent;
  }
  if (!parent) return null;
  if (ts.isJsxAttribute(parent)) return parent.name.getText();
  if (ts.isJsxExpression(parent)) {
    const owner = parent.parent;
    if (owner && ts.isJsxAttribute(owner)) return owner.name.getText();
    if (owner && (ts.isJsxElement(owner) || ts.isJsxFragment(owner))) return "child";
  }
  return null;
}

/** Module specifiers resolved to repository files (for screen import closures). */
export function localImports(repoRoot: string, path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifiers.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      specifiers.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return specifiers.flatMap((specifier) => {
    const base = specifier.startsWith("@/")
      ? `src/${specifier.slice(2)}`
      : specifier.startsWith(".")
        ? normalize(join(dirname(path), specifier))
            .split("\\")
            .join("/")
        : null;
    if (!base) return [];
    const found = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
      (candidate) => /\.tsx?$/.test(candidate) && existsSync(join(repoRoot, candidate)),
    );
    return found ? [found] : [];
  });
}

/** In-scope files reachable from `entries` through in-scope modules only. */
export function copyClosure(repoRoot: string, entries: readonly string[]): string[] {
  const seen = new Set(entries);
  const queue = [...entries];
  while (queue.length) {
    const path = queue.pop() ?? "";
    if (!isCopyScope(path)) continue;
    for (const target of localImports(repoRoot, path, readFileSync(join(repoRoot, path), "utf8")))
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
  }
  return [...seen].filter(isCopyScope).sort();
}
