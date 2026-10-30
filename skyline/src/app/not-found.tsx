import Link from 'next/link';

/**
 * Real 404. Reached by notFound() from the detail route for an unknown slug,
 * and by any unmatched URL. Returns a 404 status, not a 200 with an apology,
 * so crawlers and monitoring see the truth.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center sm:px-6">
      <p className="font-display text-6xl text-ink-300">404</p>
      <h1 className="mt-4 font-display text-3xl text-ink-900">We couldn’t find that home</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        The listing may have been sold or the link may be mistyped. Every available
        residence is on the properties page.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/properties" className="btn-primary">
          Browse all homes
        </Link>
        <Link href="/" className="btn-secondary">
          Back to Skyline
        </Link>
      </div>
    </div>
  );
}
