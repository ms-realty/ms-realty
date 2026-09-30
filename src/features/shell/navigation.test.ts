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

type Host = "public" | "client" | "staff";

/** Routes of one host that have their own page, as public URL patterns (no host prefix). */
function routePatterns(host: Host): RegExp[] {
  const root = join(appDir, host);
  return pageFiles(root)
    .map((file) => relative(root, file).split(sep).slice(0, -1))
    .filter((segments) => !segments.some((segment) => segment.startsWith("[...")))
    .map((segments) => {
      const parts = segments
        .filter((segment) => !/^\(.*\)$/.test(segment))
        .map((segment) => (/^\[.*\]$/.test(segment) ? "[^/]+" : segment));
      return new RegExp(`^/${parts.join("/")}$`);
    });
}

function routeExists(host: Host, href: string): boolean {
  return routePatterns(host).some((pattern) =>
    pattern.test(new URL(href, "https://test.invalid").pathname),
  );
}

describe("navigation registry (§06)", () => {
  it("links only routes that have a page on the item's host", () => {
    const hrefs: [Host, string][] = [
      ...linked([...publicPrimaryNav, ...publicUtilityNav, ...footerNav], "bg").map(
        (item) => ["public", item.href] as [Host, string],
      ),
      ...linked([myJourneyNav, ...journeyNav, journeyHelpNav], "bg").map(
        (item) => ["client", item.href] as [Host, string],
      ),
      ...linked([...workspacePrimaryNav, ...workspaceSecondaryNav], "bg").map(
        (item) => ["staff", item.href] as [Host, string],
      ),
    ];
    expect(hrefs.length).toBeGreaterThan(0);
    for (const [host, href] of hrefs) expect(routeExists(host, href), `${host} ${href}`).toBe(true);
  });

  it("keeps the spec's destinations and order", () => {
    expect(publicPrimaryNav.map((item) => item.label)).toEqual([
      "buy",
      "rent",
      "sellLet",
      "areas",
      "aboutContact",
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
      "inquiries",
      "cases",
      "inventory",
      "calendar",
      "tasks",
    ]);
    expect(workspaceSecondaryNav.map((item) => item.label)).toEqual(["hermes", "moreTools"]);
  });

  it("keeps Today, Inquiries and Calendar primary on phones", () => {
    expect(
      workspacePrimaryNav.filter((item) => item.mobilePrimary).map((item) => item.label),
    ).toEqual(["today", "inquiries", "calendar"]);
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
