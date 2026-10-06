import type { FormState, FormValues } from "@/ui/form/contract";
import type { FormSnapshot } from "@/ui/form/form";

export type InquiryDraftOwner = { id: string; expiresAt: number };
export type InquiryDraftKind = "accept" | "contact" | "triage";
type RetainedDraft = {
  ownerId: string;
  values: FormValues;
  revision: number | null;
  operation?: { id: string; revision: number | null };
};

const prefix = "msr.inquiry-draft.";
const ownerKey = `${prefix}owner`;
const draftKey = (id: string, kind: InquiryDraftKind) => `${prefix}${id}:${kind}`;
const revision = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);

/** A new actor or auth session removes the previous session's private in-tab drafts. */
export function claimInquiryDraftOwner(owner: InquiryDraftOwner): boolean {
  try {
    const stored = JSON.parse(sessionStorage.getItem(ownerKey) ?? "null");
    if (stored?.id !== owner.id || stored?.expiresAt <= Date.now() || owner.expiresAt <= Date.now())
      for (let index = sessionStorage.length - 1; index >= 0; index--) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
      }
    if (owner.expiresAt <= Date.now()) return false;
    sessionStorage.setItem(ownerKey, JSON.stringify(owner));
    return true;
  } catch {
    return false;
  }
}

function ownsDrafts(owner: InquiryDraftOwner): boolean {
  const stored = JSON.parse(sessionStorage.getItem(ownerKey) ?? "null");
  return stored?.id === owner.id && stored.expiresAt > Date.now() && owner.expiresAt > Date.now();
}

export function discardInquiryDraft(owner: InquiryDraftOwner, id: string, kind: InquiryDraftKind) {
  try {
    if (ownsDrafts(owner)) sessionStorage.removeItem(draftKey(id, kind));
  } catch {
    // The explicit leave choice also applies when storage is unavailable.
  }
}

/** Reconcile only the retained operation that the server has just authorized and read. */
export function reconcileInquiryDraft(
  owner: InquiryDraftOwner,
  id: string,
  kind: InquiryDraftKind,
  operationId: string,
  outcome: "succeeded" | "failed",
) {
  try {
    if (!ownsDrafts(owner)) return;
    const key = draftKey(id, kind);
    const retained = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (retained?.ownerId !== owner.id || retained.operation?.id !== operationId) return;
    if (outcome === "succeeded") sessionStorage.removeItem(key);
    else {
      delete retained.operation;
      sessionStorage.setItem(key, JSON.stringify(retained));
    }
  } catch {
    // Preserve the unknown reference if browser storage cannot be changed.
  }
}

export function readInquiryDraft<V extends FormValues>(
  owner: InquiryDraftOwner,
  id: string,
  kind: InquiryDraftKind,
  initial: FormState<V>,
): RetainedDraft | null {
  try {
    if (!ownsDrafts(owner)) return null;
    const raw = sessionStorage.getItem(draftKey(id, kind));
    if (!raw || raw.length > 32_000) return null;
    const stored = JSON.parse(raw);
    if (stored?.ownerId !== owner.id || !revision(stored.revision)) return null;
    const values: FormValues = { ...initial.values };
    for (const name of Object.keys(values)) {
      if (typeof stored.values?.[name] !== "string" || stored.values[name].length > 4_000)
        return null;
      values[name] = stored.values[name];
    }
    if (
      stored.operation &&
      (!/^[A-Za-z0-9_-]{43}\.[0-9a-f]{32}$/.test(stored.operation.id) ||
        !revision(stored.operation.revision))
    )
      return null;
    // A fresh record revision requires a fresh human confirmation of the contact facts.
    if (!stored.operation && stored.revision !== initial.expectedRevision && "reviewed" in values)
      values.reviewed = "";
    return {
      ownerId: owner.id,
      values,
      revision: stored.revision,
      ...(stored.operation ? { operation: stored.operation } : {}),
    };
  } catch {
    return null;
  }
}

/** Called synchronously on edits and before submit; no text leaves this tab or enters a URL. */
export function retainInquiryDraft<V extends FormValues>(
  owner: InquiryDraftOwner,
  id: string,
  kind: InquiryDraftKind,
  initial: FormState<V>,
  { state, values, pending }: FormSnapshot<V>,
): boolean {
  try {
    // A late response from a former account must never recreate that account's storage.
    if (!ownsDrafts(owner)) return false;
    const key = draftKey(id, kind);
    if (state.outcome.kind === "confirmed") {
      sessionStorage.removeItem(key);
      return true;
    }
    const unresolved = pending || ["unknown", "accepted"].includes(state.outcome.kind);
    if (
      !unresolved &&
      Object.keys(initial.values).every((name) => values[name] === initial.values[name])
    ) {
      sessionStorage.removeItem(key);
      return true;
    }
    const retained: RetainedDraft = {
      ownerId: owner.id,
      values,
      revision: state.expectedRevision,
      ...(unresolved
        ? { operation: { id: state.operationId, revision: state.expectedRevision } }
        : {}),
    };
    sessionStorage.setItem(key, JSON.stringify(retained));
    return true;
  } catch {
    return false;
  }
}
