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
    <header className="sticky top-0 z-40 border-b border-ink-200/60 bg-ink-50/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[90rem] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
        {/*
          Wordmark set in the display face with wide tracking. Every reference
          in the set treats the name as a mark rather than as a nav item, and
          the letterspacing is what does that work.
        */}
        <Link
          href="/"
          className="font-display text-2xl tracking-[0.18em] text-ink-900 sm:text-[1.75rem]"
          aria-label="Skyline — home"
        >
          SKYLINE
        </Link>

        {/*
          Small-caps links with a hairline that draws in on hover, instead of
          pills. Pills read as app chrome; this reads as a masthead.
        */}
        <nav aria-label="Primary" className="flex items-center gap-6 sm:gap-9">
          <Link
            href="/properties"
            className="group hidden text-xs uppercase tracking-[0.18em] text-ink-600 transition-colors hover:text-ink-900 sm:inline-block"
          >
            Residences
            <span
              aria-hidden="true"
              className="mt-1 block h-px w-0 bg-ink-900 transition-all duration-300 group-hover:w-full"
            />
          </Link>
          <Link
            href="/properties?sort=price-desc"
            className="group hidden text-xs uppercase tracking-[0.18em] text-ink-600 transition-colors hover:text-ink-900 sm:inline-block"
          >
            Penthouses
            <span
              aria-hidden="true"
              className="mt-1 block h-px w-0 bg-ink-900 transition-all duration-300 group-hover:w-full"
            />
          </Link>
          <Link
            href="/properties"
            className="inline-flex items-center gap-2 rounded-full border border-ink-900 px-5 py-2.5 text-xs
                       uppercase tracking-[0.16em] text-ink-900 transition-colors hover:bg-ink-900 hover:text-white"
          >
            Book a visit
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
