import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Nav from "@/components/Nav";
import "./globals.css";

// Every page is rendered per request so each one gets a fresh CSP nonce
// (see middleware.ts). Pages built ahead of time can't carry a nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lootbox Mania",
  description: "Lootbox Royale III checklist tracker.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Lootbox Mania home">
            <Image src="/assets/lootbox-mania-logo.png" alt="" width={52} height={52} className="brand-logo" priority />
            <span className="brand-text">Lootbox Mania</span>
          </Link>
          <Nav />
        </header>
        <main id="main" className="main">{children}</main>
      </body>
    </html>
  );
}
