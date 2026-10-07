// What the workspace chrome shows the signed-in person: their name, the X02 tools they may open
// and whether they manage access. One grant resolution serves every navigation check.
import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import type { StaffLocale } from "@/i18n/config";
import type { Session } from "@/server/auth/sessions";
import { heldCapabilities } from "@/server/authz";
import { agencyToolCapabilities, permittedTools } from "./navigation";

export async function workspaceViewer(locale: StaffLocale, session: Session) {
  const db = getDb();
  const [[principal], held] = await Promise.all([
    db
      .select({ name: principals.displayName })
      .from(principals)
      .where(eq(principals.id, session.account.id)),
    heldCapabilities(db, session.actor, [...agencyToolCapabilities, "access.grant"]),
  ]);
  return {
    account: { name: principal?.name ?? "MS Realty" },
    tools: permittedTools(locale, held),
    mayManageAccess: held.has("access.grant"),
  };
}
