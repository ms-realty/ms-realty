import { afterEach, expect, it, vi } from "vitest";
import { publicLocales } from "@/i18n/config";
import { generateMetadata } from "../../../app/public/[locale]/layout";

vi.mock("@/ui/fonts", () => ({ preloadFonts: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());

it("R09 layout inheritance never indexes an unapproved locale without page metadata", async () => {
  vi.stubEnv("STAGING", "false");
  for (const locale of publicLocales) {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(metadata.robots).toEqual({ index: locale === "bg", follow: true });
  }
});

it("R09 staging still suppresses both indexing and following for the source locale", async () => {
  vi.stubEnv("STAGING", "true");
  const metadata = await generateMetadata({ params: Promise.resolve({ locale: "bg" }) });
  expect(metadata.robots).toEqual({ index: false, follow: false });
});
