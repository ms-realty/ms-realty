import { PAYLOAD_ADMIN_ROLES } from "./payload-admin-auth.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAdminTeamPage({ operators = [], created = false, error = false } = {}) {
  const status = created
    ? '<p class="notice" role="status">Операторът е създаден. / Operator created.</p>'
    : error
      ? '<p class="error" role="alert">Операторът не беше създаден. Провери данните. / Operator was not created.</p>'
      : "";
  const rows = operators
    .map(
      (operator) => `<tr>
        <td>${escapeHtml(operator.name || "—")}</td>
        <td>${escapeHtml(operator.email)}</td>
        <td>${escapeHtml(operator.role)}</td>
        <td>${escapeHtml((operator.workspace_ids || []).join(", ") || "—")}</td>
      </tr>`,
    )
    .join("");
  const roles = PAYLOAD_ADMIN_ROLES.map((role) => `<option value="${role}">${role}</option>`).join("");
  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MS Realty — екип</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #f6f4ef; color: #1f2933; }
  main { max-width: 960px; margin: 0 auto; }
  section { background: #fff; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 30px rgba(31,41,51,.06); }
  form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  label { display: grid; gap: 6px; font-weight: 600; }
  input, select, button { font: inherit; padding: 11px; border-radius: 8px; border: 1px solid #cbd5e1; box-sizing: border-box; }
  button { background: #1d4ed8; color: #fff; border: 0; font-weight: 700; cursor: pointer; align-self: end; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  .notice { color: #166534; font-weight: 600; }
  .error { color: #b91c1c; font-weight: 600; }
  @media (max-width: 700px) { form { grid-template-columns: 1fr; } table { font-size: .9rem; } }
</style>
</head>
<body>
<main>
  <p><a href="/admin">← MS Realty admin</a></p>
  <h1>Екип / Team</h1>
  ${status}
  <section>
    <h2>Нов оператор / New operator</h2>
    <form method="POST" action="/api/admin/team">
      <label>Име / Name<input name="name" autocomplete="name"></label>
      <label>Имейл / Email<input name="email" type="email" autocomplete="off" required></label>
      <label>Парола / Password<input name="password" type="password" autocomplete="new-password" minlength="12" required></label>
      <label>Роля / Role<select name="role" required>${roles}</select></label>
      <label>Работни пространства / Workspaces<input name="workspace_ids" placeholder="sandanski"></label>
      <button type="submit">Създай / Create</button>
    </form>
  </section>
  <section>
    <h2>Оператори / Operators</h2>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Workspaces</th></tr></thead><tbody>${rows}</tbody></table>
  </section>
</main>
</body>
</html>`;
}
