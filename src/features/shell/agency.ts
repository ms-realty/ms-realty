// Public agency facts the shells may state. Coverage areas, office address and hours stay
// out until the owner confirms them (spec §23.3). The values live in src/config/tenant.ts.
import { agency } from "@/config/tenant";

/** The only public phone number: E.164 for tel: links, and its display form. */
export const brandPhone = agency.phone;
