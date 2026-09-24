// Types next-intl's message keys and locales against the English catalog (every catalog
// has the same keys; see messages.test.ts).
import type {} from "next-intl";
import type messages from "../../messages/en.json";
import type { PublicLocale } from "./config";

declare module "next-intl" {
  interface AppConfig {
    Locale: PublicLocale;
    Messages: typeof messages;
  }
}
