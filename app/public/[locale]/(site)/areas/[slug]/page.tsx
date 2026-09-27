// P16: current approved area content, otherwise a truthful availability state.
import { ContentScreen } from "@/features/discovery/content-screen";
import { discoveryMetadata } from "@/features/discovery/page";
export const metadata = discoveryMetadata;
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return <ContentScreen locale={locale} kind="area" slug={slug} route={`/areas/${slug}`} />;
}
