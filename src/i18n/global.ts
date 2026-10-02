// Types next-intl's message keys and locales against the Bulgarian source catalogs (every
// catalog has the same keys; see messages.test.ts).
import type {} from "next-intl";
import type { PublicLocale } from "./config";
import type { Messages } from "./messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: PublicLocale;
    Messages: Messages;
  }
}
