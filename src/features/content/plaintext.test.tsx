import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ContentPlaintext } from "./plaintext";

afterEach(cleanup);
it("AT03 / AT21: CMS references and full URLs retain their exact text inside LTR isolates in Hebrew prose", () => {
  const text =
    "טקסט בדיקה בלבד. MS-00001 https://example.test/path?reference=MS-00001&locale=he טקסט נוסף";
  const { container } = render(
    <p lang="he" dir="rtl">
      <ContentPlaintext text={text} />
    </p>,
  );
  expect(container.textContent).toBe(text);
  const isolated = [...container.querySelectorAll("bdi")];
  expect(isolated.map((node) => node.textContent)).toEqual([
    "MS-00001",
    "https://example.test/path?reference=MS-00001&locale=he",
  ]);
  expect(isolated.every((node) => node.dir === "ltr")).toBe(true);
  expect(isolated[0]).toHaveClass("whitespace-nowrap");
});
it("keeps markup inert and all punctuation exactly as approved", () => {
  const text = '<script>alert("synthetic")</script> — https://example.test/path/.';
  const { container } = render(<ContentPlaintext text={text} />);
  expect(container.textContent).toBe(text);
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("a")).toBeNull();
  expect(container.querySelector("bdi")?.textContent).toBe("https://example.test/path/.");
});
