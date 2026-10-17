import { z } from "zod";
import { publicLocales } from "@/i18n/config";
import { contentReferenceSchema } from "./inquiry-content";

/** Authoritative, public CMS context only; never visitor-entered personal details. */
export const inquiryContentSnapshotSchema = contentReferenceSchema.extend({
  title: z.string().max(1000),
  locale: z.enum(publicLocales),
  sourceUrl: z.url({ protocol: /^https?$/ }),
});
