// P24: no generated policy or legal guidance.
import { ContentScreen } from "@/features/discovery/content-screen";
import { discoveryMetadata } from "@/features/discovery/page";
export const metadata = discoveryMetadata;
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; topic: string }>;
}) {
  const { locale, topic } = await params;
  return <ContentScreen locale={locale} kind="help" slug={topic} route={`/help/${topic}`} />;
}
