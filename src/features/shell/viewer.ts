// What the workspace chrome shows the signed-in person: their name, the X02 tools they may open
// and whether they manage access. One grant resolution serves every navigation check.
import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import type { StaffLocale } from "@/i18n/config";
import type { Session } from "@/server/auth/sessions";
import { heldCapabilitiesFromGrants, resolveGrants } from "@/server/authz";
import { agencyToolCapabilities, permittedTools, permittedWorkspaceNav } from "./navigation";

export async function workspaceViewer(locale: StaffLocale, session: Session) {
  const db = getDb();
  const [[principal], grants] = await Promise.all([
    db
      .select({ name: principals.displayName, email: principals.email })
      .from(principals)
      .where(eq(principals.id, session.account.id)),
    resolveGrants(db, session.actor),
  ]);
  const held = heldCapabilitiesFromGrants(session.actor, grants, [
    ...agencyToolCapabilities,
    "access.grant",
  ]);
  // A scoped grant still opens its filtered collection. Navigation never grants record access.
  const navigable = new Set(
    grants
      .filter((grant) => !grant.scope?.locales || grant.scope.locales.includes(locale))
      .map((grant) => grant.capability),
  );
  return {
    account: { name: principal?.name ?? "MS Realty", detail: principal?.email },
    primary: permittedWorkspaceNav(navigable),
    tools: permittedTools(locale, held, navigable),
    mayManageAccess: held.has("access.grant"),
  };
}
