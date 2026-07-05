# LangSwitcher

The approved-locale language switcher — “we speak your language” is the brand's core promise, so this sits in the site header on every page. Globe + current code; the menu lists each language in its **own** name.

```jsx
const [lang, setLang] = React.useState('EN');

<LangSwitcher value={lang} onChange={setLang} />
<LangSwitcher value={lang} onChange={setLang} onDark />   {/* Ink footer / dark chrome */}
```

- Defaults to the seeded public website locales (BG EN DE NL RU EL HE) with native names — do not trim the list without a locale-registry reason.
- Menu labels are native names (Deutsch, Русский), never translated names.
- Preserve native-script labels and direction, including Hebrew RTL.
- Place at the far right of the header, before the CTA; `onDark` in the footer.
