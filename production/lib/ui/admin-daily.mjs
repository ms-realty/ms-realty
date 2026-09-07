// Admin-only enhancement. No network requests or mutation retries.
export function initAdminDaily(rootDocument = document, rootWindow = window) {
  rootDocument.querySelectorAll('[data-daily-workspace]').forEach(root => {
    const rows = Array.from(root.querySelectorAll('[data-daily-row]'));
    const details = Array.from(root.querySelectorAll('[data-daily-detail]'));
    const filters = Array.from(root.querySelectorAll('[data-daily-filter]'));
    const search = root.querySelector('[data-daily-search]');
    let filter = 'all';
    function apply() {
      const query = search.value.trim().toLocaleLowerCase();
      let wanted = '';
      try { wanted = decodeURIComponent(rootWindow.location.hash.slice(1)); } catch {}
      const visible = rows.filter(row => {
        const matches = (!query || row.textContent.toLocaleLowerCase().includes(query)) &&
          (filter === 'all' || row.getAttribute('data-daily-tags').split(' ').includes(filter));
        row.hidden = !matches;
        return matches;
      });
      const selected = visible.find(row => row.querySelector('[data-daily-select]').getAttribute('data-daily-select') === wanted) || visible[0];
      const id = selected?.querySelector('[data-daily-select]').getAttribute('data-daily-select');
      rows.forEach(row => {
        const link = row.querySelector('[data-daily-select]');
        if (row === selected) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      details.forEach(detail => { detail.hidden = detail.id !== id; });
      root.querySelector('[data-daily-empty]').hidden = visible.length > 0 || rows.length === 0;
      filters.forEach(button => {
        const on = button.getAttribute('data-daily-filter') === filter;
        button.setAttribute('aria-pressed', String(on));
        button.setAttribute('data-on', on ? '1' : '0');
      });
    }
    search.addEventListener('input', apply);
    filters.forEach(button => button.addEventListener('click', () => { filter = button.getAttribute('data-daily-filter'); apply(); }));
    rootWindow.addEventListener('hashchange', apply);
    root.setAttribute('data-daily-enhanced', 'true');
    apply();
  });
}
export function initDailyTaskForms(rootDocument = document) {
  function openCreate() {
    if (window.location.hash === '#task-create') {
      const create = rootDocument.getElementById('task-create');
      if (create) create.open = true;
    }
  }
  window.addEventListener('hashchange', openCreate);
  openCreate();
  rootDocument.querySelectorAll('[data-task-form]').forEach(form => {
    const status = form.querySelector('[data-daily-task-status]');
    if (!status) return;
    const submit = form.querySelector('[type="submit"]');
    let locked = false;
    function sync() { submit.disabled = locked || !form.checkValidity(); }
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (locked || !form.reportValidity()) return;
      locked = true;
      sync();
      form.setAttribute('aria-busy', 'true');
      const note = status.querySelector('p');
      note.textContent = status.getAttribute('data-saving');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(form.getAttribute('action'), { method: 'POST', signal: controller.signal, credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        if (!response.ok && response.status < 500) {
          note.textContent = status.getAttribute('data-failed');
          locked = false;
        } else {
          const result = await response.json();
          if (!response.ok || result.kind !== 'task' || !result.task || !result.event) throw new Error('unconfirmed result');
          note.textContent = status.getAttribute('data-saved');
          status.querySelector('a').hidden = false;
        }
      } catch {
        note.textContent = status.getAttribute('data-unknown');
        status.querySelector('a').hidden = false;
      } finally {
        clearTimeout(timeout);
        form.removeAttribute('aria-busy');
        sync();
      }
    });
    sync();
  });
}
export const ADMIN_DAILY_JS = `(${initAdminDaily.toString()})();(${initDailyTaskForms.toString()})();`;
