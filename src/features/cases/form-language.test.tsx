import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { formFields } from "@/ui/form/contract";
import { WorkflowForm } from "./form";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const languages = [
  {
    locale: "bg",
    error: "Има проблем",
    pending: "Записване…",
    reapply: "Прилагане на прегледаните промени",
    draft: "Вашата чернова",
    latest: "Последна стойност",
    revision: "Версия",
    reference: "Номер",
    recorded: "Записано на",
    unknown: "Непотвърден резултат",
    retained:
      "Стойностите по-долу са вашата чернова. Те не потвърждават, че промяната е записана. Използвайте връзката по-долу, за да проверите същата заявка преди нов опит.",
  },
  {
    locale: "en",
    error: "There is a problem",
    pending: "Recording…",
    reapply: "Apply my reviewed changes",
    draft: "Your draft",
    latest: "Latest value",
    revision: "Revision",
    reference: "Reference",
    recorded: "Recorded at",
    unknown: "Result not confirmed",
    retained:
      "The values below are your draft. They do not confirm that anything was saved. Use the link below to check this same request before trying again.",
  },
  {
    locale: "ru",
    error: "Возникла проблема",
    pending: "Запись…",
    reapply: "Применить проверенные изменения",
    draft: "Ваш черновик",
    latest: "Последнее значение",
    revision: "Версия",
    reference: "Номер",
    recorded: "Записано",
    unknown: "Результат не подтверждён",
    retained:
      "Значения ниже — ваш черновик. Они не подтверждают, что изменение записано. Используйте ссылку ниже, чтобы проверить тот же запрос перед новой попыткой.",
  },
  {
    locale: "de",
    error: "Es gibt ein Problem",
    pending: "Wird gespeichert…",
    reapply: "Meine geprüften Änderungen anwenden",
    draft: "Ihr Entwurf",
    latest: "Aktueller Wert",
    revision: "Version",
    reference: "Referenz",
    recorded: "Gespeichert am",
    unknown: "Ergebnis nicht bestätigt",
    retained:
      "Die unten stehenden Werte sind Ihr Entwurf. Sie bestätigen nicht, dass etwas gespeichert wurde. Prüfen Sie über den Link unten dieselbe Anfrage, bevor Sie es erneut versuchen.",
  },
  {
    locale: "nl",
    error: "Er is een probleem",
    pending: "Bezig met opslaan…",
    reapply: "Mijn gecontroleerde wijzigingen toepassen",
    draft: "Uw concept",
    latest: "Laatste waarde",
    revision: "Versie",
    reference: "Referentie",
    recorded: "Opgeslagen op",
    unknown: "Resultaat niet bevestigd",
    retained:
      "De waarden hieronder vormen uw concept. Ze bevestigen niet dat er iets is opgeslagen. Controleer via de onderstaande link hetzelfde verzoek voordat u het opnieuw probeert.",
  },
  {
    locale: "el",
    error: "Υπάρχει πρόβλημα",
    pending: "Γίνεται αποθήκευση…",
    reapply: "Εφαρμογή των αλλαγών που έλεγξα",
    draft: "Το πρόχειρό σας",
    latest: "Τρέχουσα τιμή",
    revision: "Έκδοση",
    reference: "Αριθμός αναφοράς",
    recorded: "Αποθηκεύτηκε στις",
    unknown: "Το αποτέλεσμα δεν επιβεβαιώθηκε",
    retained:
      "Οι παρακάτω τιμές είναι το πρόχειρό σας. Δεν επιβεβαιώνουν ότι αποθηκεύτηκε κάτι. Χρησιμοποιήστε τον παρακάτω σύνδεσμο για να ελέγξετε το ίδιο αίτημα πριν δοκιμάσετε ξανά.",
  },
  {
    locale: "he",
    error: "יש בעיה",
    pending: "מתבצע רישום…",
    reapply: "החלת השינויים שבדקתי",
    draft: "הטיוטה שלכם",
    latest: "הערך העדכני",
    revision: "גרסה",
    reference: "מספר אסמכתה",
    recorded: "נרשם בתאריך",
    unknown: "התוצאה לא אושרה",
    retained:
      "הערכים שלהלן הם הטיוטה שלכם. הם אינם מאשרים שדבר כלשהו נשמר. השתמשו בקישור למטה כדי לבדוק את אותה בקשה לפני ניסיון נוסף.",
  },
] as const;

const initial: FormState<FormValues> = {
  operationId: "synthetic-original-operation",
  expectedRevision: 1,
  responseId: "initial",
  values: { note: "Exact source draft / MS-00123 / 123,456.79 EUR" },
  outcome: { kind: "idle" },
};
function mount(
  locale: string,
  state = initial,
  action: FormAction<FormValues> = async (state) => state,
) {
  return render(
    <WorkflowForm
      locale={locale}
      action={action}
      initialState={state}
      fields={[{ name: "note", label: "Synthetic source field", type: "textarea" }]}
      path={`/${locale}/overview/synthetic-case`}
      status={{ href: "/status/synthetic-original-operation", label: "Synthetic status link" }}
      submit="Synthetic submit"
    />,
  );
}

it.each(languages)(
  "C01 / S11–S17 renders $locale validation and pending feedback",
  async (copy) => {
    let finish!: (state: FormState<FormValues>) => void;
    const pending = new Promise<FormState<FormValues>>((resolve) => {
      finish = resolve;
    });
    const action = vi.fn<FormAction<FormValues>>(() => pending);
    const state: FormState<FormValues> = {
      ...initial,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: "Synthetic field review",
        fieldErrors: { note: ["Synthetic field issue"] },
      },
    };
    mount(copy.locale, state, action);
    expect(screen.getByRole("heading", { name: copy.error })).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveValue(initial.values.note);
    await userEvent.click(screen.getByRole("button", { name: "Synthetic submit" }));
    expect(screen.getByRole("button", { name: copy.pending })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(action.mock.calls[0]?.[1].get("note")).toBe(initial.values.note);
    await act(async () => finish(state));
  },
);

it.each(languages)("C01 / S16 keeps the $locale conflict review explicit", async (copy) => {
  const action = vi.fn<FormAction<FormValues>>(async (state) => state);
  const { container } = mount(
    copy.locale,
    {
      ...initial,
      outcome: {
        kind: "conflict",
        code: "REVISION_CONFLICT",
        message: "Synthetic conflict review",
        latest: { revision: 2, values: { note: "Exact latest source note" } },
        reapply: {
          operationId: "synthetic-reviewed-operation",
          expectedRevision: 2,
          status: { href: "/status/synthetic-reviewed-operation", label: "Synthetic status link" },
        },
      },
    },
    action,
  );
  expect(screen.getByText(`${copy.draft}: ${initial.values.note}`)).toBeVisible();
  expect(screen.getByText(`${copy.latest}: Exact latest source note`)).toBeVisible();
  expect(container.textContent).toContain(`${copy.revision}: 2`);
  expect(action).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: copy.reapply }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0]?.[1].get(formFields.intent)).toBe("reapply");
  expect(action.mock.calls[0]?.[1].get(formFields.reapplyOperationId)).toBe(
    "synthetic-reviewed-operation",
  );
  expect(action.mock.calls[0]?.[1].get(formFields.reapplyRevision)).toBe("2");
  expect(action.mock.calls[0]?.[1].get("note")).toBe(initial.values.note);
});

it.each(languages)(
  "C01 / S17 renders $locale receipt labels without rewriting the reference",
  (copy) => {
    mount(copy.locale, {
      ...initial,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: "Synthetic receipt",
          reference: "SYNTHETIC-CASE-123",
          recordedAt: { dateTime: new Date(0).toISOString(), label: "Synthetic recorded instant" },
          nextStep: "Synthetic next step",
          destination: { href: "/synthetic-record", label: "Synthetic destination" },
        },
      },
    });
    expect(screen.getByText(copy.reference)).toBeVisible();
    expect(screen.getByText(copy.recorded)).toBeVisible();
    expect(screen.getByText("SYNTHETIC-CASE-123")).toBeVisible();
    expect(screen.getByText("Synthetic recorded instant")).toBeVisible();
    expect(screen.getByRole("link", { name: "Synthetic destination" })).toHaveAttribute(
      "href",
      "/synthetic-record",
    );
  },
);

it.each(languages)(
  "C01 / S15 retains the exact $locale draft and request after a lost response",
  async (copy) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const action = vi.fn<FormAction<FormValues>>(async () => {
      throw new Error("Synthetic lost response");
    });
    mount(copy.locale, initial, action);
    await userEvent.click(screen.getByRole("button", { name: "Synthetic submit" }));
    expect(await screen.findByText(copy.unknown)).toBeVisible();
    expect(screen.getByText(copy.retained)).toBeVisible();
    expect(screen.getByText(initial.values.note ?? "")).toBeVisible();
    expect(screen.getByRole("link", { name: "Synthetic status link" })).toHaveAttribute(
      "href",
      "/status/synthetic-original-operation",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledOnce();
  },
);
