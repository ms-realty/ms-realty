// O26L: an allowlist projection of stored listing events, never a general payload viewer.
const actions = {
  "listing.draft.created": ["working", "draftCreated"],
  "listing.draft.saved": ["working", "draftSaved"],
  "listing.revision.created": ["working", "revisionCreated"],
  "listing.availability.confirmed": ["working", "availabilityConfirmed"],
  "media.placement.changed": ["working", "mediaChanged"],
  "publication.manifest.prepare": ["prepared", "packagePrepared"],
  "publication.activate": ["publication", "publicationDecision"],
  "publication.restrict": ["restricted", "publicationRestricted"],
  "publication.withdraw": ["withdrawn", "publicationWithdrawn"],
} as const;

export type HistoryAction = (typeof actions)[keyof typeof actions][1] | "other";
export type HistoryKind = (typeof actions)[keyof typeof actions][0] | "other";
export type ChangeField = {
  key: "version" | "generation" | "previousGeneration" | "move" | "hidden";
  value: string | number | boolean;
};
export interface RecordedChange {
  readonly kind: HistoryKind;
  readonly action: HistoryAction;
  readonly fields: readonly ChangeField[];
  readonly reason: string | null;
  readonly reasonDecision: "retain_unknown" | null;
}

export function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Free-text reasons can contain accidental contacts/credentials; never expose those raw. */
export function safeRecordedText(value: unknown, limit = 800): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 20_000) return null;
  return (
    value
      .replace(/\b(?:Bearer|Basic)\s+\S+/giu, "[…]")
      .replace(/\b(?:token|secret|password|api[_ -]?key|authorization)\s*[:=]\s*[^\s,;]+/giu, "[…]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[…]")
      .replace(/(?:https?:\/\/|www\.)[^\s]+/giu, "[…]")
      .replace(/(?<!\w)\+?\d[\d ()-]{6,}\d(?!\w)/gu, "[…]")
      .replace(/[A-Za-z0-9_+/=-]{24,}/gu, "[…]")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: remove stored control characters before display.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
      .trim()
      .slice(0, limit)
  );
}

export function projectRecordedChange(action: string, value: unknown): RecordedChange {
  const payload = objectRecord(value);
  const [kind, name] = actions[action as keyof typeof actions] ?? (["other", "other"] as const);
  const fields: ChangeField[] = [];
  // These exact keys come from the writers; do not infer prior values from today's listing.
  for (const [key, stored] of [
    ["version", payload.newVersion ?? payload.version],
    ["generation", payload.generation],
    ["previousGeneration", payload.previousGeneration],
  ] as const) {
    if (typeof stored === "number" && Number.isSafeInteger(stored) && stored >= 0)
      fields.push({ key, value: stored });
  }
  if (action === "media.placement.changed") {
    if (payload.move === "up" || payload.move === "down")
      fields.push({ key: "move", value: payload.move });
    if (typeof payload.hidden === "boolean") fields.push({ key: "hidden", value: payload.hidden });
  }
  const decision = objectRecord(payload.priceDecision);
  return {
    kind,
    action: name,
    fields,
    reason: safeRecordedText(payload.reason),
    reasonDecision: decision.kind === "retain_unknown" ? "retain_unknown" : null,
  };
}
