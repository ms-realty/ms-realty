(function () {
  var root = document.querySelector("[data-site-page-editor]");
  if (!root) return;
  var copyForm = root.querySelector('[data-site-page-form="save"]');
  var status = root.querySelector("[data-site-page-feedback]");
  var dirtyNote = root.querySelector("[data-site-page-dirty]");
  var signIn = root.querySelector("[data-site-page-signin]");
  var verify = root.querySelector("[data-site-page-verify]");
  var current = root.querySelector("[data-site-page-current]");
  var saving = false;
  var dirty = false;
  var state = function () {
    return ["title", "description", "h1", "intro"].map(function (key) { return copyForm.elements[key].value; }).join("\u0000");
  };
  var baseline = state();
  function syncDirty() {
    dirty = state() !== baseline;
    dirtyNote.hidden = !dirty;
    root.querySelectorAll('[data-site-page-form]:not([data-site-page-form="save"]) button[type="submit"]').forEach(function (button) { button.disabled = dirty || saving; });
  }
  copyForm.addEventListener("input", syncDirty);
  window.addEventListener("beforeunload", function (event) {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  root.addEventListener("submit", function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-site-page-form")) return;
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    if (dirty && form !== copyForm) { dirtyNote.hidden = false; return; }
    var data = Object.fromEntries(new FormData(form).entries());
    var buttons = Array.from(root.querySelectorAll('button[type="submit"]')).map(function (button) { return { button: button, disabled: button.disabled }; });
    var fields = Array.from(copyForm.querySelectorAll("input:not([type=hidden]),textarea"));
    saving = true;
    buttons.forEach(function (entry) { entry.button.disabled = true; });
    fields.forEach(function (field) { field.readOnly = true; });
    root.setAttribute("aria-busy", "true");
    status.textContent = root.getAttribute("data-saving-message");
    signIn.hidden = true;
    verify.hidden = true;
    current.hidden = true;
    fetch(form.getAttribute("action"), { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(data) })
      .then(async function (response) {
        var result = await response.json().catch(function () { return {}; });
        if (!response.ok) {
          var verification = result.kind === "two_factor_required" || result.kind === "two_factor_enrolment_required";
          verify.hidden = !verification;
          signIn.hidden = response.status !== 401 && result.kind !== "password_change_required";
          current.hidden = response.status !== 409 && response.status < 500;
          var message = verification ? "verification" : !signIn.hidden ? "session" : response.status === 409 ? "conflict" : response.status === 400 ? "invalid" : response.status === 403 ? "forbidden" : "failure";
          throw new Error(root.getAttribute("data-" + message + "-message"));
        }
        if (result.kind !== "site_page_saved" || result.readback_verified !== true || !result.editor_url) throw new Error(root.getAttribute("data-failure-message"));
        var destination = new URL(result.editor_url, window.location.origin);
        if (destination.origin !== window.location.origin || destination.pathname !== "/admin/site-pages/seller") throw new Error(root.getAttribute("data-failure-message"));
        baseline = state();
        dirty = false;
        window.location.assign(destination.href);
      })
      .catch(function (error) {
        status.textContent = error.message || root.getAttribute("data-failure-message");
        status.focus();
        current.hidden = false;
      })
      .finally(function () {
        saving = false;
        buttons.forEach(function (entry) { entry.button.disabled = entry.disabled; });
        fields.forEach(function (field) { field.readOnly = false; });
        root.removeAttribute("aria-busy");
        syncDirty();
      });
  });
})();
