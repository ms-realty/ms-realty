import { expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ namespace }: { namespace: string }) =>
    (key: string) =>
      `${namespace}:${key}`,
}));

import { privatePageMetadata } from "./private-metadata";

it("distinguishes private route families and records without querying protected record data", async () => {
  const calendar = await privatePageMetadata({
    surface: "staff",
    locale: "bg",
    path: "/bg/calendar/00000000-0000-4000-8000-000000000001?private=never-title",
  });
  const listing = await privatePageMetadata({
    surface: "staff",
    locale: "bg",
    path: "/staff/bg/inventory/MS-00101/edit",
  });
  expect(calendar.title).toMatchObject({
    default: "tools:items.calendar.title · 00000000 · MS Realty",
  });
  expect(listing.title).toMatchObject({
    default: "tools:items.inventory.title · MS-00101 · Редакция · MS Realty",
  });
  expect(JSON.stringify(calendar)).not.toContain("never-title");
});

it("uses the scoped client task while retaining only a safe object hint", async () => {
  const result = await privatePageMetadata({
    surface: "client",
    locale: "en",
    path: "/en/cases/00000000-0000-4000-8000-000000000001/messages",
  });
  expect(result.title).toMatchObject({ default: "nav:journey.messages · 00000000 · MS Realty" });
});

it("never copies access tokens, queries or wrong-locale paths into private titles", async () => {
  for (const path of [
    "/en/invitations/00000000-0000-4000-8000-000000000001?token=secret",
    "/en/access/secret",
    "/ru/messages?email=synthetic%40example.test",
    "//attacker.test/en/cases",
  ]) {
    const result = await privatePageMetadata({ surface: "client", locale: "en", path });
    expect(JSON.stringify(result)).not.toMatch(/secret|attacker|synthetic|00000000|email=/);
  }
});
