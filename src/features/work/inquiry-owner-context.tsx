import { z } from "zod";
import { ownerInquirySchema } from "@/domain/owner-inquiry";
import { serviceCaseContextSchema } from "@/domain/service-scope";
import { viewingPreferencesSchema } from "@/domain/viewing-preferences";
import { InquiryContent } from "@/features/discovery/inquiry-content";
import { OwnerInquirySummary } from "@/features/discovery/inquiry-owner";
import { ViewingPreferenceSummary } from "@/features/discovery/inquiry-viewing";
import { ServiceContext } from "@/features/service-intake/context";
import { isPublicLocale } from "@/i18n/config";

export function InquiryOwnerContext({
  context,
  locale,
  serviceCurrent,
}: {
  context: unknown;
  locale: string;
  serviceCurrent?: boolean;
}) {
  const parsed = z
    .object({
      ownerInput: ownerInquirySchema.optional(),
      content: z.unknown().optional(),
      viewingPreferences: viewingPreferencesSchema.optional(),
      service: serviceCaseContextSchema.optional(),
    })
    .safeParse(context);
  const language = isPublicLocale(locale) ? locale : "bg";
  return parsed.success ? (
    <>
      {parsed.data.service ? (
        <ServiceContext
          locale={locale}
          request={parsed.data.service.request}
          sourceUrl={parsed.data.service.binding.sourceUrl}
          current={serviceCurrent}
          staff
        />
      ) : null}
      {parsed.data.viewingPreferences ? (
        <ViewingPreferenceSummary input={parsed.data.viewingPreferences} locale={language} />
      ) : null}
      <InquiryContent content={parsed.data.content} locale={language} />
      {parsed.data.ownerInput ? (
        <OwnerInquirySummary input={parsed.data.ownerInput} locale={language} />
      ) : null}
    </>
  ) : null;
}
