import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import { isPublicLocale } from "@/i18n/config";
import {
  listPersonalSaves,
  reviewSavedTransfer,
  savedContinuationCookie,
} from "@/server/account-saves/service";
import { getEnv } from "@/server/config/env";
import { buttonClass } from "@/ui/button-class";
import { NativeForm } from "@/ui/form/native-form";
import { clientWorkflowCopy } from "../cases/client-workflow-copy";
import { type ScreenProps, WorkflowPage, workflowLink } from "../cases/screens";
import { discoveryCopy } from "../discovery/copy";
import { listingHref, locality, priceText } from "../discovery/presentation";
import { accountSavesCopy } from "./copy";
export async function AccountSavesScreen(props: ScreenProps & { review?: boolean }) {
  const locale = isPublicLocale(props.locale) ? props.locale : "bg",
    c = accountSavesCopy(locale),
    copy = discoveryCopy(locale);
  const [identity] = await getDb()
    .select({ email: principals.email })
    .from(principals)
    .where(eq(principals.id, props.session.account.id));
  const nonce = (await cookies()).get(savedContinuationCookie())?.value;
  const review =
    props.review && nonce
      ? await reviewSavedTransfer(getDb(), props.session, nonce, locale).catch(() => null)
      : null;
  const items = props.review
    ? (review?.items ?? [])
    : await listPersonalSaves(getDb(), props.session, locale);
  return (
    <WorkflowPage {...props} title={props.review ? c.review : c.title}>
      <p>
        {clientWorkflowCopy(locale).account}: <bdi>{identity?.email ?? "—"}</bdi>
      </p>
      {props.review ? <p>{c.hint}</p> : null}
      {review?.consumed ? <p role="status">{c.complete}</p> : null}
      {items.length ? (
        <ul className="divide-y divide-divider">
          {items.map((item) => (
            <li key={item.reference} className="space-y-2 py-4">
              {item.card ? (
                <>
                  <a
                    className={workflowLink}
                    href={`${getEnv().hosts.public}${listingHref(item.card, locale)}`}
                  >
                    {item.card.title ?? item.reference}
                  </a>
                  <p>
                    <bdi>{item.reference}</bdi> · {locality(item.card)}
                  </p>
                  <p>
                    <bdi>{priceText(item.card.price, locale, copy)}</bdi>
                  </p>
                </>
              ) : (
                <p>
                  <bdi>{item.reference}</bdi> · {c.unavailable}
                </p>
              )}
              {"existing" in item ? (
                <p>{!item.card ? c.unavailable : item.existing ? c.existing : c.added}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{props.review ? c.error : c.empty}</p>
      )}
      {review && !review.consumed ? (
        <NativeForm action={`/${locale}/saved/confirm`} method="post">
          <input type="hidden" name="operationId" value={randomUUID()} />
          <button type="submit" className={buttonClass("primary")}>
            {c.confirm}
          </button>
        </NativeForm>
      ) : null}
      <a
        className={workflowLink}
        href={props.review ? `/${locale}/saved` : `${getEnv().hosts.public}/${locale}/saved`}
      >
        {props.review ? c.cancel : c.restart}
      </a>
    </WorkflowPage>
  );
}
