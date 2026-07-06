import config from "../../../../payload.config.js";
import { NotFoundPage } from "@payloadcms/next/views";

const importMap = {};

export default function PayloadAdminNotFound({ params, searchParams }) {
  return NotFoundPage({
    config,
    importMap,
    params,
    searchParams,
  });
}
