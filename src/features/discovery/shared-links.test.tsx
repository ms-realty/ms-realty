import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formFields } from "@/ui/form/contract";
import { discoveryCopy } from "./copy";
import { shareCopy } from "./share-copy";
import type { CreatorLinks, SharedLinkView } from "./share-model";
import { type RevokeShareAction, type ShareRevokeState, shareFields } from "./share-state";
import { SharedLinks } from "./shared-links";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const labels = shareCopy("en");
const token = "T".repeat(43);
const key = "30000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000001";
const moment = (dateTime: string, label: string) => ({ dateTime, label });

function link(overrides: Partial<SharedLinkView> = {}): SharedLinkView {
  return {
    id,
    url: `https://example.test/en/share/${token}`,
    references: ["MS-00001", "MS-00002"],
    state: "active",
    created: moment("2026-03-01T12:00:00.000Z", "1 Mar 2026, 14:00 EET"),
    expires: moment("2026-03-08T12:00:00.000Z", "8 Mar 2026, 14:00 EET"),
    revoked: null,
    revokeKey: key,
    ...overrides,
  };
}
const ok = (...links: SharedLinkView[]): CreatorLinks => ({ status: "ok", links });
const idle: ShareRevokeState = { operationId: key, outcome: { kind: "idle" } };

function mount(links: CreatorLinks | null, revoke?: RevokeShareAction) {
  return render(
    <SharedLinks
      locale="en"
      copy={discoveryCopy("en")}
      labels={labels}
      links={links}
      revoke={revoke ?? vi.fn(async () => idle)}
    />,
  );
}
const card = () => screen.getByRole("article");
const revokeButton = () => screen.getByRole("button", { name: labels.revokeNow });
const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByText(labels.revoke));

describe("X11M shared links section", () => {
  it("says nothing is listed for a browser without a creator cookie and explains a lost session", () => {
    mount(null);
    expect(screen.getByRole("heading", { level: 2, name: labels.linksTitle })).toBeVisible();
    expect(screen.getByText(labels.linksEmpty)).toBeVisible();
    // The viewing link cannot restore management; urgent concerns go to the agency.
    expect(screen.getByText(labels.lostBody)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send an inquiry" })).toHaveAttribute(
      "href",
      "/en/inquire?purpose=question",
    );
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("names a failed read without pretending the list is empty", () => {
    mount({ status: "failed" });
    expect(screen.getByText(labels.linksFailed)).toBeVisible();
    expect(screen.queryByText(labels.linksEmpty)).toBeNull();
  });

  it("shows the public link, listing identities, actual expiry with zone, copy and revoke", () => {
    mount(ok(link()));
    const scope = within(card());
    expect(scope.getByRole("heading", { name: labels.linkTitle })).toBeVisible();
    expect(scope.getByText(`https://example.test/en/share/${token}`)).toBeVisible();
    expect(scope.getByRole("button", { name: labels.copy })).toBeVisible();
    expect(scope.getByText(labels.statusActive)).toBeVisible();
    const expires = scope.getByText("8 Mar 2026, 14:00 EET");
    expect(expires.tagName).toBe("TIME");
    expect(expires).toHaveAttribute("datetime", "2026-03-08T12:00:00.000Z");
    expect(scope.getByRole("link", { name: "MS-00001" })).toHaveAttribute(
      "href",
      "/en/properties/MS-00001/ms-00001",
    );
    expect(scope.getByRole("link", { name: labels.viewAs })).toHaveAttribute(
      "href",
      `/en/share/${token}`,
    );
    expect(scope.getByText(labels.revoke)).toBeVisible();
  });

  it("marks a link in its last day as expiring", () => {
    mount(ok(link({ state: "expiring" })));
    expect(within(card()).getByText(labels.statusExpiring)).toBeVisible();
    expect(within(card()).getByRole("button", { name: labels.copy })).toBeVisible();
  });

  it("offers no copy or revoke for an expired or already revoked link and points to a new one", () => {
    mount(
      ok(
        link({ state: "expired", expires: moment("2026-03-01T00:00:00.000Z", "1 Mar 2026") }),
        link({
          id: "20000000-0000-4000-8000-000000000002",
          state: "revoked",
          revoked: moment("2026-03-02T09:30:00.000Z", "2 Mar 2026, 11:30 EET"),
        }),
      ),
    );
    const [expired, revoked] = screen.getAllByRole("article");
    for (const entry of [expired, revoked]) {
      expect(within(entry as HTMLElement).queryByRole("button")).toBeNull();
      expect(within(entry as HTMLElement).queryByText(token, { exact: false })).toBeNull();
      expect(within(entry as HTMLElement).getByText(labels.renew)).toBeVisible();
    }
    // The state word appears as the badge and as the label of the expiry time.
    expect(expired).toHaveAttribute("data-share-state", "expired");
    expect(within(expired as HTMLElement).getAllByText(labels.expiredAt)).toHaveLength(2);
    expect(revoked).toHaveAttribute("data-share-state", "revoked");
    expect(within(revoked as HTMLElement).getByText("2 Mar 2026, 11:30 EET")).toBeVisible();
  });
});

describe("revoking a link", () => {
  it("explains what stops and what cannot be recalled before the confirming button", async () => {
    const user = userEvent.setup();
    mount(ok(link()));
    await open(user);
    expect(screen.getByText(labels.revokeExplain)).toBeVisible();
    expect(revokeButton()).toBeVisible();
  });

  it("replaces the link actions with Revoked and its time after the server confirms", async () => {
    const user = userEvent.setup();
    const revoke = vi.fn<RevokeShareAction>(async (_previous, data) => ({
      operationId: String(data.get(formFields.operationId)),
      outcome: {
        kind: "revoked",
        revokedAt: moment("2026-03-02T09:30:00.000Z", "2 Mar 2026, 11:30 EET"),
      },
    }));
    mount(ok(link()), revoke);
    await open(user);
    await user.click(revokeButton());

    const sent = revoke.mock.calls[0]?.[1];
    expect(sent?.get(formFields.operationId)).toBe(key);
    expect(sent?.get(shareFields.shareId)).toBe(id);
    await waitFor(() => expect(screen.getByText(labels.revokedDone)).toBeVisible());
    const scope = within(card());
    expect(scope.getByText("2 Mar 2026, 11:30 EET")).toBeVisible();
    expect(scope.queryByRole("button")).toBeNull();
    expect(scope.queryByText(`https://example.test/en/share/${token}`)).toBeNull();
    expect(scope.getByText(labels.renew)).toBeVisible();
    // The control that held focus is gone; focus lands on the result, not on the page body.
    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("shows Checking revocation, not success, when the outcome is unknown, and replays the same key", async () => {
    const user = userEvent.setup();
    const revoke = vi
      .fn<RevokeShareAction>()
      .mockImplementationOnce(async (_previous, data) => ({
        operationId: String(data.get(formFields.operationId)),
        outcome: { kind: "unknown" },
      }))
      .mockImplementationOnce(async (_previous, data) => ({
        operationId: String(data.get(formFields.operationId)),
        outcome: {
          kind: "revoked",
          revokedAt: moment("2026-03-02T09:30:00.000Z", "2 Mar 2026, 11:30 EET"),
        },
      }));
    mount(ok(link()), revoke);
    await open(user);
    await user.click(revokeButton());

    expect(await screen.findByText(labels.checkingBody)).toBeVisible();
    expect(within(card()).getByText(labels.checking, { selector: "span" })).toBeVisible();
    // The link may still work, so no success wording and no copy action.
    expect(screen.queryByText(labels.revokedDone)).toBeNull();
    expect(within(card()).queryByRole("button", { name: labels.copy })).toBeNull();

    await user.click(screen.getByRole("button", { name: labels.checkAgain }));
    await waitFor(() => expect(screen.getByText(labels.revokedDone)).toBeVisible());
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls[1]?.[1].get(formFields.operationId)).toBe(key);
    expect(revoke.mock.calls[1]?.[1].get(shareFields.shareId)).toBe(id);
  });

  it("rotates the key after a definite rejection and keeps the link manageable", async () => {
    const user = userEvent.setup();
    const next = "30000000-0000-4000-8000-000000000009";
    const revoke = vi.fn<RevokeShareAction>(async () => ({
      operationId: next,
      outcome: { kind: "rejected", code: "not_manageable" },
    }));
    mount(ok(link()), revoke);
    await open(user);
    await user.click(revokeButton());
    expect(await screen.findByText(labels.revokeFailed)).toBeVisible();
    await user.click(revokeButton());
    expect(revoke.mock.calls[1]?.[1].get(formFields.operationId)).toBe(next);
  });

  it("falls back to a replay of the same operation when the acknowledgment never arrives", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const revoke = vi
      .fn<RevokeShareAction>()
      .mockRejectedValueOnce(new Error("network lost"))
      .mockImplementation(async (_previous, data) => ({
        operationId: String(data.get(formFields.operationId)),
        outcome: { kind: "unknown" },
      }));
    mount(ok(link()), revoke);
    await open(user);
    await user.click(revokeButton());

    expect(await screen.findByText(labels.checkingBody)).toBeVisible();
    expect(within(card()).queryByRole("button", { name: labels.copy })).toBeNull();
    expect(within(card()).queryByText(labels.renew)).toBeNull();
    await user.click(screen.getByRole("button", { name: labels.checkAgain }));
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(2));
    expect(revoke.mock.calls[1]?.[1].get(formFields.operationId)).toBe(key);
    expect(revoke.mock.calls[1]?.[1].get(shareFields.shareId)).toBe(id);
  });
});

describe("copying a link", () => {
  it("copies the whole address, or selects it and says so when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    mount(ok(link()));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByRole("button", { name: labels.copy }));
    expect(writeText).toHaveBeenCalledWith(`https://example.test/en/share/${token}`);
    expect(await screen.findByText(labels.copied)).toBeVisible();

    writeText.mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: labels.copy }));
    expect(await screen.findByText(labels.copyFailed)).toBeVisible();
  });
});
