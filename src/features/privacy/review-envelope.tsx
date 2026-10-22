"use client";

import { type ReactNode, startTransition, useEffect, useRef, useState } from "react";
import type { PrivacyReviewStatus } from "@/server/privacy/native";

const fields = new Set([
  "to",
  "responsibleId",
  "policyReference",
  "dueAt",
  "legalHoldReason",
  "legalHoldDisposition",
  "completionEvidence",
  "rejectionReason",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Draft = { operationId: string; version?: number; values: [string, string][] };
function readDraft(raw: string): Draft | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("operationId" in value) ||
      typeof value.operationId !== "string" ||
      !uuid.test(value.operationId) ||
      !("values" in value) ||
      !Array.isArray(value.values) ||
      value.values.length > 32 ||
      ("version" in value && (!Number.isSafeInteger(value.version) || Number(value.version) < 1))
    )
      return null;
    const values: [string, string][] = [];
    for (const entry of value.values) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "string" ||
        entry[1].length > 4000
      )
        return null;
      // Storage is untrusted. Neither hidden authority nor checked confirmations are drafts.
      if (fields.has(entry[0])) values.push([entry[0], entry[1]]);
    }
    return {
      operationId: value.operationId,
      ...("version" in value ? { version: Number(value.version) } : {}),
      values,
    };
  } catch {
    return null;
  }
}

type State = "ready" | "checking" | "pending" | "unknown" | "succeeded";
/** Pin the reviewed version; reconcile every kept key before restoring text onto a new one. */
export function ReviewEnvelope(props: {
  id: string;
  version: number;
  operationId: string;
  /** Current session first, followed only by verified same-principal step-up predecessors. */
  sessionKeys: string[];
  reconcile: (operationId: string, version?: number) => Promise<PrivacyReviewStatus>;
  restoredLabel: string;
  unkeptLabel: string;
  unknownLabel: string;
  savedLabel: string;
  checkLabel: string;
  currentLabel: string;
  currentHref: string;
  children: ReactNode;
}) {
  const [review] = useState(props);
  const anchor = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<"restored" | "unkept" | null>(null);
  const [state, setState] = useState<State>("ready");
  const blocked = useRef(false);
  const recheck = useRef<() => void>(() => {});
  useEffect(() => {
    const form = anchor.current?.form;
    if (!form) return;
    const keys = review.sessionKeys.map((session) => `privacy-review:${session}:${review.id}`);
    const key = keys[0];
    if (!key) return;
    let storage: Storage;
    let cancelled = false;
    try {
      storage = window.sessionStorage;
      storage.setItem(`${key}:probe`, "1");
      storage.removeItem(`${key}:probe`);
    } catch {
      setNotice("unkept");
      return;
    }
    const changeState = (next: State) => {
      blocked.current = next !== "ready";
      setState(next);
    };
    const keep = () => {
      if (blocked.current) return;
      try {
        const values = [...new FormData(form)]
          .filter(([name, value]) => fields.has(name) && typeof value === "string")
          .map(([name, value]): [string, string] => [name, String(value)]);
        storage.setItem(
          key,
          JSON.stringify({ operationId: review.operationId, version: review.version, values }),
        );
      } catch {
        setNotice("unkept");
      }
    };
    const reconcile = async () => {
      changeState("checking");
      try {
        const drafts = keys.flatMap((source) => {
          const raw = storage.getItem(source);
          return raw === null ? [] : [{ source, raw, draft: readDraft(raw) }];
        });
        let restore: Draft | undefined;
        let uncertain: "pending" | "unknown" | undefined;
        let succeeded = false;
        for (const { source, raw, draft } of drafts) {
          if (!draft) {
            uncertain = "unknown";
            continue;
          }
          const result = await review.reconcile(draft.operationId, draft.version);
          if (cancelled) return;
          if (storage.getItem(source) !== raw) {
            uncertain = "unknown";
            continue;
          }
          if (result === "succeeded") {
            storage.removeItem(source);
            succeeded = true;
          } else if (result === "absent" || result === "failed") restore ??= draft;
          else uncertain = result;
        }
        if (cancelled) return;
        if (uncertain) {
          changeState(uncertain);
          return;
        }
        if (restore) {
          for (const [name, value] of restore.values) {
            const field = form.elements.namedItem(name);
            if (field instanceof HTMLSelectElement) {
              if ([...field.options].some((option) => option.value === value)) field.value = value;
            } else if (
              field instanceof HTMLTextAreaElement ||
              (field instanceof HTMLInputElement &&
                field.type !== "hidden" &&
                field.type !== "checkbox")
            )
              field.value = value;
          }
          changeState("ready");
          setNotice("restored");
          // Write the new envelope before removing predecessor namespaces. A storage failure
          // leaves the original draft intact and never restores a confirmation.
          storage.setItem(
            key,
            JSON.stringify({
              operationId: review.operationId,
              version: review.version,
              values: restore.values,
            }),
          );
          for (const source of keys) if (source !== key) storage.removeItem(source);
        } else changeState(succeeded ? "succeeded" : "ready");
      } catch {
        if (!cancelled) changeState("unknown");
      }
    };
    recheck.current = () =>
      startTransition(() => {
        void reconcile();
      });
    const submit = (event: Event) => {
      if (blocked.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else keep();
    };
    form.addEventListener("input", keep);
    form.addEventListener("change", keep);
    form.addEventListener("submit", submit, true);
    recheck.current();
    return () => {
      cancelled = true;
      form.removeEventListener("input", keep);
      form.removeEventListener("change", keep);
      form.removeEventListener("submit", submit, true);
    };
  }, [review]);
  return (
    <>
      <input ref={anchor} type="hidden" name="intent" value="review" />
      <input type="hidden" name="operationId" value={review.operationId} />
      <input type="hidden" name="id" value={review.id} />
      <input type="hidden" name="expectedVersion" value={review.version} />
      {notice ? (
        <p role="status" className="rounded-control bg-warning-soft p-3 text-dense">
          {notice === "restored" ? review.restoredLabel : review.unkeptLabel}
        </p>
      ) : null}
      {state !== "ready" ? (
        <div className="grid gap-2" role="status">
          <p>{state === "succeeded" ? review.savedLabel : review.unknownLabel}</p>
          {state !== "succeeded" ? (
            <button
              type="button"
              disabled={state === "checking"}
              className="min-h-11 text-start underline"
              onClick={() => recheck.current()}
            >
              {review.checkLabel}
            </button>
          ) : null}
          <a className="inline-flex min-h-11 items-center underline" href={review.currentHref}>
            {review.currentLabel}
          </a>
        </div>
      ) : null}
      <fieldset disabled={state !== "ready"} className="contents">
        {props.children}
      </fieldset>
    </>
  );
}
