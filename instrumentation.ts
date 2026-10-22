// Next awaits register before serving any request, including public/media/private routes.
// The restore procedure installs the persistent quarantine while all runtimes are offline.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { verifyRecoveryStartup } = await import("./src/server/recovery/startup");
    try {
      await verifyRecoveryStartup(process.env.DATABASE_URL);
    } catch {
      // Next 16.3 catches rejected preparation and leaves its listener alive. A quarantined
      // destination must terminate explicitly so the supervisor cannot mistake it for healthy.
      console.error("Recovery quarantine: web startup blocked.");
      process.exit(1);
    }
  }
}
