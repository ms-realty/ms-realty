// O12: the server's acknowledgement that a listing draft save succeeded. The save action sets it
// just before its redirect, which is a full page load here; the unsaved-work guard lets exactly
// that load through. It names one operation id and carries no personal data.
export const savedOperationCookie = "msr_saved_operation";
