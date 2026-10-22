import { inquiryContentSnapshotSchema } from "@/domain/inquiry-content-snapshot";
import { localeEndonyms, type PublicLocale } from "@/i18n/config";
import { discoveryCopy } from "./copy";

export function InquiryContent({ content, locale }: { content: unknown; locale: PublicLocale }) {
  const parsed = inquiryContentSnapshotSchema.safeParse(content);
  if (!parsed.success) return null;
  const value = parsed.data;
  return (
    <section
      className="space-y-2 rounded-panel border border-divider p-4 wrap-anywhere"
      aria-label={discoveryCopy(locale).source}
    >
      <h3 className="font-semibold">
        <a href={value.sourceUrl} className="underline" lang={value.locale}>
          {value.title}
        </a>
      </h3>
      <p className="text-dense text-text-muted">{localeEndonyms[value.locale]}</p>
    </section>
  );
}
