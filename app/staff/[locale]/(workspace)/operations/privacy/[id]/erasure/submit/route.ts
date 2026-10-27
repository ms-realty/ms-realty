import { redirect } from "next/navigation";
import { privacyErasureFormRoute } from "@/server/privacy/erasure-route";
export const POST = privacyErasureFormRoute;
// Native browser recovery after a lost POST response keeps the issued exact key.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params;
  redirect(`/${locale}/operations/privacy/${id}/erasure${new URL(request.url).search}`);
}
