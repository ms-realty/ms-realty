import { type OperatingPolicy, policyEffects, policyWeekdays } from "@/domain/operating-policy";
import { policyToValues } from "@/domain/operating-policy-form";
import { staffUi } from "@/features/shell/staff-ui";
import type { OperatingPolicyCopy } from "./copy";

export function PolicyEffects({
  document,
  copy,
}: {
  document: OperatingPolicy;
  copy: OperatingPolicyCopy;
}) {
  return (
    <dl className="divide-y divide-divider">
      {Object.entries(policyEffects(document)).map(([key, value]) => (
        <div key={key} className="grid gap-1 py-3 sm:grid-cols-2 sm:gap-4">
          <dt className="text-dense font-medium">
            {copy[key as keyof ReturnType<typeof policyEffects>]}
          </dt>
          <dd className="text-dense text-text-muted">{value ? copy.ready : copy.held}</dd>
        </div>
      ))}
    </dl>
  );
}
export function PolicyReview({
  document,
  copy,
  owners,
}: {
  document: OperatingPolicy;
  copy: OperatingPolicyCopy;
  owners: { id: string; displayName: string }[];
}) {
  const values = policyToValues(document);
  return (
    <div className={staffUi.section}>
      <dl className="divide-y divide-divider">
        {Object.entries(copy.fields)
          .filter(([key]) => key !== "exceptions")
          .map(([key, label]) => {
            const value = values[key as keyof typeof values];
            return (
              <div key={key} className="grid gap-1 py-2 sm:grid-cols-2 sm:gap-4">
                <dt className="text-dense font-medium">{label}</dt>
                <dd className="whitespace-pre-wrap text-dense text-text-muted">
                  {key === "calendarState"
                    ? document.serviceCalendar
                      ? copy.calendarReviewed
                      : copy.calendarUnknown
                    : key.startsWith("owner") && value
                      ? (owners.find((owner) => owner.id === value)?.displayName ?? copy.held)
                      : value || copy.unknown}
                </dd>
              </div>
            );
          })}
        {policyWeekdays.map((day) => (
          <div key={day} className="grid gap-1 py-2 sm:grid-cols-2 sm:gap-4">
            <dt className="text-dense font-medium">{copy.weekdays[day]}</dt>
            <dd className="text-dense text-text-muted">
              {values[`${day}State`] === "closed" ? copy.closed : values[day] || copy.unknown}
            </dd>
          </div>
        ))}
        <div className="grid gap-1 py-2 sm:grid-cols-2 sm:gap-4">
          <dt className="text-dense font-medium">{copy.fields.exceptions}</dt>
          <dd className="whitespace-pre-wrap text-dense text-text-muted">
            {values.exceptions || copy.unknown}
          </dd>
        </div>
      </dl>
    </div>
  );
}
