// Receiver review times are entered in the agency's named zone. A datetime-local value has no
// offset, so a spring gap is invalid and an autumn repeated hour needs another choice.
import { localParts, sofiaInstant } from "../appointments/time";
import { AppError } from "../errors";

const offsets = ["+02:00", "+03:00"] as const;
const localMinute = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function handoverReviewInstant(value: string): string {
  const candidates = localMinute.test(value)
    ? offsets.flatMap((offset) => {
        const instant = sofiaInstant(`${value}${offset}`);
        return instant ? [instant] : [];
      })
    : [];
  const [only] = candidates;
  if (!only || candidates.length > 1)
    throw new AppError("validation_failed", {
      fieldErrors: {
        dueAt: [candidates.length > 1 ? "ambiguous_local_time" : "invalid_local_time"],
      },
    });
  return only.toISOString();
}

export function handoverReviewInput(value: Date | null): string {
  if (!value) return "";
  const parts = localParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
