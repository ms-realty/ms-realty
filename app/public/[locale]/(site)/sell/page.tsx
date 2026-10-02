// P14: supply consultation; public explanation requires exact approved CMS content.
import { ContentScreen } from "@/features/discovery/content-screen";
import { publicRouteMetadata } from "@/server/seo/public-metadata";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicRouteMetadata((await params).locale, "/sell");
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <ContentScreen
      locale={locale}
      kind="service"
      slug="sell"
      route="/sell"
      intent="seller_consultation"
    />
  );
}
