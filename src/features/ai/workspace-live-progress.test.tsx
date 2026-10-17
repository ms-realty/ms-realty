import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceLiveProgress } from "./workspace-live-progress";
import type { WorkspaceProgressView } from "./workspace-progress";

const id = "10000000-0000-4000-8000-000000000001";
const latestUrl = `/en/operations/assistance/research/${id}`;
const fetchProgress = vi.fn<typeof fetch>();
function progress(changes: Partial<WorkspaceProgressView> = {}): WorkspaceProgressView {
  return {
    state: "queued",
    steps: 0,
    maxSteps: 8,
    reservedCostMicros: 25000,
    actualCostMicros: null,
    hasRun: true,
    recovery: { canResume: false, requiresUnknownAck: false },
    sourceChanged: false,
    ...changes,
  };
}
function form(initial = progress(), locale = "en") {
  return render(
    <>
      <label>
        Unsaved correction
        <textarea defaultValue="Original correction" />
      </label>
      <WorkspaceLiveProgress
        initial={initial}
        locale={locale}
        workspaceId={id}
        latestUrl={latestUrl}
      />
    </>,
  );
}
async function advance(ms = 3000) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}
function count(label: string) {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling;
}
beforeEach(() => {
  vi.useFakeTimers();
  fetchProgress.mockReset();
  vi.stubGlobal("fetch", fetchProgress);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(["bg", "ru", "en"])("F29 live progress in %s", (locale) => {
  it("updates state, steps and cost without navigating or discarding unrelated input", async () => {
    const copy = workspaceCopy(locale);
    fetchProgress
      .mockResolvedValueOnce(
        Response.json(progress({ state: "running", steps: 2, actualCostMicros: 0 })),
      )
      .mockResolvedValueOnce(
        Response.json(
          progress({
            state: "waiting_input",
            steps: 3,
            recovery: { canResume: false, requiresUnknownAck: true },
          }),
        ),
      );
    form(progress(), locale);
    expect(screen.getByText(copy.liveProgress)).toBeVisible();
    const input = screen.getByRole("textbox", { name: "Unsaved correction" });
    fireEvent.change(input, { target: { value: "Keep this unsaved correction" } });
    await advance();
    expect(screen.getByRole("status")).toHaveTextContent(copy.states.running);
    expect(count(copy.steps)).toHaveTextContent("2");
    expect(screen.queryByText(copy.costUnknown)).not.toBeInTheDocument();
    expect(fetchProgress.mock.calls[0]).toMatchObject([
      `/${locale}/operations/assistance/research/${id}/progress`,
      { cache: "no-store", credentials: "same-origin", redirect: "error" },
    ]);
    expect(fetchProgress.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    await advance();
    expect(screen.getByRole("status")).toHaveTextContent(copy.states.waiting_input);
    expect(count(copy.steps)).toHaveTextContent("3");
    expect(screen.getByText(copy.costUnknown)).toBeVisible();
    expect(screen.getByText(copy.resultsReady)).toBeVisible();
    expect(screen.getByRole("link", { name: copy.openLatest })).toHaveAttribute("href", latestUrl);
    expect(screen.getByRole("link", { name: copy.openLatest })).toHaveTextContent(copy.openLatest);
    expect(input).toHaveValue("Keep this unsaved correction");
    await advance(30000);
    expect(fetchProgress).toHaveBeenCalledTimes(2);
  });
});

it("never overlaps reads and aborts an outstanding request on unmount", async () => {
  let resolve: (response: Response) => void = () => {};
  fetchProgress.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const current = form();
  await advance();
  const signal = fetchProgress.mock.calls[0]?.[1]?.signal;
  await advance(6000);
  expect(fetchProgress).toHaveBeenCalledTimes(1);
  current.unmount();
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => {
    resolve(Response.json(progress({ state: "completed", steps: 4 })));
  });
  await advance(30000);
  expect(fetchProgress).toHaveBeenCalledTimes(1);
});

it("clears scheduled reads before a pending panel unmounts", async () => {
  const current = form();
  current.unmount();
  await advance(30000);
  expect(fetchProgress).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("uses a new server snapshot and ignores an old request that completes after replacement", async () => {
  let resolve: (response: Response) => void = () => {};
  fetchProgress.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const current = render(
    <WorkspaceLiveProgress
      initial={progress()}
      locale="en"
      workspaceId={id}
      latestUrl={latestUrl}
    />,
  );
  await advance();
  const signal = fetchProgress.mock.calls[0]?.[1]?.signal;
  current.rerender(
    <WorkspaceLiveProgress
      initial={progress({ state: "completed", steps: 5, actualCostMicros: 1200 })}
      locale="en"
      workspaceId={id}
      latestUrl={latestUrl}
    />,
  );
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolve(Response.json(progress({ state: "running", steps: 1 })));
  });
  expect(screen.getByRole("status")).toHaveTextContent(workspaceCopy("en").states.completed);
  expect(count(workspaceCopy("en").steps)).toHaveTextContent("5");
  await advance(30000);
  expect(fetchProgress).toHaveBeenCalledTimes(1);
});

it("keeps a failed run and unknown cost visible without implying a prepared result", async () => {
  fetchProgress.mockResolvedValueOnce(Response.json(progress({ state: "failed", steps: 2 })));
  form();
  await advance();
  const copy = workspaceCopy("en");
  expect(screen.getByRole("status")).toHaveTextContent(copy.states.failed);
  expect(screen.getByText(copy.costUnknown)).toBeVisible();
  expect(screen.getByRole("link", { name: copy.openLatest })).toBeVisible();
  await advance(30000);
  expect(fetchProgress).toHaveBeenCalledTimes(1);
});

it.each([401, 403, 404])(
  "stops on access loss (%s) and marks previous progress as unconfirmed",
  async (status) => {
    fetchProgress.mockResolvedValueOnce(
      Response.json({ error: { message: "private failure" } }, { status }),
    );
    const { container } = form(progress({ state: "running", steps: 2 }));
    await advance();
    expect(screen.getByText(workspaceCopy("en").progressAccessChanged)).toBeVisible();
    expect(count(workspaceCopy("en").steps)).toHaveTextContent("2");
    expect(container.textContent).not.toContain("private failure");
    await advance(30000);
    expect(fetchProgress).toHaveBeenCalledTimes(1);
  },
);

it.each(["network", "server", "malformed"])(
  "keeps the last confirmed progress and a manual path after %s failure",
  async (failure) => {
    if (failure === "network")
      fetchProgress.mockRejectedValueOnce(new Error("private network detail"));
    else if (failure === "server")
      fetchProgress.mockResolvedValueOnce(
        Response.json({ error: "private failure" }, { status: 500 }),
      );
    else fetchProgress.mockResolvedValueOnce(Response.json({ ...progress(), state: "fabricated" }));
    const copy = workspaceCopy("en");
    const { container } = form(progress({ state: "running", steps: 2 }));
    await advance();
    expect(screen.getByText(copy.progressUnavailable)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(copy.states.running);
    expect(count(copy.steps)).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: copy.refresh })).toHaveAttribute("href", latestUrl);
    expect(container.textContent).not.toContain("private");
    await advance(30000);
    expect(fetchProgress).toHaveBeenCalledTimes(1);
  },
);

it("aborts a hung read and stops showing live updates", async () => {
  fetchProgress.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  form();
  await advance(3000);
  await advance(10000);
  expect(fetchProgress.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(screen.getByText(workspaceCopy("en").progressUnavailable)).toBeVisible();
  await advance(30000);
  expect(fetchProgress).toHaveBeenCalledTimes(1);
});

it("bounds repeated reads while a worker remains active", async () => {
  fetchProgress.mockImplementation(async () => Response.json(progress({ state: "running" })));
  form();
  await act(async () => vi.runAllTimersAsync());
  expect(fetchProgress.mock.calls.length).toBeGreaterThan(1);
  expect(screen.getByText(workspaceCopy("en").progressUnavailable)).toBeVisible();
  expect(vi.getTimerCount()).toBe(0);
});

it("stops on server-derived resumability and preserves unknown accounting", async () => {
  fetchProgress.mockResolvedValueOnce(
    Response.json(
      progress({
        state: "running",
        steps: 2,
        recovery: { canResume: true, requiresUnknownAck: true },
      }),
    ),
  );
  form();
  await advance();
  const copy = workspaceCopy("en");
  expect(screen.getByText(copy.recovery)).toBeVisible();
  expect(screen.getByText(copy.costUnknown)).toBeVisible();
  expect(screen.getByRole("link", { name: copy.openLatest })).toBeVisible();
  await advance(30000);
  expect(fetchProgress).toHaveBeenCalledTimes(1);
});

it("renders the server progress without polling an already terminal workspace", async () => {
  form(progress({ state: "completed", steps: 4, actualCostMicros: 1200 }));
  await advance(30000);
  expect(fetchProgress).not.toHaveBeenCalled();
  expect(
    within(screen.getByRole("region", { name: workspaceCopy("en").progress })).getByRole("status"),
  ).toHaveTextContent(workspaceCopy("en").states.completed);
});
