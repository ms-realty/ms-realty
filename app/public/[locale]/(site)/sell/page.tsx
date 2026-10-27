// P17 / F27: seller consultation; public explanation requires exact approved CMS content.
import { ContentScreen } from "@/features/discovery/content-screen";
import { publicContentMetadata } from "@/server/seo/public-metadata";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicContentMetadata((await params).locale, "service", "sell", "/sell");
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
