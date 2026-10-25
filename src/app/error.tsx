"use client";
import Link from "next/link";

/**
 * Shown for unexpected failures. Next.js logs the real error on the server;
 * the browser only receives an opaque digest, never the message or stack.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="message-page" role="alert">
      <h1>Something went wrong.</h1>
      <p>We couldn&apos;t load this page.</p>
      <div className="message-actions">
        <button className="btn btn-primary" onClick={reset}>Try Again</button>
        <Link href="/" className="btn">Go Home</Link>
      </div>
    </div>
  );
}
