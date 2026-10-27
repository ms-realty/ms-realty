// C18 · AT43/AT45/UX23: full and byte-range downloads reauthorize before reading bytes.
import { privacyExportGet } from "@/server/privacy/export-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = privacyExportGet;
