/** Server-only helpers. These establish form identity, not authorization or idempotency. */
import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/config/env";
import { keyedHash, randomToken } from "@/server/crypto";
import { type FormState, type FormValues, formFields } from "./contract";

function mac(scope: string, nonce: string): string {
  return keyedHash(getEnv().authSecret, `form-operation:${scope}:${nonce}`).slice(0, 32);
}

/** Issue in the Server Component. Scope must be a server-owned command name. */
export function issueFormOperation(scope: string): string {
  const nonce = randomToken();
  return `${nonce}.${mac(scope, nonce)}`;
}

export function isIssuedFormOperation(scope: string, value: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}\.[0-9a-f]{32}$/.test(value)) return false;
  const [nonce = "", signature = ""] = value.split(".");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(mac(scope, nonce)));
}

export function initialFormState<V extends FormValues>(
  scope: string,
  values: V,
  expectedRevision: number | null = null,
): FormState<V> {
  return {
    operationId: issueFormOperation(scope),
    expectedRevision,
    values,
    responseId: randomUUID(),
    outcome: { kind: "idle" },
  };
}

/** Ignore duplicate fields, files and unexpected keys. Do not echo Object.fromEntries(data). */
export function readFormValues<V extends FormValues>(
  data: FormData,
  fields: readonly (keyof V)[],
): V {
  return Object.fromEntries(
    fields.map((name) => {
      const values = data.getAll(String(name));
      return [name, values.length === 1 && typeof values[0] === "string" ? values[0] : ""];
    }),
  ) as V;
}

/** Reject forged identity, duplicate metadata and invalid revisions before calling a command. */
export function readFormEnvelope(data: FormData, scope: string) {
  const one = (name: string) => {
    const values = data.getAll(name);
    return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
  };
  const intent = one(formFields.intent);
  if (intent !== "submit" && intent !== "reapply") return null;
  const operationId = one(
    intent === "reapply" ? formFields.reapplyOperationId : formFields.operationId,
  );
  const revision = one(
    intent === "reapply" ? formFields.reapplyRevision : formFields.expectedRevision,
  );
  if (!operationId || !isIssuedFormOperation(scope, operationId) || revision === null) return null;
  if (revision !== "" && !/^[1-9]\d*$/.test(revision)) return null;
  const expectedRevision = revision === "" ? null : Number(revision);
  if (expectedRevision !== null && !Number.isSafeInteger(expectedRevision)) return null;
  return { operationId, expectedRevision, intent };
}
