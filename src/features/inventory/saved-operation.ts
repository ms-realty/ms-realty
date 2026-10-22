// O12: the server's acknowledgement that a listing draft save succeeded. Each scripted submit
// carries a fresh nonce (savedAckField); the save action echoes exactly that nonce in this cookie
// just before its redirect, which is a full page load here. The unsaved-work guard lets only that
// load through, and only while the form still holds what that submit sent. No personal data.
export const savedOperationCookie = "msr_saved_operation";
export const savedAckField = "_ack";
