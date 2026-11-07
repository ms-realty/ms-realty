import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { participantRoles } from "@/domain/parties";
import { workflowLabel } from "@/i18n/workflow-labels";
import ConfirmPage from "../../../app/client/[locale]/(journey)/access/confirm/page";
import ClientAccessPage from "../../../app/client/[locale]/(journey)/access/page";
import ClientReauthPage from "../../../app/client/[locale]/(journey)/access/reauth/page";
import InvitationPage from "../../../app/client/[locale]/(journey)/invitations/[id]/page";
import commonDe from "../../../messages/de/common.json";
import commonEl from "../../../messages/el/common.json";
import commonHe from "../../../messages/he/common.json";
import commonNl from "../../../messages/nl/common.json";
import { AccessFrame } from "./access-frame";

const mocked = vi.hoisted(() => ({
  session: null as null | { account: { kind: "client"; id: string } },
  link: vi.fn(),
  invitation: vi.fn(),
  begin: vi.fn(),
  complete: vi.fn(),
  register: vi.fn(),
  authenticate: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve([{ email: "synthetic-client@example.test" }]), {
            orderBy: () => ({ limit: async () => [] }),
          }),
      }),
    }),
  }),
}));
vi.mock("@/server/auth/pages", () => ({
  currentClientSession: async () => mocked.session,
  requireAuthHost: async () => {},
  localReturnPath: (value: string | null | undefined) => value ?? null,
}));
vi.mock("@/server/auth/email-link", () => ({ inspectEmailLink: mocked.link }));
vi.mock("@/server/auth/invitations", () => ({ viewClientInvitation: mocked.invitation }));
vi.mock("../../../app/client/[locale]/(journey)/access/actions", () => ({
  beginClientPasskey: mocked.begin,
  beginClientRegistration: mocked.begin,
  completeClientPasskey: mocked.complete,
  completeClientRegistration: mocked.complete,
}));
vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration: mocked.register,
  startAuthentication: mocked.authenticate,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("Synthetic not found");
  },
  redirect: (href: string) => {
    throw new Error(`Synthetic redirect ${href}`);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocked.session = null;
  mocked.link.mockResolvedValue({ state: "valid" });
});
afterEach(cleanup);

const locales = [
  {
    locale: "de",
    title: "Ihr MS Realty-Kundenkonto",
    email: "E-Mail-Adresse",
    send: "Anmeldelink per E-Mail senden",
    confirm: "Anmeldung abschließen",
    signIn: "Anmelden",
    reauth: "Bestätigen Sie Ihre Identität",
    invitation: "Einladung",
    accept: "Annehmen",
    decline: "Ablehnen",
    buyer: "Käufer",
    add: "Passkey hinzufügen",
    common: commonDe,
  },
  {
    locale: "nl",
    title: "Uw MS Realty-klantaccount",
    email: "E-mailadres",
    send: "Stuur mij een inloglink",
    confirm: "Inloggen voltooien",
    signIn: "Inloggen",
    reauth: "Bevestig uw identiteit",
    invitation: "Uitnodiging",
    accept: "Accepteren",
    decline: "Weigeren",
    buyer: "Koper",
    add: "Passkey toevoegen",
    common: commonNl,
  },
  {
    locale: "el",
    title: "Ο λογαριασμός πελάτη σας στην MS Realty",
    email: "Διεύθυνση email",
    send: "Αποστολή συνδέσμου σύνδεσης με email",
    confirm: "Ολοκλήρωση σύνδεσης",
    signIn: "Σύνδεση",
    reauth: "Επιβεβαιώστε την ταυτότητά σας",
    invitation: "Πρόσκληση",
    accept: "Αποδοχή",
    decline: "Απόρριψη",
    buyer: "Αγοραστής",
    add: "Προσθήκη κλειδιού πρόσβασης",
    common: commonEl,
  },
  {
    locale: "he",
    title: "חשבון הלקוח שלכם ב־MS Realty",
    email: "כתובת אימייל",
    send: "שליחת קישור כניסה באימייל",
    confirm: "השלמת הכניסה",
    signIn: "כניסה",
    reauth: "אימות הזהות שלכם",
    invitation: "הזמנה",
    accept: "קבלה",
    decline: "דחייה",
    buyer: "רוכש",
    add: "הוספת מפתח גישה",
    common: commonHe,
  },
] as const;

it.each(locales)(
  "C01 renders the actual $locale sign-in form with unchanged request and return path",
  async (copy) => {
    const returnTo = `/${copy.locale}/overview/synthetic-case`;
    const page = await ClientAccessPage({
      params: Promise.resolve({ locale: copy.locale }),
      searchParams: Promise.resolve({ returnTo }),
    });
    render(await AccessFrame(page.props));
    expect(screen.getByRole("heading", { name: copy.title })).toBeVisible();
    const email = screen.getByRole("textbox", { name: copy.email });
    expect(email).toHaveAttribute("dir", "ltr");
    const form = email.closest("form");
    expect(form).toHaveAttribute("action", `/${copy.locale}/access/request`);
    expect(form).toHaveAttribute("method", "post");
    if (!form) throw new Error("Missing sign-in form");
    expect(new FormData(form).get("returnTo")).toBe(returnTo);
    expect(new FormData(form).get("locale")).toBe(copy.locale);
    expect(screen.getByRole("button", { name: copy.send })).toBeVisible();
    expect(mocked.begin).not.toHaveBeenCalled();
    expect(mocked.complete).not.toHaveBeenCalled();
  },
);

it.each(locales)(
  "C01 renders the actual $locale link-confirmation POST without consuming the link",
  async (copy) => {
    const page = await ConfirmPage({
      params: Promise.resolve({ locale: copy.locale }),
      searchParams: Promise.resolve({ token: "synthetic-link-token" }),
    });
    render(await AccessFrame(page.props));
    expect(screen.getByRole("heading", { name: copy.confirm })).toBeVisible();
    const form = screen.getByRole("button", { name: copy.signIn }).closest("form");
    expect(form).toHaveAttribute("action", `/${copy.locale}/access/confirm/submit`);
    expect(form).toHaveAttribute("method", "post");
    if (!form) throw new Error("Missing link-confirmation form");
    expect(new FormData(form).get("token")).toBe("synthetic-link-token");
    expect(mocked.complete).not.toHaveBeenCalled();
  },
);

it.each(locales)(
  "C01 renders $locale fresh-auth recovery for the current account and preserves the reviewed destination",
  async (copy) => {
    mocked.session = { account: { kind: "client", id: "synthetic-client" } };
    const returnTo = `/${copy.locale}/overview/synthetic-case`;
    const page = await ClientReauthPage({
      params: Promise.resolve({ locale: copy.locale }),
      searchParams: Promise.resolve({ returnTo }),
    });
    render(await AccessFrame(page.props));
    expect(screen.getByRole("heading", { name: copy.reauth })).toBeVisible();
    expect(screen.getByText("synthetic-client@example.test").tagName).toBe("BDI");
    const form = screen.getByRole("button", { name: copy.send }).closest("form");
    expect(form).toHaveAttribute("action", `/${copy.locale}/access/reauth/request`);
    if (!form) throw new Error("Missing reauthentication form");
    expect(new FormData(form).get("returnTo")).toBe(returnTo);
  },
);

it.each(locales)(
  "C02 renders the actual $locale invitation with exact source facts and explicit decisions",
  async (copy) => {
    mocked.session = { account: { kind: "client", id: "synthetic-client" } };
    mocked.invitation.mockResolvedValue({
      status: "pending",
      details: {
        inviterName: "Synthetic source inviter",
        caseReference: "MS-00123",
        caseTitle: "Exact source title / כותרת מקור",
        recipientEmail: "synthetic-client@example.test",
        expiresAt: new Date(0).toISOString(),
        role: "buyer",
        capabilities: [],
      },
    });
    const page = await InvitationPage({
      params: Promise.resolve({ locale: copy.locale, id: "synthetic-invitation" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(await AccessFrame(page.props));
    expect(screen.getByRole("heading", { name: copy.invitation })).toBeVisible();
    for (const fact of [
      "Synthetic source inviter",
      "MS-00123",
      "Exact source title / כותרת מקור",
      "synthetic-client@example.test",
      copy.buyer,
    ])
      expect(container.textContent).toContain(fact);
    const form = screen.getByRole("button", { name: copy.accept }).closest("form");
    expect(form).toHaveAttribute(
      "action",
      `/${copy.locale}/invitations/synthetic-invitation/respond`,
    );
    expect(screen.getByRole("button", { name: copy.accept })).toHaveAttribute("value", "accept");
    expect(screen.getByRole("button", { name: copy.decline })).toHaveAttribute("value", "decline");
    if (copy.locale === "he")
      for (const value of [
        "MS-00123",
        "Exact source title / כותרת מקור",
        "synthetic-client@example.test",
      ])
        expect(container.textContent).toContain(`\u2068${value}\u2069`);
  },
);

it.each(locales)("C02 renders all ten existing participant roles in $locale", async (copy) => {
  mocked.session = { account: { kind: "client", id: "synthetic-client" } };
  for (const role of participantRoles) {
    mocked.invitation.mockResolvedValue({
      status: "accepted",
      details: {
        inviterName: "Synthetic source inviter",
        caseReference: "MS-00123",
        caseTitle: "Exact source title",
        recipientEmail: "synthetic-client@example.test",
        expiresAt: new Date(0).toISOString(),
        role,
        capabilities: [],
      },
    });
    const page = await InvitationPage({
      params: Promise.resolve({ locale: copy.locale, id: "synthetic-invitation" }),
      searchParams: Promise.resolve({}),
    });
    const { container, unmount } = render(await AccessFrame(page.props));
    expect(container.textContent).toContain(workflowLabel(role, copy.locale));
    expect(screen.queryByRole("button", { name: copy.accept })).not.toBeInTheDocument();
    unmount();
  }
});

it.each([
  ["de", "Dieser Anmeldelink ist abgelaufen. Fordern Sie einen neuen an.", "Neuen Link anfordern"],
  ["nl", "Deze inloglink is verlopen. Vraag een nieuwe aan.", "Nieuwe link aanvragen"],
  ["el", "Αυτός ο σύνδεσμος σύνδεσης έχει λήξει. Ζητήστε νέο.", "Αίτημα νέου συνδέσμου"],
  ["he", "תוקף קישור הכניסה הזה פג. בקשו קישור חדש.", "בקשת קישור חדש"],
])(
  "C01 renders the actual %s expired-link recovery without a confirmation action",
  async (locale, expired, request) => {
    mocked.link.mockResolvedValue({ state: "expired" });
    const page = await ConfirmPage({
      params: Promise.resolve({ locale: locale ?? "en" }),
      searchParams: Promise.resolve({ token: "synthetic-expired-link" }),
    });
    render(await AccessFrame(page.props));
    expect(screen.getByText(expired ?? "")).toBeVisible();
    expect(screen.getByRole("link", { name: request })).toHaveAttribute(
      "href",
      `/${locale}/access`,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mocked.complete).not.toHaveBeenCalled();
  },
);

it.each(locales)(
  "C01 uses the accepted $locale passkey recovery text on the actual signed-in page",
  async (copy) => {
    mocked.session = { account: { kind: "client", id: "synthetic-client" } };
    mocked.begin.mockResolvedValue({ ok: true, data: { challenge: "synthetic-options" } });
    mocked.register.mockRejectedValue({ name: "InvalidStateError" });
    const page = await ClientAccessPage({
      params: Promise.resolve({ locale: copy.locale }),
      searchParams: Promise.resolve({}),
    });
    render(await AccessFrame(page.props));
    fireEvent.click(screen.getByRole("button", { name: copy.add }));
    expect(await screen.findByText(copy.common.passkeys.passkeyAlreadyRegistered)).toBeVisible();
    expect(mocked.complete).not.toHaveBeenCalled();
  },
);
