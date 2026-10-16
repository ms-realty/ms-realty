import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import bg from "../../../messages/staff/bg/workspaceStates.json";
import en from "../../../messages/staff/en/workspaceStates.json";
import ru from "../../../messages/staff/ru/workspaceStates.json";
import { PermissionState } from "./permission-state";

const query = vi.hoisted(() => ({ managers: vi.fn(), db: {} }));
vi.mock("@/db/client", () => ({ getDb: () => query.db }));
vi.mock("@/server/auth/grants", () => ({ accessManagerNames: query.managers }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: "bg" | "en" | "ru" }) =>
    createTranslator({
      locale,
      messages: { workspaceStates: { bg, en, ru }[locale] },
      namespace: "workspaceStates",
    }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const session = { actor: { kind: "staff", id: "synthetic-member" } } as Session;

it.each(["bg", "en", "ru"] as const)(
  "explains Inventory permission limits in %s and uses the current session for manager names",
  async (locale) => {
    query.managers.mockResolvedValue(["Synthetic Manager"]);
    const { container } = render(
      await PermissionState({
        locale,
        title: "Inventory",
        about: "Agency property records.",
        session,
      }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Inventory");
    expect(container.textContent).toContain("Synthetic Manager");
    expect(screen.getByRole("link")).toHaveAttribute("href", `/${locale}/today`);
    expect(query.managers).toHaveBeenCalledWith(query.db, session);
    expect(container.querySelector("form, input, table")).toBeNull();
  },
);

it("keeps a useful manager instruction when no active access manager is available", async () => {
  query.managers.mockResolvedValue([]);
  render(
    await PermissionState({
      locale: "en",
      title: "Inventory",
      about: "Agency property records.",
      session,
    }),
  );
  expect(screen.getByText("Ask your manager to give you access.")).toBeInTheDocument();
});
