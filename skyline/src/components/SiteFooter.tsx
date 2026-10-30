import Link from 'next/link';

const YEAR = 2026;

/** Server component, no JavaScript. */
export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-ink-200 bg-ink-900 text-ink-100">
      {/*
        A closing statement rather than a link dump. The references all end on
        the brand rather than on navigation, and the dark ground gives the page
        a definite bottom edge instead of fading out on the same cream.
      */}
      <div className="mx-auto max-w-[90rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
        <p className="eyebrow text-sand">Golf Course Road · Gurugram</p>
        <p className="mt-8 max-w-3xl font-display text-4xl leading-[1.05] text-white sm:text-6xl">
          Forty-eight floors, two hundred and twelve homes, one address.
        </p>

        <div className="mt-16 grid gap-12 border-t border-white/12 pt-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-sm">
            <p className="font-display text-xl tracking-[0.18em] text-white">SKYLINE</p>
            <p className="mt-4 text-sm leading-relaxed text-ink-300">
              Two to four bedroom residences, 1,100 to 3,400 sq ft, overlooking the
              Aravalli ridge.
            </p>
          </div>

          <nav aria-label="Explore">
            <h2 className="eyebrow text-ink-400">Explore</h2>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                ['All residences', '/properties'],
                ['3 & 4 BHK', '/properties?bhk=3,4'],
                ['Villas', '/properties?type=villa'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href!}
                    className="text-ink-300 transition-colors hover:text-white"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="eyebrow text-ink-400">Sales gallery</h2>
            <address className="mt-5 space-y-3 text-sm not-italic text-ink-300">
              <p>Golf Course Road, Sector 42</p>
              <p>Gurugram, Haryana 122002</p>
              {/* Plain text, not a tel: link — the number is a placeholder for a
                  fictional tower and should not look dialable. */}
              <p className="text-ink-500">+91 90000 00000</p>
            </address>
          </div>
        </div>
      </div>

      <div className="border-t border-white/12">
        <p className="mx-auto max-w-[90rem] px-5 py-7 text-xs text-ink-500 sm:px-8 lg:px-12">
          © {YEAR} Skyline. A fictional development built for a frontend assignment.
          Listings and RERA numbers are generated sample data.
        </p>
      </div>
    </footer>
  );
}
