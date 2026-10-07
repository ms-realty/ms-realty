import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkCodeNoncePrefix, inquiryCheckCode } from "./inquiry-check-code";

describe("inquiry check code", () => {
  it("round-trips exactly the first 30 nonce bits without the receipt capability", () => {
    for (let index = 0; index < 32; index++) {
      const nonce = randomBytes(32).toString("base64url");
      const key = `${nonce}.${"a".repeat(32)}`;
      const code = inquiryCheckCode(key);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
      expect(checkCodeNoncePrefix(code ?? "")).toBe(nonce.slice(0, 5));
    }
  });

  it("normalizes common spoken aliases and rejects malformed input", () => {
    expect(inquiryCheckCode(`${"A".repeat(43)}.${"a".repeat(32)}`)).toBe("000000");
    expect(inquiryCheckCode(`${"_".repeat(43)}.${"a".repeat(32)}`)).toBe("ZZZZZZ");
    expect(checkCodeNoncePrefix("O-O O O O O")).toBe("AAAAA");
    expect(checkCodeNoncePrefix("I1LL11")).toBe(checkCodeNoncePrefix("111111"));
    expect(checkCodeNoncePrefix("ABC")).toBeNull();
    expect(checkCodeNoncePrefix("******")).toBeNull();
    expect(inquiryCheckCode("unknown")).toBeNull();
  });
});
