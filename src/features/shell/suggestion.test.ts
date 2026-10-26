import { beforeEach, expect, it, vi } from "vitest";
import { localeCookie, requestPathHeader, suggestionDismissedCookie } from "@/i18n/config";
import { languageSuggestionFor, publicPageLocaleAvailability } from "./suggestion";

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  cookies: new Map<string, { value: string }>(),
}));
vi.mock("next/headers", () => ({
  headers: async () => mocks.headers,
  cookies: async () => mocks.cookies,
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

beforeEach(() => {
  mocks.headers = new Headers({
    [requestPathHeader]: "/ru/legacy/0442585901845f0312ec1ad0",
    "accept-language": "en",
  });
  mocks.cookies.clear();
});

it("P21 never suggests an unsupported same-page language merely because its interface is routable", async () => {
  expect(await languageSuggestionFor("ru", ["ru"])).toBeNull();
});

it("F01 preserves a supported suggestion on an ordinary public route", async () => {
  mocks.headers.set(requestPathHeader, "/ru/properties");
  expect(await languageSuggestionFor("ru")).toMatchObject({ locale: "en" });
});

it("P21 binds exact archive language choices to the validated source record, not preferred language or referrer", async () => {
  mocks.headers.set("referer", "https://example.test/en/properties");
  const availability = await publicPageLocaleAvailability("ru");
  expect(availability).toMatchObject({
    pathname: "/ru/legacy/0442585901845f0312ec1ad0",
    locales: ["ru"],
  });
  expect(availability?.sourcePath).toMatch(/^\/listing\//u);
  expect(await languageSuggestionFor("ru")).toBeNull();
  mocks.headers.set(requestPathHeader, "/en/legacy/0060c155d560ff91e51b4193?source=preserved");
  expect(await publicPageLocaleAvailability("en")).toMatchObject({
    pathname: "/en/legacy/0060c155d560ff91e51b4193",
    locales: ["en"],
  });
});

it("P21 unknown IDs and malformed or mismatched route context cannot invent an edition", async () => {
  for (const path of [
    "/ru/legacy/000000000000000000000000",
    "/ru/legacy/not-an-id",
    "/bg/legacy/0442585901845f0312ec1ad0",
  ]) {
    mocks.headers.set(requestPathHeader, path);
    expect(await publicPageLocaleAvailability("ru")).toMatchObject({ locales: [] });
    expect(await languageSuggestionFor("ru")).toBeNull();
  }
});

it("F01 non-archive and CMS paths retain existing behavior without treating generic locale routing as CMS edition approval", async () => {
  for (const path of ["/ru/properties", "/ru/contact", "/ru/help/synthetic-slug"]) {
    mocks.headers.set(requestPathHeader, path);
    expect(await publicPageLocaleAvailability("ru")).toBeNull();
  }
});

it("F01 explicit preference and dismissal still suppress ordinary suggestions", async () => {
  mocks.headers.set(requestPathHeader, "/ru/properties");
  mocks.cookies.set(localeCookie, { value: "ru" });
  expect(await languageSuggestionFor("ru")).toBeNull();
  mocks.cookies.clear();
  mocks.cookies.set(suggestionDismissedCookie, { value: "1" });
  expect(await languageSuggestionFor("ru")).toBeNull();
});
