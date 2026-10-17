import type { PublicLocale } from "@/domain/ids";

// Private workflow drafts; language acceptance remains a separate human review.
const copy: Record<
  PublicLocale,
  { amount: string; currency: string; hint: string; invalid: string }
> = {
  bg: {
    amount: "Сума",
    currency: "Валута",
    hint: "Например {example}. До две цифри след десетичния знак. Смяната на валутата не преобразува сумата.",
    invalid: "Въведете сума над нула в показания формат, с до две цифри след десетичния знак.",
  },
  en: {
    amount: "Amount",
    currency: "Currency",
    hint: "For example {example}. Up to two decimal places. Changing currency does not convert the amount.",
    invalid:
      "Enter an amount greater than zero in the shown format, with up to two decimal places.",
  },
  ru: {
    amount: "Сумма",
    currency: "Валюта",
    hint: "Например {example}. До двух знаков после запятой. Смена валюты не пересчитывает сумму.",
    invalid: "Введите сумму больше нуля в указанном формате, не более двух знаков после запятой.",
  },
  de: {
    amount: "Betrag",
    currency: "Währung",
    hint: "Zum Beispiel {example}. Bis zu zwei Nachkommastellen. Ein Währungswechsel rechnet den Betrag nicht um.",
    invalid:
      "Geben Sie einen Betrag größer als null im gezeigten Format mit bis zu zwei Nachkommastellen ein.",
  },
  nl: {
    amount: "Bedrag",
    currency: "Valuta",
    hint: "Bijvoorbeeld {example}. Maximaal twee decimalen. Een andere valuta kiezen rekent het bedrag niet om.",
    invalid:
      "Voer een bedrag groter dan nul in het getoonde formaat in, met maximaal twee decimalen.",
  },
  el: {
    amount: "Ποσό",
    currency: "Νόμισμα",
    hint: "Για παράδειγμα {example}. Έως δύο δεκαδικά ψηφία. Η αλλαγή νομίσματος δεν μετατρέπει το ποσό.",
    invalid:
      "Εισαγάγετε ποσό μεγαλύτερο από το μηδέν στην υποδεικνυόμενη μορφή, με έως δύο δεκαδικά ψηφία.",
  },
  he: {
    amount: "סכום",
    currency: "מטבע",
    hint: "לדוגמה {example}. עד שתי ספרות אחרי הנקודה העשרונית. שינוי המטבע אינו ממיר את הסכום.",
    invalid: "יש להזין סכום גדול מאפס בתבנית המוצגת, עם עד שתי ספרות אחרי הנקודה העשרונית.",
  },
};

export const moneyCopy = (locale: PublicLocale) => copy[locale];
