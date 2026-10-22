import type { ParticipantRole } from "@/domain/parties";
import type { StaffLocale } from "@/i18n/config";
import { grantStaffCapability, revokeStaffGrant } from "@/server/auth/grants";
import {
  issueClientInvitation,
  issueStaffInvitation,
  issueStaffRecovery,
  type StaffRole,
} from "@/server/auth/invitations";
import { nativeAuthRoute } from "@/server/auth/native";
import { currentStaffAccess } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { getJobQueue } from "@/server/jobs/web";
export const POST = nativeAuthRoute(
  "staff",
  (locale) => `/${locale}/access/manage`,
  async ({ db, form, locale, correlationId }) => {
    const result = await (async () => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      if (form.get("intent") === "grant" || form.get("intent") === "revoke-grant") {
        const operationId = String(form.get("operationId") ?? "");
        const reason = String(form.get("reason") ?? "");
        let changed: Awaited<ReturnType<typeof grantStaffCapability>>;
        if (form.get("intent") === "grant") {
          if (form.get("confirmed") !== "yes") throw new AppError("validation_failed");
          const expiry = String(form.get("expiresAt") ?? "");
          const grantLocale = String(form.get("grantLocale") ?? "");
          changed = await grantStaffCapability(db, access.session, {
            operationId,
            reason,
            principalId: String(form.get("principalId") ?? ""),
            capability: String(form.get("capability") ?? ""),
            scope: {
              recordType: String(form.get("recordType") ?? "") || null,
              recordId: String(form.get("recordId") ?? "") || null,
              locales: grantLocale ? [grantLocale] : null,
              expiresAt: expiry ? new Date(expiry).toISOString() : null,
            },
          });
        } else
          changed = await revokeStaffGrant(db, access.session, {
            operationId,
            reason,
            grantId: String(form.get("grantId") ?? ""),
            expectedRevision: Number(form.get("expectedRevision")),
          });
        return {
          receiptId: changed.operationId,
          ownSessionEnded: changed.outcome.principalId === access.session.account.id,
        };
      }
      const common = {
        session: access.session,
        locale: locale as StaffLocale,
        queue: await getJobQueue(),
        correlationId,
      };
      const email = String(form.get("email") ?? "");
      const displayName = String(form.get("displayName") ?? "");
      switch (form.get("intent")) {
        case "staff":
          return issueStaffInvitation(db, {
            ...common,
            email,
            displayName,
            roles: [String(form.get("role")) as StaffRole],
          });
        case "client":
          return issueClientInvitation(db, {
            ...common,
            email,
            displayName,
            caseId: String(form.get("caseId") ?? ""),
            role: String(form.get("role")) as ParticipantRole,
          });
        case "recovery": {
          if (form.get("confirmed") !== "yes") throw new AppError("validation_failed");
          return issueStaffRecovery(db, {
            ...common,
            principalId: String(form.get("principalId") ?? ""),
            verificationNote: String(form.get("verificationNote") ?? ""),
          });
        }
        default:
          throw new AppError("validation_failed");
      }
    })();
    if ("receiptId" in result)
      return result.ownSessionEnded
        ? `/${locale}/access?receipt=${result.receiptId}`
        : `/${locale}/access/manage?receipt=${result.receiptId}`;
    return `/${locale}/access/manage?saved=${encodeURIComponent(result.invitationId)}`;
  },
);
