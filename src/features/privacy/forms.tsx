import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
export function Envelope({
  intent,
  id,
  version,
}: {
  intent: string;
  id?: string;
  version?: number;
}) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {version !== undefined ? (
        <input type="hidden" name="expectedVersion" value={version} />
      ) : null}
    </>
  );
}
export function TextField({
  name,
  label,
  value,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  value?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1">
      {label}
      <input
        className={controlClass}
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        maxLength={500}
      />
    </label>
  );
}
export function Check({
  name,
  children,
  required = true,
}: {
  name: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" name={name} value="yes" required={required} className="mt-1 size-5" />
      <span>{children}</span>
    </label>
  );
}
export function Submit({ children }: { children: ReactNode }) {
  return (
    <button className={buttonClass()} type="submit">
      {children}
    </button>
  );
}
export function Area({
  name,
  label,
  value,
  required = false,
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1">
      {label}
      <textarea
        name={name}
        className={controlClass}
        maxLength={4000}
        defaultValue={value}
        required={required}
      />
    </label>
  );
}
