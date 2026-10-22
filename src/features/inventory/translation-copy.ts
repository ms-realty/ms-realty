export function translationCopy(locale: string) {
  const en = {
    heading: "Translation review",
    title: "Translated title",
    description: "Translated description",
    intent: "Action",
    note: "Review note",
    confirmed:
      "For approval: I compared price, area, rooms, location, reference and source URL with the Bulgarian source.",
    save: "Save draft",
    submit: "Submit for review",
    approve: "Approve language for this source",
    reject: "Request changes",
    apply: "Apply selected action",
    locked: "This language version is approved. Create a new source revision to replace it.",
    source: "Approved Bulgarian source",
    saved: "Translation action recorded",
    next: "Language approval does not publish or make the locale indexable.",
    open: "Return to translation",
    saveFirst: "Save the edited text before reviewing it.",
  };
  if (locale === "bg")
    return {
      ...en,
      heading: "Преглед на превод",
      title: "Преведено заглавие",
      description: "Преведен текст",
      intent: "Действие",
      note: "Бележка от прегледа",
      confirmed:
        "За одобрение: сравних цена, площ, стаи, местоположение, референция и адрес на източника с българската версия.",
      save: "Запазване на чернова",
      submit: "Предаване за преглед",
      approve: "Езиково одобрение за този източник",
      reject: "Искане за промени",
      apply: "Изпълнение на избраното действие",
      locked: "Този превод е одобрен. За замяна създайте нова изходна версия.",
      source: "Одобрен български източник",
      saved: "Действието за превода е записано",
      next: "Езиковото одобрение не публикува и не разрешава индексиране.",
      open: "Към превода",
      saveFirst: "Запазете редактирания текст преди преглед.",
    };
  if (locale === "ru")
    return {
      ...en,
      heading: "Проверка перевода",
      title: "Переведённый заголовок",
      description: "Переведённый текст",
      intent: "Действие",
      note: "Примечание проверки",
      confirmed:
        "Для одобрения: я сверил цену, площадь, комнаты, местоположение, референцию и адрес источника с болгарской версией.",
      save: "Сохранить черновик",
      submit: "Передать на проверку",
      approve: "Одобрить язык для этой версии",
      reject: "Запросить изменения",
      apply: "Выполнить выбранное действие",
      locked: "Этот перевод одобрен. Для замены создайте новую исходную версию.",
      source: "Одобренный болгарский источник",
      saved: "Действие с переводом записано",
      next: "Языковое одобрение не публикует и не разрешает индексацию.",
      open: "К переводу",
      saveFirst: "Сохраните правки текста перед проверкой.",
    };
  return en;
}
