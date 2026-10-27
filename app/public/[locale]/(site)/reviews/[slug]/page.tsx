// B10: every request rechecks original-author consent and privacy restrictions at origin.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { ContentPlaintext } from "@/features/content/plaintext";
import { DiscoveryPage } from "@/features/discovery/page";
import { isRoutableLocale } from "@/i18n/config";
import { readApprovedContent } from "@/server/content/public";
import { publicContentMetadata } from "@/server/seo/public-metadata";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return publicContentMetadata(locale, "review", slug, `/reviews/${slug}`);
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const content = await readApprovedContent(getDb(), "review", slug, locale);
  if (!content) notFound();
  return (
    <DiscoveryPage>
      <article lang={content.locale} className="max-w-reading space-y-6 break-words">
        <h1 className="text-title font-semibold">
          <ContentPlaintext text={content.title} />
        </h1>
        <blockquote className="whitespace-pre-wrap">
          <ContentPlaintext text={content.paragraphs[0] ?? ""} />
        </blockquote>
        <p className="whitespace-pre-wrap">
          <ContentPlaintext text={content.paragraphs[1] ?? ""} />
        </p>
      </article>
    </DiscoveryPage>
  );
}
