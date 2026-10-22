import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { gateIds } from "@/release/schemas";
import type { ReleaseOverview } from "@/server/ops/readiness-view";
import { operationsCopy } from "./copy";
import { ReleaseReadinessScreen } from "./readiness-screen";

function missing(): ReleaseOverview {
  return {
    policyMatches: true,
    summary: {
      release: { sha: null },
      snapshotState: "missing",
      snapshot: null,
      verdict: "blocked",
      gates: gateIds.map((id) => ({ id, status: "blocked", blockers: ["no_snapshot"] })),
    },
    gates: gateIds.map((id) => ({
      id,
      status: "blocked",
      blockers: ["no_snapshot"],
      affects: id === "R01" ? ["R10", "R12"] : [],
      requirements: [{ type: "first_party_runtime_report", result: "not_confirmed", evidence: [] }],
    })),
  };
}
afterEach(cleanup);
describe.each(["bg", "en", "ru"])("W14 release checks in %s", (locale) => {
  it("names the absent proof honestly and opens requirements without suggesting a release", () => {
    const copy = operationsCopy(locale);
    render(<ReleaseReadinessScreen locale={locale} view={missing()} />);
    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeVisible();
    expect(screen.getByText(copy.noCurrentReport)).toBeVisible();
    expect(screen.queryByText(copy.recordedPass)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.checkAgain })).toHaveAttribute(
      "href",
      `/${locale}/operations/readiness?read=saved`,
    );
  });
  it("shows runtime proof and its impact, with GET-only checks and no repeated action", () => {
    const copy = operationsCopy(locale);
    const { container } = render(
      <ReleaseReadinessScreen locale={locale} view={missing()} selected="R01" impact />,
    );
    expect(screen.getByText(copy.requirements.first_party_runtime_report)).toBeVisible();
    expect(screen.getByText(copy.checkOnly)).toBeVisible();
    expect(screen.getByRole("link", { name: copy.gates.R10.title })).toHaveAttribute(
      "href",
      `/${locale}/operations/readiness/R10`,
    );
    expect(container.querySelector("form")).toBeNull();
    const primary = container.cloneNode(true) as HTMLElement;
    for (const details of primary.querySelectorAll("details")) details.remove();
    expect(within(primary).queryByText("no_snapshot")).not.toBeInTheDocument();
    expect(primary.textContent).not.toContain("first_party_runtime_report");
  });
});
