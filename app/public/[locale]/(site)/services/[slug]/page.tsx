// P18/P23: reviewed service scope only.
import { ContentScreen } from "@/features/discovery/content-screen";
import { discoveryMetadata } from "@/features/discovery/page";
export const metadata = discoveryMetadata;
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return <ContentScreen locale={locale} kind="service" slug={slug} route={`/services/${slug}`} />;
}
