export function inventoryDecisionCopy(locale: string) {
  const t = (en: string, bg: string, ru: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    navigation: t("Listing sections", "Раздели на обявата", "Разделы объявления"),
    backToSections: t(
      "Back to listing sections",
      "Към разделите на обявата",
      "К разделам объявления",
    ),
    locales: t("Languages", "Езици", "Языки"),
    publicationLocale: t("Publication language", "Език на публикацията", "Язык публикации"),
    noteRequired: t(
      "Enter a review note of 5–1000 characters.",
      "Въведете бележка от 5 до 1000 знака.",
      "Введите примечание от 5 до 1000 символов.",
    ),
    confirmRequired: t(
      "Confirm that you reviewed this exact revision and scope.",
      "Потвърдете прегледа на тази точна версия и обхват.",
      "Подтвердите проверку этой точной версии и объёма.",
    ),
    localeRequired: t(
      "Choose a supported publication language.",
      "Изберете поддържан език за публикуване.",
      "Выберите поддерживаемый язык публикации.",
    ),
    next: t(
      "Return to this section to inspect the current record before another decision.",
      "Върнете се в този раздел и проверете текущия запис преди следващо решение.",
      "Вернитесь в этот раздел и проверьте текущую запись перед следующим решением.",
    ),
    review: t(
      "Review current prerequisites",
      "Преглед на текущите условия",
      "Проверить текущие условия",
    ),
    evidence: t(
      "Review seller evidence",
      "Преглед на доказателствата от продавача",
      "Проверить документы продавца",
    ),
    media: t(
      "Review photos and rights",
      "Преглед на снимките и правата",
      "Проверить фотографии и права",
    ),
    translation: t(
      "Review the selected translation",
      "Преглед на избрания превод",
      "Проверить выбранный перевод",
    ),
    reauthenticate: t(
      "Confirm your identity",
      "Потвърдете самоличността си",
      "Подтвердите личность",
    ),
    stepUp: t(
      "Confirm your identity before this decision. Your entered note is retained below.",
      "Потвърдете самоличността си преди това решение. Бележката е запазена по-долу.",
      "Подтвердите личность перед этим решением. Примечание сохранено ниже.",
    ),
    forbidden: t(
      "Your current access does not allow this decision.",
      "Текущият ви достъп не позволява това решение.",
      "Ваш текущий доступ не разрешает это решение.",
    ),
    changed: t(
      "The reviewed record changed. Your note is retained; reopen the current section and review it before making a new decision.",
      "Прегледаният запис е променен. Бележката е запазена; отворете текущия раздел и го прегледайте преди ново решение.",
      "Проверенная запись изменилась. Примечание сохранено; откройте текущий раздел и проверьте его перед новым решением.",
    ),
    unavailable: t(
      "This decision is temporarily unavailable. No change was recorded; keep this operation receipt when retrying.",
      "Решението временно не е достъпно. Не е записана промяна; запазете това потвърждение при повторен опит.",
      "Решение временно недоступно. Изменение не записано; сохраните это подтверждение при повторе.",
    ),
    blockers: {
      fact_review_required: t(
        "A current factual review is required before publication.",
        "Преди публикуване е нужен актуален преглед на фактите.",
        "Перед публикацией нужна актуальная проверка фактов.",
      ),
      approval_stale: t(
        "The source approval is missing or no longer current. Review the current source revision.",
        "Одобрението на източника липсва или вече не е актуално. Прегледайте текущата версия.",
        "Одобрение исходника отсутствует или устарело. Проверьте текущую версию.",
      ),
      seller_instruction_required: t(
        "Current reviewed seller permission for these exact terms is required.",
        "Нужно е актуално прегледано разрешение от продавача за тези точни условия.",
        "Нужно актуальное проверенное разрешение продавца на эти точные условия.",
      ),
      locale_not_approved_for_source: t(
        "This language has no current human approval for the source revision.",
        "Този език няма актуално човешко одобрение за изходната версия.",
        "Для этого языка нет актуального одобрения человеком исходной версии.",
      ),
      media_not_eligible: t(
        "Publication requires reviewed media with current usage rights and a ready public image.",
        "Публикуването изисква прегледана медия с актуални права и готово публично изображение.",
        "Для публикации нужны проверенные материалы с действующими правами и готовым публичным изображением.",
      ),
      professional_review_required: t(
        "The regulated claims require a current professional review.",
        "Регулираните твърдения изискват актуален професионален преглед.",
        "Регулируемые утверждения требуют актуальной профессиональной проверки.",
      ),
      listing_withdrawn: t(
        "This listing is withdrawn. Review its current availability before publication.",
        "Обявата е свалена. Прегледайте актуалната наличност преди публикуване.",
        "Объявление снято. Проверьте актуальную доступность перед публикацией.",
      ),
      restrict_affected_publications_first: t(
        "Restrict affected live publications before approving changed facts.",
        "Ограничете засегнатите публикации преди одобряване на променените факти.",
        "Ограничьте затронутые публикации перед одобрением изменённых фактов.",
      ),
      missing_facts: t(
        "The frozen candidate is missing required facts or has unresolved fact conflicts. Review its facts and sources.",
        "Във фиксираната версия липсват нужни факти или има нерешени противоречия. Прегледайте фактите и източниците.",
        "В зафиксированной версии нет обязательных фактов или остались противоречия. Проверьте факты и источники.",
      ),
    },
  };
}
