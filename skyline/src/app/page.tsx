import type { Metadata } from 'next';
import Link from 'next/link';

import { HeroCanvas } from '@/components/hero/HeroCanvas';
import { PropertyCard } from '@/components/PropertyCard';
import { featuredProperties } from '@/lib/repository';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Skyline — Luxury residences in Delhi NCR',
    description:
      'A 48-storey tower on Golf Course Road, Gurugram. Scroll the tower’s story, then explore 54 homes.',
    url: '/',
    images: [{ url: '/properties/home-03.jpg', width: 1600, height: 1067, alt: 'The Skyline tower at dusk' }],
  },
};

/**
 * Landing page.
 *
 * A Server Component. The scroll-driven scene lives inside HeroCanvas, which
 * is the only client boundary here, and three is reached only through a
 * dynamic import inside it — so none of the 3D code is in this route's
 * initial JavaScript.
 */
export default function HomePage() {
  const featured = featuredProperties(6);

  return (
    <>
      <HeroCanvas poster="/properties/home-03.jpg" />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl text-ink-900 sm:text-4xl">Featured homes</h2>
            <p className="mt-3 text-base leading-relaxed text-ink-500">
              Six residences currently released for sale, from two-bedroom homes to the
              upper-floor penthouses.
            </p>
          </div>
          <Link
            href="/properties"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            See all homes →
          </Link>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((property) => (
            <li key={property.id}>
              <PropertyCard property={property} />
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-ink-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-lg">
            <h2 className="font-display text-3xl text-ink-900">Book a site visit</h2>
            <p className="mt-3 text-base leading-relaxed text-ink-500">
              The sales gallery is open seven days a week. Pick a home and choose a date.
            </p>
          </div>
          <Link href="/properties" className="btn-primary">
            Explore homes
          </Link>
        </div>
      </section>
    </>
  );
}
