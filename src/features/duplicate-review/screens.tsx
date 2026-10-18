import "server-only";
import { getDb } from "@/db/client";
import { dataReviewCopy } from "@/features/import-review/copy";
import { privateRead, queryPage } from "@/features/work/screens";
import type { Session } from "@/server/auth/sessions";
import {
  contactReviewOwner,
  readContactPair,
  readDeferredContactReview,
} from "@/server/duplicate-review/review";
import { listContacts, readContact } from "@/server/work/queries";
import { buttonClass } from "@/ui/button-class";
import { controlClass, fieldClass, labelClass } from "@/ui/field-class";
import { issueFormOperation } from "@/ui/form/server";
import { deferContactReviewAction } from "./actions";
import { ContactReviewForm } from "./form";

const link = "min-h-control py-2 font-semibold text-link underline underline-offset-4";
type Contact = Awaited<ReturnType<typeof readContactPair>>["left"];
function ContactCard({
  locale,
  contact,
  label,
}: {
  locale: string;
  contact: Contact;
  label: string;
}) {
  const copy = dataReviewCopy(locale).duplicates;
  return (
    <article
      className="grid min-w-0 content-start gap-4 rounded-panel border border-border p-4"
      data-contact-comparison={contact.party.id}
    >
      <h2 className="text-h2 font-semibold">{label}</h2>
      <p className="break-words text-h3 font-semibold">{contact.party.displayName}</p>
      <a href={`/${locale}/contacts/${contact.party.id}`} className={link}>
        {copy.openContact}
      </a>
      <h3 className="font-semibold">{copy.methods}</h3>
      {contact.methods.length ? (
        <ul className="grid gap-3">
          {contact.methods.map((method) => (
            <li key={method.id}>
              <p className="whitespace-pre-wrap break-all">{method.value}</p>
              <p className="text-caption text-text-muted">
                {method.verification === "verified"
                  ? copy.verified
                  : method.verification === "unverified"
                    ? copy.unverified
                    : copy.otherVerification}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{copy.noMethods}</p>
      )}
      <h3 className="font-semibold">{copy.inquiries}</h3>
      <ul>
        {contact.inquiries.map((inquiry) => (
          <li key={inquiry.id}>
            <a className={`${link} inline-block`} href={`/${locale}/inquiries/${inquiry.id}`}>
              {inquiry.reference}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
export async function DuplicateReviewScreen({
  locale,
  session,
  query,
}: {
  locale: string;
  session: Session;
  query: { left?: string; right?: string; page?: string; error?: string };
}) {
  const copy = dataReviewCopy(locale),
    c = copy.duplicates;
  const pair =
    query.left && query.right
      ? await privateRead(() =>
          readContactPair(getDb(), session, { left: query.left, right: query.right }),
        )
      : null;
  const contacts = pair
    ? null
    : await privateRead(() => listContacts(getDb(), session, queryPage(query.page)));
  const first =
    !pair && query.left
      ? await privateRead(() => readContact(getDb(), session, query.left as string))
      : null;
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 p-4 md:p-8" data-duplicate-review>
      <h1 className="text-h1 font-semibold">{c.title}</h1>
      <p>{c.intro}</p>
      <p className="rounded-panel border border-border bg-subtle p-4 font-semibold">{c.boundary}</p>
      {query.error ? (
        <p role="alert" className="text-error">
          {c.failure}
        </p>
      ) : null}
      {pair ? (
        <>
          <p>{c.scope}</p>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <ContactCard locale={locale} contact={pair.left} label={c.left} />
            <ContactCard locale={locale} contact={pair.right} label={c.right} />
          </div>
          <ContactReviewForm
            locale={locale}
            left={pair.left.party.id}
            right={pair.right.party.id}
            leftVersion={pair.left.party.version}
            rightVersion={pair.right.party.version}
            inquiryId={pair.left.inquiries[0]?.id ?? ""}
            ownerName={await contactReviewOwner(getDb(), session)}
            initialState={{
              operationId: issueFormOperation(
                `contact-review:${session.account.id}:${pair.left.party.id}:${pair.right.party.id}`,
              ),
              nextStep: "",
            }}
            action={deferContactReviewAction.bind(
              null,
              locale,
              pair.left.party.id,
              pair.right.party.id,
            )}
          />
          <a className={link} href={`/${locale}/operations/duplicates`}>
            {c.newPair}
          </a>
        </>
      ) : contacts?.rows.length ? (
        <>
          <form method="get" className="grid gap-5">
            {first ? (
              <div>
                <h2 className="font-semibold">{c.left}</h2>
                <p className="break-words">{first.party.displayName}</p>
                <input type="hidden" name="left" value={first.party.id} />
                <a className={`${link} inline-block`} href={`/${locale}/operations/duplicates`}>
                  {c.newPair}
                </a>
              </div>
            ) : null}
            <div className="grid gap-4">
              {(first ? (["right"] as const) : (["left"] as const)).map((side) => (
                <div className={fieldClass} key={side}>
                  <label className={labelClass} htmlFor={`contact-${side}`}>
                    {c[side]}
                  </label>
                  <select
                    id={`contact-${side}`}
                    name={side}
                    className={controlClass}
                    required
                    defaultValue=""
                  >
                    <option value="">{c.choose}</option>
                    {contacts.rows
                      .filter((contact) => contact.id !== first?.party.id)
                      .map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name} · {contact.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>
            <button type="submit" className={buttonClass()}>
              {first ? c.compare : c.chooseFirst}
            </button>
          </form>
          <nav className="flex flex-wrap gap-5">
            {contacts.page > 1 ? (
              <a
                className={link}
                href={`?page=${contacts.page - 1}${first ? `&left=${first.party.id}` : ""}`}
              >
                {c.previous}
              </a>
            ) : null}
            {contacts.hasMore ? (
              <a
                className={link}
                href={`?page=${contacts.page + 1}${first ? `&left=${first.party.id}` : ""}`}
              >
                {c.more}
              </a>
            ) : null}
          </nav>
        </>
      ) : (
        <p>{c.empty}</p>
      )}
      <a className={link} href={`/${locale}/operations`}>
        {copy.tools}
      </a>
    </div>
  );
}
export async function DeferredReviewScreen({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const result = await privateRead(() => readDeferredContactReview(getDb(), session, id));
  const copy = dataReviewCopy(locale).duplicates;
  return (
    <div
      className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 p-4 md:p-8"
      data-contact-review-receipt
    >
      <h1 className="text-h1 font-semibold">{copy.pending}</h1>
      <p>{copy.saved}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <ContactCard locale={locale} contact={result.pair.left} label={copy.left} />
        <ContactCard locale={locale} contact={result.pair.right} label={copy.right} />
      </div>
      <dl className="grid gap-3">
        <div>
          <dt className="font-semibold">{copy.owner}</dt>
          <dd>{result.ownerName ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.nextStep}</dt>
          <dd className="whitespace-pre-wrap break-words">{result.task.title}</dd>
        </div>
      </dl>
      <a className={link} href={`/${locale}/tasks/${result.task.id}`}>
        {copy.openTask}
      </a>
      <a className={link} href={`/${locale}/operations/duplicates`}>
        {copy.newPair}
      </a>
    </div>
  );
}
