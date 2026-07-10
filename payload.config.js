import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { bg } from "@payloadcms/translations/languages/bg";
import { en } from "@payloadcms/translations/languages/en";
import { ru } from "@payloadcms/translations/languages/ru";
import { buildConfig } from "payload";

const root = path.dirname(fileURLToPath(import.meta.url));
const generated = JSON.parse(fs.readFileSync(path.join(root, "production/data/payload-collections.json"), "utf8"));

const admins = {
  slug: "admins",
  auth: true,
  admin: { useAsTitle: "email" },
  fields: [
    { name: "name", type: "text" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "admin",
      options: ["admin", "broker", "editor", "translator"],
    },
  ],
};

const locales = {
  slug: "locales",
  admin: { useAsTitle: "code", defaultColumns: ["code", "native_name", "direction", "public_enabled"] },
  fields: [
    { name: "code", type: "text", required: true, unique: true },
    { name: "native_name", type: "text", required: true },
    { name: "admin_name", type: "text", required: true },
    { name: "direction", type: "select", required: true, options: ["ltr", "rtl"] },
    { name: "public_enabled", type: "checkbox", defaultValue: false },
    { name: "indexable", type: "checkbox", defaultValue: false },
    { name: "fallback_locale", type: "relationship", relationTo: "locales" },
    { name: "reviewer_owner", type: "text" },
  ],
};

export default buildConfig({
  admin: { user: "admins" },
  routes: { admin: "/payload-admin" },
  // ponytail: local defaults keep build/test importable; launch readiness still requires real env values.
  secret: process.env.PAYLOAD_SECRET || "ms-realty-local-payload-secret",
  i18n: {
    fallbackLanguage: "en",
    supportedLanguages: { bg, ru, en },
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || "postgres://payload:payload@127.0.0.1:5432/ms_realty",
    },
  }),
  collections: [admins, locales, ...generated.collections],
});
