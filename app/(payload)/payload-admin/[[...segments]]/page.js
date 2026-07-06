import config from "../../../../payload.config.js";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";

const importMap = {};

export const generateMetadata = ({ params, searchParams }) =>
  generatePageMetadata({ config, params, searchParams });

export default function PayloadAdminPage({ params, searchParams }) {
  return RootPage({
    config,
    importMap,
    params,
    searchParams,
  });
}
