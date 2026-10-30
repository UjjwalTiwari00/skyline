import Link from 'next/link';

const YEAR = 2026;

/** Server component, no JavaScript. */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ink-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[2fr_1fr_1fr] lg:px-8">
        <div className="max-w-sm">
          <p className="font-display text-2xl text-ink-900">Skyline</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            A 48-storey residential tower on Golf Course Road, Gurugram. Two to four
            bedroom homes, 1,100 to 3,400 sq ft.
          </p>
        </div>

        <nav aria-label="Explore">
          <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-ink-400">
            Explore
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link href="/properties" className="text-ink-600 hover:text-brand-600">
                All homes
              </Link>
            </li>
            <li>
              <Link href="/properties?bhk=3,4" className="text-ink-600 hover:text-brand-600">
                3 &amp; 4 BHK
              </Link>
            </li>
            <li>
              <Link
                href="/properties?type=villa"
                className="text-ink-600 hover:text-brand-600"
              >
                Villas
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-ink-400">
            Sales gallery
          </h2>
          <address className="mt-4 space-y-2.5 text-sm not-italic text-ink-600">
            <p>Golf Course Road, Sector 42</p>
            <p>Gurugram, Haryana 122002</p>
            {/* Plain text, not a tel: link — the number is a placeholder for a
                fictional tower and should not look dialable. */}
            <p className="text-ink-400">+91 90000 00000</p>
          </address>
        </div>
      </div>

      <div className="border-t border-ink-200">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-ink-400 sm:px-6 lg:px-8">
          © {YEAR} Skyline. A fictional development built for a frontend assignment.
          Listings and RERA numbers are generated sample data.
        </p>
      </div>
    </footer>
  );
}
