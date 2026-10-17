import { describe, expect, it } from "vitest";
import {
  analyticsConsent,
  analyticsPagePath,
  analyticsPreference,
  trackingConfig,
  validGtmContainerId,
} from "./tracking";

describe("source-bound analytics consent", () => {
  it("requires one exact, versioned grant and treats malformed/duplicate input as no consent", () => {
    expect(analyticsPreference(null)).toBe("unset");
    expect(analyticsConsent("other=ok; msr_analytics_consent=v1.granted")).toBe(true);
    for (const input of [
      "msr_analytics_consent=granted",
      "msr_analytics_consent=v1.denied",
      "msr_analytics_consent=v2.granted",
      "msr_analytics_consent=v1.granted; msr_analytics_consent=v1.denied",
      "msr_analytics_consent=v1.granted; msr_analytics_consent=v1.granted",
    ])
      expect(analyticsConsent(input)).toBe(false);
  });
  it("accepts only validated public IDs and no script source injection", () => {
    expect(validGtmContainerId("GTM-MSJ9W89")).toBe("GTM-MSJ9W89");
    for (const id of [
      undefined,
      "UA-50966114-2",
      'GTM-ABC"><script>',
      "https://attacker.test",
      "GTM-",
    ])
      expect(validGtmContainerId(id)).toBeNull();
    expect(
      trackingConfig({
        GTM_CONTAINER_ID: "GTM-MSJ9W89",
        SITE_GOOGLE_VERIFICATION: "BX5m2oluMQEljnLveO4e85ujRSPI7Z-CMgAk1ZDLMMU",
      }),
    ).toEqual({
      gtmContainerId: "GTM-MSJ9W89",
      googleVerification: "BX5m2oluMQEljnLveO4e85ujRSPI7Z-CMgAk1ZDLMMU",
    });
  });
  it("never exposes form, account, receipt, query or hash data to this integration", () => {
    for (const path of [
      "/bg/inquire",
      "/en/contact",
      "/en/receipt/ref",
      "/bg/saved",
      "/he/search-alerts",
      "/staff/bg",
      "/ru/properties",
      "/en/properties/intent",
    ])
      expect(analyticsPagePath(path, "", "")).toBeNull();
    expect(analyticsPagePath("/bg", "?email=private@example.test", "")).toBeNull();
    expect(analyticsPagePath("/bg", "", "#private")).toBeNull();
    expect(analyticsPagePath("/ru/properties/MS-00815/ms-00815", "", "")).toBe(
      "/ru/properties/MS-00815/ms-00815",
    );
    expect(analyticsPagePath("/he/help/privacy", "", "")).toBe("/he/help/privacy");
  });
});
