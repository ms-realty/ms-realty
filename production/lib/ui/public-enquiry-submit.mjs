// Self-contained: embedded into the progressive enhancement bundle.
export function submitPublicEnquiry(form, payload, onDone, showError) {
  const translations = {
    en: ["We cannot confirm whether your enquiry was received. Your details are kept. Check its status before sending again.", "Check request status", "No receipt was found. You can retry the same enquiry safely.", "Try sending again", "We cannot check the request right now. Your details are kept. Contact the office before sending another enquiry.", "Check your details and try again.", "Your browser cannot create a secure request reference. Please contact the office."],
    bg: ["Не можем да потвърдим дали запитването е получено. Данните ви са запазени. Проверете статуса, преди да изпратите отново.", "Проверете статуса", "Няма потвърждение за получаване. Можете безопасно да повторите същото запитване.", "Изпратете отново", "Сега не можем да проверим статуса. Данните ви са запазени. Свържете се с офиса, преди да изпратите ново запитване.", "Проверете данните и опитайте отново.", "Браузърът не може да създаде защитен номер на запитването. Свържете се с офиса."],
    ru: ["Не можем подтвердить получение запроса. Ваши данные сохранены. Проверьте статус перед повторной отправкой.", "Проверить статус", "Подтверждение не найдено. Можно безопасно повторить тот же запрос.", "Отправить повторно", "Сейчас статус проверить нельзя. Данные сохранены. Свяжитесь с офисом перед отправкой нового запроса.", "Проверьте данные и попробуйте снова.", "Браузер не может создать защищённый номер запроса. Свяжитесь с офисом."],
    de: ["Wir können den Eingang Ihrer Anfrage nicht bestätigen. Ihre Angaben bleiben erhalten. Prüfen Sie vor dem erneuten Senden den Status.", "Status prüfen", "Keine Empfangsbestätigung gefunden. Sie können dieselbe Anfrage sicher erneut senden.", "Erneut senden", "Der Status kann gerade nicht geprüft werden. Ihre Angaben bleiben erhalten. Kontaktieren Sie das Büro vor einer neuen Anfrage.", "Prüfen Sie Ihre Angaben und versuchen Sie es erneut.", "Ihr Browser kann keine sichere Anfragenummer erstellen. Bitte kontaktieren Sie das Büro."],
    nl: ["We kunnen de ontvangst niet bevestigen. Uw gegevens blijven bewaard. Controleer de status voordat u opnieuw verzendt.", "Status controleren", "Geen ontvangstbevestiging gevonden. U kunt dezelfde aanvraag veilig opnieuw verzenden.", "Opnieuw verzenden", "We kunnen de status nu niet controleren. Uw gegevens blijven bewaard. Neem contact op met het kantoor voordat u een nieuwe aanvraag verzendt.", "Controleer uw gegevens en probeer opnieuw.", "Uw browser kan geen veilig aanvraagnummer maken. Neem contact op met het kantoor."],
    el: ["Δεν μπορούμε να επιβεβαιώσουμε την παραλαβή. Τα στοιχεία σας διατηρούνται. Ελέγξτε την κατάσταση πριν στείλετε ξανά.", "Έλεγχος κατάστασης", "Δεν βρέθηκε επιβεβαίωση παραλαβής. Μπορείτε να στείλετε ξανά το ίδιο αίτημα με ασφάλεια.", "Αποστολή ξανά", "Δεν μπορούμε να ελέγξουμε την κατάσταση τώρα. Τα στοιχεία σας διατηρούνται. Επικοινωνήστε με το γραφείο πριν στείλετε νέο αίτημα.", "Ελέγξτε τα στοιχεία σας και δοκιμάστε ξανά.", "Το πρόγραμμα περιήγησης δεν μπορεί να δημιουργήσει ασφαλή αριθμό αιτήματος. Επικοινωνήστε με το γραφείο."],
    he: ["לא ניתן לאשר אם הפנייה התקבלה. הפרטים נשמרו. יש לבדוק את המצב לפני שליחה נוספת.", "בדיקת מצב הפנייה", "לא נמצא אישור קבלה. ניתן לשלוח שוב את אותה פנייה בבטחה.", "שליחה חוזרת", "לא ניתן לבדוק את המצב כרגע. הפרטים נשמרו. יש לפנות למשרד לפני שליחת פנייה חדשה.", "יש לבדוק את הפרטים ולנסות שוב.", "הדפדפן אינו יכול ליצור מספר פנייה מאובטח. יש לפנות למשרד."],
  };
  const copy = translations[String(document.documentElement.lang || "en").split("-")[0]] || translations.en;
  let state = form.__publicEnquirySubmission;
  if (state && state.phase !== "retry") return;
  const submit = form.querySelector('[type="submit"]');
  if (!state) {
    if (!globalThis.crypto?.randomUUID) { showError(form, copy[6]); return; }
    state = { phase: "sending", payload: JSON.parse(JSON.stringify(payload)), controls: [], submitHtml: submit?.innerHTML };
    state.payload.idempotencyKey = "public-lead:" + globalThis.crypto.randomUUID();
    form.__publicEnquirySubmission = state;
    // Keep the exact submitted values until the outcome is known. Reopening
    // the shared dialog must not replace the pending listing or contact data.
    for (const control of form.elements) {
      state.controls.push([control, control.disabled]);
      control.disabled = true;
    }
  }
  state.phase = "sending";
  form.setAttribute("aria-busy", "true");
  if (submit) { submit.disabled = true; submit.setAttribute("data-loading", ""); }
  if (state.check) state.check.hidden = true;

  function unlock() {
    for (const [control, disabled] of state.controls) control.disabled = disabled;
    if (submit) { submit.innerHTML = state.submitHtml; submit.removeAttribute("data-loading"); }
    form.removeAttribute("aria-busy");
    state.check?.remove();
    delete form.__publicEnquirySubmission;
  }
  function receiptMatches(receipt) {
    return receipt?.kind === "lead_receipt" && receipt.state === "received" &&
      typeof receipt.lead_id === "string" && receipt.lead_id.length > 0 &&
      receipt.idempotency_key === state.payload.idempotencyKey &&
      receipt.source === state.payload.source && receipt.listing_reference === (state.payload.listingReference || null);
  }
  function accepted(receipt) { unlock(); onDone(receipt); }
  function idle() {
    form.removeAttribute("aria-busy");
    if (submit) submit.removeAttribute("data-loading");
  }
  function unknown(message = copy[0]) {
    state.phase = "unknown";
    idle();
    if (submit) submit.disabled = true;
    showError(form, message);
    if (!state.check) {
      state.check = document.createElement("button");
      state.check.type = "button";
      state.check.className = "mk-btn mk-btn--secondary mk-btn--lg";
      state.check.style.minHeight = "44px";
      state.check.setAttribute("data-enquiry-status-check", "true");
      state.check.textContent = copy[1];
      state.check.addEventListener("click", checkStatus);
      form.appendChild(state.check);
    }
    state.check.hidden = false;
    state.check.disabled = false;
  }
  async function checkStatus() {
    if (state.phase !== "unknown") return;
    state.phase = "checking";
    state.check.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      const response = await fetch("/api/leads/status", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: state.payload.idempotencyKey, source: state.payload.source, listingReference: state.payload.listingReference || null }),
      });
      const result = await response.json();
      if (response.ok && receiptMatches(result)) { accepted(result); return; }
      if (response.ok && result.kind === "lead_status" && result.state === "not_received" && result.retry_safe === true && result.idempotency_key === state.payload.idempotencyKey) {
        state.phase = "retry";
        idle();
        state.check.hidden = true;
        showError(form, copy[2]);
        if (submit) { submit.disabled = false; submit.textContent = copy[3]; }
        return;
      }
    } catch { /* An unavailable status service says nothing about receipt. */ }
    unknown(copy[4]);
  }
  fetch(form.getAttribute("action"), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state.payload),
  }).then(async (response) => {
    let result;
    try { result = await response.json(); } catch { unknown(); return; }
    if (response.ok && receiptMatches(result.receipt)) { accepted(result.receipt); return; }
    if (!response.ok && (result.intake_status === "rejected" || [403, 413, 429].includes(response.status))) {
      unlock();
      showError(form, copy[5]);
      return;
    }
    unknown();
  }).catch(() => unknown());
}
