import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { passkeys } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { complaintOwners } from "../complaints/service";
import { custodyHolders } from "../key-custody/service";
import { privacyOwners } from "../privacy/requests";
import { createStaff } from "../testing";
import { liveStaff } from "../work/shared";
import { staffAccess } from "./access";
import { finishPasskeyRegistration, startPasskeyRegistration } from "./passkeys";
import { createSession } from "./sessions";
import { SoftAuthenticator } from "./testing-authenticator";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

it("uses the one-passkey staff policy consistently for access and operational ownership", async () => {
  const account = await createStaff(t.db, { roles: ["manager"] });
  const issued = await createSession(t.db, { kind: "staff", id: account.id });
  expect((await staffAccess(t.db, issued.token)).state).toBe("enrolling");
  await expect(liveStaff(t.db, issued.session)).rejects.toMatchObject({ code: "forbidden" });
  await expect(complaintOwners(t.db, issued.session)).rejects.toMatchObject({ code: "forbidden" });
  expect(await privacyOwners(t.db)).not.toContainEqual(expect.objectContaining({ id: account.id }));

  const key = new SoftAuthenticator();
  const options = await startPasskeyRegistration(t.db, issued.session);
  await finishPasskeyRegistration(t.db, issued.session, key.register(options.challenge), {
    expectedChallenge: options.challenge,
  });
  expect((await staffAccess(t.db, issued.token)).state).toBe("ready");
  await expect(liveStaff(t.db, issued.session)).resolves.toMatchObject({
    account: { kind: "staff", id: account.id },
  });
  for (const candidates of [
    await complaintOwners(t.db, issued.session),
    await privacyOwners(t.db),
    await custodyHolders(t.db, issued.session),
  ]) {
    expect(candidates).toContainEqual(expect.objectContaining({ id: account.id }));
  }

  await t.db
    .update(passkeys)
    .set({ revokedAt: new Date() })
    .where(eq(passkeys.principalId, account.id));
  expect((await staffAccess(t.db, issued.token)).state).toBe("enrolling");
  await expect(custodyHolders(t.db, issued.session)).rejects.toMatchObject({ code: "forbidden" });
  await expect(complaintOwners(t.db, issued.session)).rejects.toMatchObject({ code: "forbidden" });
  expect(await privacyOwners(t.db)).not.toContainEqual(expect.objectContaining({ id: account.id }));
});
