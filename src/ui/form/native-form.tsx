"use client";

import {
  Children,
  cloneElement,
  type FormHTMLAttributes,
  isValidElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { ErrorSummary } from "../error-summary";

const copy = {
  bg: [
    "Изпращане…",
    "Качване",
    "Файлът е изпратен. Проверява се…",
    "Не успяхме да потвърдим резултата. Проверете записа, преди да опитате отново.",
    "Проверете записа",
  ],
  en: [
    "Submitting…",
    "Uploading",
    "Upload sent. Checking the file…",
    "We could not confirm the result. Check the record before trying again.",
    "Check the record",
  ],
  ru: [
    "Отправка…",
    "Загрузка",
    "Файл отправлен. Идёт проверка…",
    "Не удалось подтвердить результат. Проверьте запись перед повторной попыткой.",
    "Проверить запись",
  ],
  de: [
    "Wird gesendet…",
    "Hochladen",
    "Datei gesendet. Wird geprüft…",
    "Das Ergebnis konnte nicht bestätigt werden. Prüfen Sie den Eintrag, bevor Sie es erneut versuchen.",
    "Eintrag prüfen",
  ],
  nl: [
    "Bezig met verzenden…",
    "Uploaden",
    "Bestand verzonden. Wordt gecontroleerd…",
    "Het resultaat kon niet worden bevestigd. Controleer de gegevens voordat u het opnieuw probeert.",
    "Gegevens controleren",
  ],
  el: [
    "Αποστολή…",
    "Μεταφόρτωση",
    "Το αρχείο στάλθηκε. Γίνεται έλεγχος…",
    "Δεν επιβεβαιώθηκε το αποτέλεσμα. Ελέγξτε την καταχώριση πριν δοκιμάσετε ξανά.",
    "Έλεγχος καταχώρισης",
  ],
  he: [
    "שליחה…",
    "העלאה",
    "הקובץ נשלח. מתבצעת בדיקה…",
    "לא ניתן לאשר את התוצאה. יש לבדוק את הרשומה לפני ניסיון נוסף.",
    "בדיקת הרשומה",
  ],
} as const;

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method" | "onSubmit"> & {
  action?: string;
  method?: "post";
  /** Optional localized constraint copy; server POST validation stays authoritative. */
  validation?: {
    summary: string;
    fields: Record<string, { label: string; required?: string; email?: string; error?: string }>;
  };
};

/** Native POST fallback, with a synchronous duplicate guard and honest upload phases. */
export function NativeForm({ children, validation, ...props }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(validation?.fields ?? {}).flatMap(([name, field]) =>
        field.error ? [[name, field.error]] : [],
      ),
    ),
  );
  const fieldIds: Record<string, string> = {};
  const localFields = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (node) => {
      if (!isValidElement<Record<string, unknown>>(node)) return node;
      const name = typeof node.props.name === "string" ? node.props.name : "";
      const message = validation?.fields[name];
      if (
        message &&
        typeof node.type === "string" &&
        ["input", "textarea", "select"].includes(node.type)
      ) {
        const id = typeof node.props.id === "string" ? node.props.id : `native-${name}`;
        fieldIds[name] = id;
        const described =
          [node.props["aria-describedby"], errors[name] ? `${id}-error` : undefined]
            .filter(Boolean)
            .join(" ") || undefined;
        return (
          <>
            {cloneElement(node, {
              id,
              "aria-invalid": errors[name] ? true : node.props["aria-invalid"],
              "aria-describedby": described,
            })}
            {errors[name] ? (
              <p id={`${id}-error`} className="text-dense text-error">
                {errors[name]}
              </p>
            ) : null}
          </>
        );
      }
      return node.props.children
        ? cloneElement(node, {}, localFields(node.props.children as ReactNode))
        : node;
    });
  const localizedChildren = validation ? localFields(children) : children;
  const request = useRef<XMLHttpRequest | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "checking" | "unknown">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [returnTo, setReturnTo] = useState("");
  const locale = typeof document === "undefined" ? "bg" : document.documentElement.lang;
  const labels = copy[locale as keyof typeof copy] ?? copy.en;

  useEffect(() => {
    const reset = () => {
      submitted.current = false;
      setState("idle");
      setProgress(null);
      form.current
        ?.querySelectorAll<
          HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >("[data-native-submit]")
        .forEach((control) => {
          control.disabled = false;
          delete control.dataset.nativeSubmit;
        });
    };
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      request.current?.abort();
    };
  }, []);

  return (
    <form
      {...props}
      ref={form}
      method="post"
      noValidate={validation ? true : props.noValidate}
      aria-busy={state === "sending" || state === "checking" || undefined}
      onSubmit={(event) => {
        if (validation) {
          const next: Record<string, string> = {};
          for (const [name, messages] of Object.entries(validation.fields)) {
            const field = event.currentTarget.elements.namedItem(name);
            if (
              !(
                field instanceof HTMLInputElement ||
                field instanceof HTMLTextAreaElement ||
                field instanceof HTMLSelectElement
              )
            )
              continue;
            const missing =
              field instanceof HTMLInputElement && ["checkbox", "radio"].includes(field.type)
                ? !field.checked
                : !field.value.trim();
            if (messages.required && missing) next[name] = messages.required;
            else if (
              messages.email &&
              field instanceof HTMLInputElement &&
              field.validity.typeMismatch
            )
              next[name] = messages.email;
          }
          setErrors(next);
          if (Object.keys(next).length) {
            event.preventDefault();
            return;
          }
        }
        if (submitted.current) {
          event.preventDefault();
          return;
        }
        submitted.current = true;
        setState("sending");
        const element = event.currentTarget;
        const submitter = (event.nativeEvent as SubmitEvent).submitter as
          | HTMLButtonElement
          | HTMLInputElement
          | null;
        const disable = () => {
          element
            .querySelectorAll<
              HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >("button, input, textarea, select")
            .forEach((control) => {
              if (!control.disabled) {
                control.dataset.nativeSubmit = "true";
                control.disabled = true;
              }
            });
        };
        if ((submitter?.getAttribute("formenctype") || element.enctype) !== "multipart/form-data") {
          // Serialize successful controls, including the clicked button, before disabling them.
          element.addEventListener("formdata", disable, { once: true });
          return;
        }
        event.preventDefault();
        const body = new FormData(element, submitter);
        const destination = new URL(
          submitter?.getAttribute("formaction") || element.action,
          window.location.href,
        );
        if (destination.origin !== window.location.origin) {
          submitted.current = false;
          setState("idle");
          return;
        }
        disable();
        setReturnTo(window.location.href);
        const xhr = new XMLHttpRequest();
        request.current = xhr;
        const unknown = () => setState("unknown");
        xhr.upload.onprogress = (upload) => {
          if (upload.lengthComputable)
            setProgress(Math.floor((upload.loaded / upload.total) * 100));
        };
        xhr.upload.onload = () => setState("checking");
        xhr.onerror = unknown;
        xhr.ontimeout = unknown;
        xhr.onload = () => {
          const url = new URL(xhr.responseURL || destination.href);
          if (
            url.origin === window.location.origin &&
            xhr.getResponseHeader("content-type")?.includes("text/html")
          ) {
            window.location.assign(url.href);
          } else unknown();
        };
        xhr.open("POST", destination.href);
        xhr.send(body);
      }}
    >
      {validation ? (
        <ErrorSummary
          title={validation.summary}
          errors={Object.entries(errors).map(([name, message]) => ({
            fieldId: fieldIds[name] ?? `native-${name}`,
            message: `${validation.fields[name]?.label}: ${message}`,
          }))}
        />
      ) : null}
      {localizedChildren}
      {state !== "idle" ? (
        <div className="mt-3 space-y-2 text-dense text-text-muted">
          <p role="status">
            {state === "unknown"
              ? labels[3]
              : state === "checking"
                ? labels[2]
                : progress === null
                  ? labels[0]
                  : `${labels[1]} ${progress}%`}
          </p>
          {state === "sending" && progress !== null ? (
            <progress className="w-full" max={100} value={progress} aria-label={labels[1]} />
          ) : null}
          {state === "unknown" ? (
            <a className="underline" href={returnTo}>
              {labels[4]}
            </a>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
