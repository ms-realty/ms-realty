// O27: read actual retained queue state; never infer live worker health from a connection.

import { notFound } from "next/navigation";
import { checkAiLocale, JobsScreen } from "@/features/ai/screens";
import type { ExternalActionView } from "@/server/ai/operations";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  checkAiLocale(locale);
  const search = await searchParams;
  let externalView: ExternalActionView | undefined;
  if (search.action !== undefined) {
    if (
      typeof search.action !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(search.action)
    )
      notFound();
    externalView = { kind: "record", id: search.action };
  } else if (search.view === "exceptions") {
    const page = search.page === undefined ? 1 : Number(search.page);
    if (
      Array.isArray(search.page) ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger((page - 1) * 30)
    )
      notFound();
    externalView = { kind: "queue", page };
  }
  return (
    <JobsScreen
      locale={locale}
      session={await requireStaffPage(locale)}
      externalView={externalView}
    />
  );
}
