import { z } from "zod";
import { type CurrencyCode, currencyCodes, type PublicLocale } from "@/domain/ids";
import { decimalToMinor } from "@/domain/money";
import { parseMoneyInput } from "@/i18n/money";
import { sofiaInstant } from "../appointments/time";

export const partySnapshotSchema = z.object({
  partyId: z.uuid(),
  name: z.string().min(1),
  role: z.enum(["buyer", "co_buyer", "tenant", "seller", "landlord"]),
  required: z.literal(true),
});
export type ProposalParty = z.infer<typeof partySnapshotSchema>;
export const partySnapshotsSchema = z.array(partySnapshotSchema).min(2).max(20);
export const termInputSchema = z.object({
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  currency: z.enum(currencyCodes),
  period: z.enum(["total", "month"]),
  paymentBasis: z.string().trim().min(3).max(1500),
  conditions: z.array(z.string().trim().min(1).max(1500)).max(20),
  inclusions: z.array(z.string().trim().min(1).max(1500)).max(20),
  deadline: z
    .string()
    .refine((value) => Boolean(sofiaInstant(value)), "valid_sofia_offset_required"),
});
export function amountToMinor(
  value: string,
  locale?: PublicLocale,
  currency: CurrencyCode = "EUR",
) {
  return locale
    ? parseMoneyInput(locale, value, currency)
    : decimalToMinor(value.replace(",", "."), currency);
}
export function deadlineInput(value: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(value);
  const get = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === name)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}${get("timeZoneName").replace("GMT", "")}`;
}
