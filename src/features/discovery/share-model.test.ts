import { describe, expect, it } from "vitest";
import { analyticsPagePath } from "@/i18n/tracking";
import {
  type CreatorShare,
  moment,
  type RecipientReady,
  recipientSummary,
  recipientUrl,
  sharedLinkState,
  sharedLinkView,
  shareExpiringWindowMs,
} from "./share-model";

const now = new Date("2026-03-01T12:00:00.000Z");
const hours = (count: number) => new Date(now.getTime() + count * 3_600_000).toISOString();
const token = "T".repeat(43);

function share(overrides: Partial<CreatorShare> = {}): CreatorShare {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    token,
    references: ["MS-00001", "MS-00002"],
    createdAt: hours(-24),
    expiresAt: hours(24 * 6),
    revokedAt: null,
    status: "active",
    ...overrides,
  };
}

describe("shared link state", () => {
  it("is active until the last day, then expiring", () => {
    expect(sharedLinkState(share(), now)).toBe("active");
    const edge = share({
      expiresAt: new Date(now.getTime() + shareExpiringWindowMs).toISOString(),
    });
    expect(sharedLinkState(edge, now)).toBe("expiring");
    expect(sharedLinkState(share({ expiresAt: hours(2) }), now)).toBe("expiring");
  });

  it("takes revoked and expired from the server and fails closed on anything else", () => {
    expect(sharedLinkState(share({ status: "revoked", revokedAt: hours(-1) }), now)).toBe(
      "revoked",
    );
    expect(sharedLinkState(share({ status: "expired", expiresAt: hours(-1) }), now)).toBe(
      "expired",
    );
    expect(sharedLinkState(share({ status: "surprise" }), now)).toBe("expired");
  });
});

describe("shared link view", () => {
  const context = {
    locale: "en" as const,
    origin: "https://example.test",
    now,
    revokeKey: "30000000-0000-4000-8000-000000000001",
  };

  it("builds the absolute recipient link in the page locale and keeps listing identities", () => {
    const view = sharedLinkView(share(), context);
    expect(view.url).toBe(`https://example.test/en/share/${token}`);
    expect(view.references).toEqual(["MS-00001", "MS-00002"]);
    expect(view.state).toBe("active");
    expect(view.revokeKey).toBe(context.revokeKey);
    expect(view.revoked).toBeNull();
  });

  it("words expiry with the actual date, time and zone", () => {
    const view = sharedLinkView(share(), context);
    expect(view.expires?.dateTime).toBe(hours(24 * 6));
    expect(view.expires?.label).toMatch(/2026/);
    expect(view.expires?.label).toMatch(/EES?T|GMT\+[23]/);
    expect(moment("he", hours(1)).dateTime).toBe(hours(1));
  });

  it("carries the revocation time and drops nothing about an expired link", () => {
    const revoked = sharedLinkView(share({ status: "revoked", revokedAt: hours(-2) }), context);
    expect(revoked.state).toBe("revoked");
    expect(revoked.revoked?.dateTime).toBe(hours(-2));
    const expired = sharedLinkView(share({ status: "expired", expiresAt: hours(-3) }), context);
    expect(expired.state).toBe("expired");
    expect(expired.expires?.dateTime).toBe(hours(-3));
  });

  it("never lets a recipient URL stand in for anything but the viewing route", () => {
    expect(recipientUrl("https://example.test", "bg", token)).toBe(
      `https://example.test/bg/share/${token}`,
    );
  });
});

describe("recipient summary", () => {
  const card = (reference: string) =>
    ({ status: "public", reference, card: { reference } }) as RecipientReady["items"][number];
  const gone = (reference: string): RecipientReady["items"][number] => ({
    status: "unavailable",
    reference,
  });
  const ready = (items: RecipientReady["items"]): RecipientReady => ({
    status: "ready",
    expiresAt: hours(24),
    items,
  });

  it("counts what is shown and offers comparison only for two or three Listings", () => {
    expect(recipientSummary(ready([card("A"), card("B"), gone("C")]))).toEqual({
      total: 3,
      shown: 2,
      none: false,
      compareReferences: ["A", "B"],
    });
    expect(recipientSummary(ready([card("A"), gone("B")])).compareReferences).toBeNull();
    expect(
      recipientSummary(ready([card("A"), card("B"), card("C"), card("D")])).compareReferences,
    ).toBeNull();
  });

  it("reports an all-unavailable list", () => {
    const summary = recipientSummary(ready([gone("A"), gone("B")]));
    expect(summary).toMatchObject({ total: 2, shown: 0, none: true, compareReferences: null });
  });
});

describe("analytics boundary", () => {
  it("never reports a share path to analytics, whatever consent exists", () => {
    expect(analyticsPagePath(`/en/share/${token}`, "", "")).toBeNull();
    expect(analyticsPagePath("/en/saved", "", "")).toBeNull();
  });
});
