import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Capability, rolePresets } from "@/domain/capabilities";
import {
  agencyToolCapabilities,
  agencyTools,
  footerNav,
  journeyHelpNav,
  journeyNav,
  linked,
  myJourneyNav,
  permittedTools,
  permittedWorkspaceNav,
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
      ...linked(
        [...workspacePrimaryNav, ...workspaceSecondaryNav, ...Object.values(agencyTools).flat()],
        "bg",
      ).map((item) => ["staff", item.href] as [Host, string]),
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
      "reviews",
    ]);
    expect(workspacePrimaryNav.map((item) => item.label)).toEqual([
      "today",
      "inquiries",
      "cases",
      "inventory",
      "calendar",
      "tasks",
      "contacts",
    ]);
    expect(workspaceSecondaryNav.map((item) => item.label)).toEqual(["butler", "moreTools"]);
  });

  it("X02 keeps the drawn rows in order, then the working destinations the frame omits", () => {
    expect(agencyTools.work.map((item) => item.label)).toEqual([
      "today",
      "inquiries",
      "cases",
      "inventory",
      "imports",
      "calendar",
      "tasks",
      "contacts",
      "consultations",
      "coverage",
      "inbound",
      "keys",
      "complaints",
    ]);
    expect(agencyTools.management.map((item) => item.label)).toEqual([
      "agency",
      "pages",
      "reports",
      "team",
      "system",
      "jobs",
      "history",
      "privacy",
      "alerts",
    ]);
    // Everything the old «Операции» list and the phone More menu offered is still a row.
    const paths = Object.values(agencyTools)
      .flat()
      .map((item) => item.path);
    for (const path of [
      ...workspacePrimaryNav.map((item) => item.path),
      "/coverage",
      "/content",
      "/operations/keys",
      "/operations/complaints",
      "/operations/inbound",
      "/operations/jobs",
      "/operations/history",
      "/operations/privacy",
      "/operations/subscriptions",
      "/access/manage",
    ])
      expect(paths, String(path)).toContain(path);
  });

  it("X02 offers only built rows the person may open", () => {
    const rows = (held: readonly Capability[]) =>
      permittedTools("en", new Set(held))
        .filter((group) => group.section !== "personal")
        .map((group) => [group.section, group.items.map((item) => item.href)]);
    // No grants: the safe overview, with no inaccessible collection links.
    expect(rows([])).toEqual([["work", ["/en/today"]]]);
    // A coordinator reads no internal case notes: no coverage or incoming email.
    expect(rows(rolePresets.coordinator)).toEqual([
      [
        "work",
        [
          "/en/today",
          "/en/inquiries",
          "/en/cases",
          "/en/inventory",
          "/en/calendar",
          "/en/tasks",
          "/en/contacts",
        ],
      ],
    ]);
    expect(rows(rolePresets.assigned_broker)).toEqual([
      [
        "work",
        [
          "/en/today",
          "/en/inquiries",
          "/en/cases",
          "/en/inventory",
          "/en/calendar",
          "/en/tasks",
          "/en/contacts",
          "/en/coverage",
          "/en/operations/inbound",
        ],
      ],
    ]);
    expect(rows(agencyToolCapabilities)).toEqual([
      [
        "work",
        [
          "/en/today",
          "/en/inquiries",
          "/en/cases",
          "/en/inventory",
          "/en/operations/imports",
          "/en/calendar",
          "/en/tasks",
          "/en/contacts",
          "/en/coverage",
          "/en/operations/inbound",
          "/en/operations/keys",
          "/en/operations/complaints",
        ],
      ],
      [
        "management",
        [
          "/en/operations/agency",
          "/en/content",
          "/en/reports",
          "/en/access/manage",
          "/en/operations/readiness",
          "/en/operations/jobs",
          "/en/operations/history",
          "/en/operations/privacy",
          "/en/operations/subscriptions",
        ],
      ],
    ]);
  });

  it("keeps personal settings reachable without granting agency administration", () => {
    for (const held of [
      new Set<Capability>(),
      new Set(rolePresets.coordinator),
      new Set(rolePresets.manager),
    ]) {
      expect(
        permittedTools("en", held)
          .find((group) => group.section === "personal")
          ?.items.map((item) => item.href),
      ).toEqual(["/en/settings"]);
    }
    expect(
      permittedTools("en", new Set()).flatMap((group) => group.items.map((item) => item.href)),
    ).not.toContain("/en/access/manage");
  });

  it("hides ungranted collections and keeps a record-scoped capability navigable", () => {
    expect(permittedWorkspaceNav(new Set()).map((item) => item.label)).toEqual(["today"]);
    expect(permittedWorkspaceNav(new Set(["case.read"])).map((item) => item.label)).toEqual([
      "today",
      "cases",
    ]);
    expect(
      permittedTools("bg", new Set(), new Set(["case.read"])).flatMap((group) =>
        group.items.map((item) => item.href),
      ),
    ).toEqual(["/bg/today", "/bg/cases", "/bg/settings"]);
    expect(
      permittedTools("bg", new Set(), new Set(["audit.read", "listing.read"])).flatMap((group) =>
        group.items.map((item) => item.href),
      ),
    ).toEqual(["/bg/today", "/bg/inventory", "/bg/operations/history", "/bg/settings"]);
    expect(
      permittedTools("bg", new Set(), new Set(["audit.read"])).flatMap((group) =>
        group.items.map((item) => item.href),
      ),
    ).toEqual(["/bg/today", "/bg/settings"]);
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
