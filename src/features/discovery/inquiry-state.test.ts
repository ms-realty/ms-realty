import { describe, expect, it } from "vitest";
import { discoveryCopy } from "./copy";
import { inquiryUnknownMessage } from "./inquiry-state";

const issuedShape = `Zk9Qa${"A".repeat(38)}.${"0".repeat(32)}`;

describe("P12U inquiryUnknownMessage", () => {
  it("appends the telephone check code of the submission", () => {
    expect(inquiryUnknownMessage(discoveryCopy("bg"), issuedShape)).toBe(
      "Не можем да потвърдим резултата в този браузър. Код на заявката: CS7N0T.",
    );
  });
  it("says nothing more for a key that has no issued shape", () => {
    expect(inquiryUnknownMessage(discoveryCopy("en"), "not-a-key")).toBe(
      "We cannot confirm the result in this browser.",
    );
  });
});
