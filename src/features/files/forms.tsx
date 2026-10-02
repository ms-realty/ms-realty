import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";

export function FileEnvelope({
  intent,
  version,
  id,
}: {
  intent: string;
  version: number;
  id?: string;
}) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      <input type="hidden" name="expectedRevision" value={version} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
    </>
  );
}
export function FileField({
  name,
  label,
  value,
  required = true,
  type = "text",
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-1">
      {label}
      <input
        className={controlClass}
        name={name}
        defaultValue={value}
        required={required}
        type={type}
        maxLength={2000}
      />
    </label>
  );
}
export function FileCheck({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="flex items-start gap-2">
      <input className="mt-1 size-5" type="checkbox" name={name} value="yes" required />
      <span>{children}</span>
    </label>
  );
}
export function FileButton({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className={buttonClass("secondary")}>
      {children}
    </button>
  );
}
