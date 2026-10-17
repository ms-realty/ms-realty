import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isPublicLocale } from "@/i18n/config";
import { formSpecimenCopy } from "@/ui/form/specimen-copy";
import {
  readSpecimenReceipt,
  specimenCookie,
  specimenReceiptView,
} from "@/ui/form/specimen-server";
import { Notice } from "@/ui/notice";
import { Receipt } from "@/ui/receipt";
import { isDesignSpecimenEnabled } from "@/ui/specimen/enabled";

export const metadata: Metadata = {
  title: "Practice form receipt",
  robots: { index: false, follow: false },
};

export default async function FormReceiptPage({
  params,
  searchParams,
}: PageProps<"/public/[locale]/design/forms/receipt">) {
  await connection();
  if (!isDesignSpecimenEnabled()) notFound();
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  const copy = formSpecimenCopy(locale);
  const stored = readSpecimenReceipt((await cookies()).get(specimenCookie)?.value);
  const operation = (await searchParams).operation;
  const receipt =
    stored && stored.operationId === operation ? specimenReceiptView(stored, locale) : null;
  return (
    <main
      lang={["bg", "he"].includes(locale) ? locale : "en"}
      className="mx-auto flex max-w-reading flex-col gap-6 px-4 py-8 sm:px-6"
    >
      {receipt ? (
        <Receipt
          title={receipt.title}
          reference={receipt.reference}
          referenceLabel={copy.form.reference}
          recordedAt={receipt.recordedAt}
          recordedAtLabel={copy.form.recordedAt}
          headingLevel={1}
        >
          <p>{receipt.nextStep}</p>
        </Receipt>
      ) : (
        <>
          <h1 className="text-heading font-semibold">{copy.form.unknown}</h1>
          <Notice tone="warning">{copy.receiptMissing}</Notice>
        </>
      )}
      <a href={`/${locale}/design/forms`} className="font-semibold underline">
        {copy.start}
      </a>
    </main>
  );
}
