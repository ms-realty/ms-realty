import "server-only";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
import { authorizeGovernance } from "@/server/privacy-governance/service";
export async function governancePageSession(locale: string, returnTo: string) {
  const session = await requireStaffPage(locale);
  try {
    await authorizeGovernance(getDb(), session);
    return session;
  } catch (error) {
    if (isAppError(error) && error.code === "step_up_required")
      redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(returnTo)}`);
    if (isAppError(error) && error.code === "forbidden") return null;
    throw error;
  }
}
