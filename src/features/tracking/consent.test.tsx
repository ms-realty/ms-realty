import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AnalyticsConsent, consentCookie } from "./consent";

const navigation = vi.hoisted(() => ({ pathname: "/bg", discard: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("./document-navigation", async (original) => ({
  ...(await original<typeof import("./document-navigation")>()),
  discardAnalyticsDocument: navigation.discard,
}));

afterEach(() => {
  cleanup();
  document.querySelectorAll("#msr-consented-analytics").forEach((script) => {
    script.remove();
  });
  history.replaceState({}, "", "/");
  navigation.pathname = "/bg";
  navigation.discard.mockClear();
});
it("sends no analytics request before consent and gives necessary-only equal prominence", () => {
  history.replaceState({}, "", "/bg");
  render(<AnalyticsConsent locale="bg" initialPreference="unset" containerId="GTM-MSJ9W89" />);
  expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  expect(screen.getByRole("button", { name: "Само необходимите" }).className).toBe(
    screen.getByRole("button", { name: "Разрешавам анализи" }).className,
  );
});
it("loads the validated container only after stored grant on an eligible public path", () => {
  history.replaceState({}, "", "/en");
  render(
    <AnalyticsConsent
      locale="en"
      initialPreference="granted"
      containerId="GTM-MSJ9W89"
      nonce="trusted-nonce"
    />,
  );
  const script = document.querySelector<HTMLScriptElement>("#msr-consented-analytics");
  expect(script?.src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-MSJ9W89");
  expect(script?.nonce).toBe("trusted-nonce");
  expect(screen.getByRole("button", { name: "Privacy settings" })).toBeVisible();
});
it("does not load analytics on an inquiry receipt or a page carrying a query", () => {
  for (const path of ["/en/inquire/receipt/reference", "/en?contact=private%40example.test"]) {
    history.replaceState({}, "", path);
    const rendered = render(
      <AnalyticsConsent locale="en" initialPreference="granted" containerId="GTM-MSJ9W89" />,
    );
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    rendered.unmount();
  }
});
it("persists a first-party bounded consent preference without a visitor identifier", () => {
  expect(consentCookie("denied", true)).toBe(
    "msr_analytics_consent=v1.denied; Path=/; Max-Age=15552000; SameSite=Lax; Secure",
  );
});
it("discards a retained analytics document if a router transition bypasses native navigation", () => {
  history.replaceState({}, "", "/bg");
  const view = render(
    <AnalyticsConsent locale="bg" initialPreference="granted" containerId="GTM-MSJ9W89" />,
  );
  expect(document.querySelectorAll("#msr-consented-analytics")).toHaveLength(1);
  history.replaceState({}, "", "/bg/inquire");
  navigation.pathname = "/bg/inquire";
  view.rerender(
    <AnalyticsConsent locale="bg" initialPreference="granted" containerId="GTM-MSJ9W89" />,
  );
  expect(navigation.discard).toHaveBeenCalledOnce();
  // Removing <script> would leave executed GTM listeners alive; the reload is
  // required, and this document never bootstraps another container.
  expect(document.querySelectorAll("#msr-consented-analytics")).toHaveLength(1);
});
