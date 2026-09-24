import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  footerNav,
  journeyHelpNav,
  journeyNav,
  linked,
  myJourneyNav,
  publicPrimaryNav,
  publicUtilityNav,
  workspacePrimaryNav,
  workspaceSecondaryNav,
} from "./navigation";

const appDir = fileURLToPath(new URL("../../../app", import.meta.url));

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

/** Routes with their own page; catch-all 404 pages do not count as a destination. */
const routePatterns = pageFiles(appDir)
  .map((file) => relative(appDir, file).split(sep).slice(0, -1))
  .filter((segments) => !segments.some((segment) => segment.startsWith("[...")))
  .map((segments) => {
    const parts = segments
      .filter((segment) => !/^\(.*\)$/.test(segment))
      .map((segment) => (/^\[.*\]$/.test(segment) ? "[^/]+" : segment));
    return new RegExp(`^/${parts.join("/")}$`);
  });

function routeExists(href: string): boolean {
  return routePatterns.some((pattern) => pattern.test(href));
}

describe("navigation registry (§06)", () => {
  it("links only routes that have a page", () => {
    const hrefs = [
      ...linked([...publicPrimaryNav, ...publicUtilityNav, myJourneyNav, ...footerNav], "bg"),
      ...linked([...journeyNav, journeyHelpNav], "bg"),
      ...linked([...workspacePrimaryNav, ...workspaceSecondaryNav]),
    ].map((item) => item.href);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(routeExists(href), href).toBe(true);
  });

  it("keeps the spec's destinations and order", () => {
    expect(publicPrimaryNav.map((item) => item.label)).toEqual([
      "buy",
      "rent",
      "sellLet",
      "areas",
      "howWeHelp",
    ]);
    expect(publicUtilityNav.map((item) => item.label)).toEqual(["saved", "contact"]);
    expect(journeyNav.map((item) => item.label)).toEqual([
      "overview",
      "properties",
      "appointments",
      "messages",
      "documents",
    ]);
    expect(workspacePrimaryNav.map((item) => item.label)).toEqual([
      "today",
      "inbox",
      "cases",
      "properties",
      "calendar",
    ]);
    expect(workspaceSecondaryNav.map((item) => item.label)).toEqual([
      "contentApprovals",
      "serviceOperations",
      "reports",
      "settings",
    ]);
  });

  it("keeps Today, Inbox and Calendar primary on phones", () => {
    expect(
      workspacePrimaryNav.filter((item) => item.mobilePrimary).map((item) => item.label),
    ).toEqual(["today", "inbox", "calendar"]);
  });

  it("prefixes public items with the locale and leaves unbuilt items out", () => {
    const items = linked(
      [
        { label: "buy", screen: "P02", path: "/buy" },
        { label: "rent", screen: "P02", path: null },
      ],
      "he",
    );
    expect(items.map((item) => item.href)).toEqual(["/he/buy"]);
  });
});
