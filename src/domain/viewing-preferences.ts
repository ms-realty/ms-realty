import { z } from "zod";
import { resolveLocalTime } from "./time";

const occurrence = z.enum(["earlier", "later"]).optional();
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
  }, "invalid_date");
const timezone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    // Named zones only: a fixed offset would silently lose future daylight-saving rules.
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value) && value !== "UTC") return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "invalid_timezone");

/** Visitor preferences, never an availability check, appointment or access instruction. */
export const viewingPreferencesSchema = z
  .object({
    version: z.literal(1),
    provenance: z.literal("self_declared"),
    format: z.enum(["in_person"]).optional(),
    timezone,
    windows: z
      .array(
        z
          .object({
            startsAtLocal: localDateTime,
            endsAtLocal: localDateTime,
            startOccurrence: occurrence,
            endOccurrence: occurrence,
          })
          .strict(),
      )
      .max(3),
    accessNeeds: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    input.windows.forEach((window, index) => {
      try {
        const start = resolveLocalTime(
          window.startsAtLocal,
          input.timezone,
          window.startOccurrence,
        );
        const end = resolveLocalTime(window.endsAtLocal, input.timezone, window.endOccurrence);
        for (const [name, resolved] of [
          ["startsAtLocal", start],
          ["endsAtLocal", end],
        ] as const) {
          if (resolved.outcome !== "resolved")
            ctx.addIssue({
              code: "custom",
              path: ["windows", index, name],
              message: resolved.outcome,
            });
        }
        if (
          start.outcome === "resolved" &&
          end.outcome === "resolved" &&
          start.instant >= end.instant
        )
          ctx.addIssue({
            code: "custom",
            path: ["windows", index, "endsAtLocal"],
            message: "end_before_start",
          });
      } catch {
        // Base validators report malformed dates/zones; never resolve a normalized invalid date.
      }
    });
  });
export type ViewingPreferences = z.infer<typeof viewingPreferencesSchema>;

/** Called at review and again at submission; stored preferences remain readable after their date. */
export function pastViewingWindows(input: ViewingPreferences, now = Date.now()) {
  return input.windows.flatMap((window, index) => {
    const start = resolveLocalTime(window.startsAtLocal, input.timezone, window.startOccurrence);
    return start.outcome === "resolved" && Date.parse(start.instant) <= now ? [index] : [];
  });
}
