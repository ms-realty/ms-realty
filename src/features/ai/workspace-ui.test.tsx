import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceContext } from "@/domain/generative";
import type { FormAction, FormState } from "@/ui/form/contract";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceForm } from "./workspace-forms";
import {
  WorkspaceArtifactContent,
  WorkspaceProgress,
  WorkspaceSources,
  workspaceSourceTitle,
} from "./workspace-panels";
import { projectWorkspaceProgress } from "./workspace-progress";
import { emptyWorkspaceValues, type WorkspaceValues, type WorkspaceView } from "./workspace-types";

const id = "10000000-0000-4000-8000-000000000001";
const source = {
  key: "case:" + id,
  type: "case" as const,
  id,
  revision: "2",
  digest: "current-digest",
  title: "CASE-RESEARCH",
  audience: "internal" as const,
  text: "Exact source evidence. The lift is unconfirmed.",
  facts: { version: "2", reference: "CASE-RESEARCH", kind: "buyer" },
};
const context: WorkspaceContext = {
  sources: [source],
  digest: "context-current",
  pins: [source],
  truncated: false,
};
function state(values: Partial<WorkspaceValues> = {}): FormState<WorkspaceValues> {
  return {
    operationId: "original-signed-operation",
    expectedRevision: 2,
    responseId: "initial",
    values: { ...emptyWorkspaceValues, ...values },
    outcome: { kind: "idle" },
  };
}
const choices = {
  cases: [{ id, reference: "CASE-RESEARCH", title: "Synthetic case" }],
  inquiries: [{ id, reference: "RQ-RESEARCH", title: "" }],
  listings: [{ id, reference: "MS-RESEARCH", title: "" }],
};
const props = {
  locale: "en",
  mode: "create" as const,
  path: "/en/operations/assistance/research?draft=" + id,
  statusHref:
    "/en/operations/assistance/research/" +
    id +
    "?operation=original-signed-operation&command=create",
  retentionKey: "synthetic-staff:create:" + id,
  choices,
};
const noop: FormAction<WorkspaceValues> = async (previous) => previous;
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

function primaryText(container: HTMLElement) {
  const copy = container.cloneNode(true) as HTMLElement;
  for (const disclosure of copy.querySelectorAll("details")) disclosure.remove();
  return copy.textContent ?? "";
}

describe.each(["bg", "ru", "en"])("F29 goal-first staff work in %s", (locale) => {
  it("accepts a free goal without a task enum and offers friendly source references", () => {
    const { container } = render(
      <WorkspaceForm {...props} locale={locale} initialState={state()} action={noop} />,
    );
    const copy = workspaceCopy(locale);
    expect(screen.getByRole("textbox", { name: copy.goal })).toBeVisible();
    expect(screen.getByRole("textbox", { name: copy.goal })).toHaveAttribute("maxlength", "4000");
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(
      within(screen.getByRole("combobox", { name: copy.case })).getByRole("option", {
        name: "CASE-RESEARCH · Synthetic case",
      }),
    ).toHaveValue(id);
    expect(screen.getByRole("checkbox", { name: "MS-RESEARCH" })).toHaveAttribute(
      "name",
      "listingIds",
    );
    expect(screen.getByRole("button", { name: copy.create })).toBeVisible();
    expect(container.querySelector('[name="task"]')).toBeNull();
    expect(container.textContent).not.toContain(id);
  });

  it("labels completed research as prepared work and keeps costs explicit", () => {
    const view = {
      workspace: { state: "completed", errorCode: null },
      runs: [
        {
          steps: 3,
          budget: { maxSteps: 8 },
          reservedCostMicros: 25000,
          billingMode: "metered_usd",
          actualCostMicros: null,
          errorCode: null,
        },
      ],
      availability: { budget: { maxSteps: 8, maxCostMicros: 25000 } },
      checkpoints: [],
    } as unknown as WorkspaceView;
    render(<WorkspaceProgress locale={locale} view={projectWorkspaceProgress(view)} />);
    expect(screen.getByRole("status")).toHaveTextContent(workspaceCopy(locale).states.completed);
    expect(screen.getByText(workspaceCopy(locale).costUnknown)).toBeVisible();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
  });

  it("shows subscription limits without inventing a dollar charge", () => {
    const copy = workspaceCopy(locale);
    const { container } = render(
      <WorkspaceProgress
        locale={locale}
        view={{
          state: "running",
          steps: 2,
          maxSteps: 8,
          billingMode: "chatgpt_subscription",
          reservedCostMicros: null,
          actualCostMicros: null,
          hasRun: true,
          recovery: { canResume: false, requiresUnknownAck: false },
          sourceChanged: false,
        }}
      />,
    );
    expect(screen.getByText(copy.subscription, { exact: true })).toBeVisible();
    expect(screen.getByText(copy.subscriptionLimits, { exact: true })).toBeVisible();
    expect(screen.queryByText(copy.costUnknown)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.ceiling)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/USD|\$/);
  });
});

it("retains the full goal and selected context after a rejected submission", async () => {
  const action = vi.fn<FormAction<WorkspaceValues>>(async (previous, data) => ({
    ...previous,
    responseId: "rejected",
    values: {
      ...previous.values,
      goal: String(data.get("goal")),
      constraints: String(data.get("constraints")),
      caseId: String(data.get("caseId")),
      listingIds: data.getAll("listingIds").join("\n"),
    },
    outcome: {
      kind: "validation",
      code: "VALIDATION_FAILED",
      message: "Review the entry",
      fieldErrors: { goal: ["Add context"] },
    },
  }));
  render(<WorkspaceForm {...props} initialState={state()} action={action} />);
  await userEvent.type(
    screen.getByRole("textbox", { name: workspaceCopy("en").goal }),
    "Investigate quiet neighbourhoods and explain uncertainty.",
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: workspaceCopy("en").constraints }),
    "No invented facts\nKeep unknowns visible",
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: workspaceCopy("en").case }),
    id,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "MS-RESEARCH" }));
  await userEvent.click(screen.getByRole("button", { name: workspaceCopy("en").create }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(screen.getByRole("textbox", { name: workspaceCopy("en").goal })).toHaveValue(
    "Investigate quiet neighbourhoods and explain uncertainty.",
  );
  expect(screen.getByRole("textbox", { name: workspaceCopy("en").constraints })).toHaveValue(
    "No invented facts\nKeep unknowns visible",
  );
  expect(screen.getByRole("combobox", { name: workspaceCopy("en").case })).toHaveValue(id);
  expect(screen.getByRole("checkbox", { name: "MS-RESEARCH" })).toBeChecked();
});

it("restores an unsaved correction after refresh with newer sources, using the new revision", async () => {
  const copy = workspaceCopy("en"),
    initial = state({ goal: "Initial goal" });
  const first = render(
    <WorkspaceForm {...props} mode="message" initialState={initial} action={noop} />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: copy.message }), {
    target: { value: "Prioritise a quiet street. Do not infer availability." },
  });
  await waitFor(() =>
    expect(window.sessionStorage.getItem("msr-workspace-draft:" + props.retentionKey)).toContain(
      "Prioritise a quiet street",
    ),
  );
  first.unmount();
  const { container } = render(
    <WorkspaceForm
      {...props}
      mode="message"
      initialState={{ ...initial, expectedRevision: 3 }}
      action={noop}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: copy.message })).toHaveValue(
      "Prioritise a quiet street. Do not infer availability.",
    ),
  );
  expect(container.querySelector('[name="_expectedRevision"]')).toHaveValue("3");
});

it("locks an unknown outcome to its original operation and retains the entered goal", () => {
  render(
    <WorkspaceForm
      {...props}
      initialState={{
        ...state({ goal: "Keep this uncertain submission" }),
        outcome: {
          kind: "unknown",
          code: "OUTCOME_UNKNOWN",
          message: "Check original operation",
          status: { href: props.statusHref, label: "Original receipt" },
        },
      }}
      action={noop}
    />,
  );
  expect(
    screen.queryByRole("button", { name: workspaceCopy("en").create }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Original receipt" })).toHaveAttribute(
    "href",
    props.statusHref,
  );
  expect(screen.getByRole("textbox", { name: workspaceCopy("en").goal })).toHaveValue(
    "Keep this uncertain submission",
  );
});

it("does not reuse a stored review confirmation", () => {
  window.sessionStorage.setItem(
    "msr-workspace-draft:" + props.retentionKey,
    JSON.stringify({ reviewed: "yes", acknowledgeUnknown: "yes" }),
  );
  render(
    <WorkspaceForm
      {...props}
      mode="research"
      unknownProvider
      initialState={state()}
      action={noop}
    />,
  );
  expect(screen.getByRole("checkbox", { name: workspaceCopy("en").reviewed })).not.toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: workspaceCopy("en").unknownReview }),
  ).not.toBeChecked();
});

it("keeps diagnostic revisions in technical details and exact quotes behind their source disclosure", () => {
  const { container } = render(
    <WorkspaceSources
      locale="en"
      context={context}
      pins={[{ ...source, revision: "1", digest: "old-digest" }]}
    />,
  );
  expect(primaryText(container)).not.toContain("Current revision");
  expect(primaryText(container)).not.toContain("Saved revision");
  expect(screen.getByText(workspaceCopy("en").revisionMismatch)).toBeVisible();
  expect(screen.getByRole("link", { name: workspaceCopy("en").original })).toHaveAttribute(
    "href",
    "/en/cases/" + id,
  );
  expect(primaryText(container)).not.toContain(id);
  fireEvent.click(screen.getByText("Technical details"));
  expect(screen.getByText("Current revision: 2")).toBeVisible();
  expect(screen.getByText("Saved revision: 1")).toBeVisible();
  fireEvent.click(screen.getByText(workspaceCopy("en").sourceText));
  expect(screen.getByText(source.text)).toBeVisible();
});

it.each(["bg", "ru", "en"])(
  "keeps fixed internal headings and numbered revisions out of primary %s workbench content",
  (locale) => {
    const copy = workspaceCopy(locale);
    const fixedSources = [
      { ...source, key: "brief:" + id, title: "Current case brief" },
      { ...source, key: "history:" + id, title: "Case stage history" },
      { ...source, key: "message:" + id, type: "message" as const, title: "Case message" },
    ];
    const supplied = { ...context, sources: fixedSources };
    const artifact = {
      id,
      version: 3,
      state: "draft",
      contextDigest: context.digest,
      proposal: {
        kind: "buyer_handoff",
        title: "Prepared comparison",
        body: "Compare the supplied evidence.",
        requirements: "Quiet room",
        preferences: "Near transport",
        listingIds: [],
        citations: [{ source: fixedSources[0]?.key, quote: "The lift is unconfirmed." }],
      },
    } as unknown as WorkspaceView["artifacts"][number];
    const { container } = render(
      <>
        <WorkspaceSources locale={locale} context={supplied} pins={fixedSources} />
        <WorkspaceArtifactContent
          locale={locale}
          artifact={artifact}
          context={supplied}
          revision={7}
        />
      </>,
    );
    const primary = primaryText(container);
    expect(primary).not.toMatch(/\b(?:case|brief|operation)\b|операци|операци[яи]|\bдело\b/i);
    expect(primary).not.toContain(`${copy.version} 7`);
    expect(primary).not.toContain(`${copy.current}: 2`);
    expect(primary).not.toContain(`${copy.pinned}: 2`);
    for (const title of Object.values(copy.sourceTitles))
      expect(screen.getByRole("heading", { name: title })).toBeVisible();
    for (const item of fixedSources) {
      const originalTitle = screen.getByText(item.title, { exact: true });
      expect(originalTitle.closest("details")).not.toBeNull();
      expect(originalTitle).not.toBeVisible();
    }
    const revision = screen.getByText(`${copy.version} 7`, { exact: true });
    const details = revision.closest("details");
    expect(details).not.toBeNull();
    expect(revision).not.toBeVisible();
    fireEvent.click(details!.querySelector("summary")!);
    expect(revision).toBeVisible();
    expect(screen.getAllByText(`${copy.current}: 2`).every((node) => node.closest("details"))).toBe(
      true,
    );
    expect(
      workspaceSourceTitle(
        { ...source, type: "listing", audience: "approved_public", title: "Current case brief" },
        locale,
      ),
    ).toBe("Current case brief");
    expect(workspaceSourceTitle({ ...source, title: "Current case brief" }, locale)).toBe(
      "Current case brief",
    );
  },
);

it("renders exact cited evidence and buyer handoff requirements with honest manual review", () => {
  const artifact = {
    id,
    version: 1,
    state: "draft",
    contextDigest: context.digest,
    proposal: {
      kind: "buyer_handoff",
      title: "Buyer comparison",
      body: "Prepare options. Do not book a viewing.",
      requirements: "Quiet room",
      preferences: "Near transport",
      listingIds: [],
      citations: [{ source: source.key, quote: "The lift is unconfirmed." }],
    },
  } as unknown as WorkspaceView["artifacts"][number];
  const { container } = render(
    <WorkspaceArtifactContent locale="en" artifact={artifact} context={context} />,
  );
  expect(screen.getByText("The lift is unconfirmed.")).toBeVisible();
  expect(screen.getByText("Quiet room")).toBeVisible();
  expect(screen.getByRole("link", { name: "CASE-RESEARCH" })).toHaveAttribute(
    "href",
    "#workspace-source-case-" + id,
  );
  expect(primaryText(container)).not.toContain("buyer_handoff");
  cleanup();
  render(
    <WorkspaceForm
      {...props}
      mode="materialize"
      buyer
      parents={[{ type: "case", id, expectedVersion: 2, label: "CASE-RESEARCH" }]}
      initialState={state({ parent: "case" })}
      action={noop}
    />,
  );
  expect(screen.getByText(workspaceCopy("en").buyerHelp)).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: workspaceCopy("en").personReview }),
  ).not.toBeChecked();
  expect(screen.getByRole("button", { name: workspaceCopy("en").saveBuyer })).toBeVisible();
  expect(document.body.textContent).not.toContain(id);
});

it("keeps intent evidence as an internal source without inventing a message destination", () => {
  render(
    <WorkspaceSources
      locale="en"
      context={{
        ...context,
        sources: [
          { ...source, key: "intent:" + id, type: "message", title: "Your goal and corrections" },
        ],
      }}
      pins={[]}
    />,
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("renders only approved typed listing facts with exact price, area basis, zero bedrooms and source URL", async () => {
  const { WorkspaceListingFacts } = await import("./workspace-listing-facts");
  const approved = {
    ...source,
    type: "listing" as const,
    audience: "approved_public" as const,
    facts: {
      reference: "MS-SYNTHETIC",
      sourceUrl: "https://example.test/bg/properties/MS-SYNTHETIC/source",
      price: JSON.stringify({
        state: "known",
        value: { amountMinor: 9500001, currency: "EUR", period: "total", basis: "asking" },
      }),
      area: JSON.stringify({
        state: "known",
        value: { value: 68.125, unit: "m2", basis: "living" },
      }),
      bedrooms: JSON.stringify({ state: "known", value: 0 }),
      location: JSON.stringify({
        country: "BG",
        neighborhood: null,
        settlement: { name: "Сандански", id },
        municipality: null,
        district: null,
      }),
    },
  };
  const { container } = render(<WorkspaceListingFacts locale="en" source={approved} />);
  expect(screen.getByText("€95,000.01")).toBeVisible();
  expect(screen.getByText(/68\.125/)).toHaveTextContent("68.125 m²");
  expect(screen.getByText("Living area")).toBeVisible();
  expect(screen.getByText("0")).toBeVisible();
  expect(screen.getByText("Сандански")).toBeVisible();
  expect(screen.getByRole("link", { name: approved.facts.sourceUrl })).toHaveAttribute(
    "href",
    approved.facts.sourceUrl,
  );
  expect(container.textContent).not.toContain(id);
  cleanup();
  render(
    <WorkspaceListingFacts locale="en" source={{ ...approved, audience: "external_unverified" }} />,
  );
  expect(screen.queryByText("€95,000.01")).not.toBeInTheDocument();
});
it("preserves unknown and conflicting source states and refuses malformed fact data", async () => {
  const { WorkspaceListingFacts } = await import("./workspace-listing-facts");
  render(
    <WorkspaceListingFacts
      locale="en"
      source={{
        ...source,
        type: "listing",
        audience: "approved_public",
        facts: {
          reference: "MS-SYNTHETIC",
          price: JSON.stringify({ state: "conflicting", candidates: [1, 2] }),
          area: "not-json",
          bedrooms: JSON.stringify({ state: "withheld" }),
          sourceUrl: "javascript:invalid",
        },
      }}
    />,
  );
  expect(screen.getByText("Conflicting information")).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByText("1")).not.toBeInTheDocument();
  expect(screen.queryByText("2")).not.toBeInTheDocument();
});
