import "server-only";
import { redirect } from "next/navigation";
import { requireClientPage } from "@/features/cases/access";
import { currentStaffAccess, localReturnPath, staffAccessPath } from "@/server/auth/pages";
import { isFresh } from "@/server/auth/sessions";
import { getEnv } from "@/server/config/env";
import { privacyQueuePath, privacyQueueQuery } from "@/server/privacy/requests";

/**
 * C-12: where a signed-out staff member returns after sign-in. Only the privacy queue and
 * one validated queue position qualify; anything else returns nowhere special. A position is
 * navigation only: the queue re-authorizes and never replays a review.
 */
export function privacyQueueReturn(locale: string, path: string | null | undefined) {
  const candidate = localReturnPath(path, "staff", locale);
  if (!candidate) return null;
  const destination = new URL(candidate, getEnv().hosts.staff);
  if (destination.pathname !== `/${locale}/operations/privacy`) return null;
  const after = destination.searchParams.getAll("after"),
    before = destination.searchParams.getAll("before");
  if (after.length > 1 || before.length > 1) return null;
  const query = {
    ...(after[0] ? { after: after[0] } : {}),
    ...(before[0] ? { before: before[0] } : {}),
  };
  return privacyQueueQuery.safeParse(query).success ? privacyQueuePath(locale, query) : null;
}

/** The staff sign-in page, carrying a validated privacy queue position when there is one. */
export function staffSignInPath(locale: string, path: string | null | undefined) {
  const returnTo = privacyQueueReturn(locale, path);
  return `/${locale}/access${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
}

export async function privacyPageSession(locale: string, path: string, staff = false) {
  const access = staff ? await currentStaffAccess() : null;
  if (access && access.state !== "ready")
    redirect(
      access.state === "signed_out"
        ? staffSignInPath(locale, path)
        : staffAccessPath(locale, access.state),
    );
  const session =
    access?.state === "ready" ? access.session : await requireClientPage(locale, path);
  if (!isFresh(session)) redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`);
  return session;
}
