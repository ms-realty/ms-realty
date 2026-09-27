// P20: contact through the durable inquiry route; approved office/service details only.
import { ContentScreen } from "@/features/discovery/content-screen";
import { discoveryMetadata } from "@/features/discovery/page";
export const metadata = discoveryMetadata;
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ContentScreen locale={locale} kind="help" slug="contact" route="/contact" />;
}
