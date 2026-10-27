// P18 / F28: landlord consultation without property-management claims.
import { ContentScreen } from "@/features/discovery/content-screen";
import { publicContentMetadata } from "@/server/seo/public-metadata";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicContentMetadata((await params).locale, "service", "let", "/let");
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <ContentScreen
      locale={locale}
      kind="service"
      slug="let"
      route="/let"
      intent="landlord_consultation"
    />
  );
}
