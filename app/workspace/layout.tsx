import type { Metadata } from "next";
import { connection } from "next/server";
import "../globals.css";

export const metadata: Metadata = {
  title: "MS Realty workspace",
  icons: { icon: "/brand/favicon.svg" },
  robots: { index: false, follow: false },
};

export default async function WorkspaceRootLayout({ children }: LayoutProps<"/workspace">) {
  // Dynamic rendering is required for the per-request CSP nonce.
  await connection();
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  );
}
