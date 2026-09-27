import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { FrozenPreview } from "@/features/inventory/frozen-preview";
import { translationCopy } from "@/features/inventory/translation-copy";
import { TranslationEditor } from "@/features/inventory/translation-editor";
import { isPublicLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { translationWorkbench } from "@/server/inventory/translations";
import { translationAction } from "./actions";

export default async function TranslationPage({
  params,
}: {
  params: Promise<{ locale: string; reference: string; language: string }>;
}) {
  const { locale, reference, language } = await params;
  if (!isPublicLocale(language) || language === "bg") notFound();
  const session = await requireStaffPage(locale),
    db = getDb(),
    copy = translationCopy(locale);
  const data = await translationWorkbench(db, session.actor, reference, language),
    row = data.translation;
  const resource = {
    type: "listing",
    id: data.listing.id,
    propertyId: data.listing.propertyId,
    locale: language,
  };
  const mayDraft = await can(db, session.actor, "translation.draft", resource),
    mayReview = await can(db, session.actor, "translation.review", resource);
  const href = `/${locale}/inventory/${reference}/translations/${language}`;
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <a className="text-action underline" href={`/${locale}/inventory/${reference}`}>
        <bdi>{reference}</bdi>
      </a>
      <h1 className="text-title font-semibold">
        {copy.heading} · <bdi>{language.toUpperCase()}</bdi>
      </h1>
      <p>{copy.next}</p>
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <FrozenPreview
          locale={locale}
          reference={reference}
          revision={data.revision}
          facts={data.sourceFacts}
        />
        <section lang={language} dir={language === "he" ? "rtl" : "ltr"}>
          {row?.state === "approved_for_source" || row?.state === "stale" ? (
            <>
              <p>{copy.locked}</p>
              <h2>{row.title}</h2>
              <p className="whitespace-pre-wrap">
                {String((row.body as { description?: string } | null)?.description ?? "")}
              </p>
            </>
          ) : mayDraft || mayReview ? (
            <TranslationEditor
              locale={locale}
              href={href}
              mayDraft={mayDraft}
              mayReview={mayReview}
              action={translationAction.bind(null, locale, reference, language, data.revision.id)}
              initialState={{
                operationId: randomUUID(),
                expectedRevision: row?.version ?? 0,
                responseId: randomUUID(),
                outcome: { kind: "idle" },
                values: {
                  title: row?.title ?? "",
                  description: (row?.body as { description?: string } | null)?.description ?? "",
                  intent: mayDraft ? "save" : "approve",
                  note: "",
                  confirmed: "",
                },
              }}
            />
          ) : (
            <p>{copy.source}</p>
          )}
        </section>
      </div>
    </div>
  );
}
