// O03L / O03LR: review linking an inquiry to an existing Case (`?case=`), then the recorded
// result or status of this staff member's own attempt (`?key=`).
import { InquiryLinkScreen } from "@/features/cases/inquiry-link";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";

export default async function InquiryLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const query = await searchParams;
  return (
    <InquiryLinkScreen
      locale={locale}
      session={session}
      inquiryId={id}
      caseId={typeof query.case === "string" ? query.case : undefined}
      operationKey={typeof query.key === "string" ? query.key : undefined}
    />
  );
}
