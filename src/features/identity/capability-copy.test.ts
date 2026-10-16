import { expect, it } from "vitest";
import { capabilities } from "@/domain/capabilities";
import { publicLocales, staffLocales } from "@/i18n/config";
import { capabilityLabel } from "./capability-copy";
import { staffRoleLabel } from "./management-copy";

it.each(staffLocales)(
  "labels every grant capability in %s while retaining unknown codes for technical review",
  (locale) => {
    for (const capability of capabilities) {
      const label = capabilityLabel(locale, capability);
      expect(label, capability).not.toBe(capability);
      expect(label).not.toMatch(
        /Permission requires review|Правото изисква преглед|Право требует проверки/,
      );
      expect(label).not.toContain("_");
    }
    expect(capabilityLabel(locale, "future.internal_permission")).not.toContain(
      "future.internal_permission",
    );
    expect(staffRoleLabel(locale, "future_internal_role")).not.toContain("future_internal_role");
  },
);

it.each(publicLocales)("provides client invitation permission labels in %s", (locale) => {
  for (const capability of capabilities.filter(
    (value) => value.startsWith("portal.") || value === "inquiry.submit",
  )) {
    const label = capabilityLabel(locale, capability);
    expect(label).not.toBe(capability);
    expect(label).not.toContain("_");
    if (locale === "he") expect(label).toMatch(/[א-ת]/);
  }
});
