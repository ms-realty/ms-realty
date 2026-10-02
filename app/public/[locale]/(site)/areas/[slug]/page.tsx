// P16: current approved area content, otherwise a truthful availability state.
import { ContentScreen } from "@/features/discovery/content-screen";
import { publicContentMetadata } from "@/server/seo/public-metadata";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return publicContentMetadata(locale, "area", slug, `/areas/${slug}`);
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return <ContentScreen locale={locale} kind="area" slug={slug} route={`/areas/${slug}`} />;
}
