"use client";

import { useState, useSyncExternalStore } from "react";
import type { PublicLocale } from "@/i18n/config";
import { buttonClass } from "@/ui/button-class";
import type { DiscoveryCopy } from "./copy";

type Kind = "saved" | "compare";
const storageKey = (kind: Kind) => `ms-realty.${kind}.v1`;
const changed = "ms-realty-selection";
let temporary: Partial<Record<Kind, string>> = {};
const subscribe = (listener: () => void) => {
  window.addEventListener("storage", listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changed, listener);
  };
};
function read(kind: Kind) {
  try {
    return temporary[kind] ?? localStorage.getItem(storageKey(kind)) ?? "[]";
  } catch {
    return temporary[kind] ?? "[]";
  }
}
export function selectedReferences(raw: string, kind: Kind): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (item): item is string => typeof item === "string" && /^MS-\d{5,}$/.test(item),
            ),
          ),
        ].slice(0, kind === "compare" ? 3 : 50)
      : [];
  } catch {
    return [];
  }
}
function write(kind: Kind, refs: string[]) {
  let durable = true;
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(refs));
    delete temporary[kind];
  } catch {
    temporary = { ...temporary, [kind]: JSON.stringify(refs) };
    durable = false;
  }
  window.dispatchEvent(new Event(changed));
  return durable;
}
function useSelection(kind: Kind) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(kind),
    () => "[]",
  );
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return { refs: selectedReferences(raw, kind), hydrated };
}
export function LocalActions({ reference, copy }: { reference: string; copy: DiscoveryCopy }) {
  const saved = useSelection("saved");
  const compare = useSelection("compare");
  const [notice, setNotice] = useState("");
  const toggle = (kind: Kind) => {
    const refs = selectedReferences(read(kind), kind);
    const exists = refs.includes(reference);
    if (!exists && refs.length >= (kind === "compare" ? 3 : 50)) {
      setNotice(copy.compareLimit);
      return;
    }
    setNotice(
      write(kind, exists ? refs.filter((r) => r !== reference) : [...refs, reference])
        ? ""
        : copy.storageFailed,
    );
  };
  return (
    <div>
      {saved.hydrated ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass("secondary")}
            aria-pressed={saved.refs.includes(reference)}
            onClick={() => toggle("saved")}
          >
            {saved.refs.includes(reference) ? copy.remove : copy.save}
          </button>
          <button
            type="button"
            className={buttonClass("secondary")}
            aria-pressed={compare.refs.includes(reference)}
            onClick={() => toggle("compare")}
          >
            {copy.compare}
          </button>
        </div>
      ) : null}
      <p role="status" className="text-caption text-text-muted">
        {notice}
      </p>
      <noscript>
        <p className="text-caption text-text-muted">{copy.noJsSaved}</p>
      </noscript>
    </div>
  );
}
export function LocalSelection({
  kind,
  locale,
  copy,
}: {
  kind: Kind;
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  const { refs, hydrated } = useSelection(kind);
  const [notice, setNotice] = useState("");
  return (
    <div className="space-y-5">
      <p>{copy.localOnly}</p>
      {kind === "compare" ? <p>{copy.compareLimit}</p> : null}
      {hydrated ? (
        refs.length ? (
          <>
            <ul className="space-y-3">
              {refs.map((reference) => (
                <li
                  key={reference}
                  className="flex flex-wrap items-center gap-4 rounded-control border border-border p-4"
                >
                  <a
                    className="font-semibold underline"
                    href={`/${locale}/properties/${reference}/${reference.toLowerCase()}`}
                  >
                    <bdi>{reference}</bdi>
                  </a>
                  <button
                    className={buttonClass("secondary")}
                    type="button"
                    onClick={() => {
                      if (
                        !write(
                          kind,
                          refs.filter((r) => r !== reference),
                        )
                      )
                        setNotice(copy.storageFailed);
                    }}
                  >
                    {copy.remove} <bdi>{reference}</bdi>
                  </button>
                </li>
              ))}
            </ul>
            <a
              className={buttonClass("primary")}
              href={`/${locale}/compare?references=${refs.slice(0, 3).join(",")}`}
            >
              {copy.compare}
            </a>
          </>
        ) : (
          <p>{copy.emptySaved}</p>
        )
      ) : null}
      <p role="status">{notice}</p>
      <noscript>
        <p>{copy.noJsSaved}</p>
      </noscript>
    </div>
  );
}
