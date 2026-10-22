import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HistoryDetail } from "@/server/audit-history/queries";
import { auditHistoryCopy } from "./copy";
import { HistoryDetailScreen, HistoryErrorScreen, HistoryListScreen } from "./screens";

const view: HistoryDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  reference: "MS-SYNTHETIC",
  occurredAt: new Date(1_700_000_000_000),
  actor: { kind: "staff", currentName: "Synthetic current staff name" },
  change: {
    kind: "working",
    action: "draftSaved",
    fields: [{ key: "version", value: 3 }],
    reason: "Synthetic recorded reason",
    reasonDecision: null,
  },
  publication: { state: "working", locale: null, verifiedAt: null, current: null },
  technical: {
    action: "listing.draft.saved",
    actorId: "00000000-0000-4000-8000-000000000002",
    operationId: null,
    manifestId: null,
  },
};
afterEach(cleanup);
describe.each(["bg", "en", "ru"])("O26 listing history in %s", (locale) => {
  it("finds and opens a recorded listing change with native GET navigation", () => {
    const copy = auditHistoryCopy(locale);
    const { container } = render(
      <HistoryListScreen
        locale={locale}
        view={{ reference: "MS-SYNTHETIC", entries: [view], nextCursor: "synthetic-cursor" }}
      />,
    );
    expect(screen.getByLabelText(copy.reference)).toHaveValue("MS-SYNTHETIC");
    expect(container.querySelector("form")).toHaveAttribute("method", "get");
    expect(
      screen.getByRole("link", { name: `${copy.actions.draftSaved} · MS-SYNTHETIC` }),
    ).toHaveAttribute("href", `/${locale}/operations/history/${view.id}`);
    expect(screen.getByRole("link", { name: copy.next })).toHaveAttribute(
      "href",
      `/${locale}/operations/history?reference=MS-SYNTHETIC&cursor=synthetic-cursor`,
    );
    expect(screen.getByRole("link", { name: copy.privacy })).toHaveAttribute(
      "href",
      `/${locale}/operations/privacy`,
    );
  });
  it("states the recorded actor and reason and keeps internal action codes in technical details", () => {
    const copy = auditHistoryCopy(locale);
    const { container } = render(<HistoryDetailScreen locale={locale} view={view} />);
    expect(screen.getByText(copy.working)).toBeVisible();
    expect(screen.getByText("Synthetic current staff name")).toBeVisible();
    expect(screen.getByText(copy.currentName)).toBeVisible();
    expect(screen.getByText("Synthetic recorded reason")).toBeVisible();
    expect(screen.getByText(copy.noOldValues)).toBeVisible();
    expect(screen.getByRole("link", { name: copy.checkAgain })).toHaveAttribute(
      "href",
      `/${locale}/operations/history/${view.id}`,
    );
    expect(container.querySelector("form")).toBeNull();
    const primary = container.cloneNode(true) as HTMLElement;
    for (const details of primary.querySelectorAll("details")) details.remove();
    expect(within(primary).queryByText("listing.draft.saved")).toBeNull();
    expect(screen.queryByText(copy.published)).not.toBeInTheDocument();
  });
  it("labels absent history, actor, reason and invalid filters honestly", () => {
    const copy = auditHistoryCopy(locale);
    const rendered = render(
      <HistoryListScreen locale={locale} view={{ reference: "", entries: [], nextCursor: null }} />,
    );
    expect(screen.getByText(copy.emptyHelp)).toBeVisible();
    rendered.unmount();
    const detail = render(
      <HistoryDetailScreen
        locale={locale}
        view={{
          ...view,
          actor: { kind: "staff", currentName: null },
          change: { ...view.change, reason: null },
        }}
      />,
    );
    expect(screen.getByText(copy.unknownActor)).toBeVisible();
    expect(screen.getByText(copy.noReason)).toBeVisible();
    detail.unmount();
    render(<HistoryErrorScreen locale={locale} invalid />);
    expect(screen.getByText(copy.invalidHelp)).toBeVisible();
  });
  it("keeps verified historical publication distinct from the current restriction", () => {
    const copy = auditHistoryCopy(locale);
    render(
      <HistoryDetailScreen
        locale={locale}
        view={{
          ...view,
          change: { ...view.change, kind: "publication", action: "publicationDecision" },
          publication: {
            state: "published",
            locale: "bg",
            verifiedAt: view.occurredAt,
            current: "restricted",
          },
        }}
      />,
    );
    expect(screen.getByText(copy.published)).toBeVisible();
    expect(screen.getByText(copy.current.restricted)).toBeVisible();
    expect(screen.getByText(copy.boundary)).toBeVisible();
  });
});
