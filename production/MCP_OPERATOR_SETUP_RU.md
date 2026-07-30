# Подключение MS Realty к ChatGPT и Codex через MCP

## Назначение и текущая граница

MCP endpoint приложения — POST https://<production-domain>/mcp. Он не является
общим административным API и не является публичным чат-ботом. Каждый tool получает
минимальный набор данных, а изменения требуют подтверждения, роли и append-only audit
записи.

Endpoint поддерживает OAuth/OIDC и переходные индивидуальные записи операторов через
MS_REALTY_ADMIN_CREDENTIALS_JSON: admin, broker, editor, translator. Bearer-токен нельзя
копировать в ChatGPT, Codex или общий документ и нельзя использовать как общий staff
credential. Для workspace-wide подключения используется OAuth/OIDC: проверенный `sub`
каждого сотрудника сервер сопоставляет с устойчивым `operator_id` и ролью приложения.

## Доступные tools

Без авторизации доступны только проверенные публичные данные:

- search_public_listings
- get_public_listing
- get_launch_status

После идентификации tools добавляются строго по роли:

- broker: рабочая сводка и персональная/командная очередь, подбор объектов,
  постановка уже проверенного ответа в ручную отправку, назначение лида, этапы
  buyer/renter/seller pipeline, показы и follow-up, результат ручной доставки,
  документный checklist, public requests и закрытие сделки после существующих
  процессных проверок;
- editor: очередь контента, правка разрешённых текстовых полей, массовая смена статуса,
  очередь и черновик перевода;
- translator: очередь контента, очередь и черновик перевода.

`get_broker_work_queue` не возвращает raw contact и customer message body.
`run_operator_workflow` принимает только девять allowlisted операций и повторно
проходит те же state-transition, capability, confirmation и audit проверки, что
обычный admin UI. Endpoint намеренно не даёт tool для публикации страницы,
индексирования перевода, фактической отправки сообщения клиенту, назначения прав
доступа, произвольного SQL/HTTP-запроса или запуска фоновых задач. Черновик ответа
всегда ждёт ручной доставки брокером; изменение контента не меняет
`publish_approved`.

## Модель для сотрудников

Поток доступа: **сотрудник в ChatGPT/Codex → OAuth/OIDC личная identity → MS Realty
role и capability → ограниченный MCP tool → подтверждение и append-only audit →
человеческая публикация или доставка.**

Это даёт сотруднику нормальный диалоговый интерфейс, но оставляет фактическую
публикацию, коммуникацию с клиентом и launch-решения в существующем контролируемом
операционном контуре.

## Реализованная OAuth/OIDC граница

При наличии OIDC-конфигурации `/mcp` становится защищённым resource server: до tool
scan проверяются подпись JWT по JWKS, issuer, audience, срок действия, scope и точное
соответствие `sub` записи сотрудника. Роли не принимаются из prompt или request body.
Discovery доступен по
`/.well-known/oauth-protected-resource/mcp`.

Переменные deployment secret/environment:

```dotenv
MS_REALTY_PUBLIC_ORIGIN=https://realty.example
MS_REALTY_MCP_OIDC_ISSUER=https://identity.example
MS_REALTY_MCP_OIDC_AUDIENCE=https://realty.example/mcp
MS_REALTY_MCP_OIDC_JWKS_URL=https://identity.example/.well-known/jwks.json
MS_REALTY_MCP_OIDC_SCOPE=ms-realty:operator
MS_REALTY_MCP_OIDC_PRINCIPALS_JSON=[{"subject":"provider-subject","id":"staff_editor","roles":["editor"]}]
```

В production все URL обязаны использовать HTTPS, а конфигурация должна быть полной.
Неизвестный `sub`, отсутствующий scope, неправильный issuer/audience или невалидная
подпись дают HTTP 401 до создания MCP session. Пример без реальных identity находится
в `production/data/mcp-oidc.env.example`.

## ChatGPT Business / Enterprise / Edu: запуск после production identity setup

По текущим правилам OpenAI full MCP с write/modify действиями находится в beta для
ChatGPT Business, Enterprise и Edu; Pro может подключать custom MCP только для
read/fetch. Remote MCP обязателен: ChatGPT не подключается напрямую к локальному
серверу. Для частной сети OpenAI рекомендует Secure MCP Tunnel.

1. Развернуть HTTPS endpoint https://<production-domain>/mcp и OAuth/OIDC provider.
   Redirect URI, issuer, audience, scopes и JWKS нужно закрепить в deployment secrets;
   не в репозитории.
2. Настроить выдачу refresh token (offline_access) у identity provider, затем в
   Workspace Settings → Apps → Create указать endpoint и OAuth/OIDC, выполнить
   Scan Tools.
3. В новом чате протестировать read tool и по одному write tool каждой роли;
   подтвердить действие в UI и сверить operator_id с audit log.
4. Администратор workspace публикует connector только после проверки. В
   Enterprise/Edu ограничить сотрудников и конкретные tools через RBAC.
5. При изменении схемы tool администратор обязан обновить/перепубликовать snapshot:
   ChatGPT не подхватывает новые tool definition автоматически.

Официальные детали и ограничения: [Developer mode и MCP apps в
ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta),
[Apps SDK](https://help.openai.com/en/articles/12515353-build-with-the-apps-sdk.iso).

## Codex

После того же OAuth/OIDC rollout сотрудник добавляет тот же remote endpoint в
разрешённый workspace connector Codex. Правила не должны расходиться: одна identity,
одна role/capability policy и один audit trail для ChatGPT и Codex. Сначала включаются
read tools, затем по ролям ограниченные write tools; публикацию и отправку клиенту
не добавлять как MCP capability.

## Подписка ChatGPT и автономный Hermes — разные контуры

ChatGPT-подписка покрывает интерактивную работу сотрудника с connector в ChatGPT. Она
не становится серверным budget/credential для запланированного или автономного Hermes
worker. API OpenAI биллингуется и управляется отдельно от ChatGPT, поэтому если в
будущем Hermes должен выполнять автономные model calls, ему нужен отдельный OpenAI API
project, ключ и budget — либо остаётся текущий private self-hosted Hermes. Для MS Realty
OpenRouter не используется.

Источник: [OpenAI: API billed separately from
ChatGPT](https://help.openai.com/en/articles/8156019-is-api-usage-included-in-chatgpt-subscriptions-even-if-i-have-a-paid-chatgpt-account).

## Обязательные условия до staff rollout

- production HTTPS endpoint и allowlist origins;
- OAuth/OIDC с индивидуальными identity, refresh-token flow и mapping identity → role;
- секреты только в deployment secret store, без shared bearer;
- role/tool matrix с проверкой запрещённых операций;
- проверка audit trail на каждого сотрудника;
- workspace admin review и публикация connector;
- отдельный live smoke test после публикации.

Пока live identity, HTTPS и workspace publication не подтверждены, `/mcp` остаётся
реализованным и протестированным endpoint, но не считается подключённым всеми
сотрудниками.
