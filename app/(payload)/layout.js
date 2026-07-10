import config from "../../payload.config.js";
import { handleServerFunctions, metadata, RootLayout } from "@payloadcms/next/layouts";
import "@payloadcms/next/css";

const importMap = {};

const serverFunction = async (args) => {
  "use server";

  return handleServerFunctions({
    ...args,
    config,
    importMap,
  });
};

export { metadata };

export default function PayloadLayout({ children }) {
  return RootLayout({
    children,
    config,
    importMap,
    serverFunction,
  });
}
