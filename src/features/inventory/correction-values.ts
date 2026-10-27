import { correctionImpactLimit, correctionKeysJsonLimit } from "@/domain/correction-limits";
import type { FormValues } from "@/ui/form/contract";

/** Retain every generated impact key; ordinary human fields keep their existing bounds. */
export function correctionValues(data: FormData): FormValues {
  const values: FormValues = {};
  for (const key of new Set(data.keys())) {
    const indexed = /^(state|evidence)_(\d{1,4})$/.exec(key);
    if (
      indexed
        ? Number(indexed[2]) >= correctionImpactLimit
        : !/^(sourceReference|disputedFact|urgency|reviewed|impactHash|followUpAt|items)$/.test(key)
    )
      continue;
    const entries = data.getAll(key);
    values[key] =
      entries.length === 1 && typeof entries[0] === "string"
        ? entries[0].slice(0, key === "items" ? correctionKeysJsonLimit + 1 : 16_000)
        : "";
  }
  return values;
}
