import { h } from './react-static-html.mjs';

const WORDS = {
  en: { actor: 'Acting operator', saving: 'Saving…', saved: 'Recorded. Reload the queue to see the current state.', failed: 'The change was rejected. Check the form and try again.', unknown: 'The result is unknown. Reload the queue before trying again.', reload: 'Reload queue', search: 'Search this queue', all: 'All', overdue: 'Overdue', authored: 'Created here', empty: 'No matching records.', review: 'Review', source: 'Source work', unavailable: 'Changes are unavailable in this workspace.', calendar: 'A saved appointment does not confirm calendar delivery.' },
  bg: { actor: 'Оператор, който извършва действието', saving: 'Записване…', saved: 'Записано. Презареди опашката за текущото състояние.', failed: 'Промяната е отхвърлена. Провери формата и опитай отново.', unknown: 'Резултатът е неизвестен. Презареди опашката преди нов опит.', reload: 'Презареди опашката', search: 'Търси в опашката', all: 'Всички', overdue: 'Просрочени', authored: 'Създадени тук', empty: 'Няма съвпадащи записи.', review: 'Преглед', source: 'Работа от друг източник', unavailable: 'Промените не са достъпни в това работно пространство.', calendar: 'Записаният час не потвърждава доставена покана за календар.' },
  ru: { actor: 'Оператор, выполняющий действие', saving: 'Сохранение…', saved: 'Записано. Обнови очередь, чтобы увидеть текущее состояние.', failed: 'Изменение отклонено. Проверь форму и повтори попытку.', unknown: 'Результат неизвестен. Обнови очередь перед повторной попыткой.', reload: 'Обновить очередь', search: 'Поиск в очереди', all: 'Все', overdue: 'Просроченные', authored: 'Созданы здесь', empty: 'Подходящих записей нет.', review: 'Просмотр', source: 'Работа из другого источника', unavailable: 'Изменения недоступны в этом рабочем пространстве.', calendar: 'Сохранённая встреча не подтверждает доставку приглашения в календарь.' },
};
export function dailyCopy(page) { return WORDS[page.workspace?.locale] || WORDS.en; }
export function dailyRecordId(scope, id) { return `${scope}-${id}`; }

// Queue rows and details are rendered from the same records. Anchors also work
// without the enhancement; filtering never changes or completes a record.
export function DailyWorkspace({ scope, page, title, rows, filters = [], empty, renderRow, renderDetail }) {
  const copy = dailyCopy(page);
  return h('section', { className: 'adm-daily-workspace', 'data-daily-workspace': scope, 'aria-label': title },
    h('div', { className: 'adm-daily-queue' },
      h('div', { className: 'adm-daily-tools' },
        h('label', { htmlFor: `${scope}-search` }, copy.search),
        h('input', { id: `${scope}-search`, type: 'search', placeholder: copy.search, 'data-daily-search': true }),
        filters.length ? h('div', { className: 'crm-seg', role: 'group', 'aria-label': title },
          ...[{ value: 'all', label: copy.all }, ...filters].map(f => h('button', { key: f.value, type: 'button', 'data-daily-filter': f.value, 'aria-pressed': f.value === 'all', 'data-on': f.value === 'all' ? '1' : '0' }, f.label))) : null),
      rows.length ? h('ol', { className: 'adm-daily-rows' }, ...rows.map(row => h('li', {
        key: row.id, 'data-daily-row': true, 'data-daily-tags': row.tags || '',
      }, h('a', { href: `#${encodeURIComponent(dailyRecordId(scope, row.id))}`, 'data-daily-select': dailyRecordId(scope, row.id) }, renderRow(row))))) : empty,
      h('p', { className: 'adm-empty', role: 'status', 'data-daily-empty': true, hidden: true }, copy.empty)),
    h('div', { className: 'adm-daily-details' }, ...rows.map(row => h('article', {
      key: row.id, id: dailyRecordId(scope, row.id), 'data-daily-detail': true, tabIndex: -1,
    }, renderDetail(row)))));
}

export function DailyTaskStatus({ page }) {
  const copy = dailyCopy(page);
  return h('div', { className: 'adm-daily-save', 'data-daily-task-status': true, 'data-saving': copy.saving, 'data-saved': copy.saved, 'data-failed': copy.failed, 'data-unknown': copy.unknown },
    h('p', { role: 'status', 'aria-live': 'polite' }),
    h('a', { href: `/admin/tasks?locale=${encodeURIComponent(page.workspace.locale)}`, className: 'mk-btn mk-btn--secondary', hidden: true }, copy.reload));
}

export function DailyTaskActor({ page }) {
  const operator = String(page.workspace?.operator_id || '').trim();
  return h('label', null, dailyCopy(page).actor, h('input', { name: 'actor', required: true, maxLength: 160, defaultValue: operator, readOnly: Boolean(operator), autoComplete: 'name' }));
}
