import { expect, it } from "vitest";
import { nativeContactHref } from "./native-contact";

it("O06 opens only the recorded verified native method", () => {
  expect(nativeContactHref("email", "synthetic@example.test", "verified")).toBe(
    "mailto:synthetic%40example.test",
  );
  expect(nativeContactHref("phone", "+359 879 696 870", "verified")).toBe("tel:+359879696870");
  expect(nativeContactHref("phone", "+359879696870", "unverified")).toBeNull();
  expect(
    nativeContactHref("email", "synthetic@example.test\nBcc: hidden@example.test", "verified"),
  ).toBeNull();
  expect(nativeContactHref("whatsapp", "+359879696870", "verified")).toBeNull();
});
