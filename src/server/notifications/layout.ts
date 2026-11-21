// The one HTML and plain-text layout of every service notice (ADR 0014). Brand tokens from
// design/tokens.json (canvas, surface, text, muted text, divider, action), Noto Sans with safe
// fallbacks, one accent (the 44 px button), `lang` and `dir` per locale, readable at 320 px.
import "server-only";
import { agency, isRtlLocale } from "@/config/tenant";

export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export interface NoticeLayout {
  readonly locale: string;
  /** The e-mail subject, also the document title. */
  readonly subject: string;
  /** What changed, in one line. */
  readonly headline: string;
  /** What is new beyond the headline, one job per paragraph. */
  readonly paragraphs: readonly string[];
  /** An optional secondary link, shown before the button. */
  readonly link?: { readonly label: string; readonly url: string };
  /** The button: names the page it opens. */
  readonly action: { readonly label: string; readonly url: string };
  readonly reference: { readonly label: string; readonly value: string };
  readonly footer: string;
  readonly footerLink?: { readonly label: string; readonly url: string };
}

/** The plain-text part carries everything the HTML part does, in the same order. */
export function noticeText(n: NoticeLayout): string {
  return [
    n.headline,
    "",
    ...n.paragraphs,
    ...(n.link ? [`${n.link.label}: ${n.link.url}`] : []),
    "",
    `${n.action.label}: ${n.action.url}`,
    "",
    `${n.reference.label}: ${n.reference.value}`,
    "",
    "--",
    n.footer,
    ...(n.footerLink ? [`${n.footerLink.label}: ${n.footerLink.url}`] : []),
    agency.name,
  ].join("\n");
}

export function noticeHtml(n: NoticeLayout): string {
  const rtl = isRtlLocale(n.locale);
  const dir = rtl ? "rtl" : "ltr";
  const start = rtl ? "right" : "left";
  const ltr = (value: string) => `<bdi dir="ltr">${escapeHtml(value)}</bdi>`;
  const font = "'Noto Sans','Noto Sans Hebrew',Arial,Helvetica,sans-serif";
  const para = "margin:0 0 16px;font-size:16px;line-height:24px;color:#192e27";
  const small = "margin:0 0 8px;font-size:14px;line-height:20px;color:#52625a";
  const link = "color:#214f3c;text-decoration:underline";
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(n.locale)}" dir="${dir}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<title>${escapeHtml(n.subject)}</title>`,
    "</head>",
    `<body dir="${dir}" style="margin:0;padding:0;background:#f8f7f3;font-family:${font};text-align:${start}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f3"><tr><td align="center" style="padding:24px 12px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d9dfd8;border-radius:8px"><tr><td dir="${dir}" style="padding:28px 24px;text-align:${start}">`,
    `<p style="margin:0 0 20px;font-size:15px;line-height:20px;font-weight:700;color:#214f3c">${escapeHtml(agency.name)}</p>`,
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:#192e27">${escapeHtml(n.headline)}</h1>`,
    ...n.paragraphs.map((text) => `<p style="${para}">${escapeHtml(text)}</p>`),
    ...(n.link
      ? [
          `<p style="${para}"><a href="${escapeHtml(n.link.url)}" style="${link}">${escapeHtml(n.link.label)}</a></p>`,
        ]
      : []),
    // The one accent: a 44 px touch target that names the page it opens.
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:#214f3c;border-radius:6px">`,
    `<a href="${escapeHtml(n.action.url)}" style="display:inline-block;min-height:44px;box-sizing:border-box;padding:12px 22px;font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(n.action.label)}</a>`,
    "</td></tr></table>",
    `<p style="${small}">${escapeHtml(n.reference.label)}: ${ltr(n.reference.value)}</p>`,
    `<hr style="border:0;border-top:1px solid #d9dfd8;margin:20px 0">`,
    `<p style="${small}">${escapeHtml(n.footer)}</p>`,
    ...(n.footerLink
      ? [
          `<p style="${small}"><a href="${escapeHtml(n.footerLink.url)}" style="${link};color:#52625a">${escapeHtml(n.footerLink.label)}</a></p>`,
        ]
      : []),
    "</td></tr></table>",
    "</td></tr></table>",
    "</body></html>",
  ].join("\n");
}
