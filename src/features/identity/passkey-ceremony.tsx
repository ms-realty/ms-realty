"use client";

// One passkey ceremony (sign-in, step-up or registration) driven by two server actions: the
// first returns the WebAuthn options, the second verifies the browser's answer. A result with
// `next` leaves the page by a full navigation, so no private state survives the switch.
import {
  type AuthenticationResponseJSON,
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice, TextField } from "@/ui";

type Result<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: { readonly code: string } };

export interface CeremonyOutcome {
  /** Navigate here (full page load) after success. */
  readonly next?: string;
}

export interface CeremonyMessages {
  readonly button: string;
  readonly working: string;
  readonly cancelled: string;
  readonly failed: string;
  readonly unsupported: string;
  readonly rateLimited: string;
  readonly stepUp: string;
  readonly unexpected: string;
  readonly success?: string;
  readonly label?: string;
  readonly optional?: string;
}

type Props =
  | {
      readonly kind: "authenticate";
      readonly begin: () => Promise<Result<PublicKeyCredentialRequestOptionsJSON>>;
      readonly complete: (response: AuthenticationResponseJSON) => Promise<Result<CeremonyOutcome>>;
      readonly messages: CeremonyMessages;
      readonly variant?: "primary" | "secondary";
    }
  | {
      readonly kind: "register";
      readonly begin: () => Promise<Result<PublicKeyCredentialCreationOptionsJSON>>;
      readonly complete: (
        response: RegistrationResponseJSON,
        label: string,
      ) => Promise<Result<CeremonyOutcome>>;
      readonly messages: CeremonyMessages;
      readonly variant?: "primary" | "secondary";
    };

type Status = { tone: "error" | "success"; text: string } | null;

function messageFor(code: string, messages: CeremonyMessages): string {
  switch (code) {
    case "RATE_LIMITED":
      return messages.rateLimited;
    case "STEP_UP_REQUIRED":
      return messages.stepUp;
    case "PASSKEY_FAILED":
      return messages.failed;
    default:
      return messages.unexpected;
  }
}

export function PasskeyCeremony(props: Props) {
  const { messages } = props;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [label, setLabel] = useState("");

  async function run() {
    setStatus(null);
    if (!browserSupportsWebAuthn()) {
      setStatus({ tone: "error", text: messages.unsupported });
      return;
    }
    setPending(true);
    try {
      let result: Result<CeremonyOutcome>;
      if (props.kind === "authenticate") {
        const options = await props.begin();
        if (!options.ok) throw options.error;
        let response: AuthenticationResponseJSON;
        try {
          response = await startAuthentication({ optionsJSON: options.data });
        } catch {
          setStatus({ tone: "error", text: messages.cancelled });
          return;
        }
        result = await props.complete(response);
      } else {
        const options = await props.begin();
        if (!options.ok) throw options.error;
        let response: RegistrationResponseJSON;
        try {
          response = await startRegistration({ optionsJSON: options.data });
        } catch {
          setStatus({ tone: "error", text: messages.cancelled });
          return;
        }
        result = await props.complete(response, label);
      }
      if (!result.ok) throw result.error;
      if (result.data.next) {
        window.location.assign(result.data.next);
        return;
      }
      setLabel("");
      if (messages.success) setStatus({ tone: "success", text: messages.success });
      router.refresh();
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      setStatus({
        tone: "error",
        text: typeof code === "string" ? messageFor(code, messages) : messages.unexpected,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {props.kind === "register" && messages.label ? (
        <TextField
          label={messages.label}
          optionalLabel={messages.optional}
          value={label}
          onChange={setLabel}
          maxLength={80}
          autoComplete="off"
        />
      ) : null}
      <div>
        <Button
          variant={props.variant ?? "primary"}
          onPress={run}
          isPending={pending}
          pendingLabel={messages.working}
        >
          {messages.button}
        </Button>
      </div>
      {status ? (
        <Notice tone={status.tone} role={status.tone === "error" ? "alert" : "status"}>
          {status.text}
        </Notice>
      ) : null}
    </div>
  );
}
