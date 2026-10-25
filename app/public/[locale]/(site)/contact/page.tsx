// P20: contact through the durable inquiry route; approved office/service details only.
import { ContentScreen } from "@/features/discovery/content-screen";
import { publicContentMetadata } from "@/server/seo/public-metadata";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicContentMetadata((await params).locale, "help", "contact", "/contact");
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ContentScreen locale={locale} kind="help" slug="contact" route="/contact" />;
}
