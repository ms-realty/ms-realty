/** Present before any route or task update, including the server-rendered baseline. */
export function LiveAnnouncer() {
  return (
    <>
      <div
        aria-live="polite"
        aria-atomic="true"
        data-announcer="polite"
        data-live-announcer="true"
        className="sr-only"
      />
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-announcer="assertive"
        data-live-announcer="true"
        className="sr-only"
      />
    </>
  );
}
