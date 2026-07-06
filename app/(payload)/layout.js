import config from "../../payload.config.js";
import { handleServerFunctions, metadata, RootLayout } from "@payloadcms/next/layouts";

const importMap = {};

export { metadata };

export default function PayloadLayout({ children }) {
  return RootLayout({
    children,
    config,
    importMap,
    serverFunction: handleServerFunctions,
  });
}
