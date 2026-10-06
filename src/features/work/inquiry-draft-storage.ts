import type { FormState, FormValues } from "@/ui/form/contract";
import type { FormSnapshot } from "@/ui/form/form";
import { protectInquiryMemoryOnUnload } from "./inquiry-navigation-guard";

export type InquiryDraftOwner = { id: string; expiresAt: number };
export type InquiryDraftKind = "accept" | "contact" | "triage";
type RetainedDraft = {
  ownerId: string;
  values: FormValues;
  revision: number | null;
  operation?: { id: string; revision: number | null; preserveOnSuccess?: boolean };
};

const prefix = "msr.inquiry-draft.";
const ownerKey = `${prefix}owner`;
const draftKey = (id: string, kind: InquiryDraftKind) => `${prefix}${id}:${kind}`;
let memoryOwner: InquiryDraftOwner | null = null;
const memory = new Map<string, RetainedDraft | null>();
const unpersisted = new Set<string>();
const revision = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
// Rechecking contact facts is required on recovery; it does not change the command's intent.
const sameIntent = (left: FormValues, right: FormValues) =>
  Object.keys(right).every((name) => name === "reviewed" || left[name] === right[name]);

/** A new actor or auth session removes the previous session's private in-tab drafts. */
export function claimInquiryDraftOwner(owner: InquiryDraftOwner): boolean {
  if (
    memoryOwner?.id !== owner.id ||
    memoryOwner.expiresAt <= Date.now() ||
    owner.expiresAt <= Date.now()
  ) {
    memory.clear();
    unpersisted.clear();
    protectInquiryMemoryOnUnload(0);
  }
  memoryOwner = owner.expiresAt > Date.now() ? owner : null;
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

export function ownsInquiryDrafts(owner: InquiryDraftOwner): boolean {
  return (
    memoryOwner?.id === owner.id &&
    memoryOwner.expiresAt > Date.now() &&
    owner.expiresAt > Date.now()
  );
}

function ownsStorage(owner: InquiryDraftOwner): boolean {
  const stored = JSON.parse(sessionStorage.getItem(ownerKey) ?? "null");
  return stored?.id === owner.id && stored.expiresAt > Date.now() && owner.expiresAt > Date.now();
}

function persistDraft(owner: InquiryDraftOwner, key: string, value: RetainedDraft | null) {
  memory.set(key, value);
  try {
    if (!ownsStorage(owner)) throw new Error("Draft storage belongs to another session");
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
    unpersisted.delete(key);
  } catch {
    if (value) unpersisted.add(key);
    else unpersisted.delete(key);
  }
  // Protection follows the retained drafts, including when their forms have unmounted.
  protectInquiryMemoryOnUnload(unpersisted.size ? owner.expiresAt : 0);
  return !unpersisted.has(key);
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
    if (!ownsInquiryDrafts(owner)) return;
    const key = draftKey(id, kind);
    const retained = memory.has(key)
      ? memory.get(key)
      : ownsStorage(owner)
        ? JSON.parse(sessionStorage.getItem(key) ?? "null")
        : null;
    if (retained?.ownerId !== owner.id || retained.operation?.id !== operationId) return;
    // Status identifies K, not which payload won a concurrent same-K recovery. Keep edited
    // values for review unless the client actually observed their matching confirmation.
    if (outcome === "succeeded" && !retained.operation.preserveOnSuccess)
      persistDraft(owner, key, null);
    else {
      const { operation: _operation, ...draft } = retained;
      persistDraft(owner, key, draft);
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
    if (!ownsInquiryDrafts(owner)) return null;
    const key = draftKey(id, kind);
    let stored = memory.get(key);
    if (!memory.has(key)) {
      if (!ownsStorage(owner)) return null;
      const raw = sessionStorage.getItem(key);
      if (!raw || raw.length > 32_000) return null;
      stored = JSON.parse(raw);
    }
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
        !revision(stored.operation.revision) ||
        (stored.operation.preserveOnSuccess !== undefined &&
          typeof stored.operation.preserveOnSuccess !== "boolean"))
    )
      return null;
    // A fresh record revision requires a fresh human confirmation of the contact facts.
    if (!stored.operation && stored.revision !== initial.expectedRevision && "reviewed" in values)
      values.reviewed = "";
    const retained = {
      ownerId: owner.id,
      values,
      revision: stored.revision,
      ...(stored.operation ? { operation: stored.operation } : {}),
    };
    memory.set(key, retained);
    return retained;
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
  retryOperationId?: string,
): boolean {
  // A late response from a former account must never recreate that account's storage.
  if (!ownsInquiryDrafts(owner)) return false;
  const key = draftKey(id, kind);
  const previous = readInquiryDraft(owner, id, kind, initial);
  const priorOperation =
    previous?.operation?.id === state.operationId ? previous.operation : undefined;
  if (state.outcome.kind === "confirmed") {
    // An earlier attempt's late confirmation must not delete a newer corrected draft.
    if (priorOperation?.preserveOnSuccess && previous && !sameIntent(previous.values, values)) {
      const { operation: _operation, ...draft } = previous;
      return persistDraft(owner, key, draft);
    }
    return persistDraft(owner, key, null);
  }
  const unresolved = pending || ["unknown", "accepted"].includes(state.outcome.kind);
  const recovering = retryOperationId === state.operationId;
  if (
    !unresolved &&
    !recovering &&
    Object.keys(initial.values).every((name) => values[name] === initial.values[name])
  ) {
    return persistDraft(owner, key, null);
  }
  const retained: RetainedDraft = {
    ownerId: owner.id,
    values: { ...values },
    revision: state.expectedRevision,
    ...(unresolved || recovering
      ? {
          operation: {
            id: state.operationId,
            revision: state.expectedRevision,
            ...(priorOperation?.preserveOnSuccess ||
            (recovering && (!priorOperation || !previous || !sameIntent(previous.values, values)))
              ? { preserveOnSuccess: true }
              : {}),
          },
        }
      : {}),
  };
  return persistDraft(owner, key, retained);
}
