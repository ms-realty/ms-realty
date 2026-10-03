import "../app/globals.css";
import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { localeDirection, localeEndonyms, type PublicLocale, publicLocales } from "@/i18n/config";
import { LocaleProvider } from "@/ui/locale-provider";

// The locale toolbar sets what a root layout sets in the app: lang and dir on <html> and
// React Aria's locale. Stories read their copy from the same global.
const withLocale: Decorator = (Story, context) => {
  const locale = context.globals.locale as PublicLocale;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = localeDirection(locale);
  return (
    <LocaleProvider locale={locale}>
      <div className="bg-canvas p-4 text-text">
        <Story />
      </div>
    </LocaleProvider>
  );
};

const preview: Preview = {
  decorators: [withLocale],
  globalTypes: {
    locale: {
      description: "Locale and direction",
      toolbar: {
        icon: "globe",
        dynamicTitle: true,
        items: publicLocales.map((locale) => ({
          value: locale,
          title: localeEndonyms[locale],
          right: localeDirection(locale) === "rtl" ? "RTL" : undefined,
        })),
      },
    },
  },
  initialGlobals: { locale: "en" },
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
  },
};

export default preview;
