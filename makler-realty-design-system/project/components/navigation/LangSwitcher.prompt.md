# LangSwitcher

The five-language switcher — “we speak your language” is the brand's core promise, so this sits in the site header on every page. Globe + current code; the menu lists each language in its **own** name.

```jsx
const [lang, setLang] = React.useState('EN');

<LangSwitcher value={lang} onChange={setLang} />
<LangSwitcher value={lang} onChange={setLang} onDark />   {/* Ink footer / dark chrome */}
```

- Defaults to all five brand languages (BG EN DE NL RU) with native names — don't trim the list without reason.
- Menu labels are native names (Deutsch, Русский), never translated names.
- Place at the far right of the header, before the CTA; `onDark` in the footer.
