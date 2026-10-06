// P09: public-facts recipient view. The viewing token selects a list and grants nothing else:
// no Case, no creator, no management. Eligibility and revocation are read on every request;
// the proxy owns no-store/no-referrer, and this route adds no third-party script or analytics.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryMetadata } from "@/features/discovery/page";
import { shareCopy } from "@/features/discovery/share-copy";
import { SharedShortlist } from "@/features/discovery/shared-shortlist";
import { isRoutableLocale } from "@/i18n/config";
import { readPublicShare } from "@/server/shares/public";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  // No canonical or hreflang alternates: the URL itself is the secret. Never indexable.
  return { title: shareCopy(locale).title, ...discoveryMetadata, referrer: "no-referrer" };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isRoutableLocale(locale)) notFound();
  return (
    <SharedShortlist
      locale={locale}
      token={token}
      read={await readPublicShare(getDb(), token, locale)}
    />
  );
}
