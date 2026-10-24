import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ceremonyMessages, identityCopy } from "./copy";
import { PasskeyCeremony } from "./passkey-ceremony";

const browser = vi.hoisted(() => ({
  supported: vi.fn(() => true),
  register: vi.fn(),
  authenticate: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: browser.supported,
  startRegistration: browser.register,
  startAuthentication: browser.authenticate,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: browser.refresh }) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const c = identityCopy("en");
const messages = ceremonyMessages(c, c.registerPasskey, { label: true });
const registrationOptions = {
  challenge: "Y2hhbGxlbmdl",
  rp: { name: "Unit fixture", id: "localhost" },
  user: { id: "dW5pdA", name: "fixture@example.test", displayName: "Unit fixture" },
  pubKeyCredParams: [{ type: "public-key" as const, alg: -7 }],
};

describe("passkey browser failure recovery", () => {
  it.each([
    [{ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" }, c.passkeyAlreadyRegistered],
    [{ name: "InvalidStateError" }, c.passkeyAlreadyRegistered],
    [
      { code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT" },
      c.passkeyIncompatibleAuthenticator,
    ],
    [
      { code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT" },
      c.passkeyIncompatibleAuthenticator,
    ],
    [{ name: "NotAllowedError" }, c.passkeyCancelled],
    [{ code: "ERROR_CEREMONY_ABORTED" }, c.passkeyCancelled],
    [{ code: "ERROR_INVALID_RP_ID" }, c.passkeyBrowserFailed],
    [new Error("Private browser detail"), c.passkeyBrowserFailed],
  ])(
    "shows an actionable registration error without submitting a failed ceremony: %j",
    async (error, message) => {
      browser.register.mockRejectedValueOnce(error);
      const complete = vi.fn();
      render(
        <PasskeyCeremony
          kind="register"
          begin={async () => ({ ok: true, data: registrationOptions })}
          complete={complete}
          messages={messages}
        />,
      );
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Backup" } });
      fireEvent.click(screen.getByRole("button", { name: c.registerPasskey }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("textbox")).toHaveValue("Backup");
      expect(screen.getByRole("button", { name: c.registerPasskey })).toBeEnabled();
      expect(complete).not.toHaveBeenCalled();
      expect(screen.queryByText("Private browser detail")).not.toBeInTheDocument();
    },
  );

  it("allows a retry with a different authenticator after a duplicate and refreshes the saved count", async () => {
    const response = { id: "unit-credential" };
    browser.register
      .mockRejectedValueOnce({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" })
      .mockResolvedValueOnce(response);
    const complete = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <PasskeyCeremony
        kind="register"
        begin={async () => ({ ok: true, data: registrationOptions })}
        complete={complete}
        messages={messages}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Backup" } });
    fireEvent.click(screen.getByRole("button", { name: c.registerPasskey }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: c.registerPasskey }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith(response, "Backup"));
    expect(browser.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
