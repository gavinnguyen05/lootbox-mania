import Link from "next/link";

export const metadata = { title: "Page not found | Lootbox Mania" };

export default function NotFound() {
  return (
    <div className="message-page">
      <p className="code" aria-hidden>404</p>
      <h1>Page not found.</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist.</p>
      <div className="message-actions">
        <Link href="/" className="btn btn-primary">Go Home</Link>
      </div>
    </div>
  );
}
