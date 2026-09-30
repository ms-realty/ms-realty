import { expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { attachmentProviderEnabled, configuredAttachmentProvider } from "./attachment-provider";

const local = parseEnv({ NODE_ENV: "test", ENABLE_TEST_OUTBOX: "1" });
const production = parseEnv({
  NODE_ENV: "production",
  DATABASE_URL: "postgres://app@db/app",
  APP_ORIGIN: "https://makler-realty.com",
  CANONICAL_ORIGIN: "https://makler-realty.com",
  PUBLIC_ORIGIN: "https://makler-realty.com",
  CLIENT_ORIGIN: "https://my.makler-realty.com",
  STAFF_ORIGIN: "https://app.makler-realty.com",
  AUTH_SECRET: "x".repeat(32),
  MEDIA_PUBLIC_BASE_URL: "https://makler-realty.com/media/",
  ENABLE_TEST_OUTBOX: "1",
});
it("requires explicit live receiving and provider configuration", () => {
  expect(attachmentProviderEnabled("resend", {}, local)).toBe(false);
  expect(attachmentProviderEnabled("resend", { RESEND_API_KEY: "synthetic" }, local)).toBe(false);
  expect(
    attachmentProviderEnabled(
      "resend",
      { CASE_INBOUND_ENABLED: "1", MAIL_PROVIDER: "resend", RESEND_API_KEY: "synthetic" },
      local,
    ),
  ).toBe(true);
});
it("never enables synthetic attachment reads on real hosts", () => {
  expect(attachmentProviderEnabled("test", {}, local)).toBe(true);
  expect(attachmentProviderEnabled("test", {}, production)).toBe(false);
  expect(attachmentProviderEnabled("unknown", {}, local)).toBe(false);
  expect(() =>
    configuredAttachmentProvider(
      "test",
      { read: vi.fn(), writeStaging: vi.fn(), writeImmutable: vi.fn() },
      {},
      production,
    ),
  ).toThrow();
});
