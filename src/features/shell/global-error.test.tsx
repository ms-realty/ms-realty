import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import GlobalError from "../../../app/global-error";

it("provides its own bilingual document and a host-safe return before hydration", () => {
  const html = renderToString(
    <GlobalError error={new Error("private database detail")} retry={vi.fn()} />,
  );
  expect(html).toContain('<html lang="bg" dir="ltr">');
  expect(html).toContain('<main id="main"');
  expect(html).toContain('lang="en"');
  expect(html).toContain('href="/"');
  expect(html).toContain('href="tel:+359879696870"');
  expect(html).not.toContain("/bg/properties");
  expect(html).not.toContain("private database detail");
});
