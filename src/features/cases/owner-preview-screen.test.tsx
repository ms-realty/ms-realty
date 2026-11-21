// C12 / AT18: synthetic source facts rendered by the current server component. Shell and
// persistence boundaries are mocked; the fact renderer, labels and formatters are real.
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { areaBases, priceBases } from "@/domain/facts";
import { currencyCodes, type PublicLocale, publicLocales } from "@/domain/ids";
import { representationScopes } from "@/domain/seller-instruction";
import { displayLocale, localeDirection } from "@/i18n/config";
import { factFieldLabel } from "@/i18n/fact-labels";
import { workflowCopy } from "@/i18n/workflow-copy";
import type { Session } from "@/server/auth/sessions";
import { getOwnerPreview } from "@/server/cases/owner-preview";
import { discoveryCopy } from "../discovery/copy";
import { OwnerPreviewScreen } from "./owner-preview-screen";

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/cases/owner-preview", () => ({ getOwnerPreview: vi.fn() }));
vi.mock("./screens", () => ({
  workflowLink: "",
  WorkflowPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  WorkflowSection: ({ children, title }: { children: ReactNode; title: string }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  BoundWorkflowForm: ({ values }: { values: Record<string, string> }) => (
    <form>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </form>
  ),
}));

type Preview = Awaited<ReturnType<typeof getOwnerPreview>>;
const session: Session = {
  id: "synthetic-session",
  account: { kind: "client", id: "synthetic-client" },
  actor: { kind: "client", id: "synthetic-client" },
  createdAt: new Date(0),
  lastSeenAt: new Date(0),
  expiresAt: new Date(1),
  reverifiedAt: null,
};

function fixture(): Preview {
  return {
    caseId: "synthetic-case",
    caseReference: "CS-SYNTHETIC-0042",
    caseVersion: 1,
    reference: "MS-SYNTHETIC-0042",
    revision: 1,
    hash: "synthetic-source-hash",
    sourceLanguage: "bg",
    title: "Синтетичен имот MS-SYNTHETIC-0042",
    description: "Синтетичен пример (площ 85,25 m²).",
    location: {
      country: "BG",
      region: null,
      municipality: null,
      settlement: "Синтетично място",
      neighborhood: null,
      precision: "settlement",
    },
    terms: [],
    facts: [],
    media: [],
    instruction: {
      reference: "SI-SYNTHETIC-0042",
      revision: 1,
      scope: "sale",
      commissionTerms: "Синтетични условия.",
      mediaUsageRights: { granted: true },
      publicationPermission: true,
    },
    acknowledged: false,
  };
}

async function preview(view: Preview, locale: string) {
  vi.mocked(getOwnerPreview).mockResolvedValue(view);
  return render(
    <div lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
      {await OwnerPreviewScreen({ locale, session, id: view.caseId, reference: view.reference })}
    </div>,
  );
}

const number = (locale: PublicLocale, value: number) =>
  new Intl.NumberFormat(displayLocale(locale), { maximumFractionDigits: 20 }).format(value);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe.each(publicLocales)("C12 / AT18 owner source facts in %s", (locale) => {
  it.each(representationScopes)(
    "renders %s representation without changing source authority or prose",
    async (scope) => {
      const view = fixture();
      view.instruction.scope = scope;
      view.instruction.mediaUsageRights = { granted: true, scope: "Synthetic source media terms" };
      const before = structuredClone(view);
      const { container } = await preview(view, locale);
      const labels = workflowCopy(locale, "ownerPreviewValues");
      expect(new Set(representationScopes.map((scope) => labels[scope])).size).toBe(3);
      expect(screen.getByText(labels[scope], { exact: true })).toBeVisible();
      expect(
        screen.getByText(view.instruction.commissionTerms ?? "", { exact: true }),
      ).toBeVisible();
      expect(container.textContent).toContain("Synthetic source media terms");
      expect(container.querySelector('[name="previewHash"]')).toHaveValue(before.hash);
      expect(view).toEqual(before);
    },
  );

  it.each(currencyCodes)(
    "retains fractional %s price, period, basis and inclusions",
    async (currency) => {
      const view = fixture();
      view.terms = [
        {
          key: "price",
          state: "known",
          value: {
            amountMinor: 123450,
            currency,
            period: "month",
            basis: "asking",
            inclusions: ["Synthetic included parking", "Synthetic storage"],
          },
          unit: null,
          basis: null,
        },
      ];
      const before = structuredClone(view);
      const { container } = await preview(view, locale);
      const value = container.querySelector("dd");
      const money = new Intl.NumberFormat(displayLocale(locale), {
        style: "currency",
        currency,
        // Four-digit amounts keep their separator in every locale (formatMoney).
        useGrouping: "always",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(1234.5);
      const labels = workflowCopy(locale, "ownerPreviewValues");
      expect(value?.textContent).toBe(
        `${money} / ${labels.month} · ${labels.asking} · Synthetic included parking, Synthetic storage`,
      );
      expect(value?.querySelector("bdi")?.textContent).toBe(money);
      expect(container.querySelector('[name="previewHash"]')).toHaveValue(before.hash);
      expect(container.querySelector('[name="reference"]')).toHaveValue(before.reference);
      expect(view).toEqual(before);
    },
  );

  it.each(["structured", "primitive"])(
    "preserves every %s area basis and source precision",
    async (shape) => {
      const view = fixture();
      const area = 85.25678901234566;
      view.facts = areaBases.map((basis) => ({
        key: `area.${basis}`,
        state: "known",
        value: shape === "structured" ? { value: area, unit: "m2", basis } : area,
        unit: "m2",
        basis,
      }));
      const before = structuredClone(view);
      const { container } = await preview(view, locale);
      const rows = container.querySelectorAll("dl > div");
      expect(rows).toHaveLength(areaBases.length);
      for (const [index, basis] of areaBases.entries()) {
        const label = factFieldLabel(`area.${basis}`, locale);
        expect(rows[index]?.querySelector("dt")?.textContent).toBe(label);
        expect(rows[index]?.querySelector("dd")?.textContent).toBe(
          `${number(locale, area)}\u00a0m² · ${label}`,
        );
        expect(rows[index]?.querySelector("dd bdi")?.textContent).toBe(
          `${number(locale, area)}\u00a0m²`,
        );
        expect(rows[index]?.querySelector("dd bdi")).toHaveAttribute("dir", "ltr");
      }
      expect(factFieldLabel("area.living", locale)).not.toBe(factFieldLabel("area.usable", locale));
      expect(view).toEqual(before);
    },
  );

  it.each(priceBases)(
    "keeps %s total pricing, unknown states and other numeric precision distinct",
    async (basis) => {
      const view = fixture();
      view.terms = [
        {
          key: "price",
          state: "known",
          value: { amountMinor: 123450, currency: "EUR", period: "total", basis },
          unit: null,
          basis: null,
        },
      ];
      view.facts = [
        {
          key: "additional.numeric",
          state: "known",
          value: 123.45678901234567,
          unit: "cm",
          basis: null,
        },
        { key: "area.living", state: "not_supplied", value: null, unit: "m2", basis: "living" },
        { key: "area.usable", state: "not_applicable", value: null, unit: "m2", basis: "usable" },
      ];
      const { container } = await preview(view, locale);
      const values = container.querySelectorAll("dd");
      const labels = workflowCopy(locale, "ownerPreviewValues");
      expect(values[0]?.textContent).toContain(
        ` · ${basis === "asking" ? labels.asking : discoveryCopy(locale)[basis]}`,
      );
      expect(values[0]?.textContent).not.toContain(` / ${labels.month}`);
      expect(values[1]?.textContent).toBe(`${number(locale, 123.45678901234567)} cm`);
      expect(values[2]?.textContent).toBe(discoveryCopy(locale).not_supplied);
      expect(values[3]?.textContent).toBe(labels.not_applicable);
      expect(values[2]?.querySelector("bdi")).toBeNull();
      expect(values[3]?.querySelector("bdi")).toBeNull();
    },
  );

  it("keeps Bulgarian source direction and resolves technical revision through the catalog", async () => {
    const view = fixture();
    const { container } = await preview(view, locale);
    const source = container.querySelector('section > div[lang="bg"]');
    expect(source).toHaveAttribute("dir", "ltr");
    expect(source?.querySelector("p")?.textContent).toBe(view.description);
    expect(container.querySelector(`div[lang="${locale}"]`)).toHaveAttribute(
      "dir",
      localeDirection(locale),
    );
    screen.getByText(workflowCopy(locale, "ownerPreview").technical).click();
    expect(container.querySelector("details p")?.textContent).toBe(
      `${workflowCopy(locale, "cases").revision} ${number(locale, view.revision)}`,
    );
  });
});

it("C12 normalizes unsupported locale labels and numeric presentation to the workflow English fallback", async () => {
  const view = fixture();
  view.facts = [
    { key: "area.living", state: "known", value: 123.456, unit: "m2", basis: "living" },
  ];
  const { container } = await preview(view, "unsupported");
  expect(container.querySelector("dt")?.textContent).toBe(factFieldLabel("area.living", "en"));
  expect(container.querySelector("dd")?.textContent).toBe("123.456\u00a0m² · Living area");
});

it.each([
  { amountMinor: 123450, currency: "JPY" },
  { amountMinor: 123.5, currency: "EUR" },
  { amountMinor: -123450, currency: "USD" },
])(
  "C12 does not reinterpret out-of-domain money as a supported source amount: %j",
  async (value) => {
    const view = fixture();
    view.terms = [{ key: "price", state: "known", value, unit: null, basis: null }];
    const before = structuredClone(view);
    const { container } = await preview(view, "de");
    expect(container.querySelector("dd")?.textContent).toContain(number("de", value.amountMinor));
    expect(container.querySelector("dd")?.textContent).toContain(value.currency);
    expect(view).toEqual(before);
  },
);
