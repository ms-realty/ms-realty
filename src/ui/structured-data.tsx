import { headers } from "next/headers";
import { serializeStructuredData } from "@/i18n/structured-data";

export async function StructuredData({ value }: { value: unknown }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON encoding additionally escapes every script delimiter.
      dangerouslySetInnerHTML={{ __html: serializeStructuredData(value) }}
    />
  );
}
