# Отчёт об исправлениях и технической проверке MS Realty

**Дата:** 29 июля 2026 г.
**Ветка проверки:** codex/ms-realty-content-audit
**Статус:** технический цикл исправлений завершён локально; production запуск всё ещё
заблокирован только перечисленными в конце внешними доказательствами и решениями.

Этот документ перечисляет все дефекты, исправленные в данном цикле. Он не называет
«исправленным» то, что требует реального production-доступа, ручной проверки фактов
объектов или решения владельца контента.

## Исправленные дефекты

| № | Дефект и причина | Исправление | Доказательство |
| --- | --- | --- | --- |
| 1 | В гайде была неверная ссылка на официальный источник Агентства по вписванията. | Источник заменён на проверенный официальный URL, без изменения смысла гайда. | a0f995f; unit tests контента. |
| 2 | Описания объектов частично опирались на устаревший review overlay вместо сохранённого первоисточника миграции. | Восстановлены source-verified описания, audit overlay сохранён отдельно; не удалены исходные данные. | e6aab3c; тесты runtime и description review. |
| 3 | Metadata страницы с одним гайдом обрезалась как будто это длинный список. | Общий генератор metadata выбирает полное описание, если страница содержит один guide. | 6aa82e7; public-site test. |
| 4 | Локальный текст локации и контакта был недостаточно точен для Болгарии и иностранного покупателя. | Уточнены нейтральные factual copy и контактный route без добавления неподтверждённых обещаний. | 20beebe; public-site tests. |
| 5 | Для локализованных location routes fallback мог вести на неверный результат. | Fallback теперь сохраняет locale и корректно выдаёт noindex/404, если пары locale/location нет. | 6ce900b; route manifest, runtime и public-site tests. |
| 6 | География части объектов хранилась как свободный текст, что мешало проверке и поиску. | Добавлены reviewed страна, NSI municipality и settlement, обновлены CMS seed, sitemap и search documents. | b438c27; CMS/runtime/SEO/search tests. |
| 7 | Не было безопасного connector surface для ChatGPT/Codex. | Добавлен /mcp: public discovery + строго role-bound staff tools, input validation, origin protection, no-store и audit. | 73c2964; MCP tests и Node-server parity. |
| 8 | На узком мобильном экране ошибка 360 viewer могла скрыть весь блок медиа; управление галереей не имело полноценной keyboard/focus поддержки. | Сохранён gallery fallback, добавлены 44px controls, Arrow/Home/End, reduced-motion и видимый focus; static HTML корректно передаёт tabindex. | ad016b0; photo-sphere, public-site, app-route и мобильные проверки. |
| 9 | В мобильной галерее отображалась строка вида undefined фото: использовались неверные ключи локализации. | Кнопки получили правильные locale labels во всех поддерживаемых языках. | 1b391c0; regression test. |
| 10 | Staff не мог выполнять ограниченное content-редактирование через MCP. | Добавлены очередь контента, allowlisted text patch и bulk status update с обязательным подтверждением; tool не может публиковать или менять approval. | 2219e7c; MCP tests. |
| 11 | Public approval flow позволял передать имя reviewer в запросе вместо привязки к authenticated operator; tour мог обходить явное подтверждение. | Reviewer server-bound к identity, spoofing отклоняется, для тура обязателен reviewConfirmed, audit остаётся append-only. | 8353416; admin/http/tour/runtime regression tests. |
| 12 | Поиск не имел проверяемой территориальной грани, а search-engine ответ мог быть неполным из-за лимита hits. | Добавлен фильтр «Муниципалитет» на базе reviewed NSI данных; при неполном engine result UI использует полный безопасный локальный результат. | e65840d; app API, public site, search-engine tests. |
| 13 | Полный test suite ожидал старое описание и не отправлял новое обязательное подтверждение тура. | Smoke fixtures приведены к источнику правды и новому approval contract. | e652d50; полный suite снова проходит. |
| 14 | next build затягивал migration evidence runtime paths в server trace и выдавал warning, раздувая deployment trace. | Runtime-mounted evidence paths исключены из build tracing, при этом testable runtime behaviour сохранено. | 839f3ac; next:build проходит без этого warning. |
| 15 | В архитектурном документе сохранялся старый fallback через OpenRouter, противоречащий текущей policy. | OpenRouter и внешние model aggregators исключены; при недоступности private Hermes optional drafting fail-closed, deterministic workflows остаются доступны. | Текущий документальный checkpoint; SOURCE_OF_TRUTH.md §11. |
| 16 | Кнопка «Сохранить объект» показывала успех даже при отказе localStorage: ошибка записи подавлялась, а UI обновлялся без read-back. | writeSaved возвращает успех только после безопасной записи и точного read-back; при ошибке остаётся фактическое состояние и показывается toast. | public-client-saved-listing.test.mjs; normal и forced-failure browser path. |
| 17 | Skip link менял #main, но main не был focusable; после Enter клавиатурный пользователь возвращался к началу документа. | Все public main landmarks получили tabindex=-1; click handler сохраняет нативную fragment-навигацию и переносит focus с preventScroll. | Client regression test; реальный Tab → Enter на 360px: #main, active element MAIN#main. |
| 18 | После усиления tour approval два executable smoke fixture продолжали посылать старый request без reviewConfirmed, поэтому полный release validation ломался на HTTP/Node smoke. | Оба fixture явно моделируют подтверждённый human review; endpoint по-прежнему отклоняет неполные запросы. | npm run http:build, npm run server:smoke, полный npm run validate. |
| 19 | Mobile filter live preview на каждое изменение загружал целую HTML search page и парсил DOM только ради числа совпадений. | Preview использует уже существующий /api/search, передаёт locale из form action и читает только search.total_matches из JSON. | client/QA regression tests; локальный fixture: 20 654 B JSON против 143 840 B HTML при одинаковых 71 matches. |

## Что именно добавлено для «районов» и почему

В данных нет утверждённой neighbourhood/district taxonomy для каждого объекта. Поэтому
сайт не создаёт выдуманные «районы». В поиск добавлен проверяемый **муниципалитет**
(NSI municipality) только для подтверждённых болгарских settlement records. Это честная
территориальная фасета, которая не вводит покупателя в заблуждение. Районный фильтр можно
добавить только после supplied/reviewed таблицы listing_id → district и проверки
координат; map-first UI до этого не включается намеренно.

Полное сравнение с Imot, ImotiBG, Airbnb, Booking.com и релевантными open-source
проектами, включая сознательно неиспользованные лицензии и следующий приоритет работ,
зафиксировано в [COMPETITIVE_RESEARCH_RU.md](COMPETITIVE_RESEARCH_RU.md).

## Проверка этого цикла

- Полный Node test suite: **517 passed, 0 failed**.
- Полный npm run validate проходит: generated contracts, HTTP/Node smoke, mobile/elderly
  QA и launch-evidence reports строятся без code failure. Его external blockers остаются
  именно external blockers, а не замалчиваются.
- npm run next:build завершён успешно; прежний warning про неожиданный файл в NFT list
  устранён.
- Измерение server trace после исправления: project references снижены с **36 682** до
  **1 969**, total traced entries — с **73 912** до **14 665**. Это уменьшает deployment
  packaging overhead; это не заявление о LCP/transfer-size без live измерения.
- MCP regression suite проверяет anonymous/public разграничение, роли, origin rejection,
  подтверждения, невозможность публикации и attribution в audit log.
- Реальный Chromium audit на **360 × 800**: seller valuation и listing viewing отправляют
  изолированные POST /api/leads с **201**, показывают success state и переносят focus на
  корректный элемент; viewing сохраняет intent=viewing, source и listing reference.
- На той же ширине проверены normal и forced-storage-failure ветки saved listing,
  gallery/tour fallback и keyboard skip link. Mobile action controls в viewing path имеют
  высоту **52 px**.
- Тестовые журналы использовали временный localhost и после проверки перемещены в корзину;
  рабочие lead/contact данные не затронуты.

## Не считаются исправленными: внешние production gates

Ниже не дефекты кода, а обязательные реальные действия. По
production/data/launch-readiness.json текущий launch status остаётся blocked:

1. **292 legacy URL** требуют индивидуального решения: сохранить 200, одношаговый 301
   на эквивалентный контент или обоснованный 410. Redirect на homepage/search запрещён.
2. Нужны реальные CSV/export из **Google Search Console, Yandex Webmaster и backlinks**.
3. Нужен заполненный human listing-quality CSV. В текущем отчёте всё ещё видны **165**
   объектов без подтверждённой площади и **18** с тонкой публичной галереей; эти факты
   нельзя выдумывать или «оптимизировать» текстом.
4. Нужны live отчёты Typesense/Meilisearch, Hermes worker и Payload/Postgres runtime.
5. Нужны monitoring/rollback proof и проверенный production recovery drill с разными
   оператором и reviewer.
6. Для staff-wide ChatGPT/Codex rollout нужен production HTTPS + OAuth/OIDC + индивидуальная
   mapping identity→role. Текущий bearer registry безопасен для серверной интеграции с
   индивидуальными secrets, но не является механизмом самостоятельного подключения каждым
   сотрудником. Подробности: [MCP_OPERATOR_SETUP_RU.md](MCP_OPERATOR_SETUP_RU.md).

## Следующий безопасный порядок

1. Развернуть staging с production-like identity и выполнить персональный MCP smoke test
   для broker/editor/translator.
2. Собрать внешние launch evidence, пройти npm run launch:preflight и только после этого
   считать сайт готовым к production.
