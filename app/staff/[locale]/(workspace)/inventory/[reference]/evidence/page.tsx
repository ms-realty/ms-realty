import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { evidenceCopy } from "@/features/inventory/evidence-copy";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { inventoryDetail, inventoryEvidence } from "@/server/inventory/commands";
import { listContacts } from "@/server/work/queries";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { inventoryDecision } from "../../actions";

export default async function SellerEvidencePage({
  params,
}: {
  params: Promise<{ locale: string; reference: string }>;
}) {
  const { locale, reference } = await params;
  const session = await requireStaffPage(locale),
    db = getDb(),
    copy = evidenceCopy(locale);
  const detail = await inventoryDetail(db, session.actor, reference);
  const evidence = await inventoryEvidence(db, session.actor, reference);
  const contactPage = await listContacts(db, session).catch(() => ({ rows: [] }));
  const resource = { type: "listing", id: detail.listing.id, propertyId: detail.property.id };
  const edit = await can(db, session.actor, "listing.edit", resource);
  const review = edit && (await can(db, session.actor, "listing.review_facts", resource));
  const authorityDocs = evidence.documents.filter((d) => d.purpose === "seller_authority");
  const agreementDocs = evidence.documents.filter((d) => d.purpose === "seller_instruction");
  function envelope(intent: string) {
    return (
      <>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="operationId" value={randomUUID()} />
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="expectedRevision" value={detail.listing.version} />
      </>
    );
  }
  function documentOptions(items: typeof evidence.documents) {
    return (
      <>
        <option value="">{copy.choose}</option>
        {items.map((d) => (
          <option key={d.versionId} value={d.versionId}>
            {d.reference} · {d.fileName} · v{d.version}
          </option>
        ))}
      </>
    );
  }
  function confirm(text: string) {
    return (
      <label className="flex items-start gap-3">
        <input type="checkbox" required name="confirmed" value="yes" className="mt-1 size-5" />
        {text}
      </label>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-8">
      <a href={`/${locale}/inventory/${reference}`} className="text-action underline">
        {copy.back}
      </a>
      <header>
        <h1 className="text-title font-semibold">{copy.title}</h1>
        <p>
          <bdi>{reference}</bdi>
        </p>
      </header>
      <p>{copy.missing}</p>
      <a href={`/${locale}/inventory/${reference}/documents`} className="text-action underline">
        {locale === "bg"
          ? "Преглед на документите"
          : locale === "ru"
            ? "Проверка документов"
            : "Review documents"}
      </a>
      {review ? (
        <form
          action={inventoryDecision}
          className="space-y-4 rounded-panel border border-divider bg-surface p-6"
        >
          {envelope("authority")}
          <h2 className="text-section font-semibold">{copy.authority}</h2>
          <label className="grid gap-2">
            {copy.party}
            <select name="partyId" required defaultValue="" className={controlClass}>
              <option value="">{copy.choose}</option>
              {contactPage.rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {copy.role}
            <select name="role" required className={controlClass}>
              {(["seller", "landlord", "authorized_representative"] as const).map((r) => (
                <option key={r} value={r}>
                  {copy[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {copy.authorityDocument}
            <select name="documentVersionId" required defaultValue="" className={controlClass}>
              {documentOptions(authorityDocs)}
            </select>
          </label>
          <label className="grid gap-2">
            {copy.scope}
            <textarea
              name="scope"
              required
              minLength={5}
              maxLength={2000}
              className={controlClass}
            />
          </label>
          {confirm(copy.authorityConfirm)}
          <button
            type="submit"
            className={buttonClass("primary")}
            disabled={!authorityDocs.length || !contactPage.rows.length}
          >
            {copy.authority}
          </button>
        </form>
      ) : null}
      {edit ? (
        <form
          action={inventoryDecision}
          className="space-y-4 rounded-panel border border-divider bg-surface p-6"
        >
          {envelope("instruction")}
          <h2 className="text-section font-semibold">{copy.instruction}</h2>
          <p>{copy.instructionNotice}</p>
          <label className="grid gap-2">
            {copy.party}
            <select name="partyId" required defaultValue="" className={controlClass}>
              <option value="">{copy.choose}</option>
              {evidence.relationships.map((p) => (
                <option key={p.id} value={p.partyId}>
                  {p.name} · {p.role in copy ? copy[p.role as "seller"] : p.role}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {copy.agreementDocument}
            <select name="documentVersionId" required defaultValue="" className={controlClass}>
              {documentOptions(agreementDocs)}
            </select>
          </label>
          <label className="grid gap-2">
            {copy.representation}
            <select name="representationScope" required className={controlClass}>
              {(["sale", "letting", "sale_and_letting"] as const).map((r) => (
                <option key={r} value={r}>
                  {copy[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {copy.commission}
            <textarea name="commissionTerms" required maxLength={4000} className={controlClass} />
          </label>
          <label className="grid gap-2">
            {copy.agreedAt}
            <input name="agreedAt" type="datetime-local" required className={controlClass} />
          </label>
          <label className="grid gap-2">
            {copy.expiresAt}
            <input name="expiresAt" type="datetime-local" className={controlClass} />
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="publicationPermission"
              value="yes"
              className="mt-1 size-5"
            />
            {copy.publication}
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="mediaUsageGranted" value="yes" className="mt-1 size-5" />
            {copy.rights}
          </label>
          {confirm(copy.instructionConfirm)}
          <button
            type="submit"
            className={buttonClass("primary")}
            disabled={!agreementDocs.length || !evidence.relationships.length || !detail.revision}
          >
            {copy.instruction}
          </button>
        </form>
      ) : null}
      <section>
        <h2 className="text-section font-semibold">{copy.instructions}</h2>
        <ul>
          {detail.instructions.map((i) => (
            <li key={i.id}>
              <bdi>{i.reference}</bdi> · {i.state} · {i.revisionNumber}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
