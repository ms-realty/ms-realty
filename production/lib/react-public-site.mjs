import { h, renderStaticElement } from "./react-static-html.mjs";
import { humanizeIdentifier, labelsFor, localizedListingValue, localizedLocationValue, localizedSearchFilterValue, uiCopyFor } from "./public-site.mjs";
import { Icon } from "./ui/icons.mjs";
import { LOGO_ASPECT, LOGO_URL, LOGO_URL_REVERSED } from "./ui/design-assets.mjs";

function uiLabels(page) {
  return labelsFor(page.locale || page.lang || "en");
}

function price(value, labels = labelsFor("en"), localeCode = "en") {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 1 ? formatEuro(amount, localeCode) : labels.priceOnRequest;
}

function cardSummary(card) {
  // The offer type rides on the photo badge, so the location line stays short.
  return [card.location, card.property_type_label || card.property_type].filter(Boolean).join(" · ");
}

function fillLabel(template, values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => (values[key] === undefined ? match : String(values[key])));
}

function hasFact(value) {
  return value !== null && value !== undefined && value !== "";
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
  const resources = chrome.resources?.links || [];
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
      h(Icon, { name: "menu", size: 22, className: "site-hd__mobile-icon-open" }),
      h(Icon, { name: "x", size: 22, className: "site-hd__mobile-icon-close" }),
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
        { className: "site-hd__mobile-nav" },
        ...chrome.nav.map((item) =>
          h(
            "a",
            { key: item.id, href: item.href, "aria-current": item.active ? "page" : undefined },
            item.label,
          ),
        ),
      ),
      resources.length
        ? h(
            "div",
            { className: "site-hd__mobile-resources", "data-mobile-secondary-navigation": "true" },
            h("p", { className: "site-hd__mobile-section-label" }, chrome.resources.label),
            h(
              "nav",
              { className: "site-hd__mobile-nav site-hd__mobile-nav--resources", "aria-label": chrome.resources.label },
              ...resources.map((item) =>
                h(
                  "a",
                  { key: item.id, href: item.href, "aria-current": item.active ? "page" : undefined },
                  h(Icon, { name: "file-check", size: 18 }),
                  h("span", null, item.label),
                ),
              ),
            ),
          )
        : null,
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
      h(Btn, { tag: "a", variant: "accent", size: "md", full: true, iconStart: "message-circle", href: chrome.contact.path }, chrome.contact.label),
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
        h(
          "picture",
          null,
          h("source", { media: "(prefers-color-scheme: dark)", srcSet: LOGO_URL_REVERSED }),
          h("img", { src: LOGO_URL, alt: chrome.home.label, height: 40, width: Math.round(40 * LOGO_ASPECT) }),
        ),
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
        // Package P4: saved counter plus a compare shortcut. The counter reuses
        // the data-saved-count and data-saved-navigation contract the client
        // already maintains; the compare link stays hidden until two or more
        // properties are saved, and the script fills in their ids.
        chrome.saved
          ? h(
              "a",
              {
                className: "site-hd__saved",
                href: chrome.saved.href,
                "data-saved-navigation": "true",
                "data-saved-navigation-label": chrome.saved.label,
                "aria-label": chrome.saved.label,
              },
              h(Icon, { name: "heart", size: 18 }),
              h("span", { className: "site-hd__saved-label" }, chrome.saved.label),
              h("span", { className: "site-hd__saved-count", "data-saved-count": "true", hidden: true }),
            )
          : null,
        chrome.saved?.compare
          ? h(
              "a",
              {
                className: "site-hd__compare",
                href: chrome.saved.compare.href,
                "data-compare-link": "true",
                "data-compare-min": "2",
                "aria-label": chrome.saved.compare.label,
                title: chrome.saved.compare.label,
                "aria-current": chrome.saved.compare.active ? "page" : undefined,
                hidden: true,
              },
              h(Icon, { name: "columns-3", size: 18 }),
              h("span", { className: "site-hd__compare-label" }, chrome.saved.compare.label),
            )
          : null,
        h(LanguageMenu, { languages: chrome.languages, label: copy.languageLabel }),
        h(
          Btn,
          { tag: "a", variant: "accent", size: "sm", iconStart: "message-circle", href: chrome.contact.path, className: "site-hd__call mk-btn mk-btn--accent mk-btn--sm" },
          chrome.contact.label,
        ),
      ),
      h("a", { className: "site-hd__mobile-call", href: chrome.contact.path, "aria-label": chrome.contact.label, title: chrome.contact.label }, h(Icon, { name: "message-circle", size: 20 })),
      mobileMenu,
    ),
  );
}

function MobileTaskNavigation({ page, chrome }) {
  // Stepper pages own the bottom of the viewport (their own next/back actions).
  if (page.kind === "listing" || page.kind === "seller" || page.kind === "start") return null;
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
                ? !rentView && (item.active || page.kind === "home" || page.kind === "location")
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
  const resources = chrome.resources?.links || [];
  const buy = chrome.nav.find((item) => item.id === "buy");
  // Package P4 appends the company routes it added (about, alerts) to the
  // existing explore group rather than opening a fourth footer column.
  const exploreLinks = [...chrome.nav, ...resources, ...(chrome.company?.links || [])];
  const locationLinks = locations.length
    ? locations.map((location) => ({ id: location.href, href: location.href, label: location.label }))
    : [{ id: "search", href: buy?.href || chrome.home.href, label: chrome.footer.searchLabel }];
  const contactLinks = [
    { id: "contact", href: chrome.nav.find((item) => item.id === "contact")?.href || chrome.home.href, label: copy.navContact },
    { id: "seller", href: chrome.nav.find((item) => item.id === "sell")?.href || chrome.home.href, label: labels.sellerValuation },
    ...(chrome.contact.phone
      ? [{ id: "phone", href: `tel:${chrome.contact.phone}`, label: chrome.contact.phone_display || chrome.contact.phone }]
      : []),
    { id: "email", href: `mailto:${chrome.contact.email}`, label: chrome.contact.email },
  ];
  const mobileGroups = [
    { id: "explore", label: copy.explore, links: exploreLinks },
    { id: "locations", label: chrome.footer.locationsLabel, links: locationLinks },
    { id: "contact", label: copy.getInTouch, links: contactLinks },
  ];
  return h(
    "footer",
    { className: "site-ft" },
    h(
      "div",
      { className: "site-ft__in" },
      h(
        "div",
        { className: "site-ft__brand" },
        h(
          "a",
          { href: chrome.home.href, "aria-label": chrome.home.label, className: "site-ft__logo" },
          h("img", { src: LOGO_URL_REVERSED, alt: chrome.home.label, height: 30, width: Math.round(30 * LOGO_ASPECT), loading: "lazy", decoding: "async" }),
        ),
        h("p", { className: "site-ft__intro" }, copy.tagline),
        h(
          "div",
          { className: "site-ft__contact" },
          h("span", null, h(Icon, { name: "mail", size: 16 }), h("a", { href: `mailto:${chrome.contact.email}` }, chrome.contact.email)),
          h("span", null, h(Icon, { name: "map-pin", size: 16 }), copy.offices),
        ),
      ),
      h(
        "div",
        { className: "site-ft__desktop-links" },
        h("h2", null, copy.explore),
        h(
          "ul",
          null,
          ...exploreLinks.map((item) =>
            h("li", { key: item.id }, h("a", { href: item.href, "aria-current": item.active ? "page" : undefined }, item.label)),
          ),
        ),
      ),
      h(
        "div",
        { className: "site-ft__desktop-links" },
        h("h2", null, chrome.footer.locationsLabel),
        h(
          "ul",
          null,
          ...locationLinks.map((item) => h("li", { key: item.id }, h("a", { href: item.href }, item.label))),
        ),
      ),
      h(
        "div",
        { className: "site-ft__desktop-links" },
        h("h2", null, copy.getInTouch),
        h(
          "ul",
          null,
          ...contactLinks.map((item) => h("li", { key: item.id }, h("a", { href: item.href }, item.label))),
        ),
      ),
      h(
        "div",
        { className: "site-ft__mobile-groups", "data-mobile-footer-navigation": "true" },
        ...mobileGroups.map((group) =>
          h(
            "details",
            { key: group.id, className: "site-ft__mobile-group", "data-mobile-footer-group": group.id },
            h("summary", null, h("span", null, group.label), h(Icon, { name: "chevron-down", size: 18 })),
            h(
              "ul",
              null,
              ...group.links.map((item) =>
                h("li", { key: item.id }, h("a", { href: item.href, "aria-current": item.active ? "page" : undefined }, item.label)),
              ),
            ),
          ),
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
  // When the runtime cannot durably accept leads, the shell modal must not
  // pretend otherwise: offer the working direct channels instead of a form.
  if (page.chrome?.lead_writes_disabled) {
    const contact = page.chrome?.contact || {};
    return h(
      "dialog",
      { id: "mk-enquiry", className: "ct-modal mk-enquiry", "aria-modal": "true", "aria-label": labels.inquiry, "data-enquiry-intent": "inquiry", "data-form-unavailable": "true" },
      h("div", { className: "mk-enquiry__heading" }, h("h2", null, labels.inquiry)),
      contact.phone
        ? h(
            Btn,
            { tag: "a", variant: "accent", size: "lg", full: true, iconStart: "phone", href: `tel:${contact.phone}` },
            contact.phone_display || contact.phone,
          )
        : null,
      contact.email ? h("p", null, h("a", { href: `mailto:${contact.email}` }, contact.email)) : null,
    );
  }
  const intentCopy = INTENT_DIALOG_COPY[page.locale] || INTENT_DIALOG_COPY.en;
  const facts = page.kind === "listing" ? page.body?.facts || {} : {};
  const propertyTitle = page.kind === "listing" ? page.body?.h1 || "" : "";
  const propertyMeta = [facts.location, price(facts.price_eur, labels, page.locale)].filter(Boolean).join(" · ");
  return h(
    "dialog",
    { id: "mk-enquiry", className: "ct-modal mk-enquiry", "aria-modal": "true", "aria-label": labels.inquiry, "data-enquiry-intent": "inquiry" },
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
      // Source and channel attribution. The channel names the surface family,
      // the first touch path names where the visit started. Both are filled by
      // the client, neither travels in a URL, and neither identifies a visitor.
      h("input", { type: "hidden", name: "channel", defaultValue: "", "data-lead-channel-field": "true" }),
      h("input", { type: "hidden", name: "firstTouchPath", defaultValue: "", "data-first-touch-field": "true" }),
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
      // B5: real slots for the listing's broker, fetched from /api/viewing-slots.
      // The free date and time stay as the no-JS and no-slots path, so the
      // request never depends on the picker being able to load.
      h(
        "label",
        {
          "data-enquiry-slot-group": "true",
          hidden: true,
          "data-enquiry-slot-endpoint": "/api/viewing-slots",
          "data-enquiry-slot-locale": page.locale,
          "data-enquiry-slot-loading": labels.viewingSlotLoading,
          "data-enquiry-slot-empty": labels.viewingSlotEmpty,
        },
        labels.viewingSlot,
        h(
          "select",
          { name: "request_details.viewing_slot", "data-enquiry-slot": "true" },
          h("option", { value: "" }, labels.viewingSlotPlaceholder),
        ),
        h("small", { className: "mk-enquiry__slot-note", "data-enquiry-slot-note": "true" }, labels.viewingSlotRequest),
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

function photoCountLabel(count, labels) {
  return Number(count) === 1 ? labels.photo || labels.photos : labels.photos;
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
  const imageCount = Number(card.image_count || 0);
  const mediaCountText = `${imageCount} ${photoCountLabel(imageCount, labels)}`;
  const isRent = card.offer_type === "rent";
  const offerLabel = card.offer_type_label || (card.offer_type ? localizedListingValue(localeCode, "offer_type", card.offer_type) : "");
  const statusLabel = card.listing_status && card.listing_status !== "available" ? labels.listingStatuses?.[card.listing_status] : null;
  const mediaChildren = [
    h(
      "div",
      { key: "badges", className: "mk-pcard__badges" },
      offerLabel ? h(Badge, { variant: isRent ? "for-rent" : "for-sale", solid: true, "data-card-offer": card.offer_type }, offerLabel) : null,
      statusLabel ? h(Badge, { variant: "reduced", solid: true, "data-card-status": card.listing_status }, statusLabel) : null,
      badge
        ? h(
            Badge,
            {
              variant: badge.variant,
              solid: true,
              "data-card-badge": "true",
              "data-card-source-language": badge.contentLocale || undefined,
              lang: badge.contentLocale || undefined,
            },
            badge.label,
          )
        : null,
    ),
    h(
      "span",
      { key: "count", className: "mk-pcard__count", "data-card-media-count": card.image_count },
      h(Icon, { name: "camera", size: 13 }),
      ` ${mediaCountText}`,
    ),
  ];
  const mediaAttrs = {
    href: card.path,
    className: `mk-pcard__media mk-photo mk-photo--${tone}`,
    // The title link right below is the card's one accessible entry; a second
    // link with the same destination would double every tab stop.
    "aria-hidden": "true",
    tabIndex: -1,
    lang: card.content_locale || undefined,
  };
  const photoPlaceholder = h("span", { key: "noimage", className: "mk-pcard__noimage", "aria-hidden": "true" }, h(Icon, { name: "camera", size: 22 }));
  const media = card.thumbnail?.url
    ? h(
        "a",
        { ...mediaAttrs, "data-card-thumbnail": "true" },
        h("img", publicImageProps(card.thumbnail, card.title, priority ? "eager" : "lazy", priority ? "high" : undefined)),
        photoPlaceholder,
        ...mediaChildren,
      )
    : h("a", mediaAttrs, photoPlaceholder, ...mediaChildren);
  return h(
    "article",
    {
      className: `mk-pcard mk-pcard--interactive${orientation === "horizontal" ? " mk-pcard--row" : ""}`,
      "data-listing-id": card.id,
      "data-translation-display": card.translation_display,
      "data-content-language": card.content_locale,
      // data-content-language is ours; lang is the one a screen reader and a
      // crawler read, so untranslated source text declares itself there too.
      ...(card.content_locale && card.content_locale !== localeCode ? { lang: card.content_locale } : {}),
      "data-review-badge": card.review_badge,
      "data-listing-status": card.listing_status,
      ...(rootAttrs || { "data-search-card": "true" }),
    },
    media,
    h(
      "div",
      { className: "mk-pcard__body" },
      h(
        "div",
        { className: "mk-pcard__pricerow" },
        h("span", { className: "mk-pcard__price", "data-card-price": "true" }, price(card.price_eur, labels, localeCode)),
        isRent && !card.price_on_request && Number(card.price_eur) > 1 ? h("span", { className: "mk-pcard__per" }, labels.perMonth) : null,
      ),
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
        card.bedrooms && !card.bedrooms_not_applicable
          ? h("span", { "data-card-spec": "bedrooms" }, h(Icon, { name: "bed", size: 16 }), ` ${card.bedrooms}`)
          : null,
        card.area_sqm ? h("span", { "data-card-spec": "area" }, h(Icon, { name: "ruler", size: 16 }), ` ${card.area_sqm} m²`) : null,
        card.land_area_sqm ? h("span", { "data-card-spec": "land" }, h(Icon, { name: "map", size: 16 }), ` ${card.land_area_sqm} m²`) : null,
        h("span", { "data-card-spec": "photos" }, h(Icon, { name: "camera", size: 16 }), ` ${imageCount}`),
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
            "aria-pressed": "false",
          },
          h(Icon, { name: "heart", size: 16 }),
          h("span", null, card.actions.save.label),
        ),
      ),
    ),
  );
}

const LISTING_FACT_GROUPS = [
  { id: "property", keys: ["property_type", "offer_type", "bedrooms", "area_sqm", "condition"] },
  { id: "building", keys: ["floor", "storeys"] },
  { id: "land", keys: ["land_area_sqm"] },
  { id: "status", keys: ["availability", "verified", "location_precision", "reference", "source_language"] },
];

// Every reviewed fact the detail page can state, keyed for the grouped facts
// block and for the facts bar. Only facts that carry a value come back.
function listingFactRows({ facts, labels, ui, localeCode, verificationDate, verifiedAt, reference, sourceLanguage }) {
  const factLabel = (key) => labels.factLabels?.[key] || key.replaceAll("_", " ");
  const rows = {};
  if (hasFact(facts.property_type)) rows.property_type = { label: factLabel("property_type"), value: localizedListingValue(localeCode, "property_type", facts.property_type) };
  if (hasFact(facts.offer_type)) rows.offer_type = { label: factLabel("offer_type"), value: localizedListingValue(localeCode, "offer_type", facts.offer_type) };
  if (hasFact(facts.bedrooms) && !facts.bedrooms_not_applicable) rows.bedrooms = { label: factLabel("bedrooms"), value: String(facts.bedrooms) };
  if (hasFact(facts.area_sqm)) rows.area_sqm = { label: factLabel("area_sqm"), value: `${facts.area_sqm} m²` };
  if (hasFact(facts.condition)) rows.condition = { label: factLabel("condition"), value: String(facts.condition) };
  if (hasFact(facts.floor)) {
    rows.floor = { label: factLabel("floor"), value: hasFact(facts.total_floors) ? `${facts.floor}/${facts.total_floors}` : String(facts.floor) };
  } else if (hasFact(facts.total_floors)) {
    rows.storeys = { label: factLabel("storeys"), value: String(facts.total_floors) };
  }
  if (hasFact(facts.land_area_sqm)) rows.land_area_sqm = { label: factLabel("land_area_sqm"), value: `${facts.land_area_sqm} m²` };
  if (hasFact(facts.listing_status)) {
    rows.availability = { label: labels.availability, value: labels.listingStatuses?.[facts.listing_status] || humanizeIdentifier(facts.listing_status) };
  }
  if (verificationDate) rows.verified = { label: ui.verifiedInventory, value: h("time", { dateTime: verifiedAt }, verificationDate) };
  if (hasFact(facts.location_precision)) {
    rows.location_precision = { label: factLabel("location_precision"), value: ui.locationPrecisions?.[facts.location_precision] || humanizeIdentifier(facts.location_precision) };
  }
  if (reference) rows.reference = { label: labels.reference, value: reference, mono: true };
  if (sourceLanguage) rows.source_language = { label: labels.sourceLanguage, value: sourceLanguage, lang: sourceLanguage.toLowerCase() };
  // The projection names the rows whose figure the source stated and no broker
  // confirmed. Marking them here keeps the group renderer free of any opinion
  // about which fact came from where.
  for (const key of Array.isArray(facts.source_stated) ? facts.source_stated : []) {
    if (rows[key]) rows[key] = { ...rows[key], sourceStated: true };
  }
  return rows;
}

function ListingFactGroups({ rows, labels }) {
  // Each group keeps the attribute-only <dl>: tests assert the literal
  // `<dl data-listing-facts="true">` and the CSS hooks onto that attribute.
  const groups = LISTING_FACT_GROUPS.map((group) => ({ ...group, keys: group.keys.filter((key) => rows[key]) })).filter((group) => group.keys.length);
  if (!groups.length) return null;
  return h(
    "div",
    { className: "ld-factgroups" },
    ...groups.map((group) =>
      h(
        "section",
        { key: group.id, className: "ld-factgroup", "data-listing-fact-group": group.id },
        h("h3", null, labels.factGroups?.[group.id] || group.id),
        h(
          "dl",
          { "data-listing-facts": "true" },
          ...group.keys.flatMap((key) => [
            h("dt", { key: `${key}-term` }, rows[key].label),
            h(
              "dd",
              {
                key: `${key}-value`,
                className: rows[key].mono ? "ld-factgroup__mono" : undefined,
                lang: rows[key].lang,
                ...(rows[key].sourceStated ? { "data-fact-provenance": "source_stated" } : {}),
              },
              rows[key].value,
              // The label rides with the figure rather than the group, so a
              // visitor reading one row still learns where that number came
              // from - and a screen reader announces it in the same breath.
              rows[key].sourceStated
                ? h("span", { className: "ld-factgroup__provenance" }, ` \u00b7 ${labels.sourceStated}`)
                : null,
            ),
          ]),
        ),
        // One note per group, and only where a group actually carries an
        // unchecked figure: a caveat printed under facts that are all verified
        // teaches the visitor to ignore it.
        group.keys.some((key) => rows[key].sourceStated)
          ? h("p", { className: "ld-factgroup__note", "data-fact-provenance-note": "true" }, labels.sourceStatedNote)
          : null,
      ),
    ),
  );
}

/* ============================================================
   Home (ui_kits/website/HomePage)
   ============================================================ */

const HERO_GALLERY_SLIDES = [
  {
    id: "sandanski",
    avif: "/hero/sandanski-town-1280.avif 1280w, /hero/sandanski-town-1920.avif 1920w",
    webp: "/hero/sandanski-town-1280.webp 1280w, /hero/sandanski-town-1920.webp 1920w",
    src: "/hero/sandanski-town-1920.webp",
    mobileAvif: "/hero/sandanski-640.avif 640w, /hero/sandanski-1280.avif 1280w",
    mobileWebp: "/hero/sandanski-640.webp 640w, /hero/sandanski-1280.webp 1280w",
    width: 1920,
    height: 1080,
    objectPosition: "50% 54%",
    mobileObjectPosition: "54% 50%",
  },
  {
    id: "belogradchik",
    avif: "/hero/belogradchik-960.avif 960w, /hero/belogradchik-1600.avif 1600w, /hero/belogradchik-1920.avif 1920w",
    webp: "/hero/belogradchik-960.webp 960w, /hero/belogradchik-1600.webp 1600w, /hero/belogradchik-1920.webp 1920w",
    src: "/hero/belogradchik-1920.webp",
    mobileAvif: "/hero/belogradchik-480.avif 480w, /hero/belogradchik-612.avif 612w",
    mobileWebp: "/hero/belogradchik-480.webp 480w, /hero/belogradchik-612.webp 612w",
    width: 1920,
    height: 1281,
    objectPosition: "50% 52%",
    mobileObjectPosition: "58% 46%",
  },
  {
    id: "sozopol",
    avif: "/hero/sozopol-town-1280.avif 1280w, /hero/sozopol-town-1920.avif 1920w",
    webp: "/hero/sozopol-town-1280.webp 1280w, /hero/sozopol-town-1920.webp 1920w",
    src: "/hero/sozopol-town-1920.webp",
    mobileAvif: "/hero/sozopol-640.avif 640w, /hero/sozopol-1024.avif 1024w",
    mobileWebp: "/hero/sozopol-640.webp 640w, /hero/sozopol-1024.webp 1024w",
    width: 1920,
    height: 1277,
    objectPosition: "50% 56%",
    mobileObjectPosition: "59% 48%",
  },
  {
    id: "sandanski-hotel",
    avif: "/hero/sandanski-hotel-640.avif 640w, /hero/sandanski-hotel-686.avif 686w",
    webp: "/hero/sandanski-hotel-640.webp 640w, /hero/sandanski-hotel-686.webp 686w",
    src: "/hero/sandanski-hotel-686.webp",
    width: 686,
    height: 386,
    objectPosition: "50% 50%",
    mobileObjectPosition: "50% 50%",
    mobileOnly: true,
  },
];

const PRICE_PRESETS = Object.freeze({
  sale: [50000, 75000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000],
  rent: [300, 400, 500, 700, 1000, 1500, 2000],
});

// Families whose listings carry no bedroom count; the bedroom filter hides
// for them (CSS) and is disabled on submit (client.mjs) so a plot search is
// never narrowed by a bedroom value.
const NON_RESIDENTIAL_FAMILIES = Object.freeze(["plot", "agricultural_land", "commercial", "hotel"]);

function formatEuro(value, localeCode = "en") {
  try {
    return new Intl.NumberFormat(localeCode, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value));
  } catch {
    return `€${Number(value).toLocaleString("en-US")}`;
  }
}

function pricePresetOptions({ values, localeCode, labels, suffix = "", selected = "" }) {
  return [
    h("option", { key: "any", value: "" }, labels.any),
    ...values.map((value) =>
      h(
        "option",
        { key: value, value: String(value), selected: String(selected) === String(value) ? true : undefined },
        `${formatEuro(value, localeCode)}${suffix}`,
      ),
    ),
  ];
}

function pricePresetData(presets, localeCode, labels) {
  return {
    "data-price-presets": "true",
    "data-price-any": labels.any,
    "data-price-sale": presets.sale.map((value) => `${value}|${formatEuro(value, localeCode)}`).join(";"),
    "data-price-rent": presets.rent.map((value) => `${value}|${formatEuro(value, localeCode)} ${labels.perMonth}`).join(";"),
  };
}

function SelectField({ id, name, label, className = "", children, ...attrs }) {
  return h(
    "div",
    { className: `hp-search__seg ${className}`.trim() },
    h("label", { className: "hp-search__label", htmlFor: id }, label),
    h(
      "div",
      { className: "hp-search__select" },
      h("select", { id, name, className: "hp-search__input", ...attrs }, ...children),
      h(Icon, { name: "chevron-down", size: 16, className: "hp-search__chevron" }),
    ),
  );
}

function HeroSearch({ page, labels, chrome }) {
  const formId = "home-hero-search-form";
  const controls = page.body.search?.controls || {};
  const filterOptions = controls.filter_options || {};
  const presets = filterOptions.price_presets || PRICE_PRESETS;
  const families = filterOptions.property_families || filterOptions.property_types || [];
  const buyLabel = chrome.nav?.find((item) => item.id === "buy")?.label || "Buy";
  const rentLabel = chrome.nav?.find((item) => item.id === "rent")?.label || "Rent";
  const offerLabel = labels.factLabels?.offer_type || "Offer";
  const presetData = pricePresetData(presets, page.locale, labels);
  // The hero opens the same catalogue as the results page, so it offers the
  // same facets. A control the catalogue cannot answer would send the visitor
  // straight to an empty page on their first interaction with the site.
  const availableFilterFields = new Set(controls.applicable_filter_fields || []);
  const bedroomCounts = [1, 2, 3, 4].filter((count) => (filterOptions.bedrooms || []).some((value) => value >= count));
  const showBedrooms = availableFilterFields.has("bedrooms_min") && bedroomCounts.length > 0;
  const showArea = availableFilterFields.has("area_min");

  return h(
    "form",
    {
      id: formId,
      className: "hp-search",
      action: page.body.search.path,
      method: "get",
      role: "search",
      "aria-label": labels.search,
      "data-hero-search": "true",
    },
    h(
      "fieldset",
      { className: "hp-search__intent", "data-search-intent": "true" },
      h("legend", { className: "mk-sr-only" }, offerLabel),
      h(
        "label",
        { className: "hp-search__tab" },
        h("input", { type: "radio", name: "offer_type", value: "sale", defaultChecked: true }),
        h("span", null, buyLabel),
      ),
      h(
        "label",
        { className: "hp-search__tab" },
        h("input", { type: "radio", name: "offer_type", value: "rent" }),
        h("span", null, rentLabel),
      ),
    ),
    h(
      "div",
      { className: "hp-search__card" },
      h(
        "div",
        { className: "hp-search__bar" },
        h(
          "div",
          { className: "hp-search__seg hp-search__seg--location" },
          h(Icon, { name: "map-pin", size: 20, className: "hp-search__seg-icon" }),
          h(
            "div",
            {
              className: "hp-search__field hp-hero__location-combobox",
              "data-geography-combobox": "true",
              "data-geography-endpoint": "/api/geography",
              "data-geography-locale": page.locale,
              "data-geography-empty-label": labels.noLocations,
            },
            h("label", { className: "hp-search__label", htmlFor: "home-search-q" }, labels.location),
            h("input", {
              id: "home-search-q",
              name: "location",
              type: "search",
              className: "hp-search__input mk-searchbar__input",
              autoComplete: "off",
              placeholder: labels.locationPlaceholder,
              role: "combobox",
              "aria-autocomplete": "list",
              "aria-haspopup": "listbox",
              "aria-controls": "home-search-location-options",
              "aria-expanded": "false",
              "aria-describedby": "home-search-location-status",
              "data-geography-input": "true",
            }),
            h("input", { type: "hidden", name: "geography_id", value: "", "data-geography-id": "true" }),
            h("div", {
              id: "home-search-location-options",
              className: "hp-hero__location-options",
              role: "listbox",
              "aria-label": labels.locationSuggestions,
              "data-geography-options": "true",
              hidden: true,
            }),
            h("span", {
              id: "home-search-location-status",
              className: "mk-sr-only",
              role: "status",
              "aria-live": "polite",
              "aria-atomic": "true",
              "data-geography-status": "true",
            }),
          ),
        ),
        h(
          SelectField,
          { id: "home-search-type", name: "property_family", label: labels.propertyType, className: "hp-search__seg--type", "data-hero-family": "true" },
          h("option", { key: "any", value: "" }, labels.any),
          ...families.map((family) => h("option", { key: family, value: family }, localizedListingValue(page.locale, "property_type", family))),
        ),
        h(
          SelectField,
          { id: "home-search-price-max", name: "price_max", label: labels.maxPrice, className: "hp-search__seg--price", ...presetData },
          ...pricePresetOptions({ values: presets.sale, localeCode: page.locale, labels }),
        ),
        h(
          "button",
          { className: "hp-search__go mk-search__go", type: "submit" },
          h(Icon, { name: "search", size: 20, strokeWidth: 2.25 }),
          h("span", null, labels.search),
        ),
      ),
      h(
        "details",
        { className: "hp-search__more", "data-hero-more-filters": "true" },
        h(
          "summary",
          { className: "hp-search__more-summary" },
          h(Icon, { name: "sliders-horizontal", size: 16 }),
          h("span", { "data-more-label": labels.moreFilters, "data-fewer-label": labels.fewerFilters }, labels.moreFilters),
          h(Icon, { name: "chevron-down", size: 16, className: "hp-search__more-chevron" }),
        ),
        h(
          "div",
          { className: "hp-search__more-grid" },
          showBedrooms
            ? h(
                "div",
                { className: "hp-search__more-field hp-search__more-field--bedrooms" },
                h("label", { htmlFor: "home-search-bedrooms-min" }, labels.factLabels?.bedrooms || "Bedrooms"),
                h(
                  "select",
                  { id: "home-search-bedrooms-min", name: "bedrooms_min", "data-hero-bedrooms": "true" },
                  h("option", { value: "" }, labels.any),
                  ...bedroomCounts.map((count) => h("option", { key: count, value: String(count) }, `${count}+`)),
                ),
              )
            : null,
          h(
            "div",
            { className: "hp-search__more-field" },
            h("label", { htmlFor: "home-search-price-min" }, labels.minPrice),
            h(
              "select",
              { id: "home-search-price-min", name: "price_min", ...presetData },
              ...pricePresetOptions({ values: presets.sale, localeCode: page.locale, labels }),
            ),
          ),
          showArea
            ? h(
                "div",
                { className: "hp-search__more-field" },
                h("label", { htmlFor: "home-search-area-min" }, labels.areaMin),
                h("input", { id: "home-search-area-min", name: "area_min", type: "number", min: "0", step: "any", inputMode: "decimal" }),
              )
            : null,
          showArea
            ? h(
                "div",
                { className: "hp-search__more-field" },
                h("label", { htmlFor: "home-search-area-max" }, labels.areaMax),
                h("input", { id: "home-search-area-max", name: "area_max", type: "number", min: "0", step: "any", inputMode: "decimal" }),
              )
            : null,
          h(
            "div",
            { className: "hp-search__more-actions" },
            h(Btn, { type: "reset", variant: "ghost", size: "sm", iconStart: "x" }, labels.clearFilters),
          ),
        ),
      ),
    ),
  );
}

function HomeBody({ page }) {
  const labels = uiLabels(page);
  const chrome = page.chrome || { copy: {} };
  const guides = page.body.guides?.links || [];
  const alternateGuides = page.body.guides_alternate?.links || [];
  const start = page.body.start || { path: `/${page.locale}/start`, label: labels.startSearch };
  const main = h(
    "main",
    { id: "main", tabIndex: -1, "data-kind": "home", "data-react-public-ui": "home" },
    h(
      "section",
      {
        className: "hp-hero",
        "data-hero-gallery": "true",
        "data-hero-gallery-interval": "7000",
        "data-hero-gallery-label": labels.gallery,
        "aria-roledescription": labels.carousel || "carousel",
        "aria-label": labels.gallery,
      },
      h(
        "div",
        { className: "hp-hero__bg hp-hero__gallery", "data-hero-media": "approved" },
        ...HERO_GALLERY_SLIDES.map((slide, index) =>
          h(
            "picture",
            {
              key: slide.id,
              className: "hp-hero__slide",
              "data-hero-gallery-slide": String(index + 1),
              "data-gallery-active": index === 0 ? "true" : "false",
              "aria-hidden": index === 0 ? "false" : "true",
              "data-hero-mobile-only": slide.mobileOnly ? "true" : undefined,
              hidden: index === 0 ? undefined : true,
              style: `--hero-object-position:${slide.objectPosition};--hero-mobile-object-position:${slide.mobileObjectPosition}`,
            },
            slide.mobileAvif ? h("source", { media: "(max-width: 679px)", type: "image/avif", srcSet: slide.mobileAvif, sizes: "100vw" }) : null,
            slide.mobileWebp ? h("source", { media: "(max-width: 679px)", type: "image/webp", srcSet: slide.mobileWebp, sizes: "100vw" }) : null,
            h("source", { type: "image/avif", srcSet: slide.avif, sizes: "100vw" }),
            h("source", { type: "image/webp", srcSet: slide.webp, sizes: "100vw" }),
            h("img", {
              src: slide.src,
              alt: "",
              width: slide.width,
              height: slide.height,
              loading: index === 0 ? "eager" : "lazy",
              decoding: "async",
              fetchPriority: index === 0 ? "high" : undefined,
            }),
          ),
        ),
      ),
      h(
        "div",
        { className: "hp-hero__in" },
        h(
          "div",
          { className: "hp-hero__copy" },
          h("h1", null, page.body.h1),
          h("p", null, page.body.intro),
        ),
        h(
          "div",
          { className: "hp-hero__search" },
          h(HeroSearch, { page, labels, chrome }),
        ),
      ),
      h("span", { className: "mk-sr-only", role: "status", "aria-live": "off", "aria-atomic": "true", "data-hero-gallery-status": "true" }, `${labels.gallery} 1 / ${HERO_GALLERY_SLIDES.length}`),
    ),
    (page.body.locations || []).length
      ? h(
          "section",
          { className: "hp-sec hp-areas", "aria-labelledby": "hp-areas-title" },
          h("div", { className: "hp-sec__head" }, h("div", null, h("h2", { id: "hp-areas-title" }, labels.browseByArea))),
          h(
            "nav",
            { className: "hp-resorts", "aria-label": labels.browseByArea, "data-home-locations": "true" },
            ...(page.body.locations || []).map((location) =>
              h(
                "a",
                {
                  key: location.path,
                  href: location.path,
                  className: "hp-resort",
                  "data-location-media": location.image?.url ? "approved" : "fallback",
                },
                location.image?.url ? h("img", { src: location.image.url, alt: "", loading: "lazy", decoding: "async" }) : null,
                h(
                  "div",
                  { className: "hp-resort__t" },
                  h("h3", null, location.location),
                  location.listing_count
                    ? h("span", { className: "hp-resort__c" }, `${location.listing_count} ${labels.reviewedListings}`)
                    : null,
                ),
              ),
            ),
          ),
        )
      : h(
          "section",
          { className: "hp-sec hp-areas", "aria-labelledby": "hp-areas-title" },
          h("div", { className: "hp-sec__head" }, h("div", null, h("h2", { id: "hp-areas-title" }, labels.browseByArea))),
          h(
            "nav",
            { className: "mk-empty hp-rail-empty", "aria-label": labels.browseByArea, "data-home-locations": "true", "data-home-locations-empty": "true" },
            h("span", { className: "mk-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "map-pin", size: 24 })),
            h("p", { className: "mk-empty__text" }, labels.areasEmpty),
            h(
              "div",
              { className: "mk-empty__actions" },
              h(Btn, { tag: "a", variant: "secondary", iconStart: "search", href: page.body.search.path }, labels.browseAllListings),
            ),
          ),
        ),
    h(
      "section",
      { className: "hp-sec hp-how", "aria-labelledby": "hp-how-title", "data-home-how-buying-works": "true" },
      h(
        "div",
        { className: "hp-sec__head" },
        h("div", null, h("h2", { id: "hp-how-title" }, labels.howBuyingWorks)),
        h(
          "a",
          { className: "mk-btn mk-btn--primary mk-btn--lg", href: start.path, "data-action": "start" },
          h("span", null, start.label),
          h(Icon, { name: "arrow-right", size: 20, className: "ico-dir" }),
        ),
      ),
      h(FlowSteps, {
        className: "hp-how__steps",
        steps: [
          { title: labels.buyingStepOneTitle, text: labels.buyingStepOneText },
          { title: labels.buyingStepTwoTitle, text: labels.buyingStepTwoText },
          { title: labels.buyingStepThreeTitle, text: labels.buyingStepThreeText },
        ],
      }),
    ),
    h(
      "section",
      { className: "hp-sec hp-featured", "aria-label": labels.featuredListings, "data-featured-listings": "true" },
      h(
        "div",
        { className: "hp-sec__head" },
        h("div", null, h("h2", null, labels.featuredListings)),
        h(Btn, { tag: "a", variant: "secondary", iconEnd: "arrow-right", href: page.body.search.path }, labels.browseAllListings),
      ),
      (page.cards || []).length
        ? h(
            "div",
            { className: "hp-grid" },
            ...page.cards.map((card) => h(SearchCard, { key: card.id, card, labels, localeCode: page.locale })),
          )
        : h(
            "div",
            { className: "mk-empty", "data-featured-empty": "true", "aria-live": "polite" },
            h("span", { className: "mk-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "shield-check", size: 24 })),
            h("h3", { className: "mk-empty__title" }, labels.reviewRequired),
            h("p", { className: "mk-empty__text" }, `0 ${labels.reviewedListings}`),
          ),
    ),
    guides.length
      ? h(
          "section",
          { className: "hp-sec hp-guides", "data-home-guides": "true", "data-approved-source": "cms", "aria-labelledby": "hp-guides-title" },
          h("div", { className: "hp-sec__head" }, h("div", null, h("h2", { id: "hp-guides-title" }, page.body.guides.label))),
          h(
            "nav",
            { className: "hp-guides__rail", "aria-label": page.body.guides.label },
            ...guides.map((guide) =>
              h(
                "a",
                {
                  key: guide.id,
                  href: guide.href,
                  className: "hp-guide",
                  "data-guide-reviewer": guide.reviewer,
                },
                h(
                  "div",
                  { className: "hp-guide__meta" },
                  h(Badge, { variant: "neutral", icon: "shield-check" }, labels.approvedSource),
                  h(Icon, { name: "arrow-right", size: 18, className: "hp-guide__arrow ico-dir" }),
                ),
                h("h3", null, guide.label),
                h("p", null, guide.summary),
              ),
            ),
          ),
        )
      : alternateGuides.length
        ? h(
            "section",
            { className: "hp-sec hp-guides", "data-home-guides": "true", "data-home-guides-empty": "true", "data-approved-source": "cms", "aria-labelledby": "hp-guides-title" },
            h("div", { className: "hp-sec__head" }, h("div", null, h("h2", { id: "hp-guides-title" }, chrome.copy.buyerGuides))),
            h(
              "div",
              { className: "mk-empty hp-rail-empty" },
              h("span", { className: "mk-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "languages", size: 24 })),
              h("p", { className: "mk-empty__text" }, labels.guidesUnavailable),
              h("p", { className: "hp-rail-empty__note" }, labels.guidesInEnglish),
              h(
                "nav",
                { className: "mk-empty__actions", "aria-label": chrome.copy.buyerGuides },
                ...alternateGuides.slice(0, 2).map((guide) =>
                  h(
                    "a",
                    { key: guide.id, className: "mk-btn mk-btn--secondary mk-btn--md", href: guide.href, lang: page.body.guides_alternate.locale, hrefLang: page.body.guides_alternate.locale },
                    h(Icon, { name: "file-check", size: 18 }),
                    h("span", null, guide.label),
                  ),
                ),
              ),
            ),
          )
        : null,
    h(
      "section",
      { className: "hp-trust", "aria-label": labels.trustOffices, "data-home-trust": "true" },
      h(
        "ul",
        { className: "hp-trust__in" },
        h("li", null, h(Icon, { name: "shield-check", size: 20 }), h("span", null, labels.trustReviewed)),
        h("li", null, h(Icon, { name: "languages", size: 20 }), h("span", null, labels.trustLanguages)),
        h("li", null, h(Icon, { name: "map-pin", size: 20 }), h("span", null, `${labels.trustOffices}: ${chrome.copy.offices || ""}`)),
      ),
    ),
    h(
      "section",
      { className: "hp-sell", "aria-labelledby": "hp-sell-title" },
      h("div", { className: "hp-sell__glow", "aria-hidden": "true" }),
      h(
        "div",
        { className: "hp-sell__in" },
        h("div", null, h("h2", { id: "hp-sell-title" }, page.body.seller.title || page.body.seller.label), h("p", null, page.body.seller.description || "")),
        h(
          "nav",
          { "aria-label": labels.primaryActions, className: "hp-sell__actions" },
          h(Btn, { tag: "a", variant: "accent", size: "lg", iconStart: "landmark", href: page.body.seller.path, "data-action": "seller" }, page.body.seller.label),
          h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "phone", href: page.body.contact.path, "data-action": "contact" }, page.body.contact.label),
        ),
      ),
    ),
  );
  return shell(page, main);
}

/* ============================================================
   Buyer onboarding: "Start your search" (/{locale}/start)
   One GET form that posts its answers back to the page (no JavaScript:
   the server renders the finish step) and becomes a stepper with
   client.mjs initStartFlow. Styles live in adapter-public-start.css.
   ============================================================ */

function StartRadio({ className, name, value, label, note, checked = false, required = false, attrs = {} }) {
  return h(
    "label",
    { className },
    h("input", {
      type: "radio",
      name,
      value,
      defaultChecked: checked ? true : undefined,
      required: required ? true : undefined,
      ...attrs,
    }),
    note === undefined
      ? h("span", null, label)
      : h(
          "span",
          { className: "st-tile__body" },
          h("span", { className: "st-tile__check", "aria-hidden": "true" }, h(Icon, { name: "check", size: 14, strokeWidth: 3 })),
          h("span", { className: "st-tile__name" }, label),
          note ? h("span", { className: "st-tile__note" }, note) : null,
        ),
  );
}

function StartBody({ page }) {
  const labels = uiLabels(page);
  const body = page.body;
  const copy = body.copy;
  const answers = body.answers || {};
  const finish = body.finish;
  const shortlist = body.shortlist;
  const answerState = body.state !== "finish";
  const presets = body.price_presets || PRICE_PRESETS;
  const rent = answers.offer_type === "rent";
  const residential = !answers.property_family || (body.property_families || []).some((family) => family.value === answers.property_family && family.residential);
  const bedroomsLabel = labels.factLabels?.bedrooms || "Bedrooms";
  const chip = (name, value, label, checked, extra = {}) =>
    h(StartRadio, { key: `${name}-${value || "any"}`, className: "st-chip", name, value, label, checked, ...extra });

  const stepper = h(
    "ol",
    { className: "st-stepper", "data-start-steps": "true" },
    ...body.steps.map((step, index) =>
      h(
        "li",
        {
          key: step.id,
          "data-start-step-indicator": String(index + 1),
          "aria-current": answerState && index === 0 ? "step" : undefined,
          "data-active": answerState && index === 0 ? "true" : undefined,
          "data-complete": answerState ? undefined : "true",
        },
        h("span", { className: "st-stepper__num", "aria-hidden": "true" }, index + 1),
        h("span", { className: "st-stepper__label" }, step.label),
      ),
    ),
  );

  // Without JavaScript the step buttons would be inert, so only the final
  // submit row survives; the stylesheet reveals the rest once client.mjs marks
  // the page enhanced.
  const actions = (index, last = false) =>
    h(
      "div",
      { className: `st-actions${index === 1 ? " st-actions--end" : ""}${last ? " st-actions--final" : ""}` },
      index > 1 ? h(Btn, { type: "button", variant: "secondary", size: "lg", iconStart: "arrow-left", "data-start-back": "true" }, labels.previous) : null,
      last
        ? h(Btn, { type: "submit", variant: "primary", size: "lg", iconEnd: "arrow-right", "data-start-continue": "true" }, copy.review)
        : h(Btn, { type: "button", variant: "primary", size: "lg", iconEnd: "arrow-right", "data-start-next": "true" }, labels.next),
    );

  const step = (index, id, title, content, last = false) =>
    h(
      "section",
      { className: "st-step", "data-start-step": String(index), role: "group", "aria-labelledby": `${id}-title` },
      h(
        "h2",
        { id: `${id}-title`, className: "st-step__title", tabIndex: "-1", "data-start-step-title": "true" },
        h("span", { className: "st-step__index", "aria-hidden": "true" }, String(index)),
        h("span", null, title),
      ),
      ...content,
      h("p", { className: "st-error", "data-start-error": "true", role: "alert", hidden: true }, copy.chooseOption),
      actions(index, last),
    );

  const form = h(
    "form",
    { id: "start-form", className: "st-form ct-form", method: "get", action: page.path, "data-start-form": "true", "aria-label": body.h1 },
    step(1, "start-step-intent", copy.steps.intent, [
      h(
        "fieldset",
        { className: "st-group" },
        h("legend", { className: "st-group__legend" }, copy.buyOrRent),
        h(
          "div",
          { className: "st-seg", role: "group" },
          ...body.offer_types.map((option) =>
            h(StartRadio, {
              key: option.value,
              className: "st-seg__option",
              name: "offer_type",
              value: option.value,
              label: option.label,
              checked: (answers.offer_type || "sale") === option.value,
              attrs: { "data-lead-label": option.lead_label },
            }),
          ),
        ),
      ),
      h(
        "fieldset",
        { className: "st-group" },
        h("legend", { className: "st-group__legend" }, copy.propertyType),
        h(
          "div",
          { className: "st-chips" },
          chip("property_family", "", copy.anyType, !answers.property_family),
          ...body.property_families.map((family) =>
            chip("property_family", family.value, family.label, answers.property_family === family.value, {
              attrs: { "data-lead-label": family.value, "data-residential": family.residential ? "true" : "false" },
            }),
          ),
        ),
      ),
    ]),
    step(2, "start-step-where", copy.whereTitle, [
      h(
        "fieldset",
        { className: "st-group" },
        h("legend", { className: "mk-sr-only" }, copy.whereTitle),
        h(
          "div",
          { className: "st-tiles" },
          ...body.areas.map((area) =>
            h(StartRadio, {
              key: area.id,
              className: "st-tile",
              name: "area",
              value: area.id,
              label: area.label,
              note: area.note,
              checked: answers.area === area.id,
              required: true,
              attrs: { "data-search-params": JSON.stringify(area.search), "data-lead-location": area.location },
            }),
          ),
          h(StartRadio, {
            className: "st-tile st-tile--any",
            name: "area",
            value: "",
            label: copy.anywhere,
            note: "",
            checked: !answerState && !answers.area,
            required: true,
            attrs: { "data-search-params": "{}", "data-lead-location": "" },
          }),
        ),
      ),
    ]),
    step(3, "start-step-budget", copy.budgetTitle, [
      h(
        "div",
        { className: "st-field" },
        h("label", { htmlFor: "start-price-max" }, labels.maxPrice),
        h(
          "select",
          { id: "start-price-max", name: "price_max", ...pricePresetData(presets, page.locale, labels) },
          ...pricePresetOptions({
            values: rent ? presets.rent : presets.sale,
            localeCode: page.locale,
            labels,
            suffix: rent ? ` ${labels.perMonth}` : "",
            selected: answers.price_max || "",
          }),
        ),
      ),
      body.bedrooms.length
        ? h(
            "fieldset",
            { className: "st-group", "data-start-bedrooms": "true", hidden: residential ? undefined : true },
            h("legend", { className: "st-group__legend" }, bedroomsLabel),
            h(
              "div",
              { className: "st-chips" },
              chip("bedrooms_min", "", labels.any, !answers.bedrooms_min),
              ...body.bedrooms.map((count) => chip("bedrooms_min", String(count), `${count}+`, answers.bedrooms_min === count)),
            ),
            h("p", { className: "st-hint" }, copy.bedroomsHint),
          )
        : null,
    ]),
    step(
      4,
      "start-step-about",
      copy.aboutTitle,
      [
        h(
          "fieldset",
          { className: "st-group" },
          h("legend", { className: "st-group__legend" }, copy.citizenship),
          h(
            "div",
            { className: "st-chips" },
            ...body.citizenships.map((option) =>
              chip("citizenship", option.value, option.label, answers.citizenship === option.value, {
                required: true,
                attrs: { "data-lead-label": option.lead_label },
              }),
            ),
          ),
          h("p", { className: "st-note", "data-start-note": "land_rule" }, h(Icon, { name: "info", size: 16 }), h("span", null, body.notes.land_rule)),
        ),
        h(
          "fieldset",
          { className: "st-group" },
          h("legend", { className: "st-group__legend" }, copy.financing),
          h(
            "div",
            { className: "st-chips" },
            ...body.financing.map((option) =>
              chip("financing", option.value, option.label, answers.financing === option.value, {
                required: true,
                attrs: { "data-lead-label": option.lead_label },
              }),
            ),
          ),
          h("p", { className: "st-note", "data-start-note": "financing_gap" }, h(Icon, { name: "info", size: 16 }), h("span", null, body.notes.financing_gap)),
        ),
        h(
          "fieldset",
          { className: "st-group" },
          h("legend", { className: "st-group__legend" }, copy.timeline),
          h(
            "div",
            { className: "st-chips" },
            ...body.timelines.map((option) =>
              chip("timeline", option.value, option.label, answers.timeline === option.value, {
                required: true,
                attrs: { "data-lead-label": option.lead_label },
              }),
            ),
          ),
        ),
      ],
      true,
    ),
  );

  const leadHidden = (name, value, field) =>
    h("input", { type: "hidden", name, defaultValue: value || "", "data-start-lead-field": field ? name : undefined });
  const widen = finish?.widen || [];
  const zeroMatches = Boolean(finish && finish.match_count === 0);
  const alertConfig = body.alert;

  // Saved-search alerts (existing /api/saved-searches contract). The channel
  // select swaps the contact field through the shared initSavedSearchContacts.
  // The wizard opens this panel by itself when a search returns nothing, so an
  // endpoint that cannot accept the alert must not be offered as the way out.
  const alertPanel = alertConfig && !page.chrome?.saved_search_writes_disabled
    ? h(
        "details",
        { className: "st-alert", "data-start-alert": "true", open: zeroMatches ? true : undefined },
        h(
          "summary",
          { className: "st-alert__summary" },
          h(Icon, { name: "bell", size: 18 }),
          h("span", null, copy.alertTitle),
          h(Icon, { name: "chevron-down", size: 16, className: "st-alert__chevron" }),
        ),
        h("p", { className: "st-alert__intro" }, copy.alertIntro),
        h(
          "form",
          {
            className: "st-lead ct-form",
            method: alertConfig.method || "POST",
            action: alertConfig.endpoint,
            "data-save-search-endpoint": alertConfig.endpoint,
            "data-save-search-form": "start",
            "data-start-alert-form": "true",
            "data-success-message": alertConfig.success,
            "data-sending-message": copy.sending,
          },
          h("input", { type: "hidden", name: "locale", defaultValue: alertConfig.payload.locale }),
          h("input", { type: "hidden", name: "query", defaultValue: alertConfig.payload.query }),
          h("input", {
            type: "hidden",
            name: "filters",
            defaultValue: JSON.stringify(alertConfig.payload.filters),
            "data-start-alert-filters": "true",
          }),
          h(
            "div",
            { className: "st-lead__row" },
            h("label", null, labels.name, h("input", { name: "contact.name", required: true, autoComplete: "name" })),
            h(
              "label",
              null,
              labels.alertDelivery,
              h(
                "select",
                { name: "contact_preference", "data-save-search-channel": "true", defaultValue: "email" },
                h("option", { value: "email" }, labels.email),
                h("option", { value: "whatsapp" }, "WhatsApp"),
              ),
            ),
          ),
          h(
            "div",
            { className: "st-lead__row" },
            // The shared channel switcher rewrites this label's text, so the
            // input stays a sibling instead of a child of the label.
            h(
              "div",
              { className: "st-lead__field" },
              h(
                "label",
                {
                  htmlFor: "start-alert-contact",
                  "data-save-search-contact-label": "true",
                  "data-email-label": labels.email,
                  "data-whatsapp-label": "WhatsApp",
                },
                labels.email,
              ),
              h("input", {
                id: "start-alert-contact",
                name: "contact.email",
                type: "email",
                required: true,
                autoComplete: "email",
                inputMode: "email",
                "data-save-search-contact": "true",
              }),
            ),
            h(
              "label",
              null,
              labels.alertFrequency,
              h(
                "select",
                { name: "alertFrequency", defaultValue: "weekly" },
                h("option", { value: "weekly" }, labels.alertWeekly),
                h("option", { value: "daily" }, labels.alertDaily),
                h("option", { value: "instant" }, labels.alertInstant),
              ),
            ),
          ),
          h(
            "label",
            { className: "st-lead__consent" },
            h("input", { type: "checkbox", name: "alertConsent", value: "true", required: true }),
            h("span", null, labels.alertConsent),
          ),
          h(
            "div",
            { className: "st-lead__actions" },
            h(Btn, { type: "submit", variant: "secondary", size: "lg", iconStart: "bell" }, alertConfig.label),
            h("p", { className: "st-lead__status", "data-start-status": "true", role: "status", "aria-live": "polite" }),
          ),
        ),
      )
    : alertConfig
      ? h(
          "div",
          { className: "st-unavailable", "data-start-alert-unavailable": "true", "data-form-unavailable": "true" },
          h("p", null, page.chrome?.form_unavailable || ""),
          body.contact_channels
            ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "phone", href: body.contact_channels.phone.href }, body.contact_channels.phone.label)
            : null,
        )
      : null;

  // A viewing trip is a request a broker arranges, so the control opens a real
  // form. Entries that still have no backend keep the disabled control and the
  // "coming soon" badge, which is honest rather than a hole.
  const tripForm = (item) =>
    h(
      "details",
      { className: "st-upcoming__request", "data-start-trip": "true" },
      h(
        "summary",
        { className: "mk-btn mk-btn--secondary mk-btn--md", "data-start-upcoming-action": item.id, "aria-describedby": `start-upcoming-${item.id}` },
        h(Icon, { name: item.icon, size: 18 }),
        h("span", null, item.label),
      ),
      h(
        "form",
        {
          className: "st-lead__form st-trip__form",
          method: "post",
          action: item.request.endpoint,
          "data-start-trip-form": "true",
          // The shared JSON submit swaps the form for a success card built from this.
          "data-success-message": item.request.success,
          "data-sending-message": item.request.sending || copy.sending,
          // Mirrors the server rule: a trip needs an area or a saved property.
          "data-start-trip-scope-message": item.request.scope_required || "",
        },
        h("input", { type: "hidden", name: "locale", defaultValue: item.request.payload.locale }),
        // Filled from the visitor's saved listings by the client script.
        h("input", { type: "hidden", name: "listingReferences", defaultValue: "", "data-start-trip-shortlist": "true" }),
        h(
          "div",
          { className: "st-lead__row" },
          h("label", null, item.request.fields.arrival, h("input", { type: "date", name: "arrivalDate", required: true, "data-start-trip-arrival": "true" })),
          h("label", null, item.request.fields.departure, h("input", { type: "date", name: "departureDate", required: true, "data-start-trip-departure": "true" })),
        ),
        h(
          "div",
          { className: "st-lead__row" },
          h("label", null, labels.name, h("input", { name: "contact.name", required: true, autoComplete: "name" })),
          h("label", null, labels.phone, h("input", { name: "contact.phone", type: "tel", required: true, autoComplete: "tel", inputMode: "tel" })),
        ),
        h(
          "div",
          { className: "st-lead__row" },
          h("label", null, item.request.fields.party, h("input", { type: "number", name: "partySize", min: 1, max: 12, inputMode: "numeric" })),
          h("label", null, item.request.fields.areas, h("input", { name: "areas", defaultValue: (item.request.areas || []).join(", "), "data-start-trip-areas": "true" })),
        ),
        h("label", null, item.request.fields.note, h("textarea", { name: "note", rows: 3, maxLength: 2000 })),
        h(
          "div",
          { className: "st-lead__actions" },
          h(Btn, { type: "submit", variant: "accent", size: "lg", iconStart: "calendar-days" }, item.request.label),
          h("p", { className: "st-lead__status", "data-start-status": "true", role: "status", "aria-live": "polite" }),
        ),
        h("p", { className: "st-upcoming__note" }, item.request.pending),
      ),
    );

  const upcomingPanel = (body.upcoming || []).length
    ? h(
        "div",
        { className: "st-upcoming", "data-start-upcoming": "true" },
        ...body.upcoming.map((item) =>
          h(
            "div",
            {
              key: item.id,
              className: "st-upcoming__item",
              "data-start-upcoming-item": item.id,
              "data-start-upcoming-when": item.when,
              "data-start-upcoming-live": item.request ? "true" : undefined,
              hidden: item.visible ? undefined : true,
            },
            item.request
              ? tripForm(item)
              : h(
                  "div",
                  { className: "st-upcoming__head" },
                  h(
                    "button",
                    {
                      type: "button",
                      className: "mk-btn mk-btn--secondary mk-btn--md",
                      disabled: true,
                      "aria-disabled": "true",
                      "data-start-upcoming-action": item.id,
                      "aria-describedby": `start-upcoming-${item.id}`,
                    },
                    h(Icon, { name: item.icon, size: 18 }),
                    h("span", null, item.label),
                  ),
                  h(Badge, { variant: "neutral", icon: "clock" }, copy.comingSoon),
                ),
            h("p", { id: `start-upcoming-${item.id}`, className: "st-upcoming__note" }, item.note),
          ),
        ),
      )
    : null;

  const finishSection = h(
    "section",
    { className: "st-finish", "data-start-finish": "true", hidden: answerState ? true : undefined, "aria-labelledby": "start-finish-title" },
    h(
      "h2",
      { id: "start-finish-title", className: "st-finish__title", "data-start-match-count": "true", "data-start-match-template": copy.matchCount, "data-start-no-matches": copy.noMatches },
      finish && typeof finish.match_count === "number"
        ? finish.match_count > 0
          ? copy.matchCount.replace("{count}", String(finish.match_count))
          : copy.noMatches
        : copy.seeMatches,
    ),
    h(
      "div",
      { className: "st-finish__actions" },
      h(
        Btn,
        {
          tag: "a",
          variant: zeroMatches ? "secondary" : "accent",
          size: "lg",
          iconStart: "search",
          href: finish ? finish.search_url : body.search.path,
          "data-start-see-matches": "true",
        },
        copy.seeMatches,
      ),
    ),
    // No matches: offer the wider searches that do have listings instead of
    // sending the visitor to an empty results page.
    h(
      "div",
      {
        className: "st-widen",
        "data-start-widen": "true",
        "data-widen-price": copy.widen.price,
        "data-widen-bedrooms": copy.widen.bedrooms,
        "data-widen-type": copy.widen.type,
        "data-widen-area": copy.widen.area,
        "data-widen-district": copy.areas.blagoevgrad_district,
        hidden: widen.length ? undefined : true,
      },
      h("h3", { className: "st-widen__title" }, copy.widenTitle),
      h(
        "ul",
        { className: "st-widen__list", "data-start-widen-list": "true" },
        ...widen.map((option) =>
          h(
            "li",
            { key: option.id },
            h(
              "a",
              { className: "st-widen__link", href: option.url, "data-start-widen-option": option.id },
              h(Icon, { name: "arrow-right", size: 16 }),
              h("span", { className: "st-widen__label" }, option.label),
              h("span", { className: "st-widen__count" }, copy.matchCount.replace("{count}", String(option.match_count))),
            ),
          ),
        ),
      ),
    ),
    alertPanel,
    upcomingPanel,
    shortlist
      ? h(
          "details",
          { className: "st-shortlist", "data-start-shortlist": "true" },
          h(
            "summary",
            { className: "st-shortlist__summary" },
            h(Icon, { name: "users", size: 18 }),
            h("span", null, copy.shortlistTitle),
            h(Icon, { name: "chevron-down", size: 16, className: "st-shortlist__chevron" }),
          ),
          h("p", { className: "st-shortlist__intro" }, copy.shortlistIntro),
          h(
            "form",
            {
              className: "st-lead ct-form",
              method: shortlist.method || "POST",
              action: shortlist.endpoint,
              "data-start-lead": "true",
              "data-lead-type": shortlist.payload.leadType,
              "data-source": shortlist.payload.source,
              "data-success-message": shortlist.success,
              "data-sending-message": copy.sending,
              "data-start-message-prefix": shortlist.lead_labels.prefix,
            },
            leadHidden("source", shortlist.payload.source),
            leadHidden("intent", shortlist.payload.intent),
            leadHidden("leadType", shortlist.payload.leadType, true),
            // Source and channel attribution. The channel names the surface family,
            // the first touch path names where the visit started. Both are filled by
            // the client, neither travels in a URL, and neither identifies a visitor.
            h("input", { type: "hidden", name: "channel", defaultValue: "", "data-lead-channel-field": "true" }),
            h("input", { type: "hidden", name: "firstTouchPath", defaultValue: "", "data-first-touch-field": "true" }),
            leadHidden("language", shortlist.payload.language),
            leadHidden("requirements.locations", shortlist.requirements.locations, true),
            leadHidden("requirements.property_types", shortlist.requirements.property_types, true),
            leadHidden("requirements.budget_max_eur", shortlist.requirements.budget_max_eur, true),
            leadHidden("requirements.bedrooms_min", shortlist.requirements.bedrooms_min, true),
            leadHidden("requirements.timeline", shortlist.requirements.timeline, true),
            leadHidden("requirements.finance_status", shortlist.requirements.finance_status, true),
            leadHidden("message", shortlist.message, true),
            h(
              "div",
              { className: "st-lead__row" },
              h("label", null, labels.name, h("input", { name: "contact.name", required: true, autoComplete: "name" })),
              h("label", null, labels.phone, h("input", { name: "contact.phone", type: "tel", required: true, autoComplete: "tel", inputMode: "tel" })),
            ),
            h(
              "div",
              { className: "st-lead__row" },
              h("label", null, labels.email, h("input", { name: "contact.email", type: "email", autoComplete: "email", inputMode: "email" })),
              h(
                "label",
                null,
                labels.preferredContact,
                h(
                  "select",
                  { name: "contact_preference", defaultValue: "phone" },
                  h("option", { value: "phone" }, labels.phone),
                  h("option", { value: "whatsapp" }, "WhatsApp"),
                  h("option", { value: "viber" }, "Viber"),
                  h("option", { value: "email" }, labels.email),
                ),
              ),
            ),
            h(
              "div",
              { className: "st-lead__actions" },
              h(Btn, { type: "submit", variant: "primary", size: "lg", iconStart: "send" }, shortlist.label),
              h("p", { className: "st-lead__status", "data-start-status": "true", role: "status", "aria-live": "polite" }),
            ),
          ),
        )
      : h(
          "div",
          { className: "st-unavailable", "data-form-unavailable": "true" },
          h("p", null, body.form_unavailable),
          body.contact_channels
            ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "phone", href: body.contact_channels.phone.href }, body.contact_channels.phone.label)
            : null,
        ),
  );

  const summarySection = finish
    ? h(
        "section",
        { className: "st-summary", "data-start-summary": "true", "aria-labelledby": "start-summary-title" },
        h("h2", { id: "start-summary-title", className: "st-summary__title" }, copy.summaryTitle),
        h(
          "dl",
          { className: "st-summary__list" },
          ...finish.summary.map((row) => h("div", { key: row.id, "data-start-summary-row": row.id }, h("dt", null, row.label), h("dd", null, row.value))),
        ),
      )
    : null;

  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      "data-kind": "start",
      "data-react-public-ui": "start",
      "data-start-flow": "true",
      "data-start-state": body.state,
      "data-start-search-path": body.search.path,
      "data-start-locale": page.locale,
      "data-phone-first": "true",
      "data-min-touch-target": "44",
      className: "st-page",
    },
    h(
      "header",
      { className: "st-head" },
      h("h1", null, body.h1),
      h("p", { className: "st-head__intro" }, body.intro),
      stepper,
      h("p", { className: "st-progress", "data-start-progress": "true", "data-start-progress-template": copy.stepOf, hidden: true }),
    ),
    summarySection,
    answerState ? form : finishSection,
    answerState
      ? finishSection
      : h(
          "details",
          { className: "st-edit", id: "start-edit", "data-start-edit": "true" },
          h(
            "summary",
            { className: "st-edit__summary" },
            h(Icon, { name: "pencil", size: 16 }),
            h("span", null, copy.changeAnswers),
            h(Icon, { name: "chevron-down", size: 16, className: "st-edit__chevron" }),
          ),
          form,
        ),
  );
  return shell(page, main);
}

/* ============================================================
   Search results (ui_kits/website/SearchResults)
   ============================================================ */

const SEARCH_FILTER_QUERY_KEYS = [
  "exact_reference",
  "country_code",
  "geography_id",
  "region_id",
  "location",
  "municipality",
  "district",
  "property_family",
  "property_subtype",
  "offer_type",
  "price_min",
  "price_max",
  "bedrooms_min",
  "bedrooms_max",
  "premises_min",
  "hotel_rooms_min",
  "area_min",
  "area_max",
  "land_area_min",
  "land_area_max",
  "floor_min",
  "floor_max",
  "storeys_min",
  "storeys_max",
  "status",
];

const GUIDED_SEARCH_COPY = {
  bg: { recentSearches: "Последни търсения", clearRecentSearches: "Изчисти" },
  en: { recentSearches: "Recent searches", clearRecentSearches: "Clear" },
  de: { recentSearches: "Letzte Suchen", clearRecentSearches: "Löschen" },
  nl: { recentSearches: "Recente zoekopdrachten", clearRecentSearches: "Wissen" },
  ru: { recentSearches: "Недавние поиски", clearRecentSearches: "Очистить" },
  el: { recentSearches: "Πρόσφατες αναζητήσεις", clearRecentSearches: "Εκκαθάριση" },
  he: { recentSearches: "חיפושים אחרונים", clearRecentSearches: "נקה" },
};

function guidedSearchCopyFor(locale) {
  return GUIDED_SEARCH_COPY[locale] || GUIDED_SEARCH_COPY.en;
}

function searchHref(page, omitFilter, targetPage = 1, overrides = {}) {
  const params = new URLSearchParams();
  if (page.search.query) params.set("q", page.search.query);
  if (page.search.sort && page.search.sort !== "recommended") params.set("sort", page.search.sort);
  if (page.search.view === "map") params.set("view", "map");
  for (const key of SEARCH_FILTER_QUERY_KEYS) {
    if (omitFilter === "*" || omitFilter === key) continue;
    const value = page.search.filters?.[key];
    if (value !== "" && value !== null && value !== undefined) params.set(key, String(value));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  if (targetPage > 1) params.set("page", String(targetPage));
  const query = params.toString();
  return query ? `${page.path}?${query}` : page.path;
}

function OfficialAreaMaps({ page, labels }) {
  const maps = page.search.controls?.area_maps || [];
  const source = page.search.controls?.area_map_source;
  if (page.search.view !== "map" || !maps.length) return null;
  return h(
    "section",
    { className: "sr-area-maps", "data-official-area-maps": "true", "aria-label": `${labels.region} · ${labels.view}` },
    h(
      "header",
      { className: "sr-area-maps__head" },
      h("div", null, h("h2", null, `${labels.region} · ${labels.view}`), h("p", null, `${source.authority} · ${source.dataset}`)),
      h("a", { href: source.url, rel: "external", target: "_blank" }, source.crs),
    ),
    h(
      "div",
      { className: "sr-area-maps__grid" },
      ...maps.map((country) => {
        const countryLabel = localizedSearchFilterValue(page.locale, "country_code", country.country_code);
        return h(
          "article",
          { key: country.country_code, className: "sr-area-map", "data-area-map-country": country.country_code },
          h("h3", null, countryLabel),
          h(
            "svg",
            {
              viewBox: country.view_box,
              role: "img",
              "aria-label": `${countryLabel} · ${labels.region}`,
              preserveAspectRatio: "xMidYMid meet",
            },
            ...country.areas.map((area) => {
              const name = localizedSearchFilterValue(page.locale, "region_id", area.id);
              const href = searchHref(page, null, 1, {
                view: "map",
                country_code: country.country_code,
                region_id: area.id,
                geography_id: "",
                location: "",
                municipality: "",
                district: "",
              });
              return h(
                "a",
                {
                  key: area.id,
                  href,
                  "aria-label": `${name} · ${area.count} ${labels.matches}`,
                  "data-area-map-link": area.id,
                  "data-area-map-count": area.count,
                  "aria-current": area.selected ? "true" : undefined,
                },
                h("title", null, `${name} · ${area.count} ${labels.matches}`),
                h("path", {
                  d: area.path,
                  className: `sr-area-map__shape${area.count ? " has-listings" : ""}${area.selected ? " is-selected" : ""}`,
                  "fill-rule": "evenodd",
                }),
              );
            }),
          ),
          h(
            "details",
            { className: "sr-area-map__directory" },
            h(
              "summary",
              { className: "sr-area-map__directory-summary" },
              h("span", null, `${labels.region} · ${country.areas.length}`),
              h(Icon, { name: "chevron-down", size: 16, className: "sr-area-map__directory-chevron", "aria-hidden": "true" }),
            ),
            h(
              "ul",
              null,
              ...country.areas.map((area) => {
                const name = localizedSearchFilterValue(page.locale, "region_id", area.id);
                return h(
                  "li",
                  { key: area.id },
                  h(
                    "a",
                    {
                      href: searchHref(page, null, 1, {
                        view: "map",
                        country_code: country.country_code,
                        region_id: area.id,
                        geography_id: "",
                        location: "",
                        municipality: "",
                        district: "",
                      }),
                      "aria-current": area.selected ? "page" : undefined,
                    },
                    h("span", null, name),
                    h("strong", null, String(area.count)),
                  ),
                );
              }),
            ),
          ),
        );
      }),
    ),
  );
}

function guidedSearchHref(page, filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    if (value !== "" && value !== null && value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${page.path}?${query}` : page.path;
}

function SearchBody({ page }) {
  const labels = uiLabels(page);
  const guidedCopy = guidedSearchCopyFor(page.locale);
  const chrome = page.chrome || { copy: {} };
  const savedView = page.search.saved_view === true;
  const controls = page.search.controls || {};
  const viewModes = controls.view_modes || [];
  const filterOptions = controls.filter_options || {};
  const filters = page.search.filters || {};
  const presets = filterOptions.price_presets || PRICE_PRESETS;
  const allReviewedLocations = [...new Set(filterOptions.locations || [])].filter(Boolean);
  const activeReviewedLocation = allReviewedLocations.includes(filters.location) ? filters.location : "";
  const reviewedLocations = [...new Set([activeReviewedLocation, ...allReviewedLocations])].filter(Boolean).slice(0, 6);
  const reviewedPropertyFamilies = [...new Set(filterOptions.property_families || filterOptions.property_types || [])].filter(Boolean).slice(0, 6);
  const activeFilterCount = (controls.active_filter_chips || []).length;
  const applicableFilterFields = new Set(controls.applicable_filter_fields || []);
  const savedSearchFilters = controls.save_search?.payload?.filters || {};
  const hasSavedSearchCriteria = Boolean(String(page.search.query || "").trim() || Object.keys(savedSearchFilters).length);
  const contact = chrome.contact || {};
  const filtersLabel = chrome.copy.filters || labels.activeFilters;
  const offerLabel = labels.factLabels?.offer_type || "Offer";
  const secondaryFilterKeys = ["country_code", "region_id", "land_area_min", "land_area_max", "floor_min", "floor_max", "storeys_min"];
  const secondaryFiltersActive = Boolean(String(page.search.query || "").trim()) || secondaryFilterKeys.some((key) => filters[key]);
  const mobileSearchContext = String(
    page.search.query ||
      filters.location ||
      (filters.offer_type ? localizedListingValue(page.locale, "offer_type", filters.offer_type) : "") ||
      labels.search,
  ).trim();
  const mobileSearchMeta = `${page.search.total_matches} ${labels.matches}`;
  const filterValue = (name) => String(filters[name] ?? "");
  const filterSelect = (idPrefix, name, label, values, optionLabel = (value) => value, optionValue = (value) => value, optionAttributes = () => ({}), className = "") =>
    h(
      "div",
      { key: name, className: `sr-fg ${className}`.trim() },
      h("label", { className: "sr-label", htmlFor: `${idPrefix}-${name}` }, label),
      h(
        "div",
        { className: "sr-select" },
        h(
          "select",
          { id: `${idPrefix}-${name}`, name },
          h("option", { value: "" }, labels.any),
          ...values.map((value) =>
            h(
              "option",
              {
                key: optionValue(value),
                value: optionValue(value),
                selected: filterValue(name) === String(optionValue(value)) ? true : undefined,
                ...optionAttributes(value),
              },
              optionLabel(value),
            ),
          ),
        ),
        h(Icon, { name: "chevron-down", size: 16, className: "sr-select__chevron" }),
      ),
    );
  const rangePair = (idPrefix, legend, minName, maxName, { step = "1", inputMode = "numeric", className = "" } = {}) =>
    h(
      "fieldset",
      { key: minName, className: `sr-fg sr-fg--range ${className}`.trim() },
      h("legend", { className: "sr-label" }, legend),
      h(
        "div",
        { className: "sr-fg__pair" },
        h(
          "label",
          { htmlFor: `${idPrefix}-${minName}` },
          h("span", null, labels.min),
          h("input", { id: `${idPrefix}-${minName}`, name: minName, type: "number", min: "0", step, inputMode, defaultValue: filters[minName] || "" }),
        ),
        h(
          "label",
          { htmlFor: `${idPrefix}-${maxName}` },
          h("span", null, labels.max),
          h("input", { id: `${idPrefix}-${maxName}`, name: maxName, type: "number", min: "0", step, inputMode, defaultValue: filters[maxName] || "" }),
        ),
      ),
    );
  const geographyField = (idPrefix) => {
    const optionsId = `${idPrefix}-geography-options`;
    const statusId = `${idPrefix}-geography-status`;
    const selectedGeographyId = filters.geography_id || "";
    const selectedLabel = filters.location || (selectedGeographyId ? localizedSearchFilterValue(page.locale, "geography_id", selectedGeographyId) : "");
    return h(
      "div",
      { className: "sr-fg sr-fg--location" },
      h("label", { className: "sr-label", htmlFor: `${idPrefix}-location` }, labels.location),
      h(
        "div",
        {
          className: "sr-geography-combobox",
          "data-geography-combobox": "true",
          "data-geography-endpoint": "/api/geography",
          "data-geography-locale": page.locale,
          "data-geography-empty-label": labels.noLocations,
          "data-geography-query-name": "location",
        },
        h(Icon, { name: "map-pin", size: 18, className: "sr-geography-combobox__icon" }),
        h("input", {
          id: `${idPrefix}-location`,
          name: selectedGeographyId ? undefined : "location",
          type: "search",
          defaultValue: selectedLabel,
          autoComplete: "off",
          placeholder: labels.locationPlaceholder,
          role: "combobox",
          "aria-autocomplete": "list",
          "aria-haspopup": "listbox",
          "aria-controls": optionsId,
          "aria-expanded": "false",
          "aria-describedby": statusId,
          "data-geography-input": "true",
        }),
        h("input", { type: "hidden", name: "geography_id", defaultValue: selectedGeographyId, "data-geography-id": "true" }),
        h("div", {
          id: optionsId,
          className: "hp-hero__location-options sr-geography-options",
          role: "listbox",
          "aria-label": labels.locationSuggestions,
          "data-geography-options": "true",
          hidden: true,
        }),
        h("span", { id: statusId, className: "mk-sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true", "data-geography-status": "true" }),
      ),
    );
  };
  const offerSegments = (idPrefix) =>
    h(
      "fieldset",
      { className: "sr-fg sr-fg--offer" },
      h("legend", { className: "sr-label" }, offerLabel),
      h(
        "div",
        { className: "sr-seg", role: "group" },
        ...[["", labels.allOffers], ...["sale", "rent"].filter((value) => (filterOptions.offer_types || []).includes(value)).map((value) => [value, localizedListingValue(page.locale, "offer_type", value)])].map(
          ([value, text]) =>
            h(
              "label",
              { key: value || "all", className: "sr-seg__option" },
              h("input", {
                type: "radio",
                name: "offer_type",
                value,
                id: `${idPrefix}-offer-${value || "all"}`,
                defaultChecked: filterValue("offer_type") === value ? true : undefined,
              }),
              h("span", null, text),
            ),
        ),
      ),
    );
  const bedroomPills = (idPrefix) => {
    const counts = [1, 2, 3, 4, 5].filter((count) => (filterOptions.bedrooms || []).some((value) => value >= count));
    if (!counts.length) return null;
    return h(
      "fieldset",
      { className: "sr-fg sr-fg--bedrooms" },
      h("legend", { className: "sr-label" }, labels.factLabels?.bedrooms || "Bedrooms"),
      h(
        "div",
        { className: "sr-pills" },
        ...[["", labels.any], ...counts.map((count) => [String(count), `${count}+`])].map(([value, text]) =>
          h(
            "label",
            { key: value || "any", className: "sr-pill" },
            h("input", { type: "radio", name: "bedrooms_min", value, id: `${idPrefix}-bedrooms-${value || "any"}`, defaultChecked: filterValue("bedrooms_min") === value ? true : undefined }),
            h("span", null, text),
          ),
        ),
      ),
    );
  };
  const guidedSearch = (idPrefix) =>
    !reviewedLocations.length && !reviewedPropertyFamilies.length
      ? null
      : h(
          "section",
          { className: "sr-guided", "data-guided-search": "true", "aria-label": labels.browse },
          h("p", { className: "sr-guided__title" }, labels.browse),
          reviewedLocations.length
            ? h(
                "section",
                { className: "sr-guided__group", "aria-label": labels.location },
                h("p", { className: "sr-guided__label" }, labels.location),
                h(
                  "div",
                  { className: "sr-guided__links" },
                  ...reviewedLocations.map((location) =>
                    h(
                      "a",
                      {
                        key: location,
                        className: "sr-guided__link",
                        href: guidedSearchHref(page, { location }),
                        "data-guided-search-suggestion": "location",
                        "data-guided-search-value": location,
                      },
                      localizedSearchFilterValue(page.locale, "location", location),
                    ),
                  ),
                ),
              )
            : null,
          reviewedPropertyFamilies.length
            ? h(
                "section",
                { className: "sr-guided__group", "aria-label": labels.propertyType },
                h("p", { className: "sr-guided__label" }, labels.propertyType),
                h(
                  "div",
                  { className: "sr-guided__links" },
                  ...reviewedPropertyFamilies.map((propertyFamily) =>
                    h(
                      "a",
                      {
                        key: propertyFamily,
                        className: "sr-guided__link",
                        href: guidedSearchHref(page, { property_family: propertyFamily }),
                        "data-guided-search-suggestion": "property_family",
                        "data-guided-search-value": propertyFamily,
                      },
                      localizedListingValue(page.locale, "property_type", propertyFamily),
                    ),
                  ),
                ),
              )
            : null,
          h(
            "section",
            {
              className: "sr-guided__recent",
              "data-recent-searches": "true",
              "aria-labelledby": `${idPrefix}-recent-searches-title`,
              hidden: true,
            },
            h(
              "div",
              { className: "sr-guided__recent-head" },
              h("p", { id: `${idPrefix}-recent-searches-title`, className: "sr-guided__label" }, guidedCopy.recentSearches),
              h(
                "button",
                { type: "button", className: "sr-guided__clear", "data-clear-recent-searches": "true", "aria-label": guidedCopy.clearRecentSearches },
                guidedCopy.clearRecentSearches,
              ),
            ),
            h("ul", { className: "sr-guided__links sr-guided__recent-list", "data-recent-search-list": "true" }),
          ),
        );
  const filterForm = (idPrefix) =>
    h(
      "form",
      { id: `${idPrefix}-filter-form`, className: "sr-form", action: page.path, method: "get", role: "search", "data-search-filter-form": "true", "data-filter-form-id": idPrefix },
      offerSegments(idPrefix),
      geographyField(idPrefix),
      filterSelect(idPrefix, "property_family", labels.propertyType, filterOptions.property_families || filterOptions.property_types || [], (value) =>
        localizedListingValue(page.locale, "property_type", value),
      ),
      applicableFilterFields.has("property_subtype") && (filterOptions.property_subtypes || []).length
        ? filterSelect(idPrefix, "property_subtype", labels.propertySubtype || labels.propertyType, filterOptions.property_subtypes || [])
        : null,
      rangePair(idPrefix, `${labels.price} (EUR)`, "price_min", "price_max", { className: "sr-fg--price" }),
      applicableFilterFields.has("bedrooms_min") ? bedroomPills(idPrefix) : null,
      applicableFilterFields.has("premises_min")
        ? filterSelect(idPrefix, "premises_min", labels.factLabels?.premises || labels.propertyType, filterOptions.premises || [], (value) => `${value}+`)
        : null,
      applicableFilterFields.has("hotel_rooms_min")
        ? filterSelect(idPrefix, "hotel_rooms_min", labels.factLabels?.hotel_rooms || labels.propertyType, filterOptions.hotel_rooms || [], (value) => `${value}+`)
        : null,
      applicableFilterFields.has("area_min")
        ? rangePair(idPrefix, labels.area, "area_min", "area_max", { step: "any", inputMode: "decimal", className: "sr-fg--area" })
        : null,
      h(
        "details",
        { className: "sr-more", "data-search-more-filters": "true", open: secondaryFiltersActive ? true : undefined },
        h(
          "summary",
          { className: "sr-more__summary" },
          h(Icon, { name: "sliders-horizontal", size: 16 }),
          h("span", null, labels.moreFilters),
          h(Icon, { name: "chevron-down", size: 16, className: "sr-more__chevron" }),
        ),
        h(
          "div",
          { className: "sr-more__body" },
          h(
            "div",
            { className: "sr-fg sr-fg--keyword" },
            h("label", { className: "sr-label", htmlFor: `${idPrefix}-q` }, labels.keywordSearch || labels.search),
            h("input", { id: `${idPrefix}-q`, name: "q", type: "search", defaultValue: page.search.query || "", autoComplete: "off" }),
          ),
          filterSelect(
            idPrefix,
            "country_code",
            labels.country,
            filterOptions.countries || [],
            (country) => localizedSearchFilterValue(page.locale, "country_code", country.code),
            (country) => country.code,
            () => ({ "data-geography-country-option": "true" }),
            "sr-fg--country",
          ),
          filterSelect(
            idPrefix,
            "region_id",
            labels.region,
            filterOptions.regions || [],
            (area) => localizedSearchFilterValue(page.locale, "region_id", area.id),
            (area) => area.id,
            (area) => ({ "data-country": area.country_code }),
            "sr-fg--region",
          ),
          applicableFilterFields.has("land_area_min")
            ? rangePair(idPrefix, labels.factLabels?.land_area_sqm || "Land area (m²)", "land_area_min", "land_area_max", { step: "any", inputMode: "decimal" })
            : null,
          applicableFilterFields.has("floor_min") ? rangePair(idPrefix, labels.factLabels?.floor || "Floor", "floor_min", "floor_max") : null,
          applicableFilterFields.has("storeys_min")
            ? h(
                "div",
                { className: "sr-fg" },
                h("label", { className: "sr-label", htmlFor: `${idPrefix}-storeys_min` }, labels.factLabels?.storeys || labels.propertyType),
                h("input", { id: `${idPrefix}-storeys_min`, name: "storeys_min", type: "number", min: "0", inputMode: "numeric", defaultValue: filters.storeys_min || "" }),
              )
            : null,
        ),
      ),
      h(
        "div",
        { className: "sr-filter-actions" },
        h(Btn, { type: "submit", variant: "primary", full: true }, labels.applyFilters),
        activeFilterCount ? h(Btn, { tag: "a", variant: "ghost", size: "sm", iconStart: "x", href: searchHref(page, "*") }, labels.clearFilters) : null,
      ),
    );
  // The endpoint answers 503 whenever the runtime has no durable authority for
  // it, and the client turns any failure into "try again", which here is advice
  // that cannot ever work. Rather than take a name, an email and a consent tick
  // and lose them, offer the channels that do answer.
  const saveSearchUnavailable = (idPrefix) =>
    h(
      "div",
      { className: "sr-save sr-save--unavailable", "data-save-search-unavailable": idPrefix, "data-form-unavailable": "true" },
      h("p", null, page.chrome?.form_unavailable || ""),
      contact.phone
        ? h(
            Btn,
            { tag: "a", variant: "secondary", size: "lg", full: true, iconStart: "phone", href: `tel:${contact.phone}` },
            contact.phone_display || contact.phone,
          )
        : null,
      contact.email ? h("p", { className: "sr-save__channel" }, h("a", { href: `mailto:${contact.email}` }, contact.email)) : null,
    );
  const saveSearchForm = (idPrefix) =>
    page.chrome?.saved_search_writes_disabled
      ? saveSearchUnavailable(idPrefix)
      : h(
      "form",
      {
        className: "sr-save",
        method: controls.save_search?.method || "POST",
        action: controls.save_search?.endpoint || "/api/saved-searches",
        "data-save-search-endpoint": controls.save_search?.endpoint || "/api/saved-searches",
        "data-save-search-form": idPrefix,
        "data-success-message": labels.saveSearchSuccess,
      },
      h("input", { type: "hidden", name: "locale", defaultValue: page.locale }),
      h("input", { type: "hidden", name: "query", defaultValue: page.search.query || "" }),
      h("input", { type: "hidden", name: "filters", defaultValue: JSON.stringify(savedSearchFilters) }),
      h("input", { type: "hidden", name: "search_intent", defaultValue: JSON.stringify(controls.save_search?.payload?.search_intent || page.search.intent || {}) }),
      h(
        "div",
        { className: "sr-fg" },
        h("label", { className: "sr-label", htmlFor: `${idPrefix}-save-search-name` }, labels.name),
        h("input", { id: `${idPrefix}-save-search-name`, name: "contact.name", required: true, autoComplete: "name" }),
      ),
      h(
        "div",
        { className: "sr-fg" },
        h("label", { className: "sr-label", htmlFor: `${idPrefix}-save-search-channel` }, labels.alertDelivery),
        h(
          "div",
          { className: "sr-select" },
          h(
            "select",
            { id: `${idPrefix}-save-search-channel`, name: "contact_preference", "data-save-search-channel": "true" },
            h("option", { value: "email" }, labels.email),
            h("option", { value: "whatsapp" }, "WhatsApp"),
          ),
          h(Icon, { name: "chevron-down", size: 16, className: "sr-select__chevron" }),
        ),
      ),
      h(
        "div",
        { className: "sr-fg" },
        h(
          "label",
          {
            className: "sr-label",
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
        h("label", { className: "sr-label", htmlFor: `${idPrefix}-save-search-frequency` }, labels.alertFrequency),
        h(
          "div",
          { className: "sr-select" },
          h(
            "select",
            { id: `${idPrefix}-save-search-frequency`, name: "alertFrequency" },
            h("option", { value: "weekly" }, labels.alertWeekly),
            h("option", { value: "daily" }, labels.alertDaily),
            h("option", { value: "instant" }, labels.alertInstant),
          ),
          h(Icon, { name: "chevron-down", size: 16, className: "sr-select__chevron" }),
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
  const filterForms = (idPrefix) => [filterForm(idPrefix), saveSearchDisclosure(idPrefix), guidedSearch(idPrefix)];
  const toolbarForm = () => {
    const hiddenFields = [];
    if (page.search.query) hiddenFields.push(["q", page.search.query]);
    for (const key of SEARCH_FILTER_QUERY_KEYS) {
      const value = filters[key];
      if (value !== "" && value !== null && value !== undefined) hiddenFields.push([key, String(value)]);
    }
    return h(
      "form",
      { className: "sr-toolbar__form", action: page.path, method: "get", "data-search-toolbar-form": "true" },
      ...hiddenFields.map(([name, value]) => h("input", { key: name, type: "hidden", name, defaultValue: value })),
      h(
        "label",
        { className: "sr-toolbar__sort" },
        h("span", null, labels.sort),
        h(
          "div",
          { className: "sr-select sr-select--compact" },
          h(
            "select",
            { name: "sort" },
            ...(controls.sort_options || []).map((option) =>
              h("option", { key: option.id, value: option.id, selected: page.search.sort === option.id ? true : undefined }, option.label),
            ),
          ),
          h(Icon, { name: "chevron-down", size: 16, className: "sr-select__chevron" }),
        ),
      ),
      h("noscript", null, h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, labels.applyFilters)),
      viewModes.length > 1
        ? h(
            "div",
            { className: "sr-toolbar__view", role: "group", "aria-label": labels.view, "data-view-mode-control": "true", "data-map-optional": page.mobile_policy?.map_optional ? "true" : "false" },
            ...viewModes.map((mode) =>
              h(
                "button",
                { key: mode.id, type: "submit", name: "view", value: mode.id, "aria-pressed": mode.default ? "true" : "false", "data-view-mode": mode.id },
                h(Icon, { name: mode.id === "map" ? "map" : "list", size: 16 }),
                h("span", null, mode.label),
              ),
            ),
          )
        : null,
    );
  };
  const mobileFilterPanelId = `mobile-search-filters-panel-${page.locale}`;
  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      "data-kind": "search",
      "data-react-public-ui": "search",
      "data-total-matches": page.search.total_matches,
      "data-list-first-mobile": page.mobile_policy?.list_first_mobile ? "true" : "false",
      "data-map-optional": page.mobile_policy?.map_optional ? "true" : "false",
      "data-min-touch-target": page.mobile_policy?.minimum_tap_target_px || 44,
      "data-guided-search-path": savedView ? undefined : page.path,
      "data-guided-search-success": !savedView && page.search.total_matches > 0 ? "true" : "false",
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
              { className: "sr-mobile-filters__summary", "aria-controls": mobileFilterPanelId },
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
                h(Icon, { name: "sliders-horizontal", size: 16 }),
                h("span", null, filtersLabel),
                activeFilterCount ? h("span", { className: "sr-mobile-filters__count" }, String(activeFilterCount)) : null,
                h(Icon, { name: "chevron-down", size: 14, className: "sr-mobile-filters__chevron" }),
              ),
            ),
            h(
              "div",
              { id: mobileFilterPanelId, className: "sr-mobile-filters__panel" },
              h("div", { className: "sr-mobile-filters__sheet-body" }, ...filterForms("sr-mobile")),
            ),
          ),
      savedView
        ? null
        : h(
            "aside",
            { className: "sr-filters sr-filters--desktop", "aria-label": filtersLabel },
            h("h3", null, filtersLabel),
            ...filterForms("sr"),
          ),
      h(
        "section",
        { className: `sr-results${savedView ? " sr-results--saved" : ""}`, "data-search-view": page.search.view || "list" },
        h(
          "div",
          { className: "sr-toolbar" },
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
          // Package P4: the saved view gets a compare action instead of the
          // sort and view controls. It stays hidden until the client counts two
          // or more saved properties, and carries their ids in the link.
          savedView
            ? page.chrome?.saved?.compare
              ? h(
                  "div",
                  { className: "sr-saved-actions" },
                  h(
                    Btn,
                    {
                      tag: "a",
                      variant: "secondary",
                      size: "md",
                      iconStart: "columns-3",
                      href: page.chrome.saved.compare.href,
                      "data-compare-link": "true",
                      "data-compare-min": "2",
                      hidden: true,
                    },
                    page.chrome.saved.compare.label,
                  ),
                )
              : null
            : toolbarForm(),
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
        h(OfficialAreaMaps, { page, labels }),
        savedView ? h("p", { className: "sr-saved__hint" }, labels.savedHint) : null,
        savedView
          ? h(
              "section",
              { className: "sr-saved-empty", "data-saved-listings-empty": "true", "aria-live": "polite" },
              h("span", { className: "sr-saved-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "heart", size: 30 })),
              h("p", null, labels.savedEmpty),
              h(Btn, { tag: "a", variant: "primary", size: "md", iconStart: "search", href: page.path }, labels.browseListings),
            )
          : null,
        !savedView && !(page.cards || []).length
          ? h(
              "section",
              { className: "sr-empty", "data-search-empty": "true", "aria-label": labels.searchResults },
              h("span", { className: "sr-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "search", size: 28 })),
              h("h2", null, labels.searchResults),
              h("p", null, `${page.search.total_matches} ${labels.matches}`),
              h(
                "div",
                { className: "sr-empty__actions" },
                h(Btn, { tag: "a", variant: "primary", size: "md", iconStart: "x", href: page.path }, labels.clearFilters),
              ),
            )
          : h(
              "section",
              {
                className: savedView ? "sr-list sr-list--grid" : "sr-list",
                "aria-label": savedView ? labels.savedListings : labels.searchResults,
                "data-search-results": "true",
                "data-saved-listings-grid": savedView ? "true" : undefined,
                hidden: savedView ? true : undefined,
              },
              ...(page.cards || []).map((card, index) =>
                h(SearchCard, { key: card.id, card, labels, localeCode: page.locale, orientation: savedView ? "vertical" : "horizontal", priority: index === 0 }),
              ),
            ),
        savedView
          ? h(
              "details",
              { className: "sr-saved__search", "data-saved-search-disclosure": "true" },
              h(
                "summary",
                null,
                h(Icon, { name: "bell", size: 18 }),
                h("span", null, labels.saveSearch),
                h(Icon, { name: "chevron-down", size: 16, className: "sr-saved__chevron" }),
              ),
              h(
                "div",
                { className: "sr-saved__search-body" },
                h("p", null, labels.saveSearchHint),
                h(Btn, { tag: "a", variant: "secondary", size: "md", iconStart: "search", href: page.path }, labels.search),
              ),
            )
          : null,
        !savedView && page.search.pagination?.total_pages > 1
          ? h(
              "nav",
              { className: "sr-pagination", "aria-label": labels.page, "data-search-pagination": "true" },
              page.search.pagination.has_previous
                ? h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: searchHref(page, null, page.search.pagination.page - 1), rel: "prev", "aria-label": `${labels.previous} · ${labels.page} ${page.search.pagination.page - 1}`, title: labels.previous }, h(Icon, { name: page.dir === "rtl" ? "arrow-right" : "arrow-left", size: 16 }), h("span", null, labels.previous))
                : h("span"),
              h("span", { className: "sr-pagination__status", "aria-current": "page" }, `${labels.page} ${page.search.pagination.page} / ${page.search.pagination.total_pages}`),
              page.search.pagination.has_next
                ? h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: searchHref(page, null, page.search.pagination.page + 1), rel: "next", "aria-label": `${labels.next} · ${labels.page} ${page.search.pagination.page + 1}`, title: labels.next }, h("span", null, labels.next), h(Icon, { name: page.dir === "rtl" ? "arrow-left" : "arrow-right", size: 16 }))
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
  const chrome = page.chrome;
  const cards = page.cards || [];
  const context = page.body.context;
  const subAreas = page.body.sub_areas || [];
  const guides = page.body.guides || [];
  const seller = page.body.seller;
  const searchPath = chrome?.nav?.find((item) => item.id === "buy")?.href || `/${page.locale}/search`;
  const allListingsHref = page.body.search_href || searchPath;
  const locationName = localizedLocationValue(page.locale, page.body.location);
  const forwardArrow = page.dir === "rtl" ? "arrow-left" : "arrow-right";
  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      "data-kind": "location",
      "data-react-public-ui": "location",
      "data-location": page.body.location,
      "data-total-matches": page.body.listing_count,
      "data-list-first-mobile": "true",
    },
    h(
      "header",
      { className: "loc-head" },
      h(
        "div",
        { className: "loc-head__in" },
        h("h1", null, page.body.h1),
        h("p", { className: "loc-head__count", "data-location-count": page.body.listing_count }, `${page.body.listing_count} ${labels.reviewedListings}`),
        page.body.intro ? h("p", { className: "loc-head__intro" }, page.body.intro) : null,
        context
          ? h(
              "div",
              { className: "loc-context", "data-location-context": "true" },
              h(Icon, { name: "file-check", size: 18 }),
              h("p", null, `${context.summary} `, h("a", { href: context.href }, context.title)),
            )
          : null,
        subAreas.length > 1
          ? h(
              "nav",
              { className: "loc-areas", "aria-label": labels.areas, "data-location-areas": "true" },
              ...subAreas.map((area) =>
                h(
                  "a",
                  { key: area.id, className: "mk-tag mk-tag--outline mk-tag--interactive", href: area.href, "data-location-area": area.id },
                  area.label,
                  h("span", { className: "loc-areas__count" }, String(area.count)),
                ),
              ),
            )
          : null,
      ),
    ),
    h(
      "section",
      { className: "loc-sec", "aria-label": labels.locationListings },
      h(
        "div",
        { className: "loc-sec__head" },
        h("h2", null, labels.locationListings),
        cards.length ? h(Btn, { tag: "a", variant: "secondary", iconEnd: forwardArrow, href: allListingsHref, "data-location-all": "true" }, labels.browseAllListings) : null,
      ),
      cards.length
        ? h(
            "div",
            { className: "loc-grid", "aria-label": labels.locationListings, "data-location-listings": "true" },
            ...cards.map((card, index) => h(SearchCard, { key: card.id, card, labels, localeCode: page.locale, priority: index === 0 })),
          )
        : h(
            "section",
            { className: "mk-empty loc-empty", "data-location-empty": "true", "aria-label": labels.noLocationListings },
            h("span", { className: "loc-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "map-pin", size: 24 })),
            h("h2", null, labels.noLocationListings),
            h("p", { className: "loc-empty__text" }, labels.saveSearchHint),
            h(
              "div",
              { className: "mk-empty__actions" },
              h(Btn, { tag: "a", variant: "primary", size: "lg", iconStart: "search", href: searchPath }, labels.browseAllListings),
              chrome?.contact?.path
                ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: chrome.contact.path }, chrome.contact.label)
                : null,
            ),
          ),
    ),
    guides.length
      ? h(
          "section",
          { className: "loc-sec loc-guides", "aria-label": chrome?.copy?.buyerGuides || labels.guideActions, "data-location-guides": "true" },
          h("div", { className: "loc-sec__head" }, h("h2", null, chrome?.copy?.buyerGuides || labels.guideActions)),
          h(
            "div",
            { className: "loc-guides__rail" },
            ...guides.map((guide) =>
              h(
                "a",
                { key: guide.href, className: "loc-guide", href: guide.href },
                h("h3", null, guide.title),
                guide.summary ? h("p", null, guide.summary) : null,
                h("span", { className: "loc-guide__more", "aria-hidden": "true" }, h(Icon, { name: forwardArrow, size: 16 })),
              ),
            ),
          ),
        )
      : null,
    seller
      ? h(
          "section",
          { className: "loc-cta", "aria-label": labels.sellerValuation, "data-location-sell": "true" },
          h(
            "div",
            { className: "loc-cta__in" },
            h("div", null, h("h2", null, fillLabel(labels.sellInLocation, { location: locationName })), seller.description ? h("p", null, seller.description) : null),
            h(
              "nav",
              { className: "loc-cta__actions", "aria-label": labels.primaryActions },
              h(Btn, { tag: "a", variant: "accent", size: "lg", iconStart: "phone", href: seller.path, "data-action": "seller" }, seller.label),
              chrome?.contact?.path
                ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: chrome.contact.path, "data-action": "contact" }, chrome.contact.label)
                : null,
            ),
          ),
        )
      : null,
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

/* Package P4: listing brochure action and purchase-cost disclosure. */

function ListingBrochure({ page }) {
  const brochure = page.body.extras?.brochure;
  if (!brochure) return null;
  return h(
    "section",
    { className: "ld-sec ld-brochure", "data-listing-brochure": "true" },
    h("h2", null, brochure.title),
    h(
      "div",
      { className: "ld-brochure__row" },
      h(
        Btn,
        {
          tag: "a",
          variant: "secondary",
          size: "md",
          iconStart: "download",
          href: brochure.url,
          "data-listing-action": "save_pdf",
          "data-listing-brochure-action": "true",
          "data-pdf-status": brochure.pdf_status,
        },
        brochure.label,
      ),
      h(
        "p",
        { className: "ld-brochure__note" },
        h("span", null, brochure.note),
        h("span", { className: "ld-brochure__ref", "data-listing-brochure-reference": "true" }, brochure.reference),
      ),
    ),
  );
}

function ListingPurchaseCosts({ page }) {
  const costs = page.body.extras?.costs;
  // Package B2's payload. It refuses a total while any required line is
  // unapproved and names each blocking line, so this renders the refusal
  // rather than a figure nobody signed off.
  const estimator = page.body.cost_estimator;
  if (!costs || !costs.applicable || !estimator) return null;
  const labels = uiLabels(page);
  const scopes = estimator.buyer_scopes || ["eu", "non_eu"];
  const table = estimator.table || [];
  const estimate = estimator.estimate || null;
  const missingByLine = new Map((estimator.missing || []).map((row) => [row.line_key, row]));
  const amountByLine = new Map((estimate?.lines || []).map((line) => [line.line_key, line]));
  const lineKeys = [...new Set([...(estimate?.required_lines || []), ...(table.find((row) => row.buyer_scope === "non_eu")?.required_lines || [])])];
  const missingCount = (estimator.missing || []).length;

  const lineRow = (lineKey) => {
    const copy = costs.lines[lineKey] || { label: lineKey.replaceAll("_", " "), note: "" };
    const amount = amountByLine.get(lineKey);
    const blocked = missingByLine.get(lineKey);
    const nonEuOnly = lineKey === "company_route_setup";
    return h(
      "div",
      { key: lineKey, className: "ld-costs__line", "data-cost-line": lineKey, "data-cost-state": amount ? "approved" : "missing" },
      h(
        "dt",
        null,
        h(
          "span",
          { className: "ld-costs__label" },
          copy.label,
          nonEuOnly ? h("span", { className: "ld-costs__scope" }, costs.buyers.non_eu) : null,
        ),
        h("span", { className: "ld-costs__note" }, copy.note),
      ),
      h(
        "dd",
        null,
        amount
          ? h("span", { className: "ld-costs__value" }, formatEuro(amount.amount_eur, page.locale))
          : h(
              "span",
              { className: "ld-costs__missing", "data-cost-missing": blocked ? blocked.reason : "not_approved" },
              h(Icon, { name: "circle-alert", size: 14 }),
              h("span", null, costs.missing_label),
            ),
      ),
    );
  };

  return h(
    "details",
    {
      className: "ld-costs",
      "data-listing-costs": "true",
      "data-costs-available": estimator.available ? "true" : "false",
      "data-costs-reason": estimator.reason || "",
      "data-costs-endpoint": estimator.endpoint,
      "data-costs-missing-count": String(missingCount),
    },
    h(
      "summary",
      { className: "ld-costs__summary" },
      h(Icon, { name: "calculator", size: 18 }),
      h("span", { className: "ld-costs__summary-label" }, costs.title),
      estimator.available ? null : h(Badge, { variant: "warning", icon: "circle-alert" }, costs.missing_label),
      h(Icon, { name: "chevron-down", size: 16, className: "ld-costs__chevron" }),
    ),
    h(
      "div",
      { className: "ld-costs__body" },
      h("p", { className: "ld-costs__intro" }, costs.intro),
      h(
        "p",
        { className: "ld-costs__scopes" },
        h("span", { className: "ld-costs__scopes-label" }, costs.buyer_label),
        ...scopes.map((scope) =>
          h(
            "span",
            {
              key: scope,
              className: "ld-costs__scope-chip",
              "data-cost-scope": scope,
              "data-cost-scope-available": table.find((row) => row.buyer_scope === scope)?.available ? "true" : "false",
            },
            costs.buyers[scope] || scope,
          ),
        ),
      ),
      h("dl", { className: "ld-costs__list" }, ...lineKeys.map((lineKey) => lineRow(lineKey))),
      h(
        "p",
        { className: "ld-costs__total", "data-cost-total": estimator.available ? "available" : "unavailable" },
        h("span", null, costs.total_label),
        estimator.available && estimate?.total_eur !== null && estimate?.total_eur !== undefined
          ? h("strong", null, formatEuro(estimate.total_eur, page.locale))
          : h("strong", { className: "ld-costs__unavailable", "data-cost-total-unavailable": "true" }, costs.total_unavailable),
      ),
      estimator.available && estimate?.total_including_price_eur
        ? h(
            "p",
            { className: "ld-costs__total ld-costs__total--with-price" },
            h("span", null, costs.total_with_price_label),
            h("strong", null, formatEuro(estimate.total_including_price_eur, page.locale)),
          )
        : null,
      h(
        "p",
        { className: "ld-costs__source" },
        h(Icon, { name: "info", size: 16 }),
        h("span", null, estimator.available ? costs.note : estimator.notice || costs.note),
      ),
      h(Btn, { tag: "a", variant: "secondary", size: "sm", iconStart: "message-circle", href: costs.cta.path }, costs.cta.label),
      labels ? null : null,
    ),
  );
}

function ListingBody({ page }) {
  const labels = uiLabels(page);
  const ui = uiCopyFor(page.locale);
  const chrome = page.chrome;
  const facts = page.body.facts || {};
  const tour = page.body.media.tour || {};
  const isSupersplatTour = tour.provider === "supersplat-viewer";
  const gallery = page.body.media.gallery || [];
  const floorPlans = page.body.media.floor_plans || [];
  const videos = page.body.media.videos || [];
  const galleryCount = page.body.media.gallery_count || gallery.length;
  // Desktop shows the main photo plus a 2x2 thumbnail block; phones reuse the
  // same DOM as a swipe carousel, so every reviewed photo stays in the markup
  // instead of trapping buyers in a five-image teaser.
  const gallerySlides = gallery.length ? gallery : [null];
  const galleryLayout = gallerySlides.length >= 5 ? "quad" : gallerySlides.length >= 3 ? "trio" : gallerySlides.length === 2 ? "pair" : "single";
  const channels = page.body.actions.direct_contact.channels || [];
  const brokerChannels = channels.filter((channel) => channel.enabled);
  // Without a per-listing approved broker contact the panel falls back to the
  // agency line that the footer and contact page already publish, marked as
  // such so the review status stays honest. Viber stays off this fallback: it
  // is only ever published as a reviewed per-listing broker channel.
  const agencyChannels = chrome?.contact
    ? [
        { id: "phone", label: labels.phone, href: chrome.contact.phone ? `tel:${chrome.contact.phone}` : null },
        { id: "whatsapp", label: "WhatsApp", href: chrome.contact.whatsapp || null },
      ].filter((channel) => channel.href)
    : [];
  const contactChannels = brokerChannels.length ? brokerChannels : agencyChannels;
  const tone = toneFor(facts.id || page.path);
  const breadcrumbChevron = page.dir === "rtl" ? "chevron-left" : "chevron-right";
  const sourceLocale = page.body.source.source_locale;
  const contentLocale = page.body.content_locale || sourceLocale;
  const reviewedTranslation = page.locale !== sourceLocale && page.translation.human_approved === true;
  const translationLabel = reviewedTranslation ? labels.reviewedTranslation : null;
  const sourceLanguageLabel = contentLocale !== page.locale ? contentLocale.toUpperCase() : null;
  const verifiedAt = page.body.verification?.availability_verified_at || null;
  const verificationDate = listingVerificationDate(verifiedAt, page.locale);
  // Publication approval says the listing may be shown; it says nothing about
  // whether anybody checked its figures. Claiming reviewed facts beside a
  // table that carries source-stated ones is the contradiction this page used
  // to print, so the claim now stands only when every figure on it is checked.
  const factsReviewed =
    page.body.lifecycle?.publish_approved === true && !(Array.isArray(facts.source_stated) && facts.source_stated.length);
  const locationPrecision = hasFact(facts.location_precision)
    ? ui.locationPrecisions?.[facts.location_precision] || humanizeIdentifier(facts.location_precision)
    : "";
  const locationLine = [facts.location, locationPrecision].filter(Boolean).join(" · ");
  const isRent = facts.offer_type === "rent";
  const offerLabel = hasFact(facts.offer_type) ? localizedListingValue(page.locale, "offer_type", facts.offer_type) : "";
  const statusLabel = facts.listing_status && facts.listing_status !== "available" ? labels.listingStatuses?.[facts.listing_status] : null;
  const priceText = facts.price_on_request ? labels.priceOnRequest : price(facts.price_eur, labels, page.locale);
  const showPerMonth = isRent && !facts.price_on_request && Number(facts.price_eur) > 1;
  const reference = /^MS-CRAWL-/i.test(String(facts.id || "")) ? null : facts.id;
  const searchPath = chrome?.nav?.[0]?.href || `/${page.locale}/search`;
  const locationLinks = page.body.location_links || {};
  const factRows = listingFactRows({
    facts,
    labels,
    ui,
    localeCode: page.locale,
    verificationDate,
    verifiedAt,
    reference,
    sourceLanguage: sourceLanguageLabel,
  });
  const hasFactRows = Object.keys(factRows).length > 0;
  const related = page.body.related_listings || [];

  const crumbs = chrome
    ? h(
        "nav",
        { className: "mk-crumbs", "aria-label": ui.breadcrumb },
        h("span", { className: "mk-crumbs__item" }, h("a", { href: chrome.home.href }, chrome.home.label), h("span", { className: "mk-crumbs__sep" }, h(Icon, { name: breadcrumbChevron, size: 14 }))),
        h("span", { className: "mk-crumbs__item" }, h("a", { href: chrome.nav[0].href }, labels.search), h("span", { className: "mk-crumbs__sep" }, h(Icon, { name: breadcrumbChevron, size: 14 }))),
        h("span", { className: "mk-crumbs__item" }, h("span", { className: "mk-crumbs__current", "aria-current": "page" }, facts.location || page.body.h1)),
      )
    : null;

  const secondaryActions = page.body.actions.secondary || [];
  const backAction = secondaryActions.find((action) => action.id === "back_to_results");
  const backIcon = page.dir === "rtl" ? "arrow-right" : "arrow-left";
  // Rendered twice on purpose: a quiet link in the desktop top bar and a round
  // overlay button on the phone gallery. CSS shows exactly one per viewport.
  const backLink = (keySuffix) =>
    backAction
      ? h(
          Btn,
          {
            key: `back${keySuffix}`,
            tag: "a",
            variant: "ghost",
            size: "sm",
            iconStart: backIcon,
            href: backAction.url,
            "aria-label": backAction.label,
            "data-listing-action": "back_to_results",
            "data-history-back": "same-origin",
          },
          backAction.label,
        )
      : null;
  const toolButtons = secondaryActions
    .filter((action) => action.id !== "back_to_results")
    .map((action) => {
      const icon = LISTING_ACTION_ICONS[action.id] || LISTING_ACTION_ICONS[action.kind] || "link";
      const actionAttrs = { "aria-label": action.label, "data-listing-action": action.id, "data-compact-mobile-action": "true" };
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
          "aria-pressed": "false",
          "data-client-save-listing": action.listing_id,
          "data-save-label": action.label,
          "data-saved-label": action.saved_label || labels.saved,
        },
        action.label,
      );
    });
  const tools = h("nav", { className: "ld-tools", "aria-label": labels.saveAndShare, "data-listing-tools": "true" }, backLink("-mobile"), ...toolButtons);

  const priceBlock = (attrs, { compact = false } = {}) =>
    h(
      "div",
      {
        className: `ld-price${compact ? " ld-price--compact" : ""}${facts.price_on_request ? " ld-price--request" : ""}`,
        ...attrs,
      },
      h("span", { className: "ld-price__amount" }, priceText),
      showPerMonth ? h("span", { className: "ld-price__per" }, labels.perMonth) : null,
      offerLabel ? h(Badge, { variant: isRent ? "for-rent" : "for-sale", "data-listing-offer": facts.offer_type }, offerLabel) : null,
    );

  const barItems = [];
  if (factRows.bedrooms) barItems.push({ key: "bedrooms", icon: "bed", ...factRows.bedrooms });
  if (factRows.area_sqm) barItems.push({ key: "area", icon: "ruler", ...factRows.area_sqm });
  if (factRows.land_area_sqm) barItems.push({ key: "land", icon: "map", ...factRows.land_area_sqm });
  if (factRows.floor) barItems.push({ key: "floor", icon: "building-2", ...factRows.floor });
  else if (factRows.storeys) barItems.push({ key: "storeys", icon: "building-2", ...factRows.storeys });
  if (factRows.availability) barItems.push({ key: "availability", icon: "circle-check", ...factRows.availability });
  if (factRows.reference) barItems.push({ key: "reference", icon: "file-text", ...factRows.reference });
  // One lonely fact is not a strip; it already appears in the grouped facts.
  const factsBar = barItems.length > 1
    ? h(
        "ul",
        { className: "ld-bar", "aria-label": labels.propertyDetails, "data-listing-facts-bar": "true" },
        ...barItems.map((item) =>
          h(
            "li",
            { key: item.key, className: "ld-bar__item", "data-listing-fact": item.key },
            h(Icon, { name: item.icon, size: 20 }),
            h(
              "span",
              { className: "ld-bar__text" },
              h("strong", { className: item.mono ? "ld-bar__value ld-bar__value--mono" : "ld-bar__value" }, item.value),
              h("span", { className: "ld-bar__label" }, item.label),
            ),
          ),
        ),
      )
    : null;

  const header = h(
    "section",
    {
      className: "ld-head",
      "aria-label": labels.listingSummary,
      "data-listing-summary": "true",
      "data-source-domain": page.body.source.source_domain,
      "data-schema-ready": page.schema ? "true" : "false",
    },
    h(
      "div",
      { className: "ld-head__main" },
      h("h1", { lang: contentLocale }, page.body.h1),
      locationLine ? h("p", { className: "ld-head__loc" }, h(Icon, { name: "map-pin", size: 18 }), h("span", null, locationLine)) : null,
      translationLabel || sourceLanguageLabel || verificationDate || statusLabel
        ? h(
            "div",
            { className: "ld-head__badges" },
            statusLabel ? h("span", { className: "mk-badge mk-badge--reduced mk-badge--sm", "data-listing-state": facts.listing_status }, statusLabel) : null,
            translationLabel ? h("span", { className: "mk-badge mk-badge--new mk-badge--sm", "data-listing-verification": "translation" }, translationLabel) : null,
            sourceLanguageLabel
              ? h("span", { className: "mk-badge mk-badge--neutral mk-badge--sm", "data-listing-verification": "source-language", lang: contentLocale }, sourceLanguageLabel)
              : null,
            verificationDate
              ? h(
                  "span",
                  { className: "mk-badge mk-badge--success mk-badge--sm", "data-listing-verification": "availability" },
                  h(Icon, { name: "shield-check", size: 14 }),
                  ` ${ui.verifiedInventory} · `,
                  h("time", { dateTime: verifiedAt }, verificationDate),
                )
              : null,
          )
        : null,
    ),
    priceBlock({ "data-listing-price-summary": "true" }),
  );

  const galleryShell = h(
    "div",
    { className: "ld-gallery-shell", "data-gallery-layout": galleryLayout },
    h(
      "div",
      {
        className: "ld-gallery",
        role: "region",
        "aria-label": labels.gallery,
        "data-mobile-gallery-label": labels.gallery,
        "data-mobile-gallery": "true",
        "data-mobile-gallery-index": "1",
        tabIndex: gallerySlides.length > 1 ? 0 : undefined,
      },
      ...gallerySlides.map((image, index) =>
        h(
          "button",
          {
            key: image?.url || `gallery-placeholder-${index}`,
            type: "button",
            className: `ld-g${index === 0 ? " ld-g--main" : ""}${index > 4 ? " ld-g--desktop-extra" : ""} mk-photo mk-photo--${index === 0 ? tone : index % 2 ? "sand" : "sky"}`,
            "aria-label": `${index + 1} / ${gallerySlides.length}${image?.alt ? `: ${image.alt}` : ""}`,
            "data-mobile-gallery-slide": String(index + 1),
            "data-gallery-active": index === 0 ? "true" : undefined,
            "data-listing-gallery-open": String(index),
            "data-has-photo": image ? "true" : "false",
            disabled: image ? undefined : true,
          },
          image ? h("img", publicImageProps(image, page.body.h1, index === 0 ? "eager" : "lazy", index === 0 ? "high" : undefined)) : null,
          h("span", { className: "ld-g__empty" }, h(Icon, { name: "camera", size: 26 }), h("span", null, labels.photoUnavailable)),
        ),
      ),
    ),
    gallery.length > 1
      ? h(
          "a",
          {
            className: "ld-gallery__all mk-btn mk-btn--secondary mk-btn--sm",
            href: "#listing-gallery",
            "data-listing-gallery-open": "0",
            "data-listing-gallery-all": "true",
          },
          h(Icon, { name: "layout-grid", size: 16 }),
          h("span", null, fillLabel(labels.allPhotos, { count: galleryCount })),
        )
      : null,
    gallerySlides.length > 1
      ? h(
          "div",
          {
            className: "ld-g__count",
            role: "status",
            "aria-live": "polite",
            "aria-label": `1 / ${gallerySlides.length}`,
            "data-mobile-gallery-progress": "true",
            "data-gallery-total": gallerySlides.length,
          },
          h(Icon, { name: "camera", size: 16 }),
          h("span", null, h("span", { "data-mobile-gallery-current": "true" }, "1"), ` / ${gallerySlides.length}`),
        )
      : null,
    gallerySlides.length > 1
      ? h(
          "div",
          { className: "ld-g__controls", "aria-label": labels.gallery },
          h(
            "button",
            {
              type: "button",
              className: "mk-btn mk-btn--secondary mk-btn--sm",
              "data-mobile-gallery-prev": "true",
              "aria-label": `${labels.previous} ${photoCountLabel(1, labels)}`,
            },
            h(Icon, { name: page.dir === "rtl" ? "chevron-right" : "chevron-left", size: 18 }),
          ),
          h(
            "button",
            {
              type: "button",
              className: "mk-btn mk-btn--secondary mk-btn--sm",
              "data-mobile-gallery-next": "true",
              "aria-label": `${labels.next} ${photoCountLabel(1, labels)}`,
            },
            h(Icon, { name: page.dir === "rtl" ? "chevron-left" : "chevron-right", size: 18 }),
          ),
        )
      : null,
  );

  const photoViewer = gallery.length
    ? h(
        "dialog",
        { className: "ld-photo-viewer", "aria-modal": "true", "data-listing-gallery-dialog": "true", "aria-label": labels.gallery },
        h(
          "header",
          { className: "ld-photo-viewer__head" },
          h(
            "p",
            { className: "ld-photo-viewer__count", role: "status", "aria-live": "polite" },
            h("span", { "data-listing-gallery-current": "true" }, "1"),
            ` / ${gallery.length}`,
          ),
          h(
            "button",
            {
              type: "button",
              className: "mk-iconbtn mk-iconbtn--ghost mk-iconbtn--lg",
              "data-listing-gallery-close": "true",
              "aria-label": chrome?.copy?.close || "Close",
            },
            h(Icon, { name: "x", size: 22 }),
          ),
        ),
        h(
          "div",
          { className: "ld-photo-viewer__stage" },
          h(
            "button",
            {
              type: "button",
              className: "ld-photo-viewer__nav ld-photo-viewer__nav--prev",
              "data-listing-gallery-prev": "true",
              "aria-label": `${labels.previous} ${photoCountLabel(1, labels)}`,
            },
            h(Icon, { name: page.dir === "rtl" ? "chevron-right" : "chevron-left", size: 24 }),
          ),
          h(
            "figure",
            { "data-listing-gallery-figure": "true" },
            h("img", {
              ...publicImageProps(gallery[0], page.body.h1, "lazy"),
              "data-listing-gallery-image": "true",
            }),
            // Loading and failed-photo states for the viewer; the client script
            // flips data-image-state on the figure, CSS reveals one of these.
            h(
              "p",
              { className: "ld-photo-viewer__state ld-photo-viewer__state--loading", role: "status", "aria-live": "polite" },
              h("span", { className: "ld-photo-viewer__spinner", "aria-hidden": "true" }),
              h("span", null, labels.photoLoading),
            ),
            h(
              "p",
              { className: "ld-photo-viewer__state ld-photo-viewer__state--failed", role: "status" },
              h(Icon, { name: "triangle-alert", size: 18 }),
              h("span", null, labels.photoUnavailable),
            ),
            h("figcaption", { "data-listing-gallery-caption": "true" }, gallery[0].alt || page.body.h1),
          ),
          h(
            "button",
            {
              type: "button",
              className: "ld-photo-viewer__nav ld-photo-viewer__nav--next",
              "data-listing-gallery-next": "true",
              "aria-label": `${labels.next} ${photoCountLabel(1, labels)}`,
            },
            h(Icon, { name: page.dir === "rtl" ? "chevron-left" : "chevron-right", size: 24 }),
          ),
        ),
      )
    : null;

  const primaryIcons = { inquiry: "message-circle", callback: "phone", request_viewing: "calendar" };
  const primaryOrder = { inquiry: 0, request_viewing: 1, callback: 2 };
  const primaryActionList = [...(page.body.actions.primary || [])].sort(
    (left, right) => (primaryOrder[left.id] ?? 9) - (primaryOrder[right.id] ?? 9),
  );
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
      h("strong", null, priceText),
      h("small", null, showPerMonth ? `${labels.perMonth} · ${offerLabel}` : offerLabel),
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

  const channelButtons = (prefix, { variant = "secondary", size = "md", full = true } = {}) =>
    contactChannels.map((channel) =>
      h(
        Btn,
        { key: `${prefix}-${channel.id || channel.label}`, tag: "a", variant, size, full, iconStart: channelIcon(channel.href), href: channel.href },
        channel.label,
      ),
    );

  const mobileContactOptions = h(
    "dialog",
    { id: "mk-contact-options", className: "ld-contact-options", "aria-modal": "true", "aria-label": labels.contactBroker, "data-mobile-contact-options": "true" },
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
    contactChannels.length
      ? h(
          "nav",
          { className: "ld-contact-options__direct", "aria-label": labels.brokerContact },
          ...channelButtons("mobile", { variant: "ghost", size: "sm", full: false }),
        )
      : null,
  );

  const officeBlock = chrome?.contact
    ? h(
        "div",
        { className: "ld-office", "data-listing-office": "true" },
        h("p", { className: "ld-office__name" }, h(Icon, { name: "landmark", size: 16 }), h("span", null, `${labels.office}: ${chrome.home?.label || "MS Realty"}`)),
        chrome.contact.offices ? h("p", { className: "ld-office__meta" }, chrome.contact.offices) : null,
        contactChannels.length
          ? h(
              "nav",
              {
                className: "ld-aside__contact",
                "aria-label": labels.brokerContact,
                "data-broker-contact-actions": "true",
                "data-contact-source": brokerChannels.length ? "broker" : "agency",
              },
              ...channelButtons("panel"),
            )
          : null,
      )
    : null;

  const trustRows = [
    factsReviewed
      ? h("p", { key: "facts", className: "ld-trust__row", "data-listing-trust": "facts-reviewed" }, h(Icon, { name: "shield-check", size: 16 }), h("span", null, labels.factsReviewed))
      : null,
    verificationDate
      ? h(
          "p",
          { key: "verified", className: "ld-trust__row", "data-availability-verification": "true" },
          h(Icon, { name: "calendar-check", size: 16 }),
          h("span", null, `${ui.verifiedInventory}: `, h("time", { dateTime: verifiedAt }, verificationDate)),
        )
      : null,
    translationLabel
      ? h("p", { key: "translation", className: "ld-trust__row", "data-listing-trust": "reviewed-translation" }, h(Icon, { name: "languages", size: 16 }), h("span", null, translationLabel))
      : null,
    sourceLanguageLabel
      ? h(
          "p",
          { key: "source", className: "ld-trust__row", "data-listing-trust": "source-language" },
          h(Icon, { name: "languages", size: 16 }),
          h("span", null, `${labels.sourceLanguage}: `, h("span", { className: "mk-badge mk-badge--neutral mk-badge--sm", lang: contentLocale }, sourceLanguageLabel)),
        )
      : null,
  ].filter(Boolean);
  const trustBlock = trustRows.length ? h("div", { className: "ld-trust" }, ...trustRows) : null;

  const locationSection = hasFact(facts.location)
    ? h(
        "section",
        { className: "ld-sec ld-location", "aria-label": labels.location, "data-listing-location": "true" },
        h("h2", null, labels.location),
        h("p", { className: "ld-location__line" }, h(Icon, { name: "map-pin", size: 18 }), h("span", null, locationLine)),
        h(
          "div",
          { className: "ld-location__links" },
          h(
            Btn,
            { tag: "a", variant: "secondary", size: "sm", iconStart: "search", href: locationLinks.search || searchPath, "data-listing-location-link": "search" },
            fillLabel(labels.moreInLocation, { location: facts.location }),
          ),
          locationLinks.map
            ? h(Btn, { tag: "a", variant: "ghost", size: "sm", iconStart: "map", href: locationLinks.map, "data-listing-location-link": "map" }, labels.viewOnMap)
            : null,
          // A pin needs approved public coordinates, which no listing carries
          // yet; the affordance stays visible and disabled instead of missing.
          locationLinks.pin_available
            ? null
            : h(
                Btn,
                { variant: "ghost", size: "sm", iconStart: "pin", disabled: true, "data-listing-map-pending": "true", title: labels.mapComingSoon },
                labels.mapComingSoon,
              ),
        ),
      )
    : null;

  // The nav keeps the media review attributes even with a single entry (tests
  // and operators read them); the tab links only appear when there is a choice.
  const mediaEntries = [gallery.length, floorPlans.length, videos.length, tour.available].filter(Boolean).length;
  const mediaNav =
    gallery.length || tour.available || floorPlans.length || videos.length
      ? h(
          "nav",
          {
            className: "mk-tabs mk-tabs--segmented ld-media-nav",
            "aria-label": labels.listingMedia,
            "data-media-gallery-count": page.body.media.gallery_count || 0,
            "data-tour-status": tour.available ? "available" : tour.review_status || "review_required",
          },
          mediaEntries > 1 && gallery.length ? h("a", { className: "mk-tab", href: "#listing-gallery" }, h(Icon, { name: "camera", size: 16 }), labels.gallery) : null,
          mediaEntries > 1 && floorPlans.length ? h("a", { className: "mk-tab", href: "#listing-floor-plans" }, h(Icon, { name: "file-check", size: 16 }), labels.floorPlans) : null,
          mediaEntries > 1 && videos.length ? h("a", { className: "mk-tab", href: "#listing-videos" }, h(Icon, { name: "external-link", size: 16 }), labels.videos) : null,
          mediaEntries > 1 && tour.available ? h("a", { className: "mk-tab", href: "#listing-tour" }, h(Icon, { name: "globe", size: 16 }), labels.tour360) : null,
        )
      : null;

  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      "data-kind": "listing",
      "data-listing-id": facts.id,
      "data-react-public-ui": "listing",
      "data-review-status": page.body.actions.direct_contact.review_status,
      "data-listing-status": page.body.lifecycle?.status || "available",
      "data-active-in-search": page.body.lifecycle?.active_in_search ? "true" : "false",
      "data-availability-verified": page.body.verification?.verified ? "true" : "false",
      "data-location-precision": facts.location_precision || "approximate",
      "data-content-language": contentLocale,
      ...(contentLocale && contentLocale !== (page.locale || page.lang) ? { lang: contentLocale } : {}),
      "data-min-touch-target": "44",
    },
    h(
      "div",
      { className: "ld" },
      h("div", { className: "ld-topbar" }, crumbs, backLink("-desktop")),
      header,
      factsBar,
      galleryShell,
      photoViewer,
      h(
        "section",
        { className: "ld-cols", "aria-label": labels.listingContent, "data-listing-content-grid": "true" },
        h(
          "section",
          { className: "ld-main", "aria-label": labels.listingMediaFacts, "data-listing-main-column": "true" },
          h(
            "section",
            { className: "ld-sec" },
            h("h2", null, labels.description),
            page.body.description
              ? h("p", { className: "ld-desc", "data-listing-description": "true", lang: contentLocale }, page.body.description)
              : h("p", { className: "ld-desc ld-desc--empty", "data-listing-description": "true", lang: contentLocale }, labels.reviewRequired),
          ),
          hasFactRows
            ? h(
                "section",
                { className: "ld-sec" },
                h("h2", null, labels.propertyDetails),
                h(ListingFactGroups, { rows: factRows, labels }),
                // Price history needs a reviewed price-change ledger in the CMS;
                // the row is shown as pending rather than silently missing.
                h(
                  "p",
                  { className: "ld-soon", "data-listing-price-history": "pending" },
                  h(Icon, { name: "trending-up", size: 16 }),
                  h("span", null, labels.priceHistoryComingSoon),
                ),
              )
            : null,
          // Package P4: purchase costs and the brochure action sit between the
          // reviewed facts and the area link, where a buyer decides.
          h(ListingPurchaseCosts, { page }),
          h(ListingBrochure, { page }),
          locationSection,
          mediaNav,
          gallery.length ? h("h2", { className: "ld-media-title" }, labels.gallery, h("small", null, `${galleryCount} ${photoCountLabel(galleryCount, labels)}`)) : null,
          h(
            "section",
            { id: "listing-gallery", className: "ld-gallery-full", "aria-label": labels.gallery, "data-photo-carousel": "true" },
            ...gallery.map((image, index) =>
              h(
                "button",
                {
                  key: image.url,
                  type: "button",
                  className: "ld-gallery-full__item",
                  "data-listing-gallery-source": "true",
                  "data-listing-gallery-open": String(index),
                  "aria-label": `${index + 1} / ${gallery.length}${image.alt ? `: ${image.alt}` : ""}`,
                },
                h("img", publicImageProps(image, page.body.h1)),
              ),
            ),
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
                  "data-tour-provider": tour.provider || "photo-sphere-viewer",
                  ...(isSupersplatTour
                    ? {}
                    : {
                        "data-photo-sphere-viewer": tour.mount_target,
                        "data-panorama-url": tour.panorama_url,
                      }),
                },
                h("p", null, tour.accessibility_caption),
                isSupersplatTour
                  ? h(
                      "div",
                      { className: "ld-tour__viewer" },
                      h(
                        "a",
                        {
                          className: "mk-btn mk-btn--primary mk-btn--md",
                          href: tour.viewer_url,
                          target: "_blank",
                          rel: "noopener",
                          "data-supersplat-viewer-link": "true",
                        },
                        h(Icon, { name: "external-link", size: 18 }),
                        ` ${labels.tour360}`,
                      ),
                      h(
                        "div",
                        { className: "ld-tour__fallback", "data-tour-gallery-fallback": "true", role: "status" },
                        tour.fallback_gallery?.[0] ? h("img", { ...publicImageProps(tour.fallback_gallery[0], page.body.h1, "lazy") }) : null,
                        h("a", { className: "mk-btn mk-btn--secondary mk-btn--md", href: "#listing-gallery" }, h(Icon, { name: "camera", size: 18 }), ` ${labels.gallery}`),
                      ),
                    )
                  : h(
                      "div",
                      { className: "ld-tour__fallback", hidden: true, "data-photo-sphere-fallback": "true", role: "status" },
                      tour.fallback_gallery?.[0] ? h("img", { ...publicImageProps(tour.fallback_gallery[0], page.body.h1, "lazy") }) : null,
                      h("a", { className: "mk-btn mk-btn--secondary mk-btn--md", href: "#listing-gallery" }, h(Icon, { name: "camera", size: 18 }), ` ${labels.gallery}`),
                    ),
              )
            : null,
        ),
        h(
          "aside",
          { className: "ld-aside", "aria-label": labels.contactBroker, "data-listing-contact-panel": "true" },
          h("div", { className: "ld-panel" }, priceBlock({ "data-listing-price": "true" }, { compact: true }), primaryActions, officeBlock, trustBlock, tools),
        ),
      ),
    ),
    h(
      "section",
      { className: "ld-similar", "aria-label": labels.relatedListings, "data-related-listings": "true" },
      h("h2", null, labels.relatedListings),
      related.length
        ? h(
            "div",
            { className: "ld-similar__grid" },
            ...related.map((card) => h(SearchCard, { key: card.id, card, labels, localeCode: page.locale, rootAttrs: { "data-related-listing": "true" } })),
          )
        : h(
            "div",
            { className: "mk-empty ld-similar__empty", "data-related-listings-empty": "true" },
            h("span", { className: "mk-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "search-x", size: 22 })),
            h("p", { className: "mk-empty__text" }, labels.noLocationListings),
            h(
              "div",
              { className: "mk-empty__actions" },
              h(Btn, { tag: "a", variant: "secondary", size: "md", iconStart: "search", href: locationLinks.search || searchPath }, labels.browseAllListings),
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

/* ============================================================
   Shared pieces for the seller, contact, guide and utility pages
   ============================================================ */

function fillTemplate(template, values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => (values[key] === undefined ? match : String(values[key])));
}

function phoneChannel(page) {
  const channel = page.body?.contact_channels?.phone;
  if (channel?.href) return channel;
  const contact = page.chrome?.contact;
  return contact?.phone ? { href: `tel:${contact.phone}`, label: contact.phone_display || contact.phone } : null;
}

function searchPathFor(page) {
  return page.body?.search?.path || page.body?.ctas?.search?.path || page.chrome?.nav?.find((item) => item.id === "buy")?.href || page.chrome?.home?.href || "/";
}

// Numbered strip ("How buying works", "What happens next"): an ordered list of
// steps, never a card grid. The numeral is decorative; the list carries order.
function FlowSteps({ steps, className = "", ...attrs }) {
  return h(
    "ol",
    { className: `flow-steps ${className}`.trim(), ...attrs },
    ...steps.map((step, index) =>
      h(
        "li",
        { key: step.title, className: "flow-steps__item" },
        h("span", { className: "flow-steps__num", "aria-hidden": "true" }, String(index + 1)),
        h("div", { className: "flow-steps__body" }, h("h3", null, step.title), step.text ? h("p", null, step.text) : null),
      ),
    ),
  );
}

// Utility template shared by language fallback, search unavailable, legacy
// archive, listing preservation and 404: icon, one-line title, one sentence,
// a primary action and the phone. Extra content renders under the card.
function UtilityPage({ page, kind, icon, meta, title, text, actions = [], rootAttrs = {}, children = [] }) {
  const main = h(
    "main",
    { id: "main", tabIndex: -1, "data-kind": kind, "data-react-public-ui": kind, ...rootAttrs, className: "pg-narrow ut-page" },
    h(
      "section",
      // The card is the page's only landmark content, so it takes its
      // accessible name from the heading it already shows.
      { className: "mk-empty ut-card", "data-utility-template": "true", "aria-labelledby": `${kind}-title` },
      h("span", { className: "mk-empty__icon", "aria-hidden": "true" }, h(Icon, { name: icon, size: 28 })),
      meta ? h("p", { className: "ut-card__meta" }, meta) : null,
      h("h1", { id: `${kind}-title`, className: "mk-empty__title" }, title),
      text ? h("p", { className: "mk-empty__text" }, text) : null,
      h("div", { className: "mk-empty__actions ut-card__actions" }, ...actions.filter(Boolean)),
    ),
    ...(Array.isArray(children) ? children : [children]),
  );
  return shell(page, main);
}

function phoneAction(channel, variant = "secondary") {
  if (!channel?.href) return null;
  return h(Btn, { tag: "a", variant, size: "lg", iconStart: "phone", href: channel.href, "data-utility-phone": "true" }, channel.label);
}

/* ============================================================
   Seller valuation (Persuade header + Operate stepper)
   ============================================================ */

function SellerBody({ page }) {
  const labels = uiLabels(page);
  const valuation = page.body.valuation;
  const photoUpload = page.body.photo_upload;
  const channels = page.body.contact_channels;
  const steps = [labels.propertyDetails, labels.callback, labels.brokerReview];
  const questions = [labels.sellerStepOneQuestion, labels.sellerStepTwoQuestion, labels.sellerStepThreeQuestion];
  const propertyTypes = Object.entries(uiCopyFor(page.locale).propertyTypes || {});
  const reviewFields = [
    ["property.location", labels.location],
    ["property.type", labels.propertyType],
    ["property.area", labels.area],
    ["property.bedrooms", labels.factLabels?.bedrooms || "Bedrooms"],
    ["contact.name", labels.name],
    ["contact.phone", labels.phone],
    ["contact_preference", labels.preferredContact],
    ["message", labels.message],
  ];
  const stepLabel = (index) => h("p", { className: "sell-form__step" }, fillTemplate(labels.stepOf, { n: index + 1, total: steps.length }));
  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      "data-kind": "seller",
      "data-react-public-ui": "seller",
      "data-phone-first": "true",
      "data-no-public-avm": "true",
      "data-broker-review-required": "true",
      "data-min-touch-target": "44",
      className: "pg-narrow sell-page",
    },
    h(
      "section",
      { className: "page-head sell-head", "aria-label": labels.sellerValuation, "data-seller-valuation-flow": "broker_callback" },
      h("h1", null, page.body.h1),
      h("p", null, page.body.intro),
      h("p", { className: "sell-promise", "data-seller-promise": "true" }, h(Icon, { name: "shield-check", size: 18 }), h("span", null, labels.sellerPromise)),
      // Without a submittable form there is no flow to track, so the progress
      // indicator would promise a stepper the visitor cannot use.
      valuation
        ? h(
            "ol",
            { className: "sell-steps", "data-seller-steps": "true" },
            ...steps.map((step, index) =>
              h(
                "li",
                { key: step, "data-seller-step-indicator": String(index + 1), "aria-current": index === 0 ? "step" : undefined },
                h("span", { className: "sell-steps__num", "aria-hidden": "true" }, index + 1),
                h("span", { className: "sell-steps__label" }, step),
              ),
            ),
          )
        : null,
    ),
    valuation
      ? h(
          "form",
          {
            className: "mk-card mk-card--elevated mk-card--pad-lg ct-form sell-form",
            method: valuation.method || "POST",
            action: valuation.endpoint,
            "data-lead-type": "seller",
            "data-seller-intake": "true",
            "data-seller-step": "1",
          },
          h("input", { type: "hidden", name: "source", defaultValue: valuation.payload.source }),
          h("input", { type: "hidden", name: "intent", defaultValue: valuation.payload.intent }),
          h("input", { type: "hidden", name: "leadType", defaultValue: valuation.payload.leadType }),
          // Source and channel attribution. The channel names the surface family,
          // the first touch path names where the visit started. Both are filled by
          // the client, neither travels in a URL, and neither identifies a visitor.
          h("input", { type: "hidden", name: "channel", defaultValue: "", "data-lead-channel-field": "true" }),
          h("input", { type: "hidden", name: "firstTouchPath", defaultValue: "", "data-first-touch-field": "true" }),
          h("input", { type: "hidden", name: "language", defaultValue: valuation.payload.language }),
          h(
            "section",
            {
              className: "sell-form__section",
              "data-seller-property-fields": "true",
              "data-seller-step": "1",
              role: "group",
              "aria-labelledby": "seller-step-property",
            },
            stepLabel(0),
            h("h2", { id: "seller-step-property", className: "ct-form__title", tabIndex: "-1", "data-seller-step-title": "true" }, questions[0]),
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
            h(
              "div",
              { className: "sell-form__actions sell-form__actions--end" },
              h(Btn, { type: "button", variant: "primary", size: "lg", iconEnd: "arrow-right", "data-seller-next": "true", hidden: true }, labels.next),
            ),
          ),
          h(
            "section",
            { className: "sell-form__section", "data-seller-step": "2", role: "group", "aria-labelledby": "seller-step-contact" },
            stepLabel(1),
            h("h2", { id: "seller-step-contact", className: "ct-form__title", tabIndex: "-1", "data-seller-step-title": "true" }, questions[1]),
            h(
              "div",
              { className: "ct-form__row" },
              h("label", null, labels.name, h("input", { name: "contact.name", required: true, autoComplete: "name" })),
              h("label", null, labels.phone, h("input", { name: "contact.phone", type: "tel", required: true, autoComplete: "tel", inputMode: "tel" })),
            ),
            h("label", null, labels.emailOptional, h("input", { name: "contact.email", type: "email", autoComplete: "email", inputMode: "email" })),
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
            h("label", null, labels.message, h("textarea", { name: "message", required: true })),
            h(
              "div",
              { className: "sell-form__actions" },
              h(Btn, { type: "button", variant: "secondary", size: "lg", iconStart: "arrow-left", "data-seller-back": "true", hidden: true }, labels.previous),
              h(Btn, { type: "button", variant: "primary", size: "lg", iconEnd: "arrow-right", "data-seller-next": "true", hidden: true }, labels.next),
            ),
          ),
          h(
            "section",
            { className: "sell-form__section", "data-seller-step": "3", role: "group", "aria-labelledby": "seller-step-review" },
            stepLabel(2),
            h("h2", { id: "seller-step-review", className: "ct-form__title", tabIndex: "-1", "data-seller-step-title": "true" }, questions[2]),
            h(
              "dl",
              { className: "sell-form__review", "data-seller-review": "true" },
              ...reviewFields.map(([name, label]) =>
                h(
                  "div",
                  { key: name, "data-seller-summary-row": "true", hidden: true },
                  h("dt", null, label),
                  h("dd", { "data-seller-summary": name }),
                ),
              ),
            ),
            h("p", { className: "sell-form__note" }, h(Icon, { name: "shield-check", size: 16 }), h("span", null, labels.sellerNextThreeText)),
            h(
              "div",
              { className: "sell-form__actions" },
              h(Btn, { type: "button", variant: "secondary", size: "lg", iconStart: "arrow-left", "data-seller-back": "true", hidden: true }, labels.previous),
              h(Btn, { type: "submit", variant: "accent", size: "lg", iconStart: "send" }, valuation.label),
            ),
          ),
        )
      : h(
          "div",
          { className: "mk-card mk-card--elevated mk-card--pad-lg ct-form", "data-form-unavailable": "true" },
          h("h2", { className: "ct-form__title" }, labels.sellerValuation),
          h("p", null, page.body.form_unavailable),
          channels ? phoneAction(channels.phone, "accent") : null,
        ),
    // The one photo-upload path on the page. It cannot live inside the intake
    // form - forms do not nest, and a seller who already holds a reference must
    // be able to send photos even when the intake form is switched off - so it
    // is a step of the flow by its styling rather than by its position in the
    // DOM, and it carries the only "add photos" heading on the page.
    photoUpload
      ? h(
          "section",
          {
            id: "seller-photos",
            className: "mk-card mk-card--elevated mk-card--pad-lg ct-form sell-photos",
            "aria-labelledby": "seller-photos-title",
            "data-seller-photos": "true",
            "data-feature-ready": "photo_upload",
            "data-seller-photos-public": "false",
            "data-seller-photos-searchable": "false",
          },
          h("h2", { id: "seller-photos-title", className: "ct-form__title" }, photoUpload.copy.title),
          h("p", { id: "seller-photos-note" }, photoUpload.copy.intro),
          h(
            "p",
            { className: "sell-form__note", "data-seller-photos-privacy": "true" },
            h(Icon, { name: "shield-check", size: 16 }),
            h("span", null, photoUpload.copy.privacy),
          ),
          h(
            "form",
            {
              className: "sell-photos__form",
              method: photoUpload.method || "POST",
              action: photoUpload.endpoint,
              enctype: photoUpload.enctype,
              "data-seller-photo-form": "true",
              "data-seller-photo-pending": photoUpload.copy.pending,
              "data-seller-photo-success": photoUpload.copy.success,
              "data-seller-photo-failure": photoUpload.copy.failure,
              "data-seller-photo-max-files": String(photoUpload.max_files),
              "data-seller-photo-max-bytes": String(photoUpload.max_file_bytes),
              "data-seller-photo-limits": photoUpload.copy.limits,
            },
            // Sending the valuation request fills the reference in and the
            // client hides this whole disclosure. It is here for the other
            // case: a seller who already holds a reference from a broker and is
            // only coming back to attach photos to it. Closed by default so the
            // common path stays a file picker and a button, and not `required`,
            // because a required control inside a closed disclosure cannot be
            // focused and would silently block the no-JavaScript submit.
            h(
              "details",
              { className: "sell-photos__reference", "data-seller-photo-reference-field": "true" },
              h("summary", null, photoUpload.copy.reference_toggle),
              h(
                "label",
                null,
                photoUpload.copy.reference,
                h("input", {
                  name: photoUpload.reference_field,
                  autoComplete: "off",
                  spellCheck: "false",
                  "data-seller-photo-reference": "true",
                }),
                h("small", { className: "sell-photos__hint" }, photoUpload.copy.reference_hint),
              ),
            ),
            h(
              "label",
              null,
              photoUpload.copy.field,
              h("input", {
                type: "file",
                name: photoUpload.field,
                multiple: true,
                required: true,
                accept: (photoUpload.accept || []).join(","),
                "data-seller-photo-input": "true",
              }),
              h("small", { className: "sell-photos__hint" }, photoUpload.copy.limits),
            ),
            h("progress", {
              className: "sell-photos__progress",
              max: "100",
              value: "0",
              hidden: true,
              "data-seller-photo-progress": "true",
              "aria-label": photoUpload.copy.pending,
            }),
            h("p", { className: "sell-photos__status", role: "status", "aria-live": "polite", "data-seller-photo-status": "true" }),
            h("ul", { className: "sell-photos__results", "data-seller-photo-results": "true" }),
            h(
              "div",
              { className: "sell-form__actions sell-form__actions--end" },
              h(Btn, { type: "submit", variant: "secondary", size: "lg", iconStart: "camera", "data-seller-photo-submit": "true" }, photoUpload.copy.submit),
            ),
          ),
        )
      : // Switched off, the affordance still ships - visibly disabled with the
        // reason beside it - in the same place the working one occupies, rather
        // than as a hole in the page.
        h(
          "section",
          {
            id: "seller-photos",
            className: "mk-card mk-card--elevated mk-card--pad-lg ct-form sell-photos",
            "aria-labelledby": "seller-photos-title",
            "data-seller-photos": "true",
            "data-feature-pending": "photo_upload",
          },
          h("h2", { id: "seller-photos-title", className: "ct-form__title" }, labels.addPhotos),
          h(
            "div",
            { className: "sell-form__pending" },
            h(
              "button",
              { type: "button", className: "mk-btn mk-btn--secondary mk-btn--md", disabled: true, "aria-describedby": "seller-photos-note" },
              h(Icon, { name: "camera", size: 18 }),
              h("span", null, labels.addPhotos),
            ),
            h("p", { id: "seller-photos-note", className: "sell-form__pending-note" }, labels.photosUnavailable),
          ),
        ),
    h(
      "section",
      { className: "sell-next", "aria-labelledby": "sell-next-title", "data-seller-next-steps": "true" },
      h("h2", { id: "sell-next-title" }, labels.whatHappensNext),
      h(FlowSteps, {
        className: "flow-steps--compact",
        steps: [
          { title: labels.sellerNextOneTitle, text: labels.sellerNextOneText },
          { title: labels.sellerNextTwoTitle, text: labels.sellerNextTwoText },
          { title: labels.sellerNextThreeTitle, text: labels.sellerNextThreeText },
        ],
      }),
    ),
    channels
      ? h(
          "section",
          { className: "sell-channels", "aria-labelledby": "sell-channels-title", "data-contact-channels": "true" },
          h("h2", { id: "sell-channels-title" }, labels.callOrMessage),
          h(
            "div",
            { className: "channel-row" },
            h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "phone", href: channels.phone.href }, channels.phone.label),
            channels.whatsapp ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: channels.whatsapp.href }, channels.whatsapp.label) : null,
            channels.viber ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: channels.viber.href }, channels.viber.label) : null,
            channels.email ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "mail", href: channels.email.href }, channels.email.label) : null,
          ),
        )
      : null,
  );
  return shell(page, main);
}

/* ============================================================
   Contact (channels, offices, callback form)
   ============================================================ */

function ContactBody({ page }) {
  const labels = uiLabels(page);
  const chrome = page.chrome;
  const callback = page.body.callback;
  const channels = page.body.contact_channels;
  const offices = page.body.offices || [];
  const topics = [
    ["buying", labels.topicBuying],
    ["renting", labels.topicRenting],
    ["selling", labels.topicSelling],
    ["other", labels.topicOther],
  ];
  const main = h(
    "main",
    { id: "main", tabIndex: -1, "data-kind": "contact", "data-react-public-ui": "contact", "data-phone-first": "true", "data-min-touch-target": "44", className: "ct-page" },
    h("div", { className: "page-head ct-page__head" }, h("h1", null, page.body.h1), h("p", null, page.body.intro)),
    h(
      "div",
      { className: "ct-page__cols" },
      h(
        "div",
        { className: "ct-side" },
        channels
          ? h(
              "section",
              { className: "ct-section", "aria-labelledby": "ct-channels-title", "data-contact-channels": "true" },
              h("h2", { id: "ct-channels-title" }, labels.callOrMessage),
              h(
                "div",
                { className: "channel-row" },
                h(Btn, { tag: "a", variant: "accent", size: "lg", iconStart: "phone", href: channels.phone.href }, channels.phone.label),
                channels.whatsapp ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: channels.whatsapp.href }, channels.whatsapp.label) : null,
                channels.viber ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: channels.viber.href }, channels.viber.label) : null,
                channels.email ? h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "mail", href: channels.email.href }, channels.email.label) : null,
              ),
            )
          : null,
        offices.length
          ? h(
              "section",
              { className: "ct-section", "aria-labelledby": "ct-offices-title", "data-contact-offices": "true" },
              h("h2", { id: "ct-offices-title" }, labels.ourOffices),
              h(
                "ul",
                { className: "ct-offices" },
                ...offices.map((office) =>
                  h(
                    "li",
                    { key: office.id, className: "ct-office", "data-office": office.id },
                    h("h3", null, h(Icon, { name: "map-pin", size: 18 }), h("span", null, office.name)),
                    h(
                      "div",
                      { className: "ct-office__links" },
                      h("a", { href: office.search_path }, h(Icon, { name: "search", size: 16 }), h("span", null, fillTemplate(labels.propertiesIn, { area: office.name }))),
                      h(
                        "a",
                        { href: office.map_href, target: "_blank", rel: "noopener noreferrer" },
                        h(Icon, { name: "map", size: 16 }),
                        h("span", null, labels.openMap),
                        h(Icon, { name: "external-link", size: 14, className: "ct-office__ext" }),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : null,
        chrome
          ? h(
              "nav",
              { className: "ct-actions", "aria-label": labels.contactActions },
              h(Btn, { tag: "a", variant: "secondary", iconStart: "search", href: page.body.search.path, "data-action": "search" }, labels.browseListings),
              h(Btn, { tag: "a", variant: "secondary", iconStart: "landmark", href: page.body.seller.path, "data-action": "seller" }, labels.sellerValuation),
            )
          : null,
      ),
      callback
        ? h(
            "form",
            {
              className: "mk-card mk-card--elevated mk-card--pad-lg ct-form ct-form--contact",
              method: callback.method || "POST",
              action: callback.endpoint,
              "data-lead-type": "general",
              "data-source": callback.payload.source,
            },
            h("h2", { className: "ct-form__title" }, labels.contactFormTitle),
            h("input", { type: "hidden", name: "source", defaultValue: callback.payload.source }),
            h("input", { type: "hidden", name: "intent", defaultValue: callback.payload.intent }),
            h("input", { type: "hidden", name: "leadType", defaultValue: callback.payload.leadType }),
            // Source and channel attribution. The channel names the surface family,
            // the first touch path names where the visit started. Both are filled by
            // the client, neither travels in a URL, and neither identifies a visitor.
            h("input", { type: "hidden", name: "channel", defaultValue: "", "data-lead-channel-field": "true" }),
            h("input", { type: "hidden", name: "firstTouchPath", defaultValue: "", "data-first-touch-field": "true" }),
            h("input", { type: "hidden", name: "language", defaultValue: callback.payload.language }),
            h("input", { type: "hidden", name: "contact_preference", defaultValue: callback.payload.contact_preference }),
            h(
              "div",
              { className: "ct-form__row" },
              h("label", null, labels.name, h("input", { name: "contact.name", required: true, autoComplete: "name" })),
              h("label", null, labels.phone, h("input", { name: "contact.phone", type: "tel", required: true, autoComplete: "tel", inputMode: "tel" })),
            ),
            h("label", null, labels.emailOptional, h("input", { name: "contact.email", type: "email", autoComplete: "email", inputMode: "email" })),
            h(
              "label",
              null,
              labels.contactTopic,
              h(
                "select",
                { name: "request_details.topic", "data-contact-topic": "true" },
                h("option", { value: "", disabled: true, selected: true }, labels.contactTopic),
                ...topics.map(([value, label]) => h("option", { key: value, value }, label)),
              ),
            ),
            h("label", null, labels.preferredCallbackTime, h("input", { name: "request_details.callback_time", maxLength: 120 })),
            h("label", null, labels.message, h("textarea", { name: "message" })),
            h(Btn, { type: "submit", variant: "primary", size: "lg", full: true, iconStart: "send" }, callback.label),
          )
        : h(
            "div",
            { className: "mk-card mk-card--elevated mk-card--pad-lg ct-form", "data-form-unavailable": "true" },
            h("h2", { className: "ct-form__title" }, labels.contactFormTitle),
            h("p", null, page.body.form_unavailable),
            channels ? phoneAction(channels.phone, "accent") : null,
          ),
    ),
  );
  return shell(page, main);
}

/* ============================================================
   Utility pages: search unavailable, language fallback, legacy archive,
   listing preservation, not found
   ============================================================ */

function SearchUnavailableBody({ page }) {
  const labels = uiLabels(page);
  const channels = page.body.contact_channels;
  return h(UtilityPage, {
    page,
    kind: "search-unavailable",
    icon: "search-x",
    title: page.body.h1,
    text: page.body.intro,
    actions: [
      phoneAction(channels?.phone, "accent"),
      h(Btn, { key: "contact", tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: page.body.ctas.contact.path }, labels.contactBroker),
      h(Btn, { key: "seller", tag: "a", variant: "secondary", size: "lg", iconStart: "landmark", href: page.body.ctas.seller.path }, labels.sellerValuation),
    ],
  });
}

function LanguageFallbackBody({ page }) {
  const labels = uiLabels(page);
  return h(UtilityPage, {
    page,
    kind: "language-fallback",
    icon: "languages",
    title: page.body?.h1 || page.metadata.title,
    text: page.body?.intro || page.metadata.description,
    rootAttrs: { "data-public-translation-available": page.public_translation_available ? "true" : "false" },
    actions: [
      h(
        "form",
        { key: "request", method: "POST", action: "/api/language-requests", "data-request-language": "true", "data-success-message": page.body?.success || undefined },
        h("input", { type: "hidden", name: "requestedLocale", defaultValue: page.requested_locale }),
        h("input", { type: "hidden", name: "requestedPath", defaultValue: page.requested_path }),
        h(Btn, { type: "submit", variant: "primary", size: "lg", iconStart: "languages" }, labels.requestLanguage),
      ),
      h(Btn, { key: "search", tag: "a", variant: "secondary", size: "lg", iconStart: "search", href: searchPathFor(page) }, labels.browseListings),
      phoneAction(phoneChannel(page)),
    ],
  });
}

function LegacyArchiveBody({ page }) {
  const labels = uiLabels(page);
  const source = page.body.source || {};
  const sourceFacts = [
    ["Домейн", source.domain],
    ["Тип", source.type],
    ["Архивирано", source.captured_at_utc],
    ["SHA-256", source.text_sha256],
  ].filter(([, value]) => value);
  return h(UtilityPage, {
    page,
    kind: "legacy-archive",
    icon: "file-text",
    meta: "Неиндексиран архив",
    title: page.body.h1,
    text: page.body.notice,
    rootAttrs: { "data-legacy-archive-source": "true" },
    actions: [
      h(Btn, { key: "search", tag: "a", variant: "primary", size: "lg", iconStart: "search", href: searchPathFor(page) }, labels.browseListings),
      phoneAction(phoneChannel(page)),
    ],
    children: h(
      "article",
      { className: "ut-article legacy-archive__content", lang: page.lang },
      h("p", { className: "ut-article__text legacy-archive__text" }, page.body.text),
      h(
        "footer",
        { className: "ut-article__source legacy-archive__source" },
        h("h2", null, "Източник"),
        h(
          "dl",
          null,
          ...sourceFacts.flatMap(([label, value]) => [h("dt", { key: `${label}-label` }, label), h("dd", { key: `${label}-value` }, value)]),
        ),
        source.url ? h("a", { href: source.url, target: "_blank", rel: "nofollow noopener noreferrer" }, source.url) : null,
      ),
    ),
  });
}

function ListingPreservationBody({ page }) {
  const labels = uiLabels(page);
  const archived = page.body.catalog_state !== "active";
  return h(UtilityPage, {
    page,
    kind: "listing-preservation",
    icon: archived ? "file-check" : "clock",
    meta: `${page.body.reference.label}: ${page.body.reference.value}`,
    title: page.body.h1,
    text: page.body.notice,
    rootAttrs: { "data-catalog-state": page.body.catalog_state },
    actions: [
      h(Btn, { key: "contact", tag: "a", variant: "primary", size: "lg", iconStart: "message-circle", href: page.body.contact.path }, page.body.contact.label),
      h(Btn, { key: "search", tag: "a", variant: "secondary", size: "lg", iconStart: "search", href: searchPathFor(page) }, labels.browseListings),
      phoneAction(phoneChannel(page)),
    ],
    children: h(
      "dl",
      { className: "ut-facts legacy-archive__content", "data-preservation-facts": "true" },
      h("div", null, h("dt", null, page.body.reference.label), h("dd", null, page.body.reference.value)),
      h("div", null, h("dt", null, page.body.checked_at.label), h("dd", null, page.body.checked_at.value)),
    ),
  });
}

function NotFoundBody({ page }) {
  const labels = uiLabels(page);
  const ctas = page.body?.ctas || {};
  return h(UtilityPage, {
    page,
    kind: "not-found",
    icon: "search-x",
    title: page.body?.h1 || labels.notFoundTitle,
    text: page.body?.intro || labels.notFoundText,
    actions: [
      h(Btn, { key: "search", tag: "a", variant: "primary", size: "lg", iconStart: "search", href: searchPathFor(page) }, labels.browseListings),
      phoneAction(phoneChannel(page)),
      ctas.home?.path ? h(Btn, { key: "home", tag: "a", variant: "ghost", size: "lg", iconStart: "house", href: ctas.home.path }, labels.goHome) : null,
    ],
    // A dead link is the one moment a visitor most needs the search itself,
    // so the page carries a working GET form, not only links.
    children: h(
      "form",
      { className: "ut-search", method: "get", action: searchPathFor(page), role: "search", "aria-label": labels.search, "data-not-found-search": "true" },
      h("label", { htmlFor: "not-found-query" }, labels.keywordSearch),
      h(
        "div",
        { className: "ut-search__row" },
        h("input", { id: "not-found-query", name: "q", type: "search", autoComplete: "off", placeholder: labels.locationPlaceholder }),
        h(Btn, { type: "submit", variant: "primary", size: "lg", iconStart: "search" }, labels.search),
      ),
    ),
  });
}

/* ============================================================
   Guides (Read mode): 68ch measure, sticky table of contents, sources,
   "Ask a broker", related guides
   ============================================================ */

function GuideBody({ page }) {
  const labels = uiLabels(page);
  const chrome = page.chrome || {};
  const sections = page.body.sections || [];
  const related = (chrome.resources?.links || []).filter((link) => !link.active);
  const phone = phoneChannel(page);
  const tocEntries = [
    ...sections.filter((section) => section.title !== page.body.h1).map((section) => ({ id: section.id, label: section.title })),
    { id: "guide-ask", label: labels.askBroker },
    ...(related.length ? [{ id: "guide-related", label: labels.relatedGuides }] : []),
  ];
  const toc =
    tocEntries.length > 1
      ? h(
          "nav",
          { className: "guide-toc", "aria-labelledby": "guide-toc-title", "data-guide-toc": "true" },
          h("p", { id: "guide-toc-title", className: "guide-toc__label" }, labels.onThisPage),
          h("ol", null, ...tocEntries.map((entry) => h("li", { key: entry.id }, h("a", { href: `#${entry.id}` }, entry.label)))),
        )
      : null;
  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      "data-kind": "guide",
      "data-react-public-ui": "guide",
      "data-approved-source": "cms",
      "data-min-touch-target": "44",
      className: "guide-page",
    },
    h(
      "div",
      { className: `guide-page__in${toc ? " guide-page__in--toc" : ""}` },
      h(
        "header",
        { className: "guide-head" },
        h(Badge, { variant: "neutral", icon: "shield-check", "data-guide-trust": "approved" }, labels.approvedSource),
        h("h1", null, page.body.h1),
      ),
      toc ? h("aside", { className: "guide-page__aside" }, toc) : null,
      h(
        "article",
        { className: "guide-article" },
        ...sections.map((section) => {
          const primary = section.title === page.body.h1;
          return h(
            "section",
            {
              key: section.id,
              id: section.id,
              className: `guide-sec${primary ? " guide-sec--primary" : ""}`,
              "data-reviewer": section.reviewer,
              "data-primary-guide-section": primary ? "true" : undefined,
              "aria-label": primary ? section.title : undefined,
            },
            primary ? null : h("h2", null, section.title),
            h("ul", { className: "guide-facts" }, ...(section.facts || []).map((fact) => h("li", { key: fact }, h(Icon, { name: "check", size: 16 }), h("span", null, fact)))),
            section.sources?.length
              ? h(
                  "div",
                  { className: "guide-sources", "data-guide-sources": "true" },
                  section.sources_label ? h("p", { className: "guide-sources__label" }, section.sources_label) : null,
                  h(
                    "ul",
                    { className: "guide-sources__links" },
                    ...section.sources.map((source) =>
                      h(
                        "li",
                        { key: source.id },
                        h(
                          "a",
                          { href: source.url, target: "_blank", rel: "noopener noreferrer" },
                          h("span", null, source.label || source.publisher),
                          h(Icon, { name: "external-link", size: 14 }),
                        ),
                      ),
                    ),
                  ),
                )
              : null,
          );
        }),
        h(
          "section",
          { id: "guide-ask", className: "guide-ask", "aria-labelledby": "guide-ask-title", "data-guide-ask-broker": "true" },
          h("h2", { id: "guide-ask-title" }, labels.askBroker),
          h("p", null, labels.askBrokerText),
          h(
            "nav",
            { className: "pg-actions", "aria-label": labels.guideActions },
            h(Btn, { tag: "a", variant: "primary", iconStart: "message-circle", href: page.body.ctas.contact.path }, labels.contactBroker),
            phone ? h(Btn, { tag: "a", variant: "secondary", iconStart: "phone", href: phone.href }, phone.label) : null,
            h(Btn, { tag: "a", variant: "secondary", iconStart: "search", href: page.body.ctas.search.path }, labels.search),
            h(Btn, { tag: "a", variant: "ghost", iconStart: "landmark", href: page.body.ctas.seller.path }, labels.sellerValuation),
          ),
        ),
        related.length
          ? h(
              "section",
              { id: "guide-related", className: "guide-related", "aria-labelledby": "guide-related-title", "data-guide-related": "true" },
              h("h2", { id: "guide-related-title" }, labels.relatedGuides),
              h(
                "ul",
                null,
                ...related.map((guide) =>
                  h(
                    "li",
                    { key: guide.id },
                    h(
                      "a",
                      { href: guide.href },
                      h(
                        "span",
                        { className: "guide-related__text" },
                        h("span", { className: "guide-related__title" }, guide.label),
                        guide.summary ? h("span", { className: "guide-related__summary" }, guide.summary) : null,
                      ),
                      h(Icon, { name: "arrow-right", size: 18, className: "guide-related__arrow ico-dir" }),
                    ),
                  ),
                ),
              ),
            )
          : null,
      ),
    ),
  );
  return shell(page, main);
}

/* ============================================================
   Package P4: compare, about and team, saved-search management.
   Every block below belongs to P4.
   ============================================================ */

function CompareBody({ page }) {
  const body = page.body;
  const copy = body.copy;
  const labels = uiLabels(page);
  const columns = body.columns || [];
  const hasColumns = columns.length > 0;
  // Removing a column is a plain link to the same page without that id, so it
  // works before the client script runs; the script also drops the id from the
  // saved list.
  const withoutHref = (id) => {
    const rest = columns.filter((column) => column.id !== id).map((column) => column.id);
    return rest.length ? `${page.path}?ids=${rest.join(",")}` : page.path;
  };

  const columnHead = (column, index) =>
    h(
      "th",
      { key: column.id, scope: "col", className: "cmp-col", "data-compare-column": column.id },
      h(
        "div",
        { className: "cmp-col__in" },
        h(
          "a",
          { className: "cmp-col__media", href: column.path, tabIndex: -1, "aria-hidden": "true" },
          column.thumbnail
            ? h("img", publicImageProps(column.thumbnail, column.title, index === 0 ? "eager" : "lazy"))
            : h("span", { className: `cmp-col__tone cmp-col__tone--${toneFor(column.id)}` }, h(Icon, { name: "camera", size: 20 })),
        ),
        h(
          "a",
          { className: "cmp-col__title", href: column.path, "data-compare-open": column.id },
          h("span", { className: "cmp-col__index" }, copy.columnLabel.replace("{index}", String(index + 1))),
          h("span", { className: "cmp-col__name" }, column.title),
        ),
        h(
          "a",
          {
            className: "cmp-col__remove",
            href: withoutHref(column.id),
            "data-compare-remove": column.id,
            "aria-label": copy.removeLabel.replace("{title}", column.title),
            title: copy.remove,
          },
          h(Icon, { name: "x", size: 16 }),
          h("span", { className: "cmp-col__remove-label" }, copy.remove),
        ),
      ),
    );

  const table = h(
    "table",
    { className: "cmp-table", "data-compare-table": "true" },
    h("caption", { className: "mk-sr-only" }, copy.tableLabel),
    h(
      "thead",
      null,
      h(
        "tr",
        null,
        h("th", { scope: "col", className: "cmp-table__corner" }, copy.detail),
        ...columns.map((column, index) => columnHead(column, index)),
      ),
    ),
    h(
      "tbody",
      null,
      ...(body.rows || []).map((row) =>
        h(
          "tr",
          {
            key: row.id,
            "data-compare-row": row.id,
            "data-compare-identical": row.identical ? "true" : "false",
          },
          h("th", { scope: "row", className: "cmp-table__label" }, row.label),
          ...row.values.map((value, index) =>
            h(
              "td",
              {
                key: columns[index] ? columns[index].id : String(index),
                "data-compare-cell": columns[index] ? columns[index].id : undefined,
                "data-compare-numeric": row.numeric ? "true" : undefined,
              },
              value,
            ),
          ),
        ),
      ),
    ),
  );

  // A checkbox disclosure rather than a button: identical rows collapse and
  // expand from CSS alone, so a shared comparison link stays complete without
  // JavaScript.
  const identical = h(
    "div",
    { className: "cmp-identical", "data-compare-identical-disclosure": "true" },
    h("input", {
      type: "checkbox",
      className: "cmp-identical__input",
      id: "compare-identical",
      "data-compare-identical-input": "true",
    }),
    h(
      "label",
      { className: "cmp-identical__label", htmlFor: "compare-identical" },
      h(Icon, { name: "chevron-down", size: 16, className: "cmp-identical__chevron" }),
      h(
        "span",
        { className: "cmp-identical__show", "data-compare-identical-show": copy.identicalShow },
        copy.identicalShow.replace("{count}", String(body.identical_count)),
      ),
      h(
        "span",
        { className: "cmp-identical__hide", "data-compare-identical-hide": copy.identicalHide },
        copy.identicalHide.replace("{count}", String(body.identical_count)),
      ),
    ),
    h("p", { className: "cmp-identical__hint" }, copy.identicalHint),
  );

  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      className: "cmp-page",
      "data-kind": "compare",
      "data-react-public-ui": "compare",
      "data-compare-page": "true",
      "data-compare-state": body.state,
      "data-compare-max": String(body.max_columns),
      "data-compare-path": page.path,
      "data-compare-storage-key": body.storage_key,
      "data-compare-column-label": copy.columnLabel,
      "data-min-touch-target": "44",
    },
    h(
      "header",
      { className: "cmp-head" },
      h("h1", null, body.h1),
      h("p", { className: "cmp-head__intro" }, body.intro),
      h(
        "div",
        { className: "cmp-head__actions" },
        h(Btn, { tag: "a", variant: "secondary", size: "sm", iconStart: "heart", href: body.saved.path }, copy.savedLink),
        h(Btn, { tag: "a", variant: "ghost", size: "sm", iconStart: "search", href: body.search.path }, copy.addMore),
      ),
    ),
    // Server-rendered fallback: shown until the client script confirms it can
    // read the saved list from this browser.
    h(
      "section",
      { className: "cmp-fallback", "data-compare-fallback": "true", "aria-labelledby": "compare-fallback-title" },
      h(Icon, { name: "info", size: 20 }),
      h(
        "div",
        null,
        h("h2", { id: "compare-fallback-title" }, copy.fallbackTitle),
        h("p", null, copy.fallbackText),
        h(
          "div",
          { className: "cmp-fallback__actions" },
          h(Btn, { tag: "a", variant: "primary", size: "md", iconStart: "heart", href: body.saved.path }, copy.savedLink),
          h(Btn, { tag: "a", variant: "secondary", size: "md", iconStart: "search", href: body.search.path }, copy.searchLink),
        ),
      ),
    ),
    h(
      "section",
      { className: "cmp-empty", "data-compare-empty": "true", "aria-live": "polite", hidden: true },
      h("span", { className: "cmp-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "columns-3", size: 30 })),
      h("h2", null, copy.emptyTitle),
      h("p", null, copy.emptyText),
      h(Btn, { tag: "a", variant: "primary", size: "md", iconStart: "search", href: body.search.path }, copy.searchLink),
    ),
    h(
      "p",
      {
        className: "cmp-flag",
        "data-compare-limit": "true",
        "data-compare-limit-template": copy.limitNote,
        role: "status",
        hidden: body.over_limit ? undefined : true,
      },
      h(Icon, { name: "info", size: 16 }),
      h(
        "span",
        null,
        copy.limitNote.replace("{max}", String(body.max_columns)).replace("{count}", String(body.over_limit || body.max_columns)),
      ),
    ),
    h(
      "p",
      { className: "cmp-flag", "data-compare-unavailable": "true", role: "status", hidden: body.unavailable_count ? undefined : true },
      h(Icon, { name: "triangle-alert", size: 16 }),
      h("span", null, copy.unavailableNote),
    ),
    h(
      "div",
      { className: "cmp", "data-compare-region": "true", hidden: hasColumns ? undefined : true },
      identical,
      h("div", { className: "cmp-scroll", "data-compare-scroll": "true", tabIndex: 0, role: "region", "aria-label": copy.tableLabel }, table),
      h(
        "div",
        { className: "cmp-foot" },
        ...columns.map((column) =>
          h(
            Btn,
            { key: column.id, tag: "a", variant: "secondary", size: "sm", iconEnd: page.dir === "rtl" ? "arrow-left" : "arrow-right", href: column.path, "data-compare-foot-open": column.id },
            copy.view,
          ),
        ),
      ),
      h(Btn, { tag: "a", variant: "ghost", size: "sm", iconStart: "plus", href: body.saved.path, className: "mk-btn mk-btn--ghost mk-btn--sm cmp-add" }, copy.addMore),
    ),
    labels.savedListings ? null : null,
  );
  return shell(page, main);
}

function AboutBody({ page }) {
  const body = page.body;
  const copy = body.copy;
  const labels = uiLabels(page);
  const team = body.team;
  const contact = body.contact;

  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      className: "ab-page",
      "data-kind": "about",
      "data-react-public-ui": "about",
      "data-min-touch-target": "44",
    },
    h(
      "header",
      { className: "ab-head" },
      h("h1", null, body.h1),
      h("p", { className: "ab-head__intro" }, body.intro),
      h(
        "div",
        { className: "ab-head__actions" },
        h(Btn, { tag: "a", variant: "accent", size: "md", iconStart: "message-circle", href: contact.path }, contact.label),
        h(Btn, { tag: "a", variant: "secondary", size: "md", iconStart: "search", href: body.search.path }, labels.browseListings),
      ),
    ),
    h(
      "section",
      { className: "ab-story", "aria-labelledby": "about-story-title" },
      h("h2", { id: "about-story-title" }, body.story.title),
      ...body.story.paragraphs.map((paragraph, index) => h("p", { key: index }, paragraph)),
    ),
    h(
      "section",
      { className: "ab-offices", "aria-labelledby": "about-offices-title", "data-about-offices": "true" },
      h("h2", { id: "about-offices-title" }, body.offices.title),
      h("p", { className: "ab-lede" }, body.offices.intro),
      h(
        "ul",
        { className: "ab-offices__grid" },
        ...body.offices.items.map((office) =>
          h(
            "li",
            { key: office.id, className: "mk-card mk-card--pad-md ab-office", "data-about-office": office.id },
            h(
              "p",
              { className: "ab-office__head" },
              h(Icon, { name: "building-2", size: 18 }),
              h("span", { className: "ab-office__town" }, office.town),
            ),
            h("p", { className: "ab-office__role" }, office.role),
            h("p", { className: "ab-office__note" }, office.note),
          ),
        ),
      ),
    ),
    h(
      "section",
      { className: "ab-pillars", "aria-labelledby": "about-pillars-title", "data-about-pillars": "true" },
      h("h2", { id: "about-pillars-title" }, body.pillars.title),
      h("p", { className: "ab-lede" }, body.pillars.intro),
      h(
        "dl",
        { className: "ab-pillars__list" },
        ...body.pillars.items.map((pillar) =>
          h(
            "div",
            { key: pillar.id, className: "ab-pillar", "data-about-pillar": pillar.id },
            h("dt", null, h(Icon, { name: pillar.icon, size: 18 }), h("span", null, pillar.title)),
            h("dd", null, pillar.text),
          ),
        ),
      ),
    ),
    h(
      "section",
      {
        className: "ab-team",
        "aria-labelledby": "about-team-title",
        "data-about-team": "true",
        "data-about-team-available": team.available ? "true" : "false",
        "data-about-team-count": String(team.profiles.length),
      },
      h("h2", { id: "about-team-title" }, team.title),
      h("p", { className: "ab-lede" }, team.intro),
      team.empty
        ? h(
            "div",
            {
              className: "ab-team__empty",
              "data-about-team-empty": "true",
              "data-about-team-reason": team.empty.reason,
              "data-about-team-source": team.empty.source,
            },
            h("span", { className: "ab-team__empty-icon", "aria-hidden": "true" }, h(Icon, { name: "users", size: 26 })),
            h(
              "div",
              null,
              h("p", { className: "ab-team__empty-title" }, team.empty.title),
              h("p", { className: "ab-team__empty-text" }, team.empty.text),
              h("p", { className: "ab-team__empty-fields" }, team.empty.fields),
              h(Btn, { tag: "a", variant: "secondary", size: "md", iconStart: "phone", href: contact.channels.phone.href }, contact.channels.phone.label),
            ),
          )
        : h(
            "ul",
            { className: "ab-team__grid" },
            ...team.profiles.map((profile) =>
              h(
                "li",
                { key: profile.profile_key, className: "mk-card mk-card--pad-md ab-member", "data-about-team-member": profile.profile_key },
                // A face is shown only when the photo itself was approved.
                // Otherwise the card carries initials, never a borrowed image.
                profile.photo
                  ? h("img", {
                      className: "ab-member__photo",
                      src: profile.photo.url,
                      alt: profile.photo.alt || profile.name,
                      loading: "lazy",
                      decoding: "async",
                    })
                  : h(
                      "span",
                      { className: "ab-member__photo ab-member__photo--pending", "data-about-team-photo": "not_approved", "aria-hidden": "true" },
                      String(profile.name || "")
                        .split(/\s+/u)
                        .slice(0, 2)
                        .map((part) => part.charAt(0))
                        .join(""),
                    ),
                h("p", { className: "ab-member__name" }, profile.name),
                h("p", { className: "ab-member__role" }, profile.role),
                profile.office ? h("p", { className: "ab-member__office" }, profile.office) : null,
                profile.languages?.length ? h("p", { className: "ab-member__languages" }, profile.languages.join(", ")) : null,
                profile.bio ? h("p", { className: "ab-member__bio" }, profile.bio) : null,
                profile.licence
                  ? h(
                      "p",
                      { className: "ab-member__licence", "data-about-team-licence": "true" },
                      [profile.licence.reference, profile.licence.authority].filter(Boolean).join(" · "),
                    )
                  : null,
              ),
            ),
          ),
    ),
    h(
      "section",
      { className: "ab-contact", "aria-labelledby": "about-contact-title" },
      h("h2", { id: "about-contact-title" }, contact.title),
      h("p", { className: "ab-lede" }, contact.text),
      h(
        "div",
        { className: "ab-contact__actions" },
        h(Btn, { tag: "a", variant: "accent", size: "lg", iconStart: "phone", href: contact.channels.phone.href }, contact.channels.phone.label),
        h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "message-circle", href: contact.channels.whatsapp.href }, contact.channels.whatsapp.label),
        h(Btn, { tag: "a", variant: "secondary", size: "lg", iconStart: "mail", href: contact.channels.email.href }, contact.channels.email.label),
      ),
    ),
  );
  return shell(page, main);
}

function AlertsBody({ page }) {
  const body = page.body;
  const copy = body.copy;
  const contact = body.contact;
  const labels = uiLabels(page);
  const controlNote = "alerts-controls-note";

  // The managed record. Filled by the client from GET
  // /api/saved-searches/manage when the visitor arrives on their capability
  // link; a refused token renders the same "no valid link" state as no token
  // at all, so the page never confirms whether a saved search exists.
  const managed = h(
    "section",
    {
      className: "al-managed",
      "data-alerts-managed": "true",
      hidden: true,
      "aria-labelledby": "alerts-managed-title",
    },
    h(
      "div",
      { className: "al-managed__head" },
      h("h2", { id: "alerts-managed-title" }, copy.linkTitle),
      h(
        "span",
        { className: "mk-badge mk-badge--neutral mk-badge--sm al-managed__status", "data-alert-status": "true", "data-status-active": copy.statusActive, "data-status-paused": copy.statusPaused },
        copy.statusActive,
      ),
    ),
    h("p", { className: "al-managed__intro" }, copy.linkIntro),
    h("h3", { className: "al-managed__criteria", "data-alert-title": "true" }),
    h(
      "dl",
      { className: "al-item__facts" },
      h("div", null, h("dt", null, copy.frequency), h("dd", { "data-alert-frequency": "true" })),
      h("div", null, h("dt", null, copy.channel), h("dd", { "data-alert-channel": "true" })),
      h("div", null, h("dt", null, copy.matchesNow), h("dd", { "data-alert-matches": "true" })),
      h("div", null, h("dt", null, copy.nextAlert), h("dd", null, h("time", { "data-alert-next": "true" }))),
      h("div", null, h("dt", null, copy.requested), h("dd", null, h("time", { "data-alert-date": "true" }))),
    ),
    h(
      "div",
      { className: "al-managed__controls" },
      h(
        "a",
        { className: "mk-btn mk-btn--secondary mk-btn--md", "data-alert-open": "true", href: body.search.path },
        h(Icon, { name: "search", size: 16 }),
        h("span", null, copy.openSearch),
      ),
      ...body.controls.map((control) =>
        h(
          "button",
          {
            key: control.id,
            type: "button",
            className: `mk-btn mk-btn--${control.id === "delete" ? "ghost" : "secondary"} mk-btn--md`,
            "data-alert-action": control.id,
            "data-alert-confirm": control.id === "delete" ? copy.deleteConfirm : undefined,
            hidden: control.id === "resume" ? true : undefined,
          },
          h(Icon, { name: control.icon, size: 16 }),
          h("span", null, control.label),
        ),
      ),
    ),
    h(
      "div",
      { className: "al-managed__tune" },
      h(
        "label",
        { className: "al-managed__field" },
        h("span", null, copy.changeFrequency),
        h(
          "select",
          { "data-alert-frequency-select": "true" },
          ...body.manage.frequencies.map((value) => h("option", { key: value, value }, body.frequencies[value] || value)),
        ),
      ),
      h(
        "label",
        { className: "al-managed__field", "data-alert-channel-field": "true", hidden: true },
        h("span", null, copy.changeChannel),
        h("select", { "data-alert-channel-select": "true" }),
      ),
    ),
    h(
      "p",
      {
        className: "al-managed__status-line",
        "data-alert-feedback": "true",
        role: "status",
        "aria-live": "polite",
        "data-saving": copy.saving,
        "data-saved": copy.savedChange,
        "data-failed": copy.failedChange,
        "data-deleted": copy.deleted,
      },
    ),
    h("p", { className: "al-managed__expiry" }, h("span", null, `${copy.linkExpires} `), h("time", { "data-alert-expires": "true" })),
  );

  // A refused, expired or unknown token is one indistinguishable state.
  const linkInvalid = h(
    "section",
    { className: "al-fallback al-fallback--invalid", "data-alerts-link-invalid": "true", hidden: true, "aria-labelledby": "alerts-invalid-title" },
    h(Icon, { name: "triangle-alert", size: 20 }),
    h(
      "div",
      null,
      h("h2", { id: "alerts-invalid-title" }, copy.linkInvalidTitle),
      h("p", null, copy.linkInvalidText),
      h(Btn, { tag: "a", variant: "secondary", size: "md", iconStart: "search", href: body.search.path }, body.search.label),
    ),
  );

  // Searches this browser recorded at save time. Their controls stay disabled:
  // without the capability link the site cannot prove who asked for the alert.
  const rowTemplate = h(
    "template",
    { "data-alerts-row-template": "true" },
    h(
      "li",
      { className: "al-item", "data-alert-item": "true" },
      h("div", { className: "al-item__head" }, h("h3", { className: "al-item__title", "data-alert-title": "true" })),
      h(
        "dl",
        { className: "al-item__facts" },
        h("div", { className: "al-item__facts-wide" }, h("dt", null, copy.criteria), h("dd", { "data-alert-criteria": "true" })),
        h("div", null, h("dt", null, copy.frequency), h("dd", { "data-alert-frequency": "true" })),
        h("div", null, h("dt", null, copy.channel), h("dd", { "data-alert-channel": "true" })),
        h("div", null, h("dt", null, copy.requested), h("dd", null, h("time", { "data-alert-date": "true" }))),
      ),
      h(
        "div",
        { className: "al-item__actions" },
        h(
          "a",
          { className: "mk-btn mk-btn--secondary mk-btn--sm", "data-alert-open": "true", href: body.search.path },
          h(Icon, { name: "search", size: 16 }),
          h("span", null, copy.openSearch),
        ),
        ...body.controls.map((control) =>
          h(
            "button",
            {
              key: control.id,
              type: "button",
              className: "mk-btn mk-btn--ghost mk-btn--sm",
              disabled: true,
              "aria-disabled": "true",
              "aria-describedby": controlNote,
              "data-alert-control": control.id,
            },
            h(Icon, { name: control.icon, size: 16 }),
            h("span", null, control.label),
          ),
        ),
      ),
    ),
  );

  const main = h(
    "main",
    {
      id: "main",
      tabIndex: -1,
      className: "al-page",
      "data-kind": "alerts",
      "data-react-public-ui": "alerts",
      "data-alerts-page": "true",
      "data-alerts-storage-key": body.storage_key,
      "data-alerts-endpoint": body.create.endpoint,
      "data-alerts-manage-endpoint": body.manage.endpoint,
      "data-alerts-token-param": body.manage.token_param,
      // Localised labels the client needs to name a stored record without a
      // lookup table of its own.
      "data-alerts-frequencies": JSON.stringify(body.frequencies),
      "data-alerts-channels": JSON.stringify(body.channels),
      "data-alerts-any": copy.anyCriteria,
      "data-alerts-filter-labels": JSON.stringify(body.filter_labels),
      "data-alerts-search-path": body.search.path,
      "data-min-touch-target": "44",
    },
    h("header", { className: "al-head" }, h("h1", null, body.h1), h("p", { className: "al-head__intro" }, body.intro)),
    managed,
    linkInvalid,
    h(
      "section",
      { className: "al-notice", "data-alerts-link-explainer": "true", "aria-labelledby": "alerts-notice-title" },
      h("h2", { id: "alerts-notice-title" }, copy.notConnectedTitle),
      h("p", null, copy.notConnectedText),
      h(Btn, { tag: "a", variant: "secondary", size: "md", iconStart: "message-circle", href: contact.path }, contact.label),
    ),
    h(
      "section",
      { className: "al-fallback", "data-alerts-fallback": "true", "aria-labelledby": "alerts-fallback-title" },
      h(Icon, { name: "info", size: 20 }),
      h(
        "div",
        null,
        h("h2", { id: "alerts-fallback-title" }, copy.fallbackTitle),
        h("p", null, copy.fallbackText),
        h(Btn, { tag: "a", variant: "primary", size: "md", iconStart: "search", href: body.search.path }, body.search.label),
      ),
    ),
    h(
      "section",
      { className: "al-empty", "data-alerts-empty": "true", "aria-live": "polite", hidden: true },
      h("span", { className: "al-empty__icon", "aria-hidden": "true" }, h(Icon, { name: "bell", size: 30 })),
      h("h2", null, copy.emptyTitle),
      h("p", null, copy.emptyText),
      h(Btn, { tag: "a", variant: "primary", size: "md", iconStart: "search", href: body.search.path }, copy.emptyCta),
    ),
    h(
      "section",
      { className: "al-listing", "data-alerts-region": "true", hidden: true, "aria-labelledby": "alerts-list-title" },
      h("h2", { id: "alerts-list-title" }, copy.localTitle),
      h("p", { className: "al-lede" }, copy.localIntro),
      h("p", { className: "al-device", "data-alerts-device-note": "true" }, h(Icon, { name: "shield-check", size: 16 }), h("span", null, copy.deviceNote)),
      h("ul", { className: "al-list", "data-alerts-list": "true" }),
      h("p", { className: "al-controls-note", id: controlNote }, copy.localControlsNote),
    ),
    rowTemplate,
    h(
      "section",
      { className: "al-contact", "aria-labelledby": "alerts-contact-title" },
      h("h2", { id: "alerts-contact-title" }, copy.contactTitle),
      h("p", null, copy.contactText),
      h(
        "div",
        { className: "al-contact__actions" },
        h(Btn, { tag: "a", variant: "accent", size: "md", iconStart: "phone", href: contact.phone.href }, contact.phone.label),
        h(Btn, { tag: "a", variant: "secondary", size: "md", iconStart: "message-circle", href: contact.path }, contact.label),
      ),
    ),
    labels ? null : null,
  );
  return shell(page, main);
}

export function renderReactPublicBody(page) {
  if (page.kind === "home") return renderStaticElement(h(HomeBody, { page }));
  if (page.kind === "search") return renderStaticElement(h(SearchBody, { page }));
  if (page.kind === "listing") return renderStaticElement(h(ListingBody, { page }));
  if (page.kind === "location") return renderStaticElement(h(LocationBody, { page }));
  if (page.kind === "seller") return renderStaticElement(h(SellerBody, { page }));
  if (page.kind === "start") return renderStaticElement(h(StartBody, { page }));
  if (page.kind === "compare") return renderStaticElement(h(CompareBody, { page }));
  if (page.kind === "about") return renderStaticElement(h(AboutBody, { page }));
  if (page.kind === "alerts") return renderStaticElement(h(AlertsBody, { page }));
  if (page.kind === "contact") return renderStaticElement(h(ContactBody, { page }));
  if (page.kind === "search_unavailable") return renderStaticElement(h(SearchUnavailableBody, { page }));
  if (page.kind === "language_fallback") return renderStaticElement(h(LanguageFallbackBody, { page }));
  if (page.kind === "guide") return renderStaticElement(h(GuideBody, { page }));
  if (page.kind === "legacy_archive") return renderStaticElement(h(LegacyArchiveBody, { page }));
  if (page.kind === "listing_preservation") return renderStaticElement(h(ListingPreservationBody, { page }));
  if (page.kind === "not_found" && page.chrome) return renderStaticElement(h(NotFoundBody, { page }));
  return "";
}
