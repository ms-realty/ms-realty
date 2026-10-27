// C03/F17: current-account support, never a claim of live broker availability.
import { notFound } from "next/navigation";
import { requireClientPage } from "@/features/cases/access";
import { clientWorkflowCopy } from "@/features/cases/client-workflow-copy";
import { WorkflowPage, workflowLink } from "@/features/cases/screens";
import { isRoutableLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";

export default async function ClientHelpPage({ params }: PageProps<"/client/[locale]/help">) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const session = await requireClientPage(locale, `/${locale}/help`);
  const c = clientWorkflowCopy(locale);
  return (
    <WorkflowPage session={session} locale={locale} title={c.help}>
      <a className={workflowLink} href="tel:+359879696870">
        {c.contactTeam} · <bdi>+359879696870</bdi>
      </a>
      <a className={workflowLink} href={`${getEnv().hosts.public}/${locale}/help/general`}>
        {c.help}
      </a>
      <a className={workflowLink} href={`/${locale}/preferences`}>
        {c.preferences}
      </a>
      <a className={workflowLink} href={`/${locale}/privacy`}>
        {c.privacy}
      </a>
    </WorkflowPage>
  );
}
