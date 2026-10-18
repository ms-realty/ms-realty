import { factFieldLabel } from "@/i18n/fact-labels";

export const ownerPreviewCopy = (locale: string) =>
  locale === "bg"
    ? {
        title: "Преглед за собственика",
        binding: "Свързване на инструкциите на продавача",
        instruction: "Прегледани инструкции",
        bindCheck:
          "Проверих точния имот, човека или фирмата, търговските условия и текущото пълномощие за тази сделка.",
        bind: "Свързване на инструкциите",
        source: "Текущ одобрен български източник",
        facts: "Данни и условия",
        media: "Одобрени изображения",
        rights: "Записани права за изображенията",
        permission: "Разрешение за публикуване по инструкциите",
        privacy: "Публична точност на местоположението",
        consequences:
          "Потвърждавате точно този преглед за агенцията. Това не публикува обява, не подписва договор и не дава правно заключение. Промени в съдържанието изискват ново потвърждение.",
        check:
          "Прегледах показаните точни условия, данни, български текст, изображения и ниво на публично разкриване и ги потвърждавам за тази сделка.",
        acknowledge: "Потвърждение на точния преглед",
        recorded: "Потвърждението е валидно за този точен преглед.",
        unavailable:
          "Прегледът още не е достъпен или източникът се е променил. Свържете се с брокера.",
        back: "Отворете сделката",
        ownerLink: "Преглед на обявата за потвърждение",
        technical: "Технически подробности",
        authorised: "Какво сте възложили на агенцията по тази сделка",
      }
    : locale === "ru"
      ? {
          title: "Предпросмотр для собственника",
          binding: "Связать инструкции продавца",
          instruction: "Проверенные инструкции",
          bindCheck:
            "Я проверил точный объект, человека или компанию, условия и действующие полномочия для этой сделки.",
          bind: "Связать инструкции",
          source: "Текущий утверждённый болгарский источник",
          facts: "Характеристики и условия",
          media: "Проверенные изображения",
          rights: "Записанные права на изображения",
          permission: "Разрешение на публикацию по инструкциям",
          privacy: "Точность публичного местоположения",
          consequences:
            "Вы подтверждаете именно этот предпросмотр для агентства. Это не публикует объявление, не подписывает договор и не даёт юридического заключения. Изменения требуют нового подтверждения.",
          check:
            "Я проверил показанные точные условия, факты, болгарский текст, изображения и публичное раскрытие и подтверждаю их для этой сделки.",
          acknowledge: "Подтвердить точный предпросмотр",
          recorded: "Подтверждение действительно для этого точного предпросмотра.",
          unavailable: "Предпросмотр ещё недоступен или источник изменился. Свяжитесь с брокером.",
          back: "Откройте сделку",
          ownerLink: "Проверить объявление для подтверждения",
          technical: "Технические подробности",
          authorised: "Что Вы поручили агентству по этой сделке",
        }
      : {
          title: "Owner listing preview",
          binding: "Bind seller instructions",
          instruction: "Reviewed seller instruction",
          bindCheck:
            "I reviewed the exact property, the person or company, terms and current authority for this deal.",
          bind: "Bind reviewed instruction",
          source: "Current approved Bulgarian source",
          facts: "Facts and terms",
          media: "Reviewed images",
          rights: "Recorded image usage rights",
          permission: "Publication permission in the instructions",
          privacy: "Public location precision",
          consequences:
            "You acknowledge this exact preview for the agency. This does not publish a listing, sign a contract or certify title. Changes to the content require a new acknowledgment.",
          check:
            "I reviewed the exact displayed terms, facts, Bulgarian copy, images and public disclosure and acknowledge them for this deal.",
          acknowledge: "Acknowledge exact listing preview",
          recorded: "Your acknowledgment is current for this exact preview.",
          unavailable:
            "The preview is not available yet or its source changed. Contact your broker.",
          back: "Open the deal",
          ownerLink: "Review owner listing preview",
          technical: "Technical details",
          authorised: "What you've authorised the agency to do for this deal",
        };

const previewLabels: Record<string, [string, string, string]> = {
  price: ["Price", "Цена", "Цена"],
  bedrooms: ["Bedrooms", "Спални", "Спальни"],
  rooms: ["Rooms", "Стаи", "Комнаты"],
  "area.living": ["Living area", "Жилищна площ", "Жилая площадь"],
  "feature.lift": ["Lift", "Асансьор", "Лифт"],
  "feature.step_free_access": ["Step-free access", "Достъп без стъпала", "Доступ без ступеней"],
  known: ["Recorded", "Записано", "Записано"],
  unknown: ["Unknown", "Неизвестно", "Неизвестно"],
  not_recorded: ["Not recorded", "Не е записано", "Не записано"],
  not_provided: ["Not provided", "Не е предоставено", "Не предоставлено"],
  not_applicable: ["Not applicable", "Не е приложимо", "Неприменимо"],
  conflicting: ["Conflicting evidence", "Противоречиви данни", "Противоречивые данные"],
  withheld: ["Not disclosed", "Не се разкрива", "Не раскрывается"],
  living: ["Living area", "Жилищна площ", "Жилая площадь"],
  asking: ["Asking price", "Офертна цена", "Цена предложения"],
  negotiated: ["Negotiated price", "Договорена цена", "Согласованная цена"],
  month: ["month", "месец", "месяц"],
  true: ["Yes", "Да", "Да"],
  false: ["No", "Не", "Нет"],
  granted: ["Granted", "Предоставени", "Предоставлены"],
  region: ["Region", "Област", "Регион"],
  settlement: ["Settlement", "Населено място", "Населённый пункт"],
  neighborhood: ["Neighborhood", "Квартал", "Район"],
  street: ["Street", "Улица", "Улица"],
  exact: ["Exact location", "Точно местоположение", "Точное местоположение"],
};
export function ownerPreviewLabel(value: string, locale: string) {
  if (
    ["price", "bedrooms", "rooms", "location"].includes(value) ||
    value.startsWith("area.") ||
    value.startsWith("feature.")
  )
    return factFieldLabel(value, locale);
  return (
    previewLabels[value]?.[locale === "bg" ? 1 : locale === "ru" ? 2 : 0] ??
    factFieldLabel(value, locale)
  );
}
