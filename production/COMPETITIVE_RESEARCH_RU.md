# Конкурентный и open-source benchmark MS Realty

**Дата проверки:** 29 июля 2026 г.
**Цель:** выявить применимые ожидания пользователя и workflow агентства, не копируя
чужой код, не подменяя факты листингов и не превращая агентский сайт в OTA.

## Что проверено

| Источник | Подтверждённый паттерн | Решение для MS Realty |
| --- | --- | --- |
| [imot.bg](https://www.imot.bg/obiavi/prodazhbi/grad-sofiya) | Сохранение search-фильтра, переключение list/map и отдельные среднее/медианное значения по выборке. | Сохранение объектов и criteria-based saved search уже есть. Map и price-aggregates не добавляются без reviewed координат и достаточной нормализованной выборки. |
| [ImotiBG map search](https://imotibg.bg/search-maps) | Рынок ожидает map-first поиск для территорий, где геоданные готовы. | Не рисовать маркеры с approximate/free-text локацией. Сначала listing_id → approved coordinates + privacy precision policy. |
| [Airbnb: filters](https://www.airbnb.com/help/article/3740), [map/wishlists](https://www.airbnb.com/help/article/252) | Фильтры, карта и сохранённые объекты снижают трение поиска. | Фильтры, local saved listings и мобильный list-first путь сохранены. Availability/instant booking не переносятся: у агентства просмотр и подтверждение брокером. |
| [Airbnb: neighbourhoods](https://www.airbnb.com/help/article/422) | Район — управляемая сущность, выводимая из адреса и поддерживаемой boundary model, а не маркетинговая строка. | Добавлена только reviewed NSI municipality facet. District появляется после утверждённой таксономии, а не по догадке модели. |
| [Booking.com Demand API: filters/sorting](https://developers.booking.com/demand/docs/accommodations/filter-sorting) | Фильтры и сортировка должны быть предсказуемы и соответствовать реальным данным инвентаря. | Сохраняем детерминированный search fallback; не обещаем availability/ranking signals, которых нет в CMS. |

## Open-source проверка

| Проект | Что полезно как продуктовый ориентир | Лицензия / решение о reuse |
| --- | --- | --- |
| [Property Hive](https://github.com/propertyhive/WP-Property-Hive) | Search, property detail, enquiry и viewing workflow — базовый минимум agency platform. | Upstream указывает GPL-3.0. Код не копировался и не переносится; MS Realty остаётся независимым от WordPress. |
| [Real Estate Manager](https://github.com/WebCodingPlace/real-estate-manager) | Карта, clustering, saved searches и wishlist показывают ожидаемые расширения портала. | Код не использован. До любого reuse обязательны отдельные license/security/dependency review; сейчас это только перечень product ideas. |
| [RentTools](https://github.com/Gribadan/RentTools.io) | Разделение ролей, mobile/PWA дисциплина, отчётность и явные границы calendar sync. | MIT, но это short-term rental manager; код не импортирован. Можно брать только проверяемые архитектурные идеи после отдельного design review. |
| [OpenEstate-IO](https://github.com/OpenEstate/OpenEstate-IO) | Поддержка форматов OpenImmo, ImmoXML, Kyero, Trovit и IDX полезна для будущего inbound import boundary. | Java library и иной runtime. Не интегрирована; при появлении реального feed выбрать формат и провести compatibility/license review вместо port «на всякий случай». |

## Реальный gap-анализ

### Уже закрыто в текущем цикле

- Поиск имеет reviewed municipality facet и безопасный fallback при усечённом ответе search engine.
- Saved listing больше не показывает ложный успех, если браузер не может подтвердить запись в localStorage.
- Сохраняются отдельные intent для inquiry, callback, viewing и seller valuation; mobile path не сводит их к одной общей форме.
- Mobile gallery/360 failure не скрывает основной gallery path, controls имеют keyboard/focus/reduced-motion поведение.
- Staff tools ограничены role и allowlist: drafting/content operations не могут публиковать листинг или обходить review.

### Намеренно не «закрыто» кодом

| Возможность рынка | Почему нельзя включить сейчас | Условие для включения |
| --- | --- | --- |
| Районы / neighbourhood search | В source data нет утверждённого listing → district mapping. | Reviewed taxonomy, owner и дата проверки каждой связи. |
| Map/cluster search | Координаты и допустимая точность показа не подтверждены для полного inventory. | Approved coordinates, privacy rule и mobile map QA. |
| Средние цены / price per m² | 165 объектов без подтверждённой площади; агрегат будет вводить в заблуждение. | Полный human listing-quality review и методология выборки/периода. |
| Instant booking / availability calendar | Это не подтверждённая модель агентства; viewing остаётся request с ответом брокера. | Отдельный product decision, calendar source of truth и операционный SLA. |
| Автоматическая публикация/рассылка Hermes | Противоречит draft-only и human-review boundaries. | Явно изменённая policy, permissions и audit model. |

## Приоритет после production evidence

1. **P0 — данные и эксплуатация:** закончить reviewer CSV, redirect/SEO exports, live search/Payload/Hermes reports, monitoring/rollback и OAuth/OIDC для персонального MCP доступа.
2. **P1 — география без выдумки:** добавить district dataset и координаты, затем сделать list/map parity, clustering и mobile accessibility test; не раньше.
3. **P1 — качество inventory:** обязательные area, нормальная gallery, freshness/price-change review и source-backed quality badges.
4. **P2 — поисковый опыт:** объяснимый sort, saved-search alerts и source-reviewed accessibility/amenity filters. Любая персонализация — только с consent и измерением качества.
5. **P2 — imports:** при появлении реального партнёрского feed выбрать один формат и построить отдельный адаптер с schema/error contract; не переносить Java/PHP плагины в новый runtime.

## Performance boundary

В текущем коде 360 viewer загружается только как локальный versioned asset и только для
approved panorama markup; это исключает внешний viewer CDN из critical path. После
исправления Next tracing локальная server trace стала меньше, но это **не** заменяет live
Core Web Vitals. LCP/INP/CLS должны сниматься на staging/production с настоящими медиа,
кэшем, CDN и сетевыми профилями до объявления performance-гейта закрытым.
