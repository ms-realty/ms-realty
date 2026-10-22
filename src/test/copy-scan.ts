// Interface-copy placement guard, adapted from the retained Phase5 rules to the pinned
// parser. This inventory is separate from translation review and indexing authority.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { parse } from "@babel/parser";

export type CopyRule = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";
export interface CopyHit {
  readonly rule: CopyRule;
  readonly line: number;
  readonly text: string;
}
interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  loc?: { start: { line: number } } | null;
  [key: string]: unknown;
}
const nodeOf = (value: unknown): AstNode | undefined =>
  value !== null && typeof value === "object" && "type" in value && typeof value.type === "string"
    ? (value as AstNode)
    : undefined;
const nodesOf = (value: unknown): AstNode[] =>
  Array.isArray(value) ? value.flatMap((item) => nodeOf(item) ?? []) : [];
const localeCodes = new Set(["bg", "en", "ru", "de", "nl", "el", "he"]);
const roots = ["app/public", "app/client", "app/staff", "src/features", "src/ui", "src/i18n"];
const outOfScope = [
  /\.d\.ts$/,
  /\.(test|spec|stories)\.tsx?$/,
  /\/(testing|fixtures?)\//,
  /(^|\/)(seed|fixtures?)[^/]*\.tsx?$/,
  /^src\/ui\/specimen\//,
  /^src\/ui\/form\/specimen/,
  /\/\(dev\)\//,
  /^src\/i18n\/(seo|structured-data|config)\.ts$/,
];
export const isCopyScope = (path: string): boolean =>
  /\.tsx?$/.test(path) && !outOfScope.some((pattern) => pattern.test(path));
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
const ignoredFields = new Set([
  "loc",
  "extra",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "tokens",
]);
function children(node: AstNode): AstNode[] {
  return Object.entries(node).flatMap(([key, value]) =>
    ignoredFields.has(key) ? [] : Array.isArray(value) ? nodesOf(value) : (nodeOf(value) ?? []),
  );
}
function sourceTree(path: string, source: string): AstNode {
  const file = nodeOf(
    parse(source, {
      sourceType: "unambiguous",
      plugins: path.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"],
    }),
  );
  if (!file) throw new Error(`No syntax tree for ${path}`);
  return file;
}
const isString = (node: AstNode): boolean =>
  node.type === "StringLiteral" || node.type === "TemplateLiteral";
function stringValue(node: AstNode): string {
  if (node.type === "StringLiteral") return typeof node.value === "string" ? node.value : "";
  if (node.type === "TemplateLiteral")
    return nodesOf(node.quasis)
      .map((part) => {
        const value = part.value;
        return value !== null &&
          typeof value === "object" &&
          "cooked" in value &&
          typeof value.cooked === "string"
          ? value.cooked
          : "";
      })
      .join(" ");
  return "";
}
function nameOf(node: AstNode | undefined): string | null {
  if (node?.type === "Identifier" || node?.type === "JSXIdentifier")
    return typeof node.name === "string" ? node.name : null;
  return node?.type === "StringLiteral" ? stringValue(node) : null;
}
const propertyName = (node: AstNode): string | null => nameOf(nodeOf(node.key));
const textOf = (node: AstNode | undefined, source: string): string =>
  node ? source.slice(node.start ?? 0, node.end ?? 0) : "";
const within = (node: AstNode, container: AstNode | undefined): boolean =>
  Boolean(container) &&
  (node.start ?? 0) >= (container?.start ?? 0) &&
  (node.end ?? 0) <= (container?.end ?? 0);
const scriptPatterns = [
  /\p{Script=Cyrillic}/u,
  /\p{Script=Greek}/u,
  /\p{Script=Hebrew}/u,
  /\p{Script=Latin}/u,
];
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
const localeCondition =
  /\b(?:locale|lang|language|publicLocale|staffLocale)\s*(?:===|!==|==|!=)\s*["'`](\w\w)["'`]|["'`](\w\w)["'`]\s*(?:===|!==)\s*(?:locale|lang)\b/;
function isTechnical(text: string): boolean {
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
  constructor(invariants: readonly string[]) {
    const alternatives = [...invariants]
      .sort((a, b) => b.length - a.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    this.#invariants = alternatives.length
      ? new RegExp(`(?<!\\p{L})(?:${alternatives.join("|")})(?!\\p{L})`, "gu")
      : /(?!)/gu;
  }
  copyText(text: string, mode: "multiScript" | "plain" | "prose"): string | null {
    const rest = text.replace(this.#invariants, " ").replace(/\s+/g, " ").trim();
    if (!/\p{L}/u.test(rest)) return null;
    if (mode === "multiScript") return rest;
    if (isTechnical(rest)) return null;
    if (mode === "plain") return rest;
    return /\s/.test(rest) ||
      (rest.match(/[^\p{ASCII}]/gu)?.length ?? 0) >= 2 ||
      /^[A-Z][a-z]{2,}/.test(rest)
      ? rest
      : null;
  }
  scan(path: string, source: string): CopyHit[] {
    const file = sourceTree(path, source);
    const parents = new WeakMap<AstNode, AstNode>();
    const hits: CopyHit[] = [];
    const claimed = new Set<AstNode>();
    const labelled = path.endsWith(".tsx") || /(^|\/)actions\.ts$/.test(path);
    const record = (rule: CopyRule, node: AstNode, text: string) => {
      if (claimed.has(node)) return;
      claimed.add(node);
      hits.push({ rule, line: node.loc?.start.line ?? 1, text: text.slice(0, 80) });
    };
    const ancestorSome = (node: AstNode, predicate: (parent: AstNode) => boolean): boolean => {
      for (let parent = parents.get(node); parent; parent = parents.get(parent))
        if (predicate(parent)) return true;
      return false;
    };
    const inLocaleContainer = (node: AstNode): boolean =>
      ancestorSome(node, (parent) => {
        if (
          parent.type === "VariableDeclarator" &&
          localeCodes.has(nameOf(nodeOf(parent.id)) ?? "") &&
          within(node, nodeOf(parent.init))
        )
          return true;
        if (parent.type !== "ObjectProperty" || !localeCodes.has(propertyName(parent) ?? ""))
          return false;
        const value = nodeOf(parent.value);
        if (!value || !isString(value)) return true;
        return (
          nodesOf(parents.get(parent)?.properties).filter(
            (sibling) =>
              sibling.type === "ObjectProperty" &&
              localeCodes.has(propertyName(sibling) ?? "") &&
              Boolean(nodeOf(sibling.value) && isString(nodeOf(sibling.value) as AstNode)),
          ).length >= 2
        );
      });
    const inLocaleBranch = (node: AstNode): boolean =>
      ancestorSome(node, (parent) => {
        if (parent.type !== "ConditionalExpression" && parent.type !== "IfStatement") return false;
        const test = nodeOf(parent.test),
          match = textOf(test, source).match(localeCondition);
        return !within(node, test) && Boolean(match && localeCodes.has(match[1] ?? match[2] ?? ""));
      });
    const jsxOwner = (node: AstNode): string | null => {
      let current = node,
        parent = parents.get(node);
      while (
        parent &&
        [
          "ConditionalExpression",
          "ParenthesizedExpression",
          "LogicalExpression",
          "TSAsExpression",
          "TSSatisfiesExpression",
        ].includes(parent.type)
      ) {
        if (parent.type === "ConditionalExpression" && nodeOf(parent.test) === current) return null;
        current = parent;
        parent = parents.get(parent);
      }
      if (parent?.type === "JSXAttribute") return nameOf(nodeOf(parent.name));
      if (parent?.type === "JSXExpressionContainer") {
        const owner = parents.get(parent);
        if (owner?.type === "JSXAttribute") return nameOf(nodeOf(owner.name));
        if (owner?.type === "JSXElement" || owner?.type === "JSXFragment") return "child";
      }
      return null;
    };
    const ignored = (node: AstNode): boolean => {
      if (
        [
          "ImportDeclaration",
          "ExportAllDeclaration",
          "TSTypeAliasDeclaration",
          "TSInterfaceDeclaration",
          "TSTypeAnnotation",
          "TSTypeParameterDeclaration",
        ].includes(node.type)
      )
        return true;
      const parent = parents.get(node);
      if (node.type === "ExportNamedDeclaration" && !nodeOf(node.declaration)) return true;
      if (
        parent &&
        isString(node) &&
        ((parent.type === "ObjectProperty" && nodeOf(parent.key) === node) ||
          (parent.type === "MemberExpression" && nodeOf(parent.property) === node) ||
          parent.type === "SwitchCase" ||
          (parent.type === "BinaryExpression" &&
            ["===", "!==", "==", "!="].includes(String(parent.operator))) ||
          parent.type === "ExpressionStatement")
      )
        return true;
      if (node.type === "ThrowStatement") return true;
      if (node.type === "NewExpression" && /Error$/.test(textOf(nodeOf(node.callee), source)))
        return true;
      if (
        node.type === "CallExpression" &&
        /^(console\.|logger\.|cx$|clsx$|buttonClass$|cva$|twMerge$)/.test(
          textOf(nodeOf(node.callee), source),
        )
      )
        return true;
      if (
        node.type === "FunctionDeclaration" &&
        /^generate(Metadata|Viewport)$/.test(nameOf(nodeOf(node.id)) ?? "")
      )
        return true;
      if (
        node.type === "VariableDeclarator" &&
        /^(metadata|viewport)$/.test(nameOf(nodeOf(node.id)) ?? "")
      )
        return true;
      if (node.type === "JSXAttribute" && !proseAttributes.has(nameOf(nodeOf(node.name)) ?? ""))
        return true;
      return false;
    };
    const claimMultiScript = (rule: "R2" | "R3", items: AstNode[]) => {
      if (
        items.length < 2 ||
        !items.every(isString) ||
        (rule === "R3" && ![2, 3, 7].includes(items.length))
      )
        return;
      const values = items.map(stringValue);
      if (
        values.every((value) => localeCodes.has(value)) ||
        scriptPatterns.filter((pattern) => values.some((value) => pattern.test(value))).length < 2
      )
        return;
      items.forEach((node, i) => {
        const text = this.copyText(values[i] ?? "", "multiScript");
        if (text) record(rule, node, text);
      });
    };
    const visit = (node: AstNode) => {
      if (ignored(node)) return;
      // Register every child before classifying locale-keyed sibling values.
      const next = children(node);
      for (const child of next) parents.set(child, node);
      if (node.type === "ArrayExpression") claimMultiScript("R3", nodesOf(node.elements));
      if (node.type === "CallExpression" && nodeOf(node.callee)?.type === "Identifier")
        claimMultiScript("R2", nodesOf(node.arguments));
      if (node.type === "JSXText") {
        const text = this.copyText(typeof node.value === "string" ? node.value : "", "plain");
        if (text) record("R5", node, text);
        return;
      }
      if (isString(node)) {
        const plain = this.copyText(stringValue(node), "plain");
        if (plain) {
          if (inLocaleContainer(node)) record("R1", node, plain);
          else {
            const prose = this.copyText(stringValue(node), "prose"),
              jsx = jsxOwner(node),
              parent = parents.get(node);
            if (prose && inLocaleBranch(node)) record("R4", node, prose);
            else if (prose && (jsx === "child" || (jsx && proseAttributes.has(jsx))))
              record("R5", node, prose);
            else if (
              prose &&
              labelled &&
              parent?.type === "ObjectProperty" &&
              nodeOf(parent.value) === node &&
              labelProperties.has(propertyName(parent) ?? "")
            )
              record("R6", node, prose);
          }
        }
      }
      next.forEach(visit);
    };
    visit(file);
    return hits;
  }
}

export function localImports(repoRoot: string, path: string, source: string): string[] {
  const specifiers: string[] = [];
  const visit = (node: AstNode) => {
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)
    ) {
      const imported = nodeOf(node.source);
      if (imported?.type === "StringLiteral") specifiers.push(stringValue(imported));
    }
    if (node.type === "ImportExpression") {
      const imported = nodeOf(node.source);
      if (imported?.type === "StringLiteral") specifiers.push(stringValue(imported));
    }
    if (node.type === "CallExpression" && nodeOf(node.callee)?.type === "Import") {
      const imported = nodesOf(node.arguments)[0];
      if (imported?.type === "StringLiteral") specifiers.push(stringValue(imported));
    }
    children(node).forEach(visit);
  };
  visit(sourceTree(path, source));
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
export function copyClosure(repoRoot: string, entries: readonly string[]): string[] {
  const seen = new Set(entries),
    queue = [...entries];
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
