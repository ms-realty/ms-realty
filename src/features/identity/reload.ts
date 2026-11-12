/**
 * A full page load: the server renders the page for an active session or sends the person to
 * sign in. Kept apart so the page guard's tests can observe it.
 */
export function reloadPage(): void {
  window.location.reload();
}
