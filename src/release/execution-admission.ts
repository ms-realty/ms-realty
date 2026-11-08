// Only adapters pass their actual process/Worker environment here. No file or request loader.
import { createHash, createPublicKey } from "node:crypto";
import { z } from "zod";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[A-Za-z0-9._:-]{3,128}$/);
const key = (purpose: "execution_grant" | "execution_verification") =>
  z.object({ keyId: identifier, fingerprint: digest, purpose: z.literal(purpose) }).strict();

// This standalone decoder also runs in native Node operator scripts without a TS loader.
// The evaluator independently revalidates the release portion against its own schema.
export const runtimeAdmissionSchema = z
  .object({
    schemaVersion: z.literal(2),
    mode: z.literal("single_operator_owner_review"),
    leaseAuthority: z.literal("watchdog_durable_state"),
    release: z
      .object({
        schemaVersion: z.literal(1),
        policyDigest: digest,
        trustedKeysDigest: digest,
        owner: z.literal("Ivan"),
        ownerKeyId: identifier,
        ownerKeyFingerprint: digest,
        custodyReference: z
          .string()
          .min(1)
          .max(200)
          .regex(/^\S(?:[^\r\n]*\S)?$/),
      })
      .strict(),
    keys: z
      .object({ owner: key("execution_grant"), verifier: key("execution_verification") })
      .strict(),
  })
  .strict();
export type RuntimeAdmission = z.infer<typeof runtimeAdmissionSchema>;

export class ExecutionAdmissionError extends Error {
  constructor() {
    super("Installed execution admission is missing, malformed or inconsistent");
  }
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
const sha256 = (value: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export function loadExecutionAdmission(
  environment: Record<string, unknown>,
  surface: "operator" | "watchdog",
) {
  const text = environment.MS_REALTY_EXECUTION_ADMISSION;
  if (text === undefined || text === "") return null;
  try {
    if (typeof text !== "string" || text.length > 16_384) throw new ExecutionAdmissionError();
    const admission = runtimeAdmissionSchema.parse(JSON.parse(text));
    if (canonical(admission) !== text) throw new ExecutionAdmissionError();
    const keys = {
      owner:
        environment[
          surface === "watchdog" ? "WATCHDOG_OWNER_PUBLIC_KEY" : "LAUNCH_OWNER_PUBLIC_KEY"
        ],
      controller:
        environment[
          surface === "watchdog" ? "WATCHDOG_CONTROLLER_PUBLIC_KEY" : "LAUNCH_CONTROLLER_PUBLIC_KEY"
        ],
    };
    for (const role of ["owner", "controller"] as const) {
      const pem = keys[role];
      if (typeof pem !== "string") throw new ExecutionAdmissionError();
      const publicKey = createPublicKey(pem);
      const expected = admission.keys[role === "owner" ? "owner" : "verifier"];
      if (
        publicKey.asymmetricKeyType !== "ed25519" ||
        sha256(publicKey.export({ format: "der", type: "spki" })) !== expected.fingerprint
      )
        throw new ExecutionAdmissionError();
    }
    if (
      admission.keys.owner.keyId !== admission.release.ownerKeyId ||
      admission.keys.owner.fingerprint !== admission.release.ownerKeyFingerprint ||
      admission.keys.owner.fingerprint === admission.keys.verifier.fingerprint
    )
      throw new ExecutionAdmissionError();
    return { admission, digest: sha256(text), keys: keys as { owner: string; controller: string } };
  } catch {
    throw new ExecutionAdmissionError();
  }
}

export type InstalledExecutionAdmission = NonNullable<ReturnType<typeof loadExecutionAdmission>>;
