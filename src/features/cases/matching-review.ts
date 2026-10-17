// O07 add seam (design/contracts/o07.md §4): the reviewed property travels as one hidden form
// field, a JSON string named `matchReview`, and must reach `addInterest` exactly as
// `readCaseCandidate` returned it. Only keys and public listing identity: no requirement text.
// Hidden form data is transport, not authority: the command rechecks every field itself.
import { z } from "zod";
import { commercialStates } from "@/domain/listing";

/** Hidden field of the `interest` workflow command (`workflowFields.interest`). */
export const matchReviewField = "matchReview";

const reviewSchema = z
  .object({
    briefRevision: z.number().int().min(1),
    manifestId: z.uuid(),
    availability: z.enum(commercialStates),
    violated: z.array(z.string().min(1).max(80)).max(32),
    unconfirmed: z.array(z.string().min(1).max(80)).max(32),
    reviewed: z.literal(true),
  })
  .strict();

export type MatchReview = z.infer<typeof reviewSchema>;

/** What the broker saw: the candidate read, copied without reinterpretation. */
export function encodeMatchReview(read: {
  readonly briefRevision: number;
  readonly candidate: {
    readonly manifestId: string;
    readonly availability: { readonly presented: string };
  };
  readonly violated: readonly string[];
  readonly unconfirmed: readonly string[];
}): string {
  return JSON.stringify({
    briefRevision: read.briefRevision,
    manifestId: read.candidate.manifestId,
    availability: read.candidate.availability.presented,
    violated: [...read.violated],
    unconfirmed: [...read.unconfirmed],
    reviewed: true,
  });
}

/**
 * For the `interest` Server Action binding: the submitted review, or undefined when the field is
 * absent or malformed. `addInterest` then refuses the add (`required_for_structured_brief`)
 * instead of trusting a guessed review.
 */
export function matchReviewFromForm(value: string | undefined | null): MatchReview | undefined {
  if (!value) return undefined;
  try {
    const parsed = reviewSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
