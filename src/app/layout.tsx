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
  icons: { icon: "/assets/lootbox-mania-logo.png", apple: "/assets/lootbox-mania-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <Link href="/" className="brand">
            {/* Height is fixed by CSS; width follows the image's own shape. */}
            <Image src="/assets/lootbox-royale.png" alt="Lootbox Royale" width={240} height={80} className="brand-logo" priority />
          </Link>
          <Nav />
        </header>
        <main id="main" className="main">{children}</main>
      </body>
    </html>
  );
}
