const catalogs = {
  bg: {
    choose: "Изберете решение",
    recordSelected: "Запис на избраното решение",
    save: "Запис",
    original: "Първоначално запитване",
    select: "Изберете запитване",
    hint: "Изберете от последните достъпни запитвания или въведете номера на по-старо запитване от входящата кутия.",
    confirm:
      "Това премества запитването в опашката за проверка. То не се изтрива и може да бъде поето отново.",
    review: "Потвърждавам преместването за проверка",
  },
  en: {
    choose: "Choose what happens next",
    recordSelected: "Save this decision",
    save: "Record",
    original: "Original inquiry",
    select: "Choose an inquiry",
    hint: "Choose a recent inquiry or enter the reference of an older inquiry from the inbox.",
    confirm:
      "This moves the inquiry to the review queue. It is not deleted and can be accepted again.",
    review: "I confirm moving this inquiry to review",
  },
  ru: {
    choose: "Выберите решение",
    recordSelected: "Записать выбранное решение",
    save: "Записать",
    original: "Исходное обращение",
    select: "Выберите обращение",
    hint: "Выберите недавнее обращение или введите номер более раннего обращения из входящих.",
    confirm:
      "Обращение перейдёт в очередь проверки. Оно не удаляется, и его можно снова принять в работу.",
    review: "Подтверждаю перевод обращения на проверку",
  },
};
export const triageCopy = (locale: string) =>
  catalogs[locale as keyof typeof catalogs] ?? catalogs.en;
