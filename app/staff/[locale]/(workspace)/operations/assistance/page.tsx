// O32: contextual source selection; no general assistant chat.
import { notFound } from "next/navigation";
import { AssistanceEntryScreen } from "@/features/ai/entry-screen";
import { AssistanceScreen, checkAiLocale } from "@/features/ai/screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    source?: string | string[];
    operation?: string | string[];
    page?: string | string[];
    view?: string | string[];
  }>;
}) {
  const { locale } = await params;
  checkAiLocale(locale);
  const session = await requireStaffPage(locale);
  const { source, operation, page, view } = await searchParams;
  if (source === undefined)
    return <AssistanceEntryScreen locale={locale} session={session} page={page} view={view} />;
  if (!source || typeof source !== "string") notFound();
  return (
    <AssistanceScreen
      locale={locale}
      sourceId={source}
      session={session}
      {...(typeof operation === "string" && operation.length <= 200
        ? { operationKey: operation }
        : {})}
    />
  );
}
