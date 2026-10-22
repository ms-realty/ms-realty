import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { InboundAttachments } from "./attachments";

const fixture = vi.hoisted(() => ({
  id: "00000000-0000-4000-8000-000000000001",
  filename: "Exact_sender_filename.pdf",
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/inbound/attachments", () => ({
  attachmentImportScope: "test-scope",
  readInboundAttachments: async () => ({
    row: {
      version: 1,
      provider: "resend",
      attachments: [
        { id: fixture.id, filename: null, contentType: "application/pdf" },
        { id: "second-attachment", filename: fixture.filename, contentType: "application/pdf" },
      ],
    },
    record: { version: 1, disposition: "active" },
    imports: [],
  }),
}));
vi.mock("@/server/inbound/attachment-provider", () => ({ attachmentProviderEnabled: () => true }));
vi.mock("@/ui/form/server", () => ({ issueFormOperation: () => "test-operation" }));
vi.mock("./attachment-native", () => ({
  attachmentDraft: async () => null,
  attachmentReceipt: async () => null,
}));
afterEach(cleanup);

it.each(["bg", "en", "ru"])(
  "keeps attachment identities in values and details in %s",
  async (locale) => {
    const { container } = render(
      await InboundAttachments({ locale, session: {} as Session, id: "inbound", caseId: "case" }),
    );
    const option = screen
      .getAllByRole("option")
      .find((node) => node.getAttribute("value") === fixture.id);
    expect(option).toBeDefined();
    expect(option?.textContent).not.toContain(fixture.id);
    const primary = container.cloneNode(true) as HTMLElement;
    for (const details of primary.querySelectorAll("details")) details.remove();
    expect(primary.textContent).not.toContain(fixture.id);
    expect(primary.textContent).toContain(fixture.filename);
    expect(container.querySelector("details")?.textContent).toContain(fixture.id);
    expect(container.querySelector("details")?.textContent).toContain("application/pdf");
  },
);
