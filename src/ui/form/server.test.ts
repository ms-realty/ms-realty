import { describe, expect, it } from "vitest";
import { formFields } from "./contract";
import {
  initialFormState,
  isIssuedFormOperation,
  issueFormOperation,
  readFormEnvelope,
  readFormValues,
} from "./server";
import { readSpecimenReceipt, sealSpecimenReceipt } from "./specimen-server";

describe("UI07 / architecture §5.1 server form envelope", () => {
  it("issues unique identities bound to the server-owned command scope", () => {
    const state = initialFormState("draft.save", { title: "" }, 3);
    expect(isIssuedFormOperation("draft.save", state.operationId)).toBe(true);
    expect(isIssuedFormOperation("inquiry.send", state.operationId)).toBe(false);
    expect(isIssuedFormOperation("draft.save", `${state.operationId.slice(0, -2)}xx`)).toBe(false);
    expect(issueFormOperation("draft.save")).not.toBe(state.operationId);
  });

  it("rejects duplicate metadata and revisions that would bypass the revision guard", () => {
    const data = new FormData();
    const operationId = issueFormOperation("draft.save");
    data.set(formFields.operationId, operationId);
    data.set(formFields.expectedRevision, "3");
    data.set(formFields.intent, "submit");
    expect(readFormEnvelope(data, "draft.save")).toEqual({
      operationId,
      expectedRevision: 3,
      intent: "submit",
    });
    for (const value of ["NaN", "1.5", "-1", "0", "1e2", "9007199254740992"]) {
      data.set(formFields.expectedRevision, value);
      expect(readFormEnvelope(data, "draft.save"), value).toBeNull();
    }
    data.set(formFields.expectedRevision, "3");
    data.append(formFields.operationId, operationId);
    expect(readFormEnvelope(data, "draft.save")).toBeNull();
  });

  it("requires explicit reapply and a server-issued identity for the reviewed command", () => {
    const data = new FormData();
    const operationId = issueFormOperation("draft.save");
    data.set(formFields.intent, "reapply");
    data.set(formFields.reapplyOperationId, operationId);
    data.set(formFields.reapplyRevision, "4");
    expect(readFormEnvelope(data, "draft.save")).toEqual({
      operationId,
      expectedRevision: 4,
      intent: "reapply",
    });
    data.set(formFields.reapplyOperationId, "browser-invented-key");
    expect(readFormEnvelope(data, "draft.save")).toBeNull();
  });

  it("returns only allowlisted text, preserving spaces and ignoring credentials, files and duplicates", () => {
    const data = new FormData();
    data.set("note", "  My original\ntext  ");
    data.set("password", "never-echo-this");
    data.set("document", new Blob(["private"]), "private.txt");
    data.append("title", "one");
    data.append("title", "two");
    expect(readFormValues(data, ["note", "title", "document"])).toEqual({
      note: "  My original\ntext  ",
      title: "",
      document: "",
    });
  });
});

describe("practice receipt readback", () => {
  const recordedAt = "2026-09-27T10:00:00.000Z";
  const receipt = {
    operationId: "practice-id",
    digest: "a".repeat(64),
    recordedAt,
    reference: "DEMO-example",
    revision: 2 as const,
  };
  it("accepts its signed metadata during the one-hour lifetime and rejects tampering or expiry", () => {
    const sealed = sealSpecimenReceipt(receipt);
    expect(readSpecimenReceipt(sealed, Date.parse(recordedAt) + 1)).toEqual(receipt);
    expect(readSpecimenReceipt(`${sealed}00`, Date.parse(recordedAt) + 1)).toBeNull();
    expect(readSpecimenReceipt(sealed, Date.parse(recordedAt) + 3_600_000)).toBeNull();
    expect(readSpecimenReceipt(sealed, Date.parse(recordedAt) - 1)).toBeNull();
    expect(readSpecimenReceipt("malformed")).toBeNull();
  });
  it("never seals draft text or unknown keys", () => {
    const sealed = sealSpecimenReceipt({ ...receipt, note: "private text" } as typeof receipt);
    const body = JSON.parse(Buffer.from(sealed.split(".")[0] ?? "", "base64url").toString());
    expect(body).not.toHaveProperty("note");
    expect(Object.keys(body).sort()).toEqual([
      "digest",
      "operationId",
      "recordedAt",
      "reference",
      "revision",
    ]);
  });
});
