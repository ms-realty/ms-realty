import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { routableLocales } from "@/i18n/config";
import common from "../../../messages/en/common.json";
import { LanguageSuggestion } from "./language-suggestion";
import { LocaleSwitcher } from "./language-switcher";
import { type PageLocaleAvailability, samePageLocales } from "./page-locale-availability";

const location = vi.hoisted(() => ({ pathname: "/ru/legacy/0442585901845f0312ec1ad0" }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams("source=preserved"),
}));
const copy = {
  label: common.languageSuggestion.label,
  message: common.languageSuggestion.message,
  switchLabel: common.languageSuggestion.switch,
  dismiss: common.languageSuggestion.dismiss,
};
afterEach(cleanup);
beforeEach(() => {
  location.pathname = "/ru/legacy/0442585901845f0312ec1ad0";
});

it("P21 native header omits nonexistent archive editions even without client availability context", () => {
  const { container } = render(
    <LocaleSwitcher locale="ru" locales={routableLocales()} label="Language" />,
  );
  expect(container.querySelector('a[hreflang="en"]')).toBeNull();
  expect(container.querySelector('a[hreflang="ru"]')).toHaveAttribute(
    "href",
    `${location.pathname}?source=preserved`,
  );
});

it("P21 cached public layout cannot keep an unsupported language suggestion after entering an archive", () => {
  location.pathname = "/ru/properties";
  const { rerender } = render(<LanguageSuggestion suggested="en" copy={copy} />);
  expect(screen.getByText(copy.message)).toBeVisible();
  location.pathname = "/ru/legacy/0442585901845f0312ec1ad0";
  rerender(<LanguageSuggestion suggested="en" copy={copy} />);
  expect(screen.queryByText(copy.message)).toBeNull();
});

it("P21 cached header cannot reuse another archive's available editions, while leaving the archive restores ordinary choices", () => {
  const availability: PageLocaleAvailability = {
    pathname: "/en/legacy/0060c155d560ff91e51b4193",
    locales: ["en"],
  };
  const { container, rerender } = render(
    <LocaleSwitcher
      locale="ru"
      locales={routableLocales()}
      availability={availability}
      label="Language"
    />,
  );
  expect(container.querySelector('a[hreflang="en"]')).toBeNull();
  location.pathname = "/ru/properties";
  rerender(
    <LocaleSwitcher
      locale="ru"
      locales={routableLocales()}
      availability={availability}
      label="Language"
    />,
  );
  expect(container.querySelector('a[hreflang="en"]')).toHaveAttribute(
    "href",
    "/en/properties?source=preserved",
  );
});

it("P21 the exact original source alias keeps truthful native choices and its current path", () => {
  const availability: PageLocaleAvailability = {
    pathname: "/ru/legacy/0442585901845f0312ec1ad0",
    sourcePath: "/listing/синтетичен-източник/",
    locales: ["ru"],
  };
  location.pathname =
    "/listing/%D1%81%D0%B8%D0%BD%D1%82%D0%B5%D1%82%D0%B8%D1%87%D0%B5%D0%BD-%D0%B8%D0%B7%D1%82%D0%BE%D1%87%D0%BD%D0%B8%D0%BA/";
  const { container } = render(
    <LocaleSwitcher
      locale="ru"
      locales={routableLocales()}
      availability={availability}
      label="Language"
    />,
  );
  expect(container.querySelector('a[hreflang="en"]')).toBeNull();
  expect(container.querySelector('a[hreflang="ru"]')).toHaveAttribute(
    "href",
    `${location.pathname}?source=preserved`,
  );
});

it("P21 consumes only matching edition context; encoded separators cannot impersonate an original path", () => {
  const availability: PageLocaleAvailability = {
    pathname: "/ru/legacy/0442585901845f0312ec1ad0",
    sourcePath: "/listing/synthetic/",
    locales: ["ru"],
  };
  expect(samePageLocales("/listing/synthetic/", routableLocales(), availability)).toEqual(["ru"]);
  expect(samePageLocales("/listing%2Fsynthetic/", routableLocales(), availability)).toEqual(
    routableLocales(),
  );
});
