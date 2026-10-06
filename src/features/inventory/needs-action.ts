// O10 "Needs action": the one next step a listing is waiting for, from recorded states only.
// Editorial work comes before availability; an approved, confirmed listing needs nothing.
export type ListingAction = "changes" | "review" | "facts" | "availability";

export function listingAction(listing: {
  editorialState: string;
  commercialState: string;
  freshnessState: string;
}): ListingAction | null {
  if (listing.editorialState === "changes_requested") return "changes";
  if (listing.editorialState === "in_review") return "review";
  if (listing.editorialState === "needs_facts") return "facts";
  if (
    listing.commercialState === "confirmation_required" ||
    listing.freshnessState === "review_due"
  )
    return "availability";
  return null;
}
