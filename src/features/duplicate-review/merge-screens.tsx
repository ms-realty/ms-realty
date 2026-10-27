import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { listings } from "@/db/schema";
import { privateRead } from "@/features/work/screens";
import type { Session } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import {
  type DuplicateIdentity,
  type DuplicateImpact,
  type DuplicatePair,
  type Hold,
  listDuplicateSources,
  type MergeSubject,
  readCanonicalDuplicate,
  readDuplicateSource,
} from "@/server/duplicate-review/impact";
import {
  duplicateOperationScope,
  duplicateOperationStatus,
  previewDuplicateMerge,
  previewDuplicateReversal,
  readDuplicateReceipt,
} from "@/server/duplicate-review/merge";
import { AppError } from "@/server/errors";
import { buttonClass } from "@/ui/button-class";
import { controlClass, fieldClass, labelClass } from "@/ui/field-class";
import { isIssuedFormOperation, issueFormOperation } from "@/ui/form/server";
import { Table } from "@/ui/table";
import { duplicateMergeAction } from "./merge-actions";
import { duplicateMergeCopy } from "./merge-copy";
import { DuplicateMergeForm } from "./merge-form";

const link = "inline-block min-h-control py-2 font-semibold text-link underline underline-offset-4";
const shell = "mx-auto grid w-full max-w-5xl min-w-0 gap-6 p-4 md:p-8";
const base = (locale: string) => `/${locale}/operations/duplicates/merge`;
export const duplicatePairQuery = (pair: DuplicatePair) =>
  `subject=${pair.subject}&left=${pair.left}&right=${pair.right}`;
type Copy = ReturnType<typeof duplicateMergeCopy>;

function IdentityCard({
  identity,
  copy,
  title,
}: {
  identity: DuplicateIdentity;
  copy: Copy;
  title: string;
}) {
  return (
    <article
      className="grid min-w-0 gap-2 rounded-panel border border-border p-4"
      data-duplicate-source={identity.id}
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="break-words text-subheading">{identity.label}</p>
      <p className="break-all text-caption text-text-muted">{identity.id}</p>
      <p>
        {copy.version}: {identity.version}
      </p>
      {identity.aliases.length ? (
        <ul>
          {identity.aliases.map((alias) => (
            <li className="break-words" key={alias}>
              {alias}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
function Holds({ copy, held }: { copy: Copy; held: Hold[] }) {
  if (!held.length) return null;
  return (
    <section className="grid gap-3 rounded-panel border border-warning p-4" data-duplicate-held>
      <h2 className="text-heading font-semibold">{copy.blocked}</h2>
      <ul className="grid gap-3">
        {held.map((reason) => (
          <li key={reason}>{copy.holds[reason]}</li>
        ))}
      </ul>
      <p>{copy.manual}</p>
    </section>
  );
}
function Impact({ copy, impact }: { copy: Copy; impact: DuplicateImpact }) {
  const keys = Object.keys(impact.left.fields) as Array<keyof Copy["fields"]>;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <IdentityCard identity={impact.left} copy={copy} title={copy.left} />
        <IdentityCard identity={impact.right} copy={copy} title={copy.right} />
      </div>
      <section className="grid gap-3">
        <h2 className="text-heading font-semibold">{copy.differences}</h2>
        <Table
          caption={copy.differences}
          hideCaption
          rowHeader="field"
          columns={[
            { key: "field", label: copy.field },
            { key: "left", label: copy.left },
            { key: "right", label: copy.right },
          ]}
          rows={keys.map((key) => ({
            id: key,
            field: copy.fields[key],
            left: (
              <span className="block max-w-72 whitespace-normal break-words">
                {impact.left.fields[key] ?? "—"}
              </span>
            ),
            right: (
              <span className="block max-w-72 whitespace-normal break-words">
                {impact.right.fields[key] ?? "—"}
              </span>
            ),
          }))}
        />
        <p>{copy.kept}</p>
      </section>
      <section className="grid gap-3" data-duplicate-impact>
        <h2 className="text-heading font-semibold">{copy.relationships}</h2>
        <p>{copy.retained}</p>
        {impact.references.length ? (
          <ul className="grid gap-3">
            {impact.references.map((reference) => (
              <li
                key={`${reference.table}:${reference.id}`}
                className="rounded-panel border border-border p-3"
              >
                <p className="font-semibold">
                  {copy.references[reference.table as keyof Copy["references"]] ?? copy.reference}
                </p>
                <p className="break-all text-caption">{reference.id}</p>
                <details>
                  <summary className="min-h-control cursor-pointer py-2 text-link">
                    {copy.audience}
                  </summary>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-caption">
                    {JSON.stringify(reference.audience, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p>{copy.noReferences}</p>
        )}
      </section>
      <Holds copy={copy} held={impact.held} />
    </>
  );
}

async function SourceLinks({
  locale,
  session,
  subject,
  id,
}: {
  locale: string;
  session: Session;
  subject: MergeSubject;
  id: string;
}) {
  const copy = duplicateMergeCopy(locale);
  if (subject === "party")
    return (
      <a className={link} href={`/${locale}/contacts/${id}`}>
        {copy.openSource}
      </a>
    );
  const rows = await getDb().select().from(listings).where(eq(listings.propertyId, id));
  const visible = [];
  for (const row of rows)
    if (
      await can(getDb(), session.actor, "listing.read", {
        type: "listing",
        id: row.id,
        propertyId: id,
        audience: "internal",
      })
    )
      visible.push(row);
  return (
    <ul>
      {visible.map((row) => (
        <li key={row.id}>
          <a className={link} href={`/${locale}/inventory/${encodeURIComponent(row.reference)}`}>
            {copy.openSource} · {row.reference}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** O27/F32: source comparison → explicit survivor → exact impact → human command. */
export async function DuplicateMergeScreen({
  locale,
  session,
  query,
}: {
  locale: string;
  session: Session;
  query: {
    subject?: string;
    left?: string;
    right?: string;
    survivor?: string;
    key?: string;
    after?: string;
  };
}) {
  const copy = duplicateMergeCopy(locale),
    subject: MergeSubject = query.subject === "property" ? "property" : "party";
  const pair = query.left && query.right ? { subject, left: query.left, right: query.right } : null;
  const impact = pair
    ? await privateRead(() => previewDuplicateMerge(getDb(), session, pair))
    : null;
  const selection = pair
    ? { rows: [], nextCursor: null }
    : await privateRead(() => listDuplicateSources(getDb(), session, subject, query.after));
  const first =
    !pair && query.left
      ? await privateRead(async () => {
          const record = await readDuplicateSource(
            getDb(),
            session.actor,
            subject,
            query.left as string,
          );
          if (
            !(await can(getDb(), session.actor, "import.run", {
              type: subject,
              id: record.id,
              audience: "internal",
            }))
          )
            throw new AppError("not_found");
          return record;
        })
      : null;
  const sources = selection.rows.filter((source) => source.id !== first?.id);
  const survivor =
    pair && query.survivor && [pair.left, pair.right].includes(query.survivor)
      ? query.survivor
      : null;
  const alias = pair && survivor ? (survivor === pair.left ? pair.right : pair.left) : null;
  let permalink =
    pair && survivor
      ? `${base(locale)}?${duplicatePairQuery(pair)}&survivor=${survivor}`
      : base(locale);
  let operationId = "";
  if (pair && survivor) {
    const scope = duplicateOperationScope(session.account.id, "merge", pair);
    if (!query.key) redirect(`${permalink}&key=${encodeURIComponent(issueFormOperation(scope))}`);
    if (!isIssuedFormOperation(scope, query.key)) throw new AppError("not_found");
    operationId = query.key;
    permalink += `&key=${encodeURIComponent(operationId)}`;
    const status = await privateRead(() =>
      duplicateOperationStatus(getDb(), session, pair, "merge", operationId),
    );
    if (status.state === "succeeded") redirect(`${base(locale)}/receipt?id=${status.id}`);
    if (status.state !== "absent")
      redirect(
        `${base(locale)}/status?${duplicatePairQuery(pair)}&mode=merge&key=${encodeURIComponent(operationId)}`,
      );
  }
  return (
    <div className={shell} data-duplicate-merge-review>
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <p>{copy.intro}</p>
      {!pair ? (
        <>
          <nav className="flex flex-wrap gap-6" aria-label={copy.chooseType}>
            <a
              className={link}
              href={`${base(locale)}?subject=party`}
              aria-current={subject === "party" ? "page" : undefined}
            >
              {copy.party}
            </a>
            <a
              className={link}
              href={`${base(locale)}?subject=property`}
              aria-current={subject === "property" ? "page" : undefined}
            >
              {copy.property}
            </a>
          </nav>
          {first ? <IdentityCard identity={first} copy={copy} title={copy.left} /> : null}
          {sources.length ? (
            <form method="get" className="grid gap-5">
              <input type="hidden" name="subject" value={subject} />
              {first ? <input type="hidden" name="left" value={first.id} /> : null}
              {(first ? (["right"] as const) : (["left"] as const)).map((side) => (
                <div className={fieldClass} key={side}>
                  <label htmlFor={`merge-${side}`} className={labelClass}>
                    {copy[side]}
                  </label>
                  <select
                    className={controlClass}
                    name={side}
                    id={`merge-${side}`}
                    required
                    defaultValue=""
                  >
                    <option value="">{copy.choose}</option>
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.label} · {source.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button className={buttonClass()} type="submit">
                {first ? copy.compare : copy.chooseSecond}
              </button>
            </form>
          ) : (
            <p>{copy.empty}</p>
          )}
          {selection.nextCursor ? (
            <a
              className={link}
              href={`${base(locale)}?subject=${subject}&after=${selection.nextCursor}${first ? `&left=${first.id}` : ""}`}
            >
              {copy.nextPage}
            </a>
          ) : null}
        </>
      ) : impact ? (
        <>
          <Impact copy={copy} impact={impact} />
          <div className="grid gap-4 md:grid-cols-2">
            <SourceLinks locale={locale} session={session} subject={subject} id={pair.left} />
            <SourceLinks locale={locale} session={session} subject={subject} id={pair.right} />
          </div>
          {!impact.held.length ? (
            <>
              <form method="get" className="grid gap-4">
                <input type="hidden" name="subject" value={subject} />
                <input type="hidden" name="left" value={pair.left} />
                <input type="hidden" name="right" value={pair.right} />
                <fieldset className="grid gap-3">
                  <legend className="mb-3 font-semibold">{copy.chooseSurvivor}</legend>
                  {[impact.left, impact.right].map((identity) => (
                    <label key={identity.id} className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="survivor"
                        value={identity.id}
                        defaultChecked={identity.id === survivor}
                        required
                        className="mt-1 size-5 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 break-words">
                        {identity.label} · {identity.id}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className={buttonClass("secondary")}>
                  {copy.reviewMapping}
                </button>
              </form>
              {survivor && alias ? (
                <section
                  className="grid gap-4 rounded-panel border border-border p-4"
                  data-duplicate-alias-map
                >
                  <h2 className="text-heading font-semibold">{copy.mapping}</h2>
                  <p className="break-all">
                    {alias} → {survivor}
                  </p>
                  <p>{copy.mappingHint}</p>
                  <DuplicateMergeForm
                    locale={locale}
                    mode="merge"
                    leftVersion={impact.left.version}
                    rightVersion={impact.right.version}
                    impactDigest={impact.digest}
                    permalink={permalink}
                    statusUrl={`${base(locale)}/status?${duplicatePairQuery(pair)}&mode=merge`}
                    initialState={{
                      operationId,
                      reason: "",
                    }}
                    action={duplicateMergeAction.bind(null, locale, pair, "merge", survivor)}
                  />
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      <a href={`/${locale}/operations/duplicates`} className={link}>
        {copy.cancel}
      </a>
    </div>
  );
}

export async function DuplicateMergeReceiptScreen({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const result = await privateRead(() => readDuplicateReceipt(getDb(), session, id)),
    copy = duplicateMergeCopy(locale);
  return (
    <div className={shell} data-duplicate-merge-receipt>
      <h1 className="text-title font-semibold">
        {result.receipt.action === "merge" ? copy.merged : copy.reversed}
      </h1>
      <dl className="grid gap-3">
        <div>
          <dt className="font-semibold">{copy.receipt}</dt>
          <dd className="break-all">{result.operationId}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.history}</dt>
          <dd className="break-all">{result.record.id}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.preservedCount}</dt>
          <dd>{result.receipt.preservedReferenceCount}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.permissions}</dt>
          <dd>{copy.none}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.reasonRecorded}</dt>
          <dd className="whitespace-pre-wrap break-words">{result.receipt.decisionReason}</dd>
        </div>
      </dl>
      <p>{copy.retained}</p>
      <a
        className={link}
        href={`${base(locale)}/identity?subject=${result.pair.subject}&id=${result.receipt.survivor}`}
      >
        {copy.openCanonical}
      </a>
      {!result.record.reversedAt ? (
        <>
          <Holds copy={copy} held={result.impact.held} />
          <a className={link} href={`${base(locale)}/split?id=${result.record.id}`}>
            {copy.splitReview}
          </a>
        </>
      ) : (
        <p>{copy.holds.already_reversed}</p>
      )}
      <a className={link} href={`${base(locale)}?${duplicatePairQuery(result.pair)}`}>
        {copy.reviewAgain}
      </a>
    </div>
  );
}

export async function DuplicateSplitScreen({
  locale,
  session,
  id,
  operationKey,
}: {
  locale: string;
  session: Session;
  id: string;
  operationKey?: string;
}) {
  const result = await privateRead(() => previewDuplicateReversal(getDb(), session, id)),
    copy = duplicateMergeCopy(locale);
  const scope = duplicateOperationScope(
    session.account.id,
    "reverse",
    result.pair,
    result.record.id,
  );
  const reviewUrl = `${base(locale)}/split?id=${result.record.id}`;
  if (!operationKey) redirect(`${reviewUrl}&key=${encodeURIComponent(issueFormOperation(scope))}`);
  if (!isIssuedFormOperation(scope, operationKey)) throw new AppError("not_found");
  const permalink = `${reviewUrl}&key=${encodeURIComponent(operationKey)}`;
  const status = await privateRead(() =>
    duplicateOperationStatus(
      getDb(),
      session,
      result.pair,
      "reverse",
      operationKey,
      result.record.id,
    ),
  );
  if (status.state === "succeeded") redirect(`${base(locale)}/receipt?id=${status.id}`);
  if (status.state !== "absent")
    redirect(
      `${base(locale)}/status?${duplicatePairQuery(result.pair)}&mode=reverse&mergeId=${result.record.id}&key=${encodeURIComponent(operationKey)}`,
    );
  return (
    <div className={shell} data-duplicate-split-review>
      <h1 className="text-title font-semibold">{copy.splitReview}</h1>
      <p>{copy.splitBoundary}</p>
      <Impact copy={copy} impact={result.impact} />
      {!result.impact.held.length ? (
        <DuplicateMergeForm
          locale={locale}
          mode="reverse"
          leftVersion={result.impact.left.version}
          rightVersion={result.impact.right.version}
          impactDigest={result.impact.digest}
          permalink={permalink}
          statusUrl={`${base(locale)}/status?${duplicatePairQuery(result.pair)}&mode=reverse&mergeId=${result.record.id}`}
          initialState={{
            operationId: operationKey,
            reason: "",
          }}
          action={duplicateMergeAction.bind(null, locale, result.pair, "reverse", result.record.id)}
        />
      ) : null}
      <a
        className={link}
        href={`${base(locale)}/identity?subject=${result.pair.subject}&id=${result.record.mergedId}`}
      >
        {copy.openCanonical}
      </a>
    </div>
  );
}

export async function DuplicateIdentityScreen({
  locale,
  session,
  subject,
  id,
}: {
  locale: string;
  session: Session;
  subject: MergeSubject;
  id: string;
}) {
  const current = await privateRead(() => readCanonicalDuplicate(getDb(), session, subject, id)),
    copy = duplicateMergeCopy(locale);
  return (
    <div className={shell} data-canonical-identity>
      <h1 className="text-title font-semibold">{copy.survivor}</h1>
      <p>{copy.mappingHint}</p>
      <IdentityCard identity={current.canonical} copy={copy} title={copy.survivor} />
      <SourceLinks locale={locale} session={session} subject={subject} id={current.canonical.id} />
      <h2 className="text-heading font-semibold">{copy.aliases}</h2>
      {current.aliases.length ? (
        current.aliases.map((alias) => (
          <section className="grid gap-3" key={alias.id}>
            <IdentityCard identity={alias} copy={copy} title={copy.sourceIdentity} />
            <SourceLinks locale={locale} session={session} subject={subject} id={alias.id} />
          </section>
        ))
      ) : (
        <p>{copy.noAliases}</p>
      )}
      <a className={link} href={base(locale)}>
        {copy.reviewAgain}
      </a>
    </div>
  );
}
