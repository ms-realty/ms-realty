# Отчёт об исправлениях и полной технической проверке MS Realty

**Дата:** 30 июля 2026 г.

**Ветка:** `codex/ms-realty-content-audit`

**Источник сайта:** новый код в текущем workspace; WordPress используется только как
источник опубликованного legacy-контента для миграции и после переноса не требуется.

## Текущий доказанный статус

- Production build Next.js: **успешно**.
- Полный автоматизированный regression suite: **545 passed, 0 failed**.
- Полный генерационный и launch-evidence pipeline `npm run validate`: **успешно**.
- Проверены **205** текущих public routes: 198 sitemap routes и 7 utility search routes.
- Проверены **108 из 108** сохранённых legacy archive pages.
- Реестр географии содержит **26 775** официальных территориальных записей.
- Launch authority остаётся `blocked`: код собирается и тестируется, но семь внешних
  production gates ещё не подтверждены.
- Текущий live visual audit через запрошенный Browser plugin не выполнен: transport
  закрывается до page discovery с ошибкой `Transport closed`. Поэтому этот отчёт не
  называет интерфейс «pixel perfect» без последнего реального browser pass.

## Исправленные ошибки и пробелы

| № | Было | Исправлено | Проверка |
| --- | --- | --- | --- |
| 1 | Миграция могла потерять опубликованный текст, который не превращался в современную страницу. | Исходный контент сохранён отдельно от нового IA: 418 crawl rows учтены, 108 подходящих записей доступны как opaque noindex archive pages, остальные классифицированы без выдуманных redirect assumptions. | Полный archive test проходит для 108/108 записей. |
| 2 | WordPress мог остаться скрытой runtime-зависимостью нового сайта. | Legacy crawl и WordPress используются только как source evidence; public runtime, search, CMS seed и archive renderer работают из нового workspace. | Next build и standalone runtime tests проходят без WordPress runtime. |
| 3 | Часть описаний объектов использовала устаревший overlay вместо сохранённого источника. | Source-verified descriptions восстановлены; enrichment и audit overlays сохранены отдельно и не удаляют исходный текст. | CMS seed, runtime и content tests. |
| 4 | Metadata одиночного гайда обрезалась как metadata списка. | Общий metadata renderer использует полное описание для одиночной guide page. | Public-site metadata regression. |
| 5 | Locale fallback для location route мог вести на неверную страницу или индексировать fallback. | Locale и canonical сохраняются; неподтверждённая locale/location пара получает корректный fallback/noindex либо 404. | Route-manifest, runtime и SEO tests. |
| 6 | Redirect на homepage/search мог маскировать потерянный legacy URL. | Redirects разрешены только после индивидуального reviewed mapping; прямой archive capture имеет noindex и не создаёт ложный canonical. | Redirect/archive priority tests. |
| 7 | Hero использовал неподходящие по качеству и размеру изображения. | Все предоставленные изображения подготовлены в responsive AVIF/WebP variants; добавлены более качественные 1280/1600/1920 variants, корректный crop и source attribution. | Файлы в `public/hero`, design-asset build и HTML tests. |
| 8 | Hero gallery зависела от ручных кнопок и могла отвлекать пользователя. | Галерея автоматически меняет кадры, не требует кнопок, сохраняет readable overlay и останавливает лишнее движение при `prefers-reduced-motion`. | Hero UX regression и mobile QA. |
| 9 | Главная строка поиска была визуально разорвана: label, pin, input, filter icon и Search не совпадали по высоте и margins. | Hero search полностью собран в единый grid/control contract с согласованными высотами, padding, border-radius и focus state. | `hero-search-ux.test.mjs`, CSS/HTML regressions. |
| 10 | Advanced-search control был крупной отдельной кнопкой и ломал alignment. | Control стал компактной icon-only кнопкой внутри search shell с доступным именем и устойчивым размером. | Hero UX tests и accessibility markup checks. |
| 11 | Advanced filters открывались отдельным modal/popup и перекрывали hero. | Фильтры разворачиваются в normal document flow внутри того же search surface; mobile sheet/modal удалён. | HTML/client regression. |
| 12 | Expanded search визуально распадался на несвязанные колонки и дублировал Search button. | Фильтры сгруппированы по смыслу, единый submit остаётся в search shell, responsive grid перестраивается без overflow. | Hero UX and mobile QA tests. |
| 13 | Поиск имел только свободный location text и неполную географию. | Hero и results page используют общий async geography combobox, country/region/municipality/district/settlement identifiers и сохраняют legacy query parameters. | Geography, runtime, app API и search filter tests. |
| 14 | Не было профессионального полного справочника территорий. | Добавлен расширяемый registry: Болгария — 28 областей, 265 общин, 5 256 населённых мест; Греция — 13 регионов, 333 муниципалитета, 13 586 settlements, включая полный Northern Greece active-market hierarchy. | Registry contains 26 775 records; hierarchy/orphan tests. |
| 15 | Районы, регионы и города могли быть придуманы из свободного текста. | Registry строится из NSI/EKATTE, ELSTAT census и NUTS 2024 snapshots с hash/revision; unknown listing facts не повышаются до verified. | Source snapshot и hierarchy validation. |
| 16 | Не было единого API для нового региона и будущего расширения. | Добавлен `/api/geography` с bounded search, ancestry и стабильными area IDs; импорт нового региона проходит через тот же source-attributed registry contract. | App API, geography search и parity tests. |
| 17 | Карта либо отсутствовала, либо потребовала бы фиктивных listing pins. | Добавлена area map по официальным NUTS 2024 geometries: 28 болгарских областей и 13 греческих регионов; pins не показываются без проверенных координат объекта. | Area-map coverage tests. |
| 18 | Typesense/Meilisearch не знали новую территориальную модель. | Geography IDs и filters добавлены в search fixtures, Typesense schema и Meilisearch settings; engine response не может тихо потерять результаты из-за ограниченного hit window. | Search import/sync/query tests. |
| 19 | Live-preview advanced filters загружал и парсил полную HTML page. | Preview использует существующий `/api/search` JSON и только `search.total_matches`. | Client/QA regression; меньший transfer и отсутствие DOM parsing. |
| 20 | Значение `0` для непроверенной площади/цены могло выглядеть реальным фактом. | Unverified zero нормализуется как unknown; price-on-request и not-applicable сохраняются отдельно. | Search/runtime/schema tests. |
| 21 | Карточки разной высоты заставляли Details/Inquiry/Save «танцевать». | Card body стал flex/grid contract с закреплённой action row и одинаковым baseline независимо от длины title/location. | Public-site/card HTML regressions. |
| 22 | Listing card не всегда имела устойчивый click target. | Media/title/details ведут на canonical listing route; actions остаются отдельными доступными controls. | Route and public-client tests. |
| 23 | Галерея listing page имела неравномерную mosaic layout и изображения нельзя было нормально листать. | Gallery получила устойчивый responsive layout, clickable items, active-image navigation, keyboard Arrow/Home/End и focus management. | Photo-sphere/public-client/listing gallery tests. |
| 24 | Ошибка 360 viewer могла скрыть обычную галерею. | Gallery fallback всегда остаётся доступным; 360 показывается только для reviewed panorama с caption и fallback. | Tour approval и photo-sphere tests. |
| 25 | В mobile gallery появлялось `undefined фото`. | Исправлены locale keys и доступные labels для всех поддерживаемых языков. | Public client localization regression. |
| 26 | Print/PDF был непригодным: layout повторял экран, изображения были маленькими, лишние controls попадали в печать. | Добавлен самостоятельный A4 listing brochure: print typography, page breaks, full-resolution approved images, logo, property facts и contact block; navigation/actions скрываются. | Print HTML/CSS regression и production build. |
| 27 | Save button показывал успех даже при отказе `localStorage`. | UI меняется только после записи и read-back; failure сохраняет фактическое состояние и показывает error toast. | Normal и forced-storage-failure tests. |
| 28 | Skip link менял hash, но не переносил keyboard focus. | Public `main` получил `tabindex=-1`; native fragment navigation сохраняется, focus переносится на `MAIN#main`. | Keyboard regression. |
| 29 | Mobile touch controls были слишком маленькими или могли выйти за viewport. | Mobile-first breakpoints, минимум 44 px для interactive controls, безопасные gaps, wrapping и reduced-motion rules применены к hero, cards, gallery и forms. | Mobile/elderly QA report и UI tests. |
| 30 | Search, hero и listing media могли загружать лишний объём. | Responsive `srcset`, AVIF/WebP, bounded gallery payload, lazy loading вне LCP, JSON filter preview и уменьшенный server trace снижают transfer/package overhead. | Asset build, HTML tests и Next build. |
| 31 | Public routes не имели полного автоматического контракта. | Manifest test рендерит все 205 routes и проверяет HTTP status, kind, title, metadata, H1, canonical/indexability и shell. | `app-route-manifest.test.mjs`. |
| 32 | Контент legacy archive проверялся выборочно. | Test проходит по каждой из 108 страниц и сверяет path, source URL, exact preserved body, canonical policy, noindex/nofollow и отсутствие hreflang/schema. | `runtime.test.mjs`. |
| 33 | Staff connector использовал бы общий secret и не мог безопасно атрибутировать сотрудника. | `/mcp` получил OAuth/OIDC resource-server boundary: JWKS signature, issuer, audience, expiry, scope и server-side `sub → operator_id/roles`. | MCP OIDC tests и protected-resource metadata route. |
| 34 | Роли можно было бы подменить prompt/body/token claims. | Роли берутся только из server-side principals registry; actor/broker/reviewer привязываются к verified principal. | Spoofing и role-capability tests. |
| 35 | ChatGPT/Codex имели только public search, но не полноценную staff work queue. | Добавлен privacy-safe `get_broker_work_queue`: lead SLA/pipeline, viewings, reply delivery, seller flow, public requests и inventory matches без raw contacts/messages. | MCP privacy regression. |
| 36 | Staff connector не мог выполнять ежедневные CRM действия. | Добавлен allowlisted `run_operator_workflow`: assignment, buyer/renter pipeline, viewing/follow-up, manual-delivery outcome, document checklist, seller pipeline, public request и validated deal close. Все действия проходят существующие admin state/capability/audit checks. | MCP workflow test плюс существующие endpoint transition tests. |
| 37 | Connector мог превратиться в unrestricted admin proxy. | Не добавлены arbitrary HTTP/SQL, permission changes, background task execution, content publication или автоматическая отправка сообщения. | Tool-list/role tests. |
| 38 | Translation/Hermes мог публиковать draft или изображать человека. | Hermes может готовить draft, но publish/index/send остаются отдельными human-approved действиями; source facts сохраняются. | Translation/Hermes/audit tests. |
| 39 | Считалось возможным использовать ChatGPT subscription как server API credential Hermes. | Зафиксирована реальная граница: subscription покрывает интерактивную модель в ChatGPT, а unattended Hermes требует self-hosted model либо отдельный API project/budget. | `MCP_OPERATOR_SETUP_RU.md`. |
| 40 | Public/admin/API route handoff мог расходиться между standalone Node и Next. | Оба runtime используют общие adapters; OAuth metadata, MCP, geography, archive и admin routes добавлены в parity validation. | App-route parity, HTTP и node-server tests. |
| 41 | Security headers и write boundaries были неполными. | CSP, no-store private responses, origin allowlist, role capabilities, bounded request bodies, optional rate limiting и privacy-safe audit metadata применены к соответствующим surfaces. | Security-header, rate-limit, auth и audit tests. |
| 42 | Конкурентный и open-source анализ не был связан с решениями продукта. | Сравнение Airbnb, Booking, Imot/ImotiBG и релевантных open-source решений зафиксировано отдельно; в продукт перенесены паттерны progressive disclosure, map/search continuity, stable cards, saved search и guided operator workflow без копирования бренда/кода. | `COMPETITIVE_RESEARCH_RU.md` и реализованные regressions. |

## Проверенная география

| Страна | Проверенное покрытие |
| --- | --- |
| Болгария | 2 NUTS1, 6 NUTS2, 28 областей, 35 municipal districts, 265 общин, 5 256 населённых мест |
| Греция | 4 NUTS1, 13 регионов, 75 regional units, 333 муниципалитета, 1 037 municipal units, 6 135 communities, 13 586 settlements |

Northern Greece отмечен как текущий active-market scope, но registry покрывает всю
Грецию, поэтому новый регион можно включить без изменения search schema. Телефонный
area code хранится как справочная географическая характеристика, а не как адрес или
доказательство местоположения конкретного объекта.

## Что проверено автоматически

1. Все 205 public route contracts и 108 legacy archive routes.
2. Hero/basic/advanced search markup, filter semantics и mobile behavior.
3. Полный geography hierarchy, source snapshots, map coverage и API search.
4. Typesense-first, Meilisearch fallback и seed fallback без скрытия ошибок.
5. CMS seed, Payload-style collections, translations, structured data и sitemap.
6. Listing cards, saved listings, galleries, 360 fallback, keyboard navigation и print.
7. Lead intake, CRM pipelines, appointments, documents, replies, seller journey и deals.
8. MCP anonymous/role separation, OIDC, privacy projection, confirmations и audit actor.
9. Standalone Node/Next route parity, HTTP smoke, CSP, compression и rate limiting.
10. Production build и generated launch-readiness artifacts.

## Не исправляется выдумыванием данных

Текущий listing-quality report содержит 165 source listings:

- **165** не имеют подтверждённой площади;
- **18** имеют thin public gallery;
- цена, bedrooms, location и description не имеют текущих массовых missing issues.

Площадь и дополнительные фотографии нельзя сгенерировать как property facts. Эти
поля должны быть подтверждены сотрудником по документам/владельцу и импортированы
через human listing-quality review.

## Оставшиеся внешние production gates

`production/data/launch-readiness.json` содержит семь блокирующих gates:

1. `redirect_reviews` — индивидуально утвердить оставшиеся legacy URL decisions.
2. `external_seo_exports` — предоставить реальные Search Console, Yandex Webmaster и
   backlink exports по обоим legacy-доменам.
3. `listing_quality_review` — завершить human review CSV для 165 listings.
4. `live_services` — предоставить live Typesense, Meilisearch и Hermes worker reports.
5. `monitoring_rollback` — подтвердить production monitoring и rollback proof.
6. `payload_runtime` — предоставить реальный Payload/Postgres runtime report.
7. `production_recovery` — выполнить и подписать recovery drill с разделёнными ролями.

Отдельно для staff-wide ChatGPT/Codex connector нужны live HTTPS/OIDC credentials,
workspace app publication/RBAC, mapping реальных staff subjects и live smoke каждой
роли. Код endpoint готов, но отсутствие этих внешних параметров нельзя закрыть
локальным fixture.

## Незавершённая визуальная проверка

Запрошенный in-app Browser plugin был вызван повторно после успешного build, но его
transport вернул `Transport closed` до получения списка страниц. Автоматические
mobile/a11y/layout tests зелёные, однако финальный ручной responsive pass на реальном
Chromium остаётся обязательным после восстановления Browser connection:

- 360, 390, 768, 1024, 1440 и 1920 px;
- collapsed/expanded hero search;
- keyboard-only и reduced-motion;
- cards, listing gallery/lightbox и print preview;
- реальные network/LCP/CLS screenshots.

## Основные официальные источники

- NSI/EKATTE (Болгария) и ELSTAT Census 2021 (Греция), revisions и hashes сохранены
  в `production/data/geography-registry.json`.
- Eurostat GISCO NUTS 2024:
  `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2024_4326.geojson`.
- MCP Authorization:
  `https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`.
- OpenAI developer mode/full MCP:
  `https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta`.
