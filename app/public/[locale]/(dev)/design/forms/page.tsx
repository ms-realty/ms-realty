import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isPublicLocale } from "@/i18n/config";
import { initialFormState } from "@/ui/form/server";
import { formSpecimenCopy } from "@/ui/form/specimen-copy";
import { SpecimenForm } from "@/ui/form/specimen-form";
import { specimenRevision, specimenScope, specimenStatusHref } from "@/ui/form/specimen-server";
import { isDesignSpecimenEnabled } from "@/ui/specimen/enabled";
import { checkPracticeForm } from "./actions";

export const metadata: Metadata = {
  title: "Form submission specimen",
  robots: { index: false, follow: false },
};

export default async function FormSpecimenPage({
  params,
  searchParams,
}: PageProps<"/public/[locale]/design/forms">) {
  await connection();
  if (!isDesignSpecimenEnabled()) notFound();
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  const conflict = (await searchParams).scenario === "conflict";
  const permalink = `/${locale}/design/forms${conflict ? "?scenario=conflict" : ""}`;
  const copy = formSpecimenCopy(locale);
  const initialState = initialFormState(
    specimenScope,
    { subject: "", note: "" },
    conflict ? 1 : specimenRevision,
  );
  return (
    <main
      lang={["bg", "he"].includes(locale) ? locale : "en"}
      className="mx-auto flex max-w-reading flex-col gap-6 px-4 py-8 sm:px-6"
    >
      <h1 className="text-display font-semibold">{copy.heading}</h1>
      <p className="text-compact text-text-muted">{copy.scope}</p>
      <noscript>
        <p className="rounded-control border border-info p-4">{copy.noJs}</p>
      </noscript>
      <SpecimenForm
        action={checkPracticeForm.bind(null, locale)}
        initialState={initialState}
        permalink={permalink}
        copy={copy}
        statusHref={specimenStatusHref(locale, initialState.operationId)}
      />
      <a
        href={`/${locale}/design/forms?scenario=conflict`}
        className="text-compact font-semibold underline"
      >
        {copy.conflictLink}
      </a>
    </main>
  );
}
