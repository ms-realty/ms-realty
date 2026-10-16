"use client";

import { type ReactNode, useState } from "react";

export function AudienceComposer({
  shared,
  internal,
  sharedLabel,
  internalLabel,
  recipients,
}: {
  shared: ReactNode;
  internal: ReactNode;
  sharedLabel: string;
  internalLabel: string;
  recipients: { id: string; name: string }[];
}) {
  const [audience, setAudience] = useState(shared ? "shared" : "internal");
  return (
    <div className="space-y-4">
      {shared && internal ? (
        <fieldset aria-label={`${sharedLabel} / ${internalLabel}`} className="flex flex-wrap gap-2">
          {(["shared", "internal"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={audience === value}
              onClick={() => setAudience(value)}
              className="min-h-control rounded-control border border-border px-4 py-2 aria-pressed:bg-selected aria-pressed:font-semibold"
            >
              {value === "shared" ? sharedLabel : internalLabel}
            </button>
          ))}
        </fieldset>
      ) : null}
      <div
        hidden={audience !== "shared"}
        inert={audience !== "shared"}
        className="space-y-4 rounded-card border border-border p-4"
      >
        <p className="font-semibold">{sharedLabel}</p>
        <ul className="flex flex-wrap gap-2">
          {recipients.map(({ id, name }) => (
            <li key={id} className="rounded-control bg-subtle px-3 py-1 text-caption">
              {name}
            </li>
          ))}
        </ul>
        {shared}
      </div>
      <div
        hidden={audience !== "internal"}
        inert={audience !== "internal"}
        className="space-y-4 rounded-card border border-dashed border-border bg-subtle p-4"
      >
        <p className="font-semibold">
          <span aria-hidden="true">🔒 </span>
          {internalLabel}
        </p>
        {internal}
      </div>
    </div>
  );
}
