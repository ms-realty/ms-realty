import { h, renderStaticElement } from "./react-static-html.mjs";
import { labelsFor, localizedListingValue, localizedSearchFilterValue, uiCopyFor } from "./public-site.mjs";
import { Icon } from "./ui/icons.mjs";
import { LOGO_ASPECT, LOGO_SRC, LOGO_SRC_REVERSED } from "./ui/design-assets.mjs";

function uiLabels(page) {
  return labelsFor(page.locale || page.lang || "en");
}

function price(value, labels = labelsFor("en")) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 1 ? `EUR ${amount.toLocaleString("en-US")}` : labels.priceOnRequest;
}

function cardSummary(card) {
  return [card.location, card.property_type_label || card.property_type, card.offer_type_label || card.offer_type].filter(Boolean).join(" / ");
}

// Placeholder photo tones from the DS media tokens; deterministic per listing id
// so cards keep a stable look between renders when no photo is available.
const PHOTO_TONES = ["sand", "sea", "pine", "sunset"];
function toneFor(seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 997;
  return PHOTO_TONES[hash % PHOTO_TONES.length];
}

function Btn({ tag = "button", variant = "primary", size = "md", iconStart, iconEnd, full = false, children, ...attrs }) {
  const iconSize = size === "sm" ? 16 : size === "lg" ? 20 : 18;
  const className = ["mk-btn", `mk-btn--${variant}`, `mk-btn--${size}`, full ? "mk-btn--full" : null].filter(Boolean).join(" ");
  return h(
    tag,
    { className, ...(tag === "button" && !attrs.type ? { type: "button" } : {}), ...attrs },
    iconStart ? h(Icon, { name: iconStart, size: iconSize }) : null,
    children === null || children === undefined ? null : h("span", null, children),
    iconEnd ? h(Icon, { name: iconEnd, size: iconSize }) : null,
  );
}

function Badge({ variant = "neutral", solid = false, icon, children, ...attrs }) {
  const className = ["mk-badge", `mk-badge--${variant}`, "mk-badge--sm", solid ? "mk-badge--solid" : null]
    .filter(Boolean)
    .join(" ");
  return h("span", { className, ...attrs }, icon ? h(Icon, { name: icon, size: 12, strokeWidth: 2.25 }) : null, children);
}

/* ============================================================
   Site chrome — header, footer, skip link (ui_kits/website/SiteChrome)
   ============================================================ */

function LanguageMenu({ languages, label }) {
  const active = languages.find((language) => language.active) || languages[0];
  if (!active) return null;
  return h(
    "details",
    { className: "site-language", "data-language-switcher": "desktop" },
    h(
      "summary",
      { "aria-label": `${label}: ${active.label}`, title: `${label}: ${active.label}` },
      h(Icon, { name: "globe", size: 17 }),
      h("span", { className: "site-language__current", lang: active.code }, active.code.toUpperCase()),
      h(Icon, { name: "chevron-down", size: 14, "aria-hidden": "true" }),
    ),
    h(
      "nav",
      { className: "site-language__menu", "aria-label": label },
      ...languages.map((language) =>
        h(
          "a",
          {
            key: language.code,
            href: language.href,
            hrefLang: language.code,
            lang: language.code,
            "aria-current": language.active ? "true" : undefined,
          },
          h("span", { className: "site-language__code" }, language.code.toUpperCase()),
          h("span", { className: "site-language__label" }, language.label),
          language.active ? h(Icon, { name: "check", size: 16, "aria-hidden": "true" }) : null,
        ),
      ),
    ),
  );
}

function SiteHeader({ chrome }) {
  const copy = chrome.copy;
  const activeLanguage = chrome.languages.find((language) => language.active) || chrome.languages[0];
  const mobileMenuId = `public-mobile-navigation-${activeLanguage?.code || "en"}`;
  const mobileMenu = h(
    "details",
    { className: "site-hd__mobile", "data-mobile-menu": "true" },
    h(
      "summary",
      {
        "aria-label": copy.menuLabel,
        "aria-controls": mobileMenuId,
        "aria-expanded": "false",
        title: copy.menuLabel,
      },
      h(Icon, { name: "menu", size: 22 }),
      h("span", { className: "site-hd__mobile-label" }, copy.menuLabel),
    ),
    h("button", {
      type: "button",
      className: "site-hd__mobile-backdrop",
      "data-mobile-menu-close": "true",
      "aria-label": copy.close,
      "aria-hidden": "true",
      tabIndex: -1,
    }),
    h(
      "div",
      {
        id: mobileMenuId,
        className: "site-hd__mobile-panel",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": copy.menuLabel,
      },
      h(
        "nav",
        { className: "site-hd__mobile-nav", "aria-label": copy.menuLabel },
        ...chrome.nav.map((item) =>
          h(
            "a",
            { key: item.id, href: item.href, "aria-current": item.active ? "page" : undefined },
            item.label,
          ),
        ),
      ),
      h(
        "nav",
        { className: "site-hd__mobile-langs", "aria-label": copy.languageLabel, "data-language-switcher": "mobile" },
        ...chrome.languages.map((language) =>
          h(
            "a",
            {
              key: language.code,
              href: language.href,
              hrefLang: language.code,
              lang: language.code,
              "aria-current": language.active ? "true" : undefined,
            },
            h("b", null, language.code.toUpperCase()),
            h("span", null, language.label),
          ),
        ),
      ),
      h(Btn, { tag: "a", variant: "accent", size: "md", full: true, iconStart: "phone", href: chrome.contact.phone_href }, copy.callBroker),
    ),
  );
  return h(
    "header",
    { className: "site-hd" },
    h(
      "div",
      { className: "site-hd__in" },
      h(
        "a",
        { href: chrome.home.href, className: "site-hd__logo", "aria-label": chrome.home.label },
        h("img", { src: LOGO_SRC, alt: chrome.home.label, height: 40, width: Math.round(40 * LOGO_ASPECT) }),
      ),
      h(
        "nav",
        { className: "site-hd__nav", "aria-label": copy.menuLabel },
        ...chrome.nav.map((item) =>
          h(
            "a",
            {
              key: item.id,
              href: item.href,
              "data-active": item.active ? "true" : undefined,
              "aria-current": item.active ? "page" : undefined,
            },
            item.label,
          ),
        ),
      ),
      h(
      "div",
      { className: "site-hd__right" },
        h(LanguageMenu, { languages: chrome.languages, label: copy.languageLabel }),
        h(
          Btn,
          { tag: "a", variant: "accent", size: "sm", iconStart: "phone", href: chrome.contact.phone_href, className: "site-hd__call mk-btn mk-btn--accent mk-btn--sm" },
          copy.callBroker,
        ),
      ),
      h("a", { className: "site-hd__mobile-call", href: chrome.contact.phone_href, "aria-label": copy.callBroker, title: copy.callBroker }, h(Icon, { name: "phone", size: 20 })),
      mobileMenu,
    ),
  );
}

function MobileTaskNavigation({ page, chrome }) {
  if (page.kind === "listing") return null;
  const labels = uiLabels(page);
  const buy = chrome.nav.find((item) => item.id === "buy");
  const savedView = page.search?.saved_view === true;
  const rentView = page.kind === "search" && page.search?.filters?.offer_type === "rent" && !savedView;
  const items = [...chrome.nav];
  items.splice(2, 0, {
    id: "saved",
    label: labels.savedListings,
    href: `${buy?.href || page.path}?saved=1`,
    active: savedView,
  });
  const iconById = { buy: "search", rent: "key", saved: "heart", sell: "landmark", contact: "message-circle" };
  return h(
    "nav",
    {
      className: "site-mobile-tabs",
      "aria-label": chrome.copy.menuLabel,
      "data-mobile-task-navigation": "true",
    },
    ...items.map((item) => {
      const active =
        item.id === "saved"
          ? savedView
          : savedView
            ? false
            : item.id === "rent"
              ? rentView
              : item.id === "buy"
                ? !rentView && (item.active || page.kind === "home")
                : item.active;
      return h(
        "a",
        {
          key: item.id,
          href: item.href,
          "data-mobile-task": item.id,
          "data-active": active ? "true" : undefined,
          "aria-current": active ? "page" : undefined,
          "data-saved-navigation": item.id === "saved" ? "true" : undefined,
          "data-saved-navigation-label": item.id === "saved" ? item.label : undefined,
        },
        h(Icon, { name: iconById[item.id] || "circle", size: 20 }),
        h("span", null, item.label),
        item.id === "saved" ? h("span", { className: "site-mobile-tabs__badge", "data-saved-count": "true", hidden: true }) : null,
      );
    }),
  );
}

function SiteFooter({ chrome, labels }) {
  const copy = chrome.copy;
  const locations = chrome.footer.locations || [];
  const buy = chrome.nav.find((item) => item.id === "buy");
  return h(
    "footer",
    { className: "site-ft" },
    h(
      "div",
      { className: "site-ft__in" },
      h(
        "div",
        null,
        h(
          "a",
          { href: chrome.home.href, "aria-label": chrome.home.label, className: "site-ft__logo" },
          h("img", { src: LOGO_SRC_REVERSED, alt: chrome.home.label, height: 30, width: Math.round(30 * LOGO_ASPECT) }),
        ),
        h("p", { className: "site-ft__intro" }, copy.tagline),
        h(
          "div",
          { className: "site-ft__contact" },
          h("span", null, h(Icon, { name: "phone", size: 16 }), h("a", { href: chrome.contact.phone_href }, chrome.contact.phone_label)),
          h("span", null, h(Icon, { name: "mail", size: 16 }), h("a", { href: `mailto:${chrome.contact.email}` }, chrome.contact.email)),
          h("span", null, h(Icon, { name: "map-pin", size: 16 }), copy.offices),
        ),
      ),
      h(
        "div",
        null,
        h("h4", null, copy.explore),
        h("ul", null, ...chrome.nav.map((item) => h("li", { key: item.id }, h("a", { href: item.href }, item.label)))),
      ),
      h(
        "div",
        null,
        h("h4", null, chrome.footer.locationsLabel),
        h(
          "ul",
          null,
          ...(locations.length
            ? locations.map((location) => h("li", { key: location.href }, h("a", { href: location.href }, location.label)))
            : [h("li", { key: "search" }, h("a", { href: buy?.href || chrome.home.href }, chrome.footer.searchLabel))]),
        ),
      ),
      h(
        "div",
        null,
        h("h4", null, copy.getInTouch),
        h(
          "ul",
          null,
          h("li", null, h("a", { href: chrome.nav.find((item) => item.id === "contact")?.href || chrome.home.href }, copy.navContact)),
          h("li", null, h("a", { href: chrome.nav.find((item) => item.id === "sell")?.href || chrome.home.href }, labels.sellerValuation)),
          h("li", null, h("a", { href: chrome.contact.phone_href }, chrome.contact.phone_label)),
          h("li", null, h("a", { href: `mailto:${chrome.contact.email}` }, chrome.contact.email)),
        ),
      ),
    ),
    h(
      "div",
      { className: "site-ft__bar" },
      h(
        "div",
        { className: "site-ft__bar-in" },
        h("span", null, `© 2026 MS Realty · ${copy.copyright}`),
        h(
          "nav",
          { "aria-label": copy.languageLabel },
          ...chrome.languages.map((language) =>
            h("a", { key: language.code, href: language.href, hrefLang: language.code, lang: language.code }, language.label),
          ),
        ),
      ),
    ),
  );
}

const INTENT_DIALOG_COPY = {
  bg: {
    inquiryHelp: "Попитайте за цената, условията или документите на имота.",
    callbackHelp: "Посочете удобно време и брокер ще ви се обади.",
    viewingHelp: "Изберете предпочитани дата и час за оглед.",
    inquiryNext: "Брокер ще прегледа въпроса и ще отговори по избрания канал.",
    callbackNext: "Брокер ще потвърди часа преди обаждането.",
    viewingNext: "Това е заявка; брокер ще потвърди наличността и часа.",
  },
  en: {
    inquiryHelp: "Ask about the price, terms, or property documents.",
    callbackHelp: "Tell us when you are free and a broker will call.",
    viewingHelp: "Choose your preferred date and time for a viewing.",
    inquiryNext: "A broker will review your question and reply through your chosen channel.",
    callbackNext: "A broker will confirm the time before calling.",
    viewingNext: "This is a request; a broker will confirm availability and timing.",
  },
  de: {
    inquiryHelp: "Fragen Sie nach Preis, Konditionen oder Objektunterlagen.",
    callbackHelp: "Nennen Sie eine passende Zeit und ein Makler ruft Sie an.",
    viewingHelp: "Wählen Sie Ihren Wunschtermin für die Besichtigung.",
    inquiryNext: "Ein Makler prüft Ihre Frage und antwortet über den gewählten Kanal.",
    callbackNext: "Ein Makler bestätigt den Zeitpunkt vor dem Anruf.",
    viewingNext: "Dies ist eine Anfrage; ein Makler bestätigt Verfügbarkeit und Termin.",
  },
  nl: {
    inquiryHelp: "Vraag naar de prijs, voorwaarden of woningdocumenten.",
    callbackHelp: "Geef aan wanneer u kunt en een makelaar belt u terug.",
    viewingHelp: "Kies uw voorkeursdatum en -tijd voor een bezichtiging.",
    inquiryNext: "Een makelaar beoordeelt uw vraag en antwoordt via het gekozen kanaal.",
    callbackNext: "Een makelaar bevestigt het tijdstip vóór het gesprek.",
    viewingNext: "Dit is een aanvraag; een makelaar bevestigt beschikbaarheid en tijd.",
  },
  ru: {
    inquiryHelp: "Спросите о цене, условиях или документах по объекту.",
    callbackHelp: "Укажите удобное время, и брокер вам позвонит.",
    viewingHelp: "Выберите желаемые дату и время просмотра.",
    inquiryNext: "Брокер изучит вопрос и ответит по выбранному каналу.",
    callbackNext: "Брокер подтвердит время перед звонком.",
    viewingNext: "Это заявка: брокер подтвердит доступность объекта и время.",
  },
  el: {
    inquiryHelp: "Ρωτήστε για την τιμή, τους όρους ή τα έγγραφα του ακινήτου.",
    callbackHelp: "Πείτε μας πότε σας εξυπηρετεί και θα σας καλέσει μεσίτης.",
    viewingHelp: "Επιλέξτε ημερομηνία και ώρα προτίμησης για την επίσκεψη.",
    inquiryNext: "Μεσίτης θα εξετάσει την ερώτηση και θα απαντήσει από το κανάλι που επιλέξατε.",
    callbackNext: "Μεσίτης θα επιβεβαιώσει την ώρα πριν από την κλήση.",
    viewingNext: "Πρόκειται για αίτημα· μεσίτης θα επιβεβαιώσει διαθεσιμότητα και ώρα.",
  },
  he: {
    inquiryHelp: "שאלו על המחיר, התנאים או מסמכי הנכס.",
    callbackHelp: "ציינו מתי נוח לכם ומתווך יחזור אליכם.",
    viewingHelp: "בחרו תאריך ושעה מועדפים לביקור בנכס.",
    inquiryNext: "מתווך יבדוק את השאלה וישיב בערוץ שבחרתם.",
    callbackNext: "מתווך יאשר את השעה לפני השיחה.",
    viewingNext: "זו בקשה; מתווך יאשר את זמינות הנכס ואת השעה.",
  },
};

// One implementation with three explicit task states. Each state has its own
// context, fields, validation, and confirmation while sharing the lead schema.
function EnquiryDialog({ page, labels, copy }) {
  const intentCopy = INTENT_DIALOG_COPY[page.locale] || INTENT_DIALOG_COPY.en;
  const facts = page.kind === "listing" ? page.body?.facts || {} : {};
  const propertyTitle = page.kind === "listing" ? page.body?.h1 || "" : "";
  const propertyMeta = [facts.location, price(facts.price_eur, labels)].filter(Boolean).join(" · ");
  return h(
    "dialog",
    { id: "mk-enquiry", className: "ct-modal mk-enquiry", "aria-label": labels.inquiry, "data-enquiry-intent": "inquiry" },
    h(
      "form",
      {
        method: "post",
        action: "/api/leads",
        className: "ct-form",
        "data-enquiry-form": "true",
        "data-help-inquiry": intentCopy.inquiryHelp,
        "data-help-callback": intentCopy.callbackHelp,
        "data-help-viewing": intentCopy.viewingHelp,
        "data-next-inquiry": intentCopy.inquiryNext,
        "data-next-callback": intentCopy.callbackNext,
        "data-next-viewing": intentCopy.viewingNext,
      },
      h(
        "div",
        { className: "ct-modal__hd" },
        h(
          "div",
          { className: "mk-enquiry__heading" },
          h(
            "span",
            { className: "mk-enquiry__intent-icon", "aria-hidden": "true" },
            h("span", { "data-enquiry-icon": "inquiry" }, h(Icon, { name: "message-circle", size: 21 })),
            h("span", { "data-enquiry-icon": "callback", hidden: true }, h(Icon, { name: "phone", size: 21 })),
            h("span", { "data-enquiry-icon": "viewing", hidden: true }, h(Icon, { name: "calendar", size: 21 })),
          ),
          h("div", null, h("h2", { "data-enquiry-title": "true" }, labels.inquiry), h("p", { "data-enquiry-help": "true" }, intentCopy.inquiryHelp)),
        ),
        h(
          "button",
          { type: "button", className: "mk-iconbtn mk-iconbtn--ghost mk-iconbtn--md", "data-enquiry-close": "true", "aria-label": copy.close },
          h(Icon, { name: "x", size: 20 }),
        ),
      ),
      h("input", { type: "hidden", name: "source", defaultValue: "website_listing_detail" }),
      h("input", { type: "hidden", name: "intent", defaultValue: "inquiry" }),
      h("input", { type: "hidden", name: "leadType", defaultValue: "buyer" }),
      h("input", { type: "hidden", name: "language", defaultValue: page.locale }),
      h("input", { type: "hidden", name: "listingReference", defaultValue: "" }),
      propertyTitle
        ? h(
            "aside",
            { className: "mk-enquiry__property", "data-enquiry-property": "true" },
            h("div", null, h("strong", null, propertyTitle), h("span", null, propertyMeta)),
            h("code", null, facts.id || ""),
          )
        : null,
      h("label", null, labels.name, h("input", { name: "contact.name", required: true, autoComplete: "name" })),
      h(
        "label",
        { "data-enquiry-channel-group": "true" },
        labels.preferredContact,
        h(
          "select",
          { name: "contact_preference", "data-enquiry-channel": "true", defaultValue: "phone" },
          h("option", { value: "phone" }, labels.phone),
          h("option", { value: "whatsapp" }, "WhatsApp"),
          h("option", { value: "viber" }, "Viber"),
        ),
      ),
      h(
        "label",
        { "data-enquiry-phone-label": "true", "data-enquiry-default-label": labels.phone },
        labels.phone,
        h("input", { name: "contact.phone", type: "tel", required: true, autoComplete: "tel", inputMode: "tel", "data-enquiry-contact": "true" }),
      ),
      h(
        "label",
        { "data-enquiry-callback-time-group": "true", hidden: true },
        labels.preferredCallbackTime,
        h("input", { name: "request_details.callback_time", maxLength: 120, "data-enquiry-callback-time": "true" }),
      ),
      h(
        "div",
        { className: "ct-form__row", "data-enquiry-viewing-fields": "true", hidden: true },
        h(
          "label",
          null,
          labels.preferredViewingDate,
          h("input", { name: "request_details.viewing_date", type: "date", "data-enquiry-viewing-date": "true" }),
        ),
        h(
          "label",
          null,
          labels.preferredViewingTime,
          h("input", { name: "request_details.viewing_time", type: "time", "data-enquiry-viewing-time": "true" }),
        ),
      ),
      h("label", null, labels.message, h("textarea", { name: "message", "data-enquiry-message": "true" })),
      h(
        "div",
        { className: "mk-enquiry__next", "data-enquiry-next": "true" },
        h(Icon, { name: "shield-check", size: 18 }),
        h("p", null, intentCopy.inquiryNext),
      ),
      h(Btn, { type: "submit", variant: "accent", size: "lg", full: true, iconStart: "send", "data-enquiry-submit": "true" }, labels.inquiry),
    ),
    h(
      "div",
      { className: "ct-done", hidden: true },
      h("div", { className: "ct-done__ic" }, h(Icon, { name: "check", size: 30, strokeWidth: 2.5 })),
      h("h2", null, copy.requestSent),
      h("p", { "data-enquiry-success-detail": "true" }),
      h(Btn, { variant: "primary", "data-enquiry-close": "true" }, copy.close),
    ),
  );
}

function shell(page, main) {
  const chrome = page.chrome;
  if (!chrome) return main;
  const labels = uiLabels(page);
  return [
    h("a", { key: "skip", className: "skip-link", href: "#main" }, chrome.copy.skipToContent),
    h(SiteHeader, { key: "header", chrome }),
    main,
    h(MobileTaskNavigation, { key: "mobile-tasks", page, chrome }),
    h(SiteFooter, { key: "footer", chrome, labels }),
    h(EnquiryDialog, { key: "enquiry", page, labels, copy: chrome.copy }),
  ];
}

/* ============================================================
   Listing cards (components/display/PropertyCard)
   ============================================================ */

function cardBadge(card, labels, localeCode) {
  if (card.review_badge === "reviewed_translation") return { variant: "neutral", label: labels.reviewedTranslation };
  if (card.content_locale && card.content_locale !== localeCode) {
    return { variant: "neutral", label: card.content_locale.toUpperCase(), contentLocale: card.content_locale };
  }
  return null;
}

function publicImageProps(image, fallbackAlt, loading = "lazy", fetchPriority) {
  return {
    src: image.url,
    alt: image.alt || fallbackAlt,
    loading,
    decoding: "async",
    fetchPriority,
    "data-fallback-src": image.fallback_url || undefined,
  };
}

function SearchCard({ card, labels = labelsFor("en"), localeCode = "en", orientation = "vertical", rootAttrs, priority = false }) {
  const badge = cardBadge(card, labels, localeCode);
  const tone = toneFor(card.id);
  const mediaChildren = [
    badge
      ? h(
          "div",
          { key: "badges", className: "mk-pcard__badges" },
          h(
            Badge,
            {
              variant: badge.variant,
              solid: true,
              "data-card-badge": "true",
              "data-card-source-language": badge.contentLocale || undefined,
              lang: badge.contentLocale || undefined,
            },
            badge.label,
          ),
        )
      : null,
    h(
      "span",
      { key: "count", className: "mk-pcard__count", "data-card-media-count": card.image_count },
      h(Icon, { name: "camera", size: 13 }),
      ` ${card.image_count || 0} ${labels.photos}`,
    ),
  ];
  const media = card.thumbnail?.url
    ? h(
        "a",
        {
          href: card.path,
          className: `mk-pcard__media mk-photo mk-photo--${tone}`,
          "data-card-thumbnail": "true",
          "aria-label": card.title,
          lang: card.content_locale || undefined,
        },
        h("img", publicImageProps(card.thumbnail, card.title, priority ? "eager" : "lazy", priority ? "high" : undefined)),
        ...mediaChildren,
      )
    : h(
        "a",
        { href: card.path, className: `mk-pcard__media mk-photo mk-photo--${tone}`, "aria-label": card.title, lang: card.content_locale || undefined },
        ...mediaChildren,
      );
  return h(
    "article",
    {
      className: `mk-pcard mk-pcard--interactive${orientation === "horizontal" ? " mk-pcard--row" : ""}`,
      "data-listing-id": card.id,
      "data-translation-display": card.translation_display,
      "data-content-language": card.content_locale,
      "data-review-badge": card.review_badge,
      "data-listing-status": card.listing_status,
      ...(rootAttrs || { "data-search-card": "true" }),
    },
    media,
    h(
      "div",
      { className: "mk-pcard__body" },
      h("div", { className: "mk-pcard__pricerow" }, h("span", { className: "mk-pcard__price", "data-card-price": "true" }, price(card.price_eur, labels))),
      h("h2", { className: "mk-pcard__title", lang: card.content_locale || undefined }, h("a", { href: card.path }, card.title)),
      h(
        "div",
        { className: "mk-pcard__loc", "data-search-card-meta": "true" },
        h(Icon, { name: "map-pin", size: 14 }),
        ` ${cardSummary(card)}`,
      ),
      h(
        "div",
        { className: "mk-pcard__specs" },
        card.bedrooms ? h("span", { "data-card-spec": "bedrooms" }, h(Icon, { name: "bed", size: 16 }), ` ${card.bedrooms}`) : null,
        card.area_sqm ? h("span", { "data-card-spec": "area" }, h(Icon, { name: "ruler", size: 16 }), ` ${card.area_sqm} m²`) : null,
        h("span", { "data-card-spec": "photos" }, h(Icon, { name: "camera", size: 16 }), ` ${card.image_count || 0}`),
        h("span", { className: "mk-pcard__ref", "data-card-spec": "reference" }, card.id),
      ),
      h(
        "nav",
        { className: "mk-pcard__actions", "aria-label": labels.searchResultActions },
        h(
          "a",
          { className: "mk-btn mk-btn--secondary mk-btn--sm", href: card.actions.detail.href, "data-card-action": "detail" },
          h("span", null, card.actions.detail.label),
        ),
        h(
          "button",
          {
            type: "button",
            className: "mk-btn mk-btn--primary mk-btn--sm",
            "data-card-action": "inquiry",
            "data-endpoint": card.actions.inquiry.endpoint,
            "data-listing-reference": card.actions.inquiry.payload.listingReference,
            "data-lead-source": card.actions.inquiry.payload.source,
            "data-lead-type": card.offer_type === "rent" ? "renter" : "buyer",
            "data-lead-intent": "inquiry",
            "data-lead-title": card.actions.inquiry.label,
            "data-lead-submit": card.actions.inquiry.label,
          },
          h("span", null, card.actions.inquiry.label),
        ),
        h(
          "button",
          {
            type: "button",
            className: "mk-btn mk-btn--subtle mk-btn--sm",
            "data-card-action": "save",
            "data-client-save-listing": card.actions.save.listing_id,
            "data-save-label": card.actions.save.label,
            "data-saved-label": card.actions.save.saved_label || labels.saved,
            "aria-label": card.actions.save.label,
          },
          h(Icon, { name: "heart", size: 16 }),
          h("span", null, card.actions.save.label),
        ),
      ),
    ),
  );
}

function factsList(facts = {}, labels = labelsFor("en"), localeCode = "en") {
  // Attribute-only <dl>: tests assert the literal `<dl data-listing-facts="true">`;
  // styling hooks onto the attribute selector in adapter-public.css.
  return h(
    "dl",
    { "data-listing-facts": "true" },
    ...["property_type", "offer_type", "bedrooms", "area_sqm", "floor", "land_area_sqm", "condition", "location_precision"]
      .map((key) => [key, facts[key]])
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .flatMap(([key, value]) => [
        h("dt", { key: `${key}-term` }, key === "area_sqm" ? labels.area : labels.factLabels?.[key] || key.replaceAll("_", " ")),
        h(
          "dd",
          { key: `${key}-value` },
          key === "property_type" || key === "offer_type"
            ? localizedListingValue(localeCode, key, value)
            : key === "area_sqm" || key === "land_area_sqm"
              ? `${value} m²`
              : key === "floor" && facts.total_floors !== null && facts.total_floors !== undefined && facts.total_floors !== ""
                ? `${value}/${facts.total_floors}`
                : key === "location_precision"
                  ? uiCopyFor(localeCode).locationPrecisions?.[value] || humanizeIdentifier(value)
              : value,
        ),
      ]),
  );
}

/* ============================================================
   Home (ui_kits/website/HomePage)
   ============================================================ */

function HomeBody({ page }) {
  const labels = uiLabels(page);
  const chrome = page.chrome || { copy: {} };
  const heroImage = page.body.hero?.image;
  const main = h(
    "main",
    { id: "main", "data-kind": "home", "data-react-public-ui": "home" },
    h(
      "section",
      { className: "hp-hero" },
      h(
        "div",
        { className: "hp-hero__bg", "data-hero-media": heroImage?.url ? "approved" : "fallback" },
        heroImage?.url ? h("img", { src: heroImage.url, alt: heroImage.alt || page.body.h1, loading: "eager", decoding: "async", fetchPriority: "high" }) : null,
      ),
      h(
        "div",
        { className: "hp-hero__in" },
        h(
          "div",
          { className: "hp-hero__copy" },
          h("span", { className: "hp-hero__eyebrow" }, h(Icon, { name: "compass", size: 15 }), chrome.copy.offices || ""),
          h("h1", null, page.body.h1),
          h("p", null, page.body.intro),
        ),
        h(
          "div",
          { className: "hp-hero__search mk-search mk-search--lg" },
          h(
            "form",
            { className: "mk-search__bar", action: page.body.search.path, method: "get", role: "search" },
            h(
              "div",
              { className: "mk-search__seg mk-search__seg--grow" },
              h(Icon, { name: "map-pin", size: 20 }),
              h(
                "div",
                { className: "mk-search__field" },
                h("label", { htmlFor: "home-search-q" }, labels.search),
                h("input", { id: "home-search-q", name: "q", type: "search", autoComplete: "off", placeholder: labels.location }),
              ),
            ),
            h("button", { className: "mk-search__go", type: "submit" }, h(Icon, { name: "search", size: 20, strokeWidth: 2.25 }), h("span", null, labels.search)),
          ),
        ),
      ),
    ),
    (page.body.locations || []).length
      ? h(
          "section",
          { className: "hp-sec" },
          h("div", { className: "hp-sec__head" }, h("div", null, h("h2", null, labels.locations))),
          h(
            "nav",
            { className: "hp-resorts", "aria-label": labels.locations, "data-home-locations": "true" },
            ...(page.body.locations || []).map((location) =>
              h(
                "a",
                {
                  key: location.path,
                  href: location.path,
                  className: "hp-resort",
                  "data-location-media": location.image?.url ? "approved" : "fallback",
                },
                location.image?.url ? h("img", { src: location.image.url, alt: location.image.alt || location.location, loading: "lazy", decoding: "async" }) : null,
                location.listing_count ? h("span", { className: "hp-resort__c" }, location.listing_count) : null,
                h("div", { className: "hp-resort__t" }, h("h3", null, location.location)),
              ),
            ),
          ),
        )
      : h("nav", { "aria-label": labels.locations, "data-home-locations": "true", hidden: true }),
    h(
      "section",
      { className: "hp-sec", style: "padding-top:0", "aria-label": labels.featuredListings, "data-featured-listings": "true" },
      h(
        "div",
        { className: "hp-sec__head" },
        h("div", null, h("h2", null, labels.featuredListings)),
        h(Btn, { tag: "a", variant: "secondary", iconEnd: "arrow-right", href: page.body.search.path }, labels.searchResults),
      ),
      h(
        "div",
        { className: "hp-grid" },
        ...(page.cards || []).map((card) => h(SearchCard, { key: card.id, card, labels, localeCode: page.locale })),
      ),
    ),
    h(
      "section",
      { className: "hp-sell" },
      h("div", { className: "hp-sell__glow", "aria-hidden": "true" }),
      h(
        "div",
        { className: "hp-sell__in" },
        h("div", null, h("h2", null, page.body.seller.title || page.body.seller.label), h("p", null, page.body.seller.description || "")),
        h(
          "nav",
          { "aria-label": labels.primaryActions, className: "hp-sell__actions" },
          h(Btn, { tag: "a", variant: "accent", size: "lg", iconStart: "phone", href: page.body.seller.path, "data-action": "seller" }, page.body.seller.label),
          h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: page.body.contact.path, "data-action": "contact" }, page.body.contact.label),
        ),
      ),
    ),
  );
  return shell(page, main);
}

/* ============================================================
   Search results (ui_kits/website/SearchResults)
   ============================================================ */

const SEARCH_FILTER_QUERY_KEYS = [
  "location",
  "property_type",
  "offer_type",
  "price_min",
  "price_max",
  "bedrooms_min",
  "area_min",
  "area_max",
  "status",
];

function searchHref(page, omitFilter, targetPage = 1) {
  const params = new URLSearchParams();
  if (page.search.query) params.set("q", page.search.query);
  if (page.search.sort && page.search.sort !== "recommended") params.set("sort", page.search.sort);
  for (const key of SEARCH_FILTER_QUERY_KEYS) {
    if (omitFilter === "*" || omitFilter === key) continue;
    const value = page.search.filters?.[key];
    if (value) params.set(key, value);
  }
  if (targetPage > 1) params.set("page", String(targetPage));
  const query = params.toString();
  return query ? `${page.path}?${query}` : page.path;
}

function SearchBody({ page }) {
  const labels = uiLabels(page);
  const chrome = page.chrome || { copy: {} };
  const savedView = page.search.saved_view === true;
  const controls = page.search.controls || {};
  const viewModes = controls.view_modes || [];
  const filterOptions = controls.filter_options || {};
  const activeFilterCount = (controls.active_filter_chips || []).length;
  const savedSearchFilters = controls.save_search?.payload?.filters || {};
  const hasSavedSearchCriteria = Boolean(String(page.search.query || "").trim() || Object.keys(savedSearchFilters).length);
  const mobileSearchContext = String(
    page.search.query ||
      page.search.filters?.location ||
      (page.search.filters?.offer_type
        ? localizedListingValue(page.locale, "offer_type", page.search.filters.offer_type)
        : "") ||
      labels.search,
  ).trim();
  const mobileSearchMeta = `${page.search.total_matches} ${labels.matches} · ${chrome.copy.filters || labels.activeFilters}`;
  const filterSelect = (idPrefix, name, label, values, optionLabel = (value) => value) =>
    h(
      "div",
      { key: name, className: "sr-fg" },
      h("label", { className: "hdr", htmlFor: `${idPrefix}-${name}` }, label),
      h(
        "select",
        { id: `${idPrefix}-${name}`, name },
        h("option", { value: "" }, labels.any),
        ...values.map((value) =>
          h("option", { key: value, value, selected: page.search.filters?.[name] === String(value) ? true : undefined }, optionLabel(value)),
        ),
      ),
    );
  const filterForm = (idPrefix) =>
    h(
      "form",
      { id: `${idPrefix}-filter-form`, action: page.path, method: "get", role: "search", "data-search-filter-form": "true", "data-filter-form-id": idPrefix },
      h(
        "div",
        { className: "sr-fg" },
        h("label", { className: "hdr", htmlFor: `${idPrefix}-q` }, labels.search),
        h("input", { id: `${idPrefix}-q`, name: "q", type: "search", defaultValue: page.search.query || "", autoComplete: "off" }),
      ),
      h(
        "div",
        { className: "sr-fg" },
        h("label", { className: "hdr", htmlFor: `${idPrefix}-location` }, labels.location),
        h("input", {
          id: `${idPrefix}-location`,
          name: "location",
          list: `${idPrefix}-location-options`,
          defaultValue: page.search.filters?.location || "",
          autoComplete: "off",
        }),
        h(
          "datalist",
          { id: `${idPrefix}-location-options` },
          ...(filterOptions.locations || []).map((location) => h("option", { key: location, value: location })),
        ),
      ),
      filterSelect(
        idPrefix,
        "property_type",
        labels.propertyType,
        filterOptions.property_types || [],
        (value) => localizedListingValue(page.locale, "property_type", value),
      ),
      filterSelect(
        idPrefix,
        "offer_type",
        labels.factLabels?.offer_type || "Offer",
        filterOptions.offer_types || [],
        (value) => localizedListingValue(page.locale, "offer_type", value),
      ),
      h(
        "fieldset",
        { className: "sr-fg sr-fg--price" },
        h("legend", { className: "hdr" }, "EUR"),
        h(
          "div",
          { className: "sr-fg__pair" },
          h(
            "label",
            { htmlFor: `${idPrefix}-price_min` },
            labels.priceMin,
            h("input", { id: `${idPrefix}-price_min`, name: "price_min", type: "number", min: "0", inputMode: "numeric", defaultValue: page.search.filters?.price_min || "" }),
          ),
          h(
            "label",
            { htmlFor: `${idPrefix}-price_max` },
            labels.priceMax,
            h("input", { id: `${idPrefix}-price_max`, name: "price_max", type: "number", min: "0", inputMode: "numeric", defaultValue: page.search.filters?.price_max || "" }),
          ),
        ),
      ),
      filterSelect(
        idPrefix,
        "bedrooms_min",
        labels.factLabels?.bedrooms || "Bedrooms",
        filterOptions.bedrooms || [],
        (value) => `${value}+`,
      ),
      h(
        "fieldset",
        { className: "sr-fg sr-fg--area" },
        h("legend", { className: "hdr" }, labels.area),
        h(
          "div",
          { className: "sr-fg__pair" },
          h(
            "label",
            { htmlFor: `${idPrefix}-area_min` },
            labels.areaMin,
            h("input", { id: `${idPrefix}-area_min`, name: "area_min", type: "number", min: "0", step: "any", inputMode: "decimal", defaultValue: page.search.filters?.area_min || "" }),
          ),
          h(
            "label",
            { htmlFor: `${idPrefix}-area_max` },
            labels.areaMax,
            h("input", { id: `${idPrefix}-area_max`, name: "area_max", type: "number", min: "0", step: "any", inputMode: "decimal", defaultValue: page.search.filters?.area_max || "" }),
          ),
        ),
      ),
      h(
        "div",
        { className: "sr-fg" },
        h(
          "label",
          null,
          h("span", { className: "hdr" }, labels.sort),
          h(
            "select",
            { name: "sort" },
            ...(controls.sort_options || []).map((option) =>
              h("option", { key: option.id, value: option.id, selected: page.search.sort === option.id ? true : undefined }, option.label),
            ),
          ),
        ),
      ),
      viewModes.length > 1
        ? h(
            "fieldset",
            { className: "sr-fg sr-view", "data-view-mode-control": "true", "data-map-optional": page.mobile_policy?.map_optional ? "true" : "false" },
            h("legend", null, labels.view),
            h(
              "div",
              { className: "sr-beds" },
              ...viewModes.map((mode) =>
                h(
                  "button",
                  { key: mode.id, type: "submit", name: "view", value: mode.id, "aria-pressed": mode.default ? "true" : "false", "data-view-mode": mode.id },
                  mode.label,
                ),
              ),
            ),
          )
        : null,
      h(
        "div",
        { className: "sr-filter-actions" },
        h(Btn, { type: "submit", variant: "primary", full: true }, labels.search),
        activeFilterCount ? h(Btn, { tag: "a", variant: "ghost", size: "sm", iconStart: "x", href: searchHref(page, "*") }, labels.clearFilters) : null,
      ),
    );
  const saveSearchForm = (idPrefix) =>
    h(
      "form",
      {
        className: "sr-save",
        method: controls.save_search?.method || "POST",
        action: controls.save_search?.endpoint || "/api/saved-searches",
        "data-save-search-endpoint": controls.save_search?.endpoint || "/api/saved-searches",
        "data-save-search-form": idPrefix,
      },
      h("input", { type: "hidden", name: "locale", defaultValue: page.locale }),
      h("input", { type: "hidden", name: "query", defaultValue: page.search.query || "" }),
      h("input", { type: "hidden", name: "filters", defaultValue: JSON.stringify(savedSearchFilters) }),
      h(
        "div",
        { className: "sr-fg" },
        h("label", { className: "hdr", htmlFor: `${idPrefix}-save-search-name` }, labels.name),
        h("input", { id: `${idPrefix}-save-search-name`, name: "contact.name", required: true, autoComplete: "name" }),
      ),
      h(
        "div",
        { className: "sr-fg" },
        h("label", { className: "hdr", htmlFor: `${idPrefix}-save-search-channel` }, labels.alertDelivery),
        h(
          "select",
          { id: `${idPrefix}-save-search-channel`, name: "contact_preference", "data-save-search-channel": "true" },
          h("option", { value: "email" }, labels.email),
          h("option", { value: "whatsapp" }, "WhatsApp"),
        ),
      ),
      h(
        "div",
        { className: "sr-fg" },
        h(
          "label",
          {
            className: "hdr",
            htmlFor: `${idPrefix}-save-search-contact`,
            "data-save-search-contact-label": "true",
            "data-email-label": labels.email,
            "data-whatsapp-label": "WhatsApp",
          },
          labels.email,
        ),
        h("input", {
          id: `${idPrefix}-save-search-contact`,
          name: "contact.email",
          type: "email",
          required: true,
          autoComplete: "email",
          inputMode: "email",
          "data-save-search-contact": "true",
        }),
      ),
      h(
        "div",
        { className: "sr-fg" },
        h("label", { className: "hdr", htmlFor: `${idPrefix}-save-search-frequency` }, labels.alertFrequency),
        h(
          "select",
          { id: `${idPrefix}-save-search-frequency`, name: "alertFrequency" },
          h("option", { value: "weekly" }, labels.alertWeekly),
          h("option", { value: "daily" }, labels.alertDaily),
          h("option", { value: "instant" }, labels.alertInstant),
        ),
      ),
      h(
        "label",
        { className: "sr-save__consent" },
        h("input", { type: "checkbox", name: "alertConsent", value: "true", required: true }),
        h("span", null, labels.alertConsent),
      ),
      h(Btn, { type: "submit", variant: "secondary", full: true, iconStart: "bell", disabled: !hasSavedSearchCriteria }, labels.saveSearch),
    );
  const saveSearchDisclosure = (idPrefix) =>
    h(
      "details",
      { className: "sr-save-disclosure", "data-save-search-disclosure": idPrefix },
      h(
        "summary",
        null,
        h(Icon, { name: "bell", size: 17 }),
        h("span", null, labels.saveSearch),
        h(Icon, { name: "chevron-down", size: 14, "aria-hidden": "true" }),
      ),
      h("div", { className: "sr-save-disclosure__body" }, saveSearchForm(idPrefix)),
    );
  const filterForms = (idPrefix) => [filterForm(idPrefix), saveSearchDisclosure(idPrefix)];
  const mobileFilterTitleId = `mobile-search-filters-title-${page.locale}`;
  const mobileFilterPanelId = `mobile-search-filters-panel-${page.locale}`;
  const main = h(
    "main",
    {
      id: "main",
      "data-kind": "search",
      "data-react-public-ui": "search",
      "data-total-matches": page.search.total_matches,
      "data-list-first-mobile": page.mobile_policy?.list_first_mobile ? "true" : "false",
      "data-map-optional": page.mobile_policy?.map_optional ? "true" : "false",
      "data-min-touch-target": page.mobile_policy?.minimum_tap_target_px || 44,
      "data-saved-listings-view": savedView ? "true" : undefined,
    },
    h(
      "div",
      { className: `sr-body${savedView ? " sr-body--saved" : ""}` },
      savedView
        ? null
        : h(
        "details",
        { className: "sr-mobile-filters", "data-mobile-search-filters": "true", "data-mobile-filter-count": activeFilterCount },
        h(
          "summary",
          {
            className: "sr-mobile-filters__summary",
            "aria-controls": mobileFilterPanelId,
            "aria-expanded": "false",
          },
          h(Icon, { name: "search", size: 18 }),
          h(
            "span",
            { className: "sr-mobile-filters__copy" },
            h("strong", { className: "sr-mobile-filters__label" }, mobileSearchContext),
            h("small", null, mobileSearchMeta),
          ),
          h(
            "span",
            { className: "sr-mobile-filters__control", "aria-hidden": "true" },
            h(Icon, { name: "sliders-horizontal", size: 18 }),
            activeFilterCount ? h("span", { className: "sr-mobile-filters__count" }, String(activeFilterCount)) : null,
          ),
        ),
        h("button", {
          type: "button",
          className: "sr-mobile-filters__backdrop",
          "data-mobile-filter-close": "true",
          "aria-label": chrome.copy.close,
          "aria-hidden": "true",
          tabIndex: -1,
        }),
        h(
          "div",
          {
            id: mobileFilterPanelId,
            className: "sr-mobile-filters__panel",
            "data-mobile-filter-sheet": "true",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": mobileFilterTitleId,
          },
          h(
            "header",
            { className: "sr-mobile-filters__sheet-head" },
            h("h2", { id: mobileFilterTitleId }, chrome.copy.filters || labels.activeFilters),
            h(
              "button",
              { type: "button", className: "mk-iconbtn mk-iconbtn--ghost mk-iconbtn--md", "data-mobile-filter-close": "true", "aria-label": chrome.copy.close },
              h(Icon, { name: "x", size: 20 }),
            ),
          ),
          h("div", { className: "sr-mobile-filters__sheet-body" }, ...filterForms("sr-mobile")),
          h(
            "footer",
            { className: "sr-mobile-filters__sheet-foot" },
            activeFilterCount ? h(Btn, { tag: "a", variant: "ghost", size: "sm", iconStart: "x", href: searchHref(page, "*") }, labels.clearFilters) : null,
            h(Btn, { type: "submit", form: "sr-mobile-filter-form", variant: "primary", full: true, iconStart: "search" }, `${labels.search} · ${page.search.total_matches} ${labels.matches}`),
          ),
        ),
      ),
      savedView
        ? null
        : h(
        "aside",
        { className: "sr-filters sr-filters--desktop", "aria-label": chrome.copy.filters || labels.activeFilters },
        h("h3", null, chrome.copy.filters || labels.activeFilters),
        ...filterForms("sr"),
      ),
      h(
        "section",
        { className: `sr-results${savedView ? " sr-results--saved" : ""}`, "data-search-view": "list" },
        h(
          "div",
          { className: "sr-results__head" },
          h("h1", null, savedView ? labels.savedListings : page.metadata.title.replace(/\s+\|\s+MS Realty$/u, "")),
          h(
            "p",
            {
              className: "sr-results__count",
              role: "status",
              "aria-live": "polite",
              "data-saved-listings-count": savedView ? "true" : undefined,
              "data-saved-count-label": savedView ? labels.savedListings : undefined,
              hidden: savedView ? true : undefined,
            },
            savedView ? "" : `${page.search.total_matches} ${labels.matches}`,
          ),
        ),
        savedView
          ? null
          : h(
          "section",
          {
            className: "sr-active",
            "aria-label": labels.activeFilters,
            "data-active-filters": "true",
            "data-active-filter-count": (controls.active_filter_chips || []).length,
          },
          ...(controls.active_filter_chips || []).map((chip) =>
            h(
              "a",
              {
                key: chip.key,
                className: "mk-tag mk-tag--outline mk-tag--md",
                href: searchHref(page, chip.key),
                "data-filter-chip": chip.key,
                "aria-label": `${labels.clearFilters}: ${localizedSearchFilterValue(page.locale, chip.key, chip.value)}`,
              },
              localizedSearchFilterValue(page.locale, chip.key, chip.value),
              h(Icon, { name: "x", size: 14 }),
            ),
          ),
        ),
        savedView
          ? h(
          "section",
          {
            className: "sr-saved-empty",
            "data-saved-listings-empty": "true",
            "aria-live": "polite",
            hidden: true,
          },
          h("span", { className: "sr-saved-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "heart", size: 30 })),
          h("p", null, labels.savedEmpty),
          h(Btn, { tag: "a", variant: "primary", size: "md", iconStart: "search", href: page.path }, labels.browseListings),
        )
          : null,
        h(
          "section",
          {
            className: "sr-list",
            "aria-label": savedView ? labels.savedListings : labels.searchResults,
            "data-search-results": "true",
            "data-saved-listings-grid": savedView ? "true" : undefined,
          },
          ...(page.cards || []).map((card, index) => h(SearchCard, { key: card.id, card, labels, localeCode: page.locale, orientation: "horizontal", priority: index === 0 })),
        ),
        !savedView && page.search.pagination?.total_pages > 1
          ? h(
              "nav",
              { className: "sr-pagination", "aria-label": labels.page, "data-search-pagination": "true" },
              page.search.pagination.has_previous
                ? h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: searchHref(page, null, page.search.pagination.page - 1), rel: "prev" }, h(Icon, { name: page.dir === "rtl" ? "arrow-right" : "arrow-left", size: 16 }), h("span", null, labels.previous))
                : h("span"),
              h("span", { className: "sr-pagination__status", "aria-current": "page" }, `${labels.page} ${page.search.pagination.page} / ${page.search.pagination.total_pages}`),
              page.search.pagination.has_next
                ? h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: searchHref(page, null, page.search.pagination.page + 1), rel: "next" }, h("span", null, labels.next), h(Icon, { name: page.dir === "rtl" ? "arrow-left" : "arrow-right", size: 16 }))
                : h("span"),
            )
          : null,
      ),
    ),
  );
  return shell(page, main);
}

/* ============================================================
   Location landing
   ============================================================ */

function LocationBody({ page }) {
  const labels = uiLabels(page);
  const cards = page.cards || [];
  const searchPath = page.chrome?.nav?.find((item) => item.id === "buy")?.href || `/${page.locale}/search`;
  const main = h(
    "main",
    {
      id: "main",
      "data-kind": "location",
      "data-react-public-ui": "location",
      "data-location": page.body.location,
      "data-total-matches": page.body.listing_count,
      "data-list-first-mobile": "true",
    },
    h(
      "section",
      { className: "hp-sec" },
      h(
        "div",
        { className: "hp-sec__head" },
        h("div", null, h("h1", null, page.body.h1), h("p", null, `${page.body.listing_count} ${labels.reviewedListings}`)),
      ),
      cards.length
        ? h(
            "div",
            { className: "hp-grid", "aria-label": labels.locationListings, "data-location-listings": "true" },
            ...cards.map((card, index) => h(SearchCard, { key: card.id, card, labels, localeCode: page.locale, priority: index === 0 })),
          )
        : h(
            "section",
            { className: "mk-empty loc-empty", "data-location-empty": "true", "aria-label": labels.noLocationListings },
            h("span", { className: "loc-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "map-pin", size: 24 })),
            h("h2", null, labels.noLocationListings),
            h(
              "div",
              { className: "mk-empty__actions" },
              h(Btn, { tag: "a", variant: "primary", size: "lg", iconStart: "search", href: searchPath }, labels.browseAllListings),
            ),
          ),
    ),
  );
  return shell(page, main);
}

/* ============================================================
   Listing detail (ui_kits/website/ListingDetail)
   ============================================================ */

const LISTING_ACTION_ICONS = {
  save: "heart",
  share: "share-2",
  print: "printer",
  back_to_results: "arrow-left",
};

function channelIcon(href = "") {
  if (href.startsWith("tel:")) return "phone";
  if (href.includes("wa.me")) return "message-circle";
  if (href.startsWith("viber:")) return "phone";
  if (href.startsWith("mailto:")) return "mail";
  return "message-circle";
}

function listingVerificationDate(value, localeCode) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  const language = { bg: "bg-BG", ru: "ru-RU", de: "de-DE", nl: "nl-NL", el: "el-GR", he: "he-IL" }[localeCode] || "en-GB";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "Europe/Sofia" }).format(new Date(value));
}

function nativeListingVideo(url = "") {
  return /\.(?:mov|mp4|webm)(?:[?#]|$)/i.test(url);
}

function ListingBody({ page }) {
  const labels = uiLabels(page);
  const ui = uiCopyFor(page.locale);
  const chrome = page.chrome;
  const facts = page.body.facts || {};
  const tour = page.body.media.tour || {};
  const gallery = (page.body.media.gallery || []).slice(0, 12);
  const floorPlans = page.body.media.floor_plans || [];
  const videos = page.body.media.videos || [];
  const channels = page.body.actions.direct_contact.channels || [];
  const brokerChannels = channels.filter((channel) => channel.enabled);
  const tone = toneFor(page.body.facts?.id || page.path);
  const breadcrumbChevron = page.dir === "rtl" ? "chevron-left" : "chevron-right";
  const sourceLocale = page.body.source.source_locale;
  const contentLocale = page.body.content_locale || sourceLocale;
  const reviewedTranslation = page.locale !== sourceLocale && page.translation.human_approved === true;
  const translationLabel = reviewedTranslation ? labels.reviewedTranslation : null;
  const sourceLanguageLabel = contentLocale !== page.locale ? contentLocale.toUpperCase() : null;
  const verificationDate = listingVerificationDate(page.body.verification?.availability_verified_at, page.locale);
  const locationPrecision = ui.locationPrecisions?.[facts.location_precision] || humanizeIdentifier(facts.location_precision);
  const hasDetailFacts = ["property_type", "offer_type", "bedrooms", "area_sqm", "floor", "land_area_sqm", "condition", "location_precision"].some(
    (key) => facts[key] !== null && facts[key] !== undefined && facts[key] !== "",
  );

  const crumbs = chrome
    ? h(
        "nav",
        { className: "mk-crumbs", "aria-label": ui.breadcrumb },
        h("span", { className: "mk-crumbs__item" }, h("a", { href: chrome.home.href }, chrome.home.label), h("span", { className: "mk-crumbs__sep" }, h(Icon, { name: breadcrumbChevron, size: 14 }))),
        h("span", { className: "mk-crumbs__item" }, h("a", { href: chrome.nav[0].href }, labels.search), h("span", { className: "mk-crumbs__sep" }, h(Icon, { name: breadcrumbChevron, size: 14 }))),
        h("span", { className: "mk-crumbs__item" }, h("span", { className: "mk-crumbs__current", "aria-current": "page" }, facts.location || page.body.h1)),
      )
    : null;

  const toolButtons = (page.body.actions.secondary || []).map((action) => {
    const icon = action.id === "back_to_results" && page.dir === "rtl" ? "arrow-right" : LISTING_ACTION_ICONS[action.id] || LISTING_ACTION_ICONS[action.kind] || "link";
    const compactOnMobile = ["save", "share_family", "print"].includes(action.id);
    const actionAttrs = {
      "aria-label": action.label,
      "data-listing-action": action.id,
      "data-history-back": action.id === "back_to_results" ? "same-origin" : undefined,
      "data-compact-mobile-action": compactOnMobile ? "true" : undefined,
    };
    if (action.kind === "share" || action.kind === "print" || action.kind === "link") {
      return h(Btn, { key: action.id, tag: "a", variant: "secondary", size: "sm", iconStart: icon, href: action.url, ...actionAttrs }, action.label);
    }
    return h(
      Btn,
      {
        key: action.id,
        variant: "secondary",
        size: "sm",
        iconStart: icon,
        ...actionAttrs,
        "data-client-save-listing": action.listing_id,
        "data-save-label": action.label,
        "data-saved-label": action.saved_label || labels.saved,
      },
      action.label,
    );
  });

  const specIcons = { bedrooms: "bed", property_type: "house", offer_type: "key", location: "map-pin" };
  const specs = ["bedrooms", "property_type", "offer_type", "location"]
    .filter((key) => facts[key])
    .map((key) => {
      const value = key === "property_type" || key === "offer_type" ? localizedListingValue(page.locale, key, facts[key]) : facts[key];
      return h(
        "div",
        { key, className: "ld-spec" },
        h(Icon, { name: specIcons[key], size: 22 }),
        h("b", null, value),
        h("span", null, labels.factLabels?.[key] || key.replaceAll("_", " ")),
      );
    });

  const primaryIcons = { inquiry: "message-circle", callback: "phone", request_viewing: "calendar" };
  const primaryActionList = page.body.actions.primary || [];
  const stickyActionId = facts.price_on_request ? "inquiry" : "request_viewing";
  const leadButton = (action, { variant = "secondary", size = "lg", full = true, keySuffix = "" } = {}) =>
    h(
      Btn,
      {
        key: `${action.id || action.endpoint}${keySuffix}`,
        variant,
        size,
        full,
        iconStart: primaryIcons[action.id] || "message-circle",
        "data-endpoint": action.endpoint,
        "data-lead-source": action.payload?.source,
        "data-lead-intent": action.id === "request_viewing" ? "viewing" : action.id,
        "data-lead-title": action.label,
        "data-lead-submit": action.label,
        "data-listing-reference": action.payload?.listingReference,
        "data-lead-type": facts.offer_type === "rent" ? "renter" : "buyer",
        "data-contact-preference": action.payload?.contact_preference,
        "data-mobile-sticky-primary": action.id === stickyActionId ? "true" : undefined,
      },
      action.label,
    );
  const primaryActions = h(
    "nav",
    {
      className: "ld-aside__btns",
      "aria-label": labels.listingActions,
      "data-mobile-sticky-actions": page.body.actions.sticky_mobile ? "true" : "false",
    },
    h(
      "span",
      { className: "ld-mobile-price", "aria-hidden": "true" },
      h("strong", null, facts.price_on_request ? labels.priceOnRequest : price(facts.price_eur, labels)),
      h("small", null, localizedListingValue(page.locale, "offer_type", facts.offer_type)),
    ),
    ...primaryActionList.map((action, index) => leadButton(action, { variant: index === 0 ? "accent" : "secondary", keySuffix: `-${index}` })),
    h(
      "button",
      {
        type: "button",
        className: "ld-mobile-contact-more mk-iconbtn mk-iconbtn--outline mk-iconbtn--lg",
        "data-mobile-contact-options-open": "true",
        "aria-label": labels.contactBroker,
        title: labels.contactBroker,
      },
      h(Icon, { name: "message-circle", size: 20 }),
    ),
  );

  const mobileContactOptions = h(
    "dialog",
    { id: "mk-contact-options", className: "ld-contact-options", "aria-label": labels.contactBroker, "data-mobile-contact-options": "true" },
    h(
      "header",
      { className: "ld-contact-options__head" },
      h("div", null, h("h2", null, labels.contactBroker), h("p", null, labels.listingActions)),
      h(
        "button",
        { type: "button", className: "mk-iconbtn mk-iconbtn--ghost mk-iconbtn--md", "data-mobile-contact-options-close": "true", "aria-label": chrome.copy.close },
        h(Icon, { name: "x", size: 20 }),
      ),
    ),
    h(
      "nav",
      { className: "ld-contact-options__actions", "aria-label": labels.listingActions },
      ...primaryActionList.map((action, index) => leadButton(action, { variant: action.id === stickyActionId ? "accent" : "secondary", keySuffix: `-mobile-${index}` })),
    ),
    brokerChannels.length
      ? h(
          "nav",
          { className: "ld-contact-options__direct", "aria-label": labels.brokerContact },
          ...brokerChannels.map((channel) =>
            h(Btn, { key: `mobile-${channel.label}`, tag: "a", variant: "ghost", size: "sm", iconStart: channelIcon(channel.href), href: channel.href }, channel.label),
          ),
        )
      : null,
  );

  const brokerContact = h(
    "nav",
    { className: "ld-aside__contact", "aria-label": labels.brokerContact, "data-broker-contact-actions": "true" },
    ...brokerChannels.map((channel) => h(Btn, { key: channel.label, tag: "a", variant: "secondary", size: "md", full: true, iconStart: channelIcon(channel.href), href: channel.href }, channel.label)),
  );

  const main = h(
    "main",
    {
      id: "main",
      "data-kind": "listing",
      "data-react-public-ui": "listing",
      "data-review-status": page.body.actions.direct_contact.review_status,
      "data-listing-status": page.body.lifecycle?.status || "available",
      "data-active-in-search": page.body.lifecycle?.active_in_search ? "true" : "false",
      "data-availability-verified": page.body.verification?.verified ? "true" : "false",
      "data-location-precision": facts.location_precision || "approximate",
      "data-content-language": contentLocale,
      "data-min-touch-target": "44",
    },
    h(
      "div",
      { className: "ld" },
      crumbs,
      h(
        "section",
        {
          className: "ld-top",
          "aria-label": labels.listingSummary,
          "data-listing-summary": "true",
          "data-source-domain": page.body.source.source_domain,
          "data-schema-ready": page.schema ? "true" : "false",
        },
        h(
          "div",
          { className: "ld-top__main" },
          translationLabel
            ? h("p", { className: "mk-badge mk-badge--new mk-badge--sm ld-top__badge", "data-listing-verification": "translation" }, translationLabel)
            : null,
          sourceLanguageLabel
            ? h(
                "p",
                {
                  className: "mk-badge mk-badge--neutral mk-badge--sm ld-top__badge",
                  "data-listing-verification": "source-language",
                  lang: contentLocale,
                },
                sourceLanguageLabel,
              )
            : null,
          verificationDate
            ? h(
                "p",
                { className: "mk-badge mk-badge--success mk-badge--sm ld-top__badge", "data-listing-verification": "availability" },
                h(Icon, { name: "shield-check", size: 14 }),
                ` ${ui.verifiedInventory} · `,
                h("time", { dateTime: page.body.verification.availability_verified_at }, verificationDate),
              )
            : null,
          h("h1", { lang: contentLocale }, page.body.h1),
          h(
            "div",
            { className: "ld-top__loc" },
            h(Icon, { name: "map-pin", size: 17 }),
            ` ${[facts.location, locationPrecision, localizedListingValue(page.locale, "property_type", facts.property_type)].filter(Boolean).join(" · ")}`,
          ),
          h("div", { className: "ld-top__price", "data-listing-price-summary": "true" }, facts.price_on_request ? labels.priceOnRequest : price(facts.price_eur, labels)),
          h(
            "ul",
            { className: "ld-feats", "data-listing-highlights": "true" },
            ...["location", "property_type", "offer_type", "bedrooms"]
              .filter((key) => facts[key])
              .map((key) => {
                const value = key === "property_type" || key === "offer_type" ? localizedListingValue(page.locale, key, facts[key]) : facts[key];
                return h("li", { key, className: "mk-tag mk-tag--neutral mk-tag--md" }, h(Icon, { name: "check", size: 15 }), `${labels.factLabels?.[key] || key}: ${value}`);
              }),
          ),
        ),
        h("nav", { className: "ld-top__acts", "aria-label": labels.saveAndShare, "data-listing-tools": "true" }, ...toolButtons),
      ),
      h(
        "div",
        { className: "ld-gallery", "data-mobile-gallery": "true" },
        h(
          "div",
          { className: `ld-g ld-g--main mk-photo mk-photo--${tone}` },
          gallery[0] ? h("img", publicImageProps(gallery[0], page.body.h1, "eager", "high")) : null,
          h(
            "a",
            { className: "ld-g__count", href: "#listing-gallery", "aria-label": `${page.body.media.gallery_count || gallery.length} ${labels.photos}` },
            h(Icon, { name: "camera", size: 16 }),
            h("span", null, `${page.body.media.gallery_count || gallery.length} ${labels.photos}`),
          ),
        ),
        h("div", { className: "ld-g mk-photo mk-photo--sand" }, gallery[1] ? h("img", publicImageProps(gallery[1], page.body.h1)) : null),
        h(
          "div",
          { className: "ld-g mk-photo mk-photo--sky" },
          gallery[2] ? h("img", publicImageProps(gallery[2], page.body.h1)) : null,
          h("a", { className: "ld-g__more", href: "#listing-gallery" }, h(Icon, { name: "camera", size: 18 }), ` ${page.body.media.gallery_count || gallery.length} ${labels.photos}`),
        ),
      ),
      h(
        "section",
        { className: "ld-cols", "aria-label": labels.listingContent, "data-listing-content-grid": "true" },
        h(
          "section",
          { className: "ld-main", "aria-label": labels.listingMediaFacts, "data-listing-main-column": "true" },
          h("div", { className: "ld-specs" }, ...specs),
          h(
            "div",
            { className: "ld-sec" },
            h("h2", null, labels.propertyDetails),
            h("p", { className: "ld-desc", "data-listing-description": "true", lang: contentLocale }, page.body.description || ""),
          ),
          hasDetailFacts ? h("div", { className: "ld-sec" }, h("h2", null, labels.listingMediaFacts), factsList(facts, labels, page.locale)) : null,
          tour.available || floorPlans.length || videos.length
            ? h(
                "nav",
                {
                  className: "mk-tabs mk-tabs--segmented ld-media-nav",
                  "aria-label": labels.listingMedia,
                  "data-media-gallery-count": page.body.media.gallery_count || 0,
                  "data-tour-status": "available",
                },
                h("a", { className: "mk-tab", href: "#listing-gallery" }, h(Icon, { name: "camera", size: 16 }), labels.gallery),
                floorPlans.length ? h("a", { className: "mk-tab", href: "#listing-floor-plans" }, h(Icon, { name: "file-check", size: 16 }), labels.floorPlans) : null,
                videos.length ? h("a", { className: "mk-tab", href: "#listing-videos" }, h(Icon, { name: "external-link", size: 16 }), labels.videos) : null,
                tour.available ? h("a", { className: "mk-tab", href: "#listing-tour" }, h(Icon, { name: "globe", size: 16 }), labels.tour360) : null,
              )
            : null,
          h(
            "section",
            { id: "listing-gallery", className: "ld-gallery-full", "aria-label": labels.gallery, "data-photo-carousel": "true" },
            ...gallery.map((image) => h("img", { key: image.url, ...publicImageProps(image, page.body.h1) })),
          ),
          floorPlans.length
            ? h(
                "section",
                { id: "listing-floor-plans", className: "ld-gallery-full", "aria-label": labels.floorPlans, "data-floor-plan-gallery": "true" },
                ...floorPlans.map((plan) => h("img", { key: plan.url, src: plan.url, alt: plan.alt, loading: "lazy" })),
              )
            : null,
          videos.length
            ? h(
                "section",
                { id: "listing-videos", className: "ld-videos", "aria-label": labels.videos, "data-listing-videos": "true", "data-low-bandwidth": "metadata-only" },
                ...videos.map((video) =>
                  h(
                    "figure",
                    { key: video.url, className: "mk-card mk-card--sunken mk-card--pad-md" },
                    nativeListingVideo(video.url)
                      ? h("video", { controls: true, preload: "metadata", src: video.url, "aria-label": video.alt })
                      : h("a", { className: "mk-btn mk-btn--secondary mk-btn--md", href: video.url, target: "_blank", rel: "noreferrer" }, h(Icon, { name: "external-link", size: 16 }), labels.videos),
                    h("figcaption", null, video.alt),
                  ),
                ),
              )
            : null,
          tour.available
            ? h(
                "section",
                {
                  id: "listing-tour",
                  className: "ld-tour mk-card mk-card--sunken mk-card--pad-md",
                  "aria-label": labels.tour360,
                  "data-photo-sphere-viewer": tour.mount_target,
                  "data-tour-provider": tour.provider || "photo-sphere-viewer",
                  "data-panorama-url": tour.panorama_url,
                },
                h("p", null, tour.accessibility_caption),
              )
            : null,
        ),
        h(
          "aside",
          { className: "ld-aside", "aria-label": labels.contactBroker, "data-listing-contact-panel": "true" },
          h(
            "div",
            { className: "mk-card mk-card--elevated mk-card--pad-lg ld-aside__card" },
            h("div", { className: "ld-price", "data-listing-price": "true" }, facts.price_on_request ? labels.priceOnRequest : price(facts.price_eur, labels)),
            primaryActions,
            brokerChannels.length ? brokerContact : null,
            translationLabel ? h("div", { className: "ld-trust" }, h(Icon, { name: "shield-check", size: 16 }), ` ${translationLabel}`) : null,
            verificationDate ? h("div", { className: "ld-trust", "data-availability-verification": "true" }, h(Icon, { name: "calendar-check", size: 16 }), ` ${ui.verifiedInventory}: ${verificationDate}`) : null,
            h("div", { className: "ld-aside__ref" }, h("span", null, facts.id), h("span", null, page.body.source.source_domain)),
          ),
        ),
      ),
    ),
    h(
      "section",
      { className: "ld-similar", "aria-label": labels.relatedListings, "data-related-listings": "true" },
      h("h2", null, labels.relatedListings),
      h(
        "div",
        { className: "ld-similar__grid" },
        ...(page.body.related_listings || []).map((card) =>
          h(SearchCard, { key: card.id, card, labels, localeCode: page.locale, rootAttrs: { "data-related-listing": "true" } }),
        ),
      ),
    ),
    mobileContactOptions,
  );
  return shell(page, main);
}

/* ============================================================
   Seller valuation
   ============================================================ */

function SellerBody({ page }) {
  const labels = uiLabels(page);
  const valuation = page.body.valuation;
  const steps = [labels.propertyDetails, labels.brokerReview, labels.callback];
  const propertyTypes = Object.entries(uiCopyFor(page.locale).propertyTypes || {});
  const main = h(
    "main",
    {
      id: "main",
      "data-kind": "seller",
      "data-react-public-ui": "seller",
      "data-phone-first": "true",
      "data-no-public-avm": "true",
      "data-broker-review-required": "true",
      "data-min-touch-target": "44",
      className: "ct-page pg-narrow",
    },
    h(
      "section",
      { className: "ct-page__head", "aria-label": labels.sellerValuation, "data-seller-valuation-flow": "broker_callback" },
      h("h1", null, page.body.h1),
      h("p", null, page.body.intro),
      h(
        "ol",
        { className: "sell-steps", "data-seller-steps": "true" },
        ...steps.map((step, index) => h("li", { key: step }, h("span", { className: "sell-steps__num", "aria-hidden": "true" }, index + 1), step)),
      ),
    ),
    h(
      "form",
      { className: "mk-card mk-card--elevated mk-card--pad-lg ct-form", method: valuation.method || "POST", action: valuation.endpoint, "data-lead-type": "seller" },
      h("input", { type: "hidden", name: "source", defaultValue: valuation.payload.source }),
      h("input", { type: "hidden", name: "intent", defaultValue: valuation.payload.intent }),
      h("input", { type: "hidden", name: "leadType", defaultValue: valuation.payload.leadType }),
      h("input", { type: "hidden", name: "language", defaultValue: valuation.payload.language }),
      h(
        "div",
        { className: "sell-form__section", "data-seller-property-fields": "true" },
        h("h2", { className: "ct-form__title" }, labels.propertyDetails),
        h("label", null, labels.location, h("input", { name: "property.location", required: true, autoComplete: "address-level2" })),
        h(
          "div",
          { className: "sell-form__grid" },
          h(
            "label",
            null,
            labels.propertyType,
            h(
              "select",
              { name: "property.type", required: true },
              h("option", { value: "", disabled: true, selected: true }, labels.propertyType),
              ...propertyTypes.map(([value, option]) => h("option", { key: value, value }, option)),
            ),
          ),
          h("label", null, labels.area, h("input", { name: "property.area", type: "number", min: "0", inputMode: "decimal" })),
          h("label", null, labels.factLabels?.bedrooms || "Bedrooms", h("input", { name: "property.bedrooms", type: "number", min: "0", inputMode: "numeric" })),
        ),
      ),
      h(
        "div",
        { className: "sell-form__section" },
        h("h2", { className: "ct-form__title" }, labels.contact),
        h(
          "div",
          { className: "ct-form__row" },
          h("label", null, labels.name, h("input", { name: "contact.name", required: true, autoComplete: "name" })),
          h("label", null, labels.phone, h("input", { name: "contact.phone", type: "tel", required: true, autoComplete: "tel", inputMode: "tel" })),
        ),
        h(
          "div",
          { className: "ct-form__row" },
          h(
            "label",
            null,
            labels.preferredContact,
            h(
              "select",
              { name: "contact_preference" },
              h("option", { value: "phone" }, labels.phone),
              h("option", { value: "whatsapp" }, "WhatsApp"),
              h("option", { value: "viber" }, "Viber"),
            ),
          ),
          h("label", null, labels.propertyDetails, h("textarea", { name: "message", required: true })),
        ),
      ),
      h(Btn, { type: "submit", variant: "accent", size: "lg", full: true, iconStart: "send" }, valuation.label),
    ),
  );
  return shell(page, main);
}

/* ============================================================
   Contact (ui_kits/website/ContactPanel → ContactPage)
   ============================================================ */

function ContactBody({ page }) {
  const labels = uiLabels(page);
  const chrome = page.chrome;
  const callback = page.body.callback;
  const main = h(
    "main",
    { id: "main", "data-kind": "contact", "data-react-public-ui": "contact", "data-phone-first": "true", "data-min-touch-target": "44", className: "ct-page" },
    h("div", { className: "ct-page__head" }, h("h1", null, page.body.h1), h("p", null, page.body.intro)),
    h(
      "div",
      { className: "ct-page__cols" },
      h(
        "div",
        { className: "ct-offices" },
        chrome
          ? h(
              "div",
              { className: "ct-office" },
              h("div", { className: "ct-office__ph mk-photo mk-photo--sand", "aria-hidden": "true" }),
              h(
                "div",
                null,
                h("h3", null, chrome.copy.getInTouch),
                h(
                  "div",
                  { className: "ct-office__meta" },
                  h("span", null, h(Icon, { name: "map-pin", size: 16 }), ` ${chrome.copy.offices}`),
                  h("span", null, h(Icon, { name: "phone", size: 16 }), h("a", { href: chrome.contact.phone_href }, chrome.contact.phone_label)),
                  h("span", null, h(Icon, { name: "mail", size: 16 }), h("a", { href: `mailto:${chrome.contact.email}` }, chrome.contact.email)),
                ),
              ),
            )
          : null,
        h(
          "nav",
          { className: "ct-actions", "aria-label": labels.contactActions },
          h(Btn, { tag: "a", variant: "secondary", iconStart: "search", href: page.body.search.path, "data-action": "search" }, labels.search),
          h(Btn, { tag: "a", variant: "secondary", iconStart: "landmark", href: page.body.seller.path, "data-action": "seller" }, labels.sellerValuation),
        ),
      ),
      h(
        "form",
        {
          className: "mk-card mk-card--elevated mk-card--pad-lg ct-form",
          method: callback.method || "POST",
          action: callback.endpoint,
          "data-lead-type": "general",
          "data-source": callback.payload.source,
        },
        h("h2", { className: "ct-form__title" }, labels.message),
        h("input", { type: "hidden", name: "source", defaultValue: callback.payload.source }),
        h("input", { type: "hidden", name: "intent", defaultValue: callback.payload.intent }),
        h("input", { type: "hidden", name: "leadType", defaultValue: callback.payload.leadType }),
        h("input", { type: "hidden", name: "language", defaultValue: callback.payload.language }),
        h("input", { type: "hidden", name: "contact_preference", defaultValue: callback.payload.contact_preference }),
        h("label", null, labels.name, h("input", { name: "contact.name", required: true, autoComplete: "name" })),
        h("label", null, labels.phone, h("input", { name: "contact.phone", type: "tel", required: true, autoComplete: "tel", inputMode: "tel" })),
        h("label", null, labels.preferredCallbackTime, h("input", { name: "request_details.callback_time", maxLength: 120 })),
        h("label", null, labels.message, h("textarea", { name: "message" })),
        h(Btn, { type: "submit", variant: "accent", size: "lg", full: true, iconStart: "send" }, callback.label),
      ),
    ),
  );
  return shell(page, main);
}

/* ============================================================
   Language fallback + guide
   ============================================================ */

function LanguageFallbackBody({ page }) {
  const labels = uiLabels(page);
  const main = h(
    "main",
    {
      id: "main",
      "data-kind": "language-fallback",
      "data-react-public-ui": "language-fallback",
      "data-public-translation-available": page.public_translation_available ? "true" : "false",
      className: "pg-narrow",
    },
    h(
      "div",
      { className: "mk-empty" },
      h("span", { className: "mk-empty__icon" }, h(Icon, { name: "languages", size: 24 })),
      h("h1", { className: "mk-empty__title" }, page.metadata.title),
      h("p", { className: "mk-empty__text" }, page.metadata.description),
      h(
        "div",
        { className: "mk-empty__actions" },
        h(
          "form",
          { method: "POST", action: "/api/language-requests", "data-request-language": "true" },
          h("input", { type: "hidden", name: "requestedLocale", defaultValue: page.requested_locale }),
          h("input", { type: "hidden", name: "requestedPath", defaultValue: page.requested_path }),
          h(Btn, { type: "submit", variant: "primary", iconStart: "languages" }, labels.requestLanguage),
        ),
      ),
    ),
  );
  return shell(page, main);
}

function GuideBody({ page }) {
  const labels = uiLabels(page);
  const main = h(
    "main",
    {
      id: "main",
      "data-kind": "guide",
      "data-react-public-ui": "guide",
      "data-approved-source": "cms",
      "data-min-touch-target": "44",
      className: "pg-narrow",
    },
    h("header", { className: "ct-page__head" }, h("h1", null, page.body.h1), h("p", null, page.body.intro)),
    ...(page.body.sections || []).map((section) =>
      h(
        "section",
        { key: section.id, id: section.id, className: "mk-card mk-card--pad-lg guide-sec", "data-reviewer": section.reviewer },
        h("h2", null, section.title),
        h("ul", { className: "guide-facts" }, ...(section.facts || []).map((fact) => h("li", { key: fact }, h(Icon, { name: "check", size: 15 }), fact))),
      ),
    ),
    h(
      "nav",
      { className: "pg-actions", "aria-label": labels.guideActions },
      h(Btn, { tag: "a", variant: "primary", iconStart: "search", href: page.body.ctas.search.path }, labels.search),
      h(Btn, { tag: "a", variant: "secondary", iconStart: "landmark", href: page.body.ctas.seller.path }, labels.sellerValuation),
      h(Btn, { tag: "a", variant: "secondary", iconStart: "phone", href: page.body.ctas.contact.path }, labels.contact),
    ),
  );
  return shell(page, main);
}

export function renderReactPublicBody(page) {
  if (page.kind === "home") return renderStaticElement(h(HomeBody, { page }));
  if (page.kind === "search") return renderStaticElement(h(SearchBody, { page }));
  if (page.kind === "listing") return renderStaticElement(h(ListingBody, { page }));
  if (page.kind === "location") return renderStaticElement(h(LocationBody, { page }));
  if (page.kind === "seller") return renderStaticElement(h(SellerBody, { page }));
  if (page.kind === "contact") return renderStaticElement(h(ContactBody, { page }));
  if (page.kind === "language_fallback") return renderStaticElement(h(LanguageFallbackBody, { page }));
  if (page.kind === "guide") return renderStaticElement(h(GuideBody, { page }));
  return "";
}
