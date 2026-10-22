import { describe, expect, it } from "vitest";
import type { InventoryAction } from "@/server/inventory/queries";
import { rowAction, rowDestination } from "./row-action";

const translation = (locale: "en" | "ru", canReview: boolean): InventoryAction => ({
  kind: "translation_review",
  locale,
  sourceRevisionId: "00000000-0000-4000-8000-000000000001",
  translationId: `00000000-0000-4000-8000-00000000000${locale === "en" ? 2 : 3}`,
  canReview,
});

describe("O10 rowAction", () => {
  it("prefers a translation the person may review over one they may not", () => {
    const action = rowAction([translation("en", false), translation("ru", true)]);
    expect(rowDestination("bg", "MS-1", action)).toBe("/bg/inventory/MS-1/translations/ru");
  });
  it("keeps editorial work first and falls back to the first step", () => {
    expect(rowAction([{ kind: "review" }, translation("en", true)])).toEqual({ kind: "review" });
    expect(rowDestination("en", "MS-1", rowAction([translation("en", false)]))).toBe(
      "/en/inventory/MS-1/translations/en",
    );
    expect(rowDestination("en", "MS-1", rowAction([]))).toBe("/en/inventory/MS-1");
  });
});
