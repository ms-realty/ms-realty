import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/shares/public", () => ({ readPublicShare: vi.fn() }));

import { generateMetadata } from "../../../app/public/[locale]/(site)/share/[token]/page";

const token = "T".repeat(43);
const params = (locale: string) => ({ params: Promise.resolve({ locale, token }) });

describe("P09 route metadata", () => {
  it("is never indexable, sends no referrer and carries no canonical or alternates", async () => {
    const metadata = await generateMetadata(params("en"));
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
    expect(metadata.alternates).toBeUndefined();
    // The URL is the secret: it must not reach a title, description or Open Graph record.
    expect(JSON.stringify(metadata)).not.toContain(token);
    expect(metadata.title).toBe("Shared list of properties");
  });

  it("titles the page in the route locale and refuses an unknown locale", async () => {
    expect((await generateMetadata(params("bg"))).title).toBe("Споделен списък с имоти");
    await expect(generateMetadata(params("xx"))).rejects.toThrow();
  });
});
