// P24: no generated policy or legal guidance.
import { ContentScreen } from "@/features/discovery/content-screen";
import { publicContentMetadata } from "@/server/seo/public-metadata";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; topic: string }>;
}) {
  const { locale, topic } = await params;
  return publicContentMetadata(locale, "help", topic, `/help/${topic}`);
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; topic: string }>;
}) {
  const { locale, topic } = await params;
  return <ContentScreen locale={locale} kind="help" slug={topic} route={`/help/${topic}`} />;
}
