/** An opt-in, non-business demonstration. Stores a signed receipt, never the entered draft. */
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PublicLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import { keyedHash } from "@/server/crypto";
import type { FormReceipt } from "./contract";
import { formSpecimenCopy } from "./specimen-copy";

export const specimenScope = "design.form.check";
export const specimenRevision = 2;
export const specimenCookie = "msr_form_specimen";
export const specimenLifetime = 3600;
export const specimenLatest = {
  subject: "A fictional practice draft",
  note: "Example current text",
};

const storedReceipt = z.object({
  operationId: z.string().max(100),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  recordedAt: z.string().datetime(),
  reference: z.string().max(30),
  revision: z.literal(specimenRevision),
});
export type SpecimenReceipt = z.infer<typeof storedReceipt>;

function mac(body: string) {
  return keyedHash(getEnv().authSecret, `form-specimen-receipt:${body}`);
}

export function sealSpecimenReceipt(receipt: SpecimenReceipt): string {
  const body = Buffer.from(JSON.stringify(storedReceipt.parse(receipt))).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function readSpecimenReceipt(
  value: string | undefined,
  now = Date.now(),
): SpecimenReceipt | null {
  if (!value || value.length > 2000) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(mac(body)))) return null;
  try {
    const result = storedReceipt.safeParse(JSON.parse(Buffer.from(body, "base64url").toString()));
    if (!result.success) return null;
    const age = now - Date.parse(result.data.recordedAt);
    return age >= 0 && age < specimenLifetime * 1000 ? result.data : null;
  } catch {
    return null;
  }
}

export function specimenStatusHref(locale: PublicLocale, operationId: string) {
  return `/${locale}/design/forms/receipt?operation=${encodeURIComponent(operationId)}`;
}

export function specimenReceiptView(receipt: SpecimenReceipt, locale: PublicLocale): FormReceipt {
  const copy = formSpecimenCopy(locale);
  return {
    title: copy.confirmed,
    reference: receipt.reference,
    recordedAt: {
      dateTime: receipt.recordedAt,
      label: new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Sofia",
      }).format(new Date(receipt.recordedAt)),
    },
    nextStep: copy.next,
    destination: { href: specimenStatusHref(locale, receipt.operationId), label: copy.receipt },
  };
}
