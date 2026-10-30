import Link from 'next/link';

/**
 * Server component — the header ships zero JavaScript.
 *
 * There are only two destinations, so they sit inline at every breakpoint
 * rather than behind a hamburger. A mobile menu would mean a client component,
 * hydration, and an open/closed state to keep correct on navigation, to hide
 * two links.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-ink-50/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-display text-xl tracking-tight text-ink-900 sm:text-2xl"
          aria-label="Skyline — home"
        >
          Skyline
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/properties"
            className="rounded-full px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 sm:px-4"
          >
            Properties
          </Link>
          <Link
            href="/properties?sort=price-desc"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 sm:inline-flex"
          >
            Luxury
          </Link>
          <Link
            href="/properties"
            className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-700 sm:px-5"
          >
            Book a visit
          </Link>
        </nav>
      </div>
    </header>
  );
}
