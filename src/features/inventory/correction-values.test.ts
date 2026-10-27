import { expect, it } from "vitest";
import { correctionImpactLimit, correctionKeysJsonLimit } from "@/domain/correction-limits";
import { correctionValues } from "./correction-values";

it("retains a complete authorized impact larger than the former16KB transport and1000-field ceiling", () => {
  const keys = Array.from(
    { length: correctionImpactLimit },
    (_, index) => `interest:00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const data = new FormData();
  data.set("items", JSON.stringify(keys));
  for (const [index] of keys.entries()) {
    data.set(`state_${index}`, "unresolved");
    data.set(`evidence_${index}`, `Human source reference ${index}`);
  }
  const values = correctionValues(data);
  expect((data.get("items") as string).length).toBeGreaterThan(16_000);
  expect(JSON.parse(values.items ?? "null")).toEqual(keys);
  expect(values.state_1000).toBe("unresolved");
  expect(values[`evidence_${correctionImpactLimit - 1}`]).toBe(
    `Human source reference ${correctionImpactLimit - 1}`,
  );
  expect(Object.keys(values)).toHaveLength(1 + 2 * correctionImpactLimit);
});

it("retains an oversized marker for explicit validation and rejects out-of-range or duplicate fields", () => {
  const data = new FormData();
  data.set("items", "x".repeat(correctionKeysJsonLimit + 20));
  data.append("state_1", "verified");
  data.append("state_1", "unresolved");
  data.set(`state_${correctionImpactLimit}`, "verified");
  data.set("untrusted", "ignored");
  const values = correctionValues(data);
  expect(values.items?.length).toBe(correctionKeysJsonLimit + 1);
  expect(values.state_1).toBe("");
  expect(values[`state_${correctionImpactLimit}`]).toBeUndefined();
  expect(values.untrusted).toBeUndefined();
});
