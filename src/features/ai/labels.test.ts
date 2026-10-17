import { expect, it } from "vitest";
import {
  externalActionKinds,
  externalActionStates,
  inboxEventStates,
} from "@/domain/external-action";
import { operationStatuses } from "@/domain/operation-receipt";
import { staffLocales } from "@/i18n/config";
import { assistanceTasks } from "@/server/ai/draft";
import { aiLabel } from "./labels";

it.each(staffLocales)("labels current Butler, job and provider codes in %s", (locale) => {
  const groups = {
    run: ["queued", "running", "draft", "failed", "stale", "rejected", "accepted"],
    task: [...assistanceTasks, "locale.draft", "intake.extract"],
    operation: operationStatuses,
    job: ["created", "retry", "active", "completed", "cancelled", "failed"],
    worker: ["current", "missing", "stale"],
    external: externalActionStates,
    externalKind: externalActionKinds,
    inbox: inboxEventStates,
  } as const;
  for (const [kind, values] of Object.entries(groups))
    for (const value of values) {
      const label = aiLabel(kind as keyof typeof groups, value, locale);
      expect(label, `${kind}.${value}`).not.toMatch(
        /Requires review|Нужен е преглед|Требуется проверка/,
      );
      expect(label).not.toContain("_");
    }
  expect(aiLabel("task", "future.internal_task", locale)).not.toContain("future.internal_task");
});
it("keeps an accepted draft distinct from an executed action", () => {
  expect(aiLabel("run", "accepted", "en")).toBe("Accepted for manual use");
  expect(aiLabel("event", "email.sent", "en")).toBe("Email accepted by provider");
  expect(aiLabel("external", "outcome_unknown", "en")).toContain("unconfirmed");
});
