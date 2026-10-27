import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import { readStaffCaseContacts } from "@/server/cases/staff-contacts";
import { ContactActions } from "../work/contact-actions";
import { staffWorkflowCopy } from "../work/workflow-completion-copy";
export async function StaffCaseContacts({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const methods = await readStaffCaseContacts(getDb(), session, id);
  return methods.length ? (
    <section className="space-y-3" aria-label={staffWorkflowCopy(locale).contacts}>
      <h2 className="text-subheading font-semibold">{staffWorkflowCopy(locale).contacts}</h2>
      {[...new Set(methods.map((method) => method.partyId))].map((partyId) => (
        <div key={partyId} className="space-y-2">
          <p className="font-semibold">
            {methods.find((method) => method.partyId === partyId)?.name}
          </p>
          <ContactActions
            locale={locale}
            methods={methods.filter((method) => method.partyId === partyId)}
          />
        </div>
      ))}
    </section>
  ) : null;
}
