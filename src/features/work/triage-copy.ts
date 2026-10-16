const catalogs = {
  bg: {
    choose: "Изберете решение",
    save: "Запис",
    original: "Първоначално запитване",
    select: "Изберете запитване",
    hint: "Показани са до 200 от последните запитвания, до които имате достъп, с техния номер и име.",
    confirm:
      "Това премества запитването в опашката за проверка. То не се изтрива и може да бъде поето отново.",
    review: "Потвърждавам преместването за проверка",
  },
  en: {
    choose: "Choose a disposition",
    save: "Record",
    original: "Original inquiry",
    select: "Choose an inquiry",
    hint: "Up to 200 recent inquiries you can access are shown by reference and name.",
    confirm:
      "This moves the inquiry to the review queue. It is not deleted and can be accepted again.",
    review: "I confirm moving this inquiry to review",
  },
  ru: {
    choose: "Выберите решение",
    save: "Записать",
    original: "Исходное обращение",
    select: "Выберите обращение",
    hint: "Показано до 200 последних доступных обращений с номером и именем.",
    confirm:
      "Обращение перейдёт в очередь проверки. Оно не удаляется, и его можно снова принять в работу.",
    review: "Подтверждаю перевод обращения на проверку",
  },
};
export const triageCopy = (locale: string) =>
  catalogs[locale as keyof typeof catalogs] ?? catalogs.en;
