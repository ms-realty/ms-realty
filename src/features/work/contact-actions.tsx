import { nativeContactHref } from "./native-contact";
import { staffWorkflowCopy } from "./workflow-completion-copy";
export function ContactActions({
  locale,
  methods,
}: {
  locale: string;
  methods: readonly { kind: string; value: string; verification: string }[];
}) {
  const copy = staffWorkflowCopy(locale);
  return (
    <div className="flex flex-wrap gap-3">
      {methods.map((method) => {
        const href = nativeContactHref(method.kind, method.value, method.verification);
        return href ? (
          <a
            key={`${method.kind}:${method.value}`}
            href={href}
            className="inline-flex min-h-control items-center gap-2 rounded-control border border-border px-3 py-2 font-semibold text-link"
          >
            <span>{method.kind === "phone" ? copy.call : copy.email}</span>
            <bdi>{method.value}</bdi>
          </a>
        ) : null;
      })}
    </div>
  );
}
