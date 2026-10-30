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

      {/*
        Generous vertical rhythm. The section used to breathe at py-16/24; a
        luxury listing page earns its calm from the space around the content,
        and the grid gaps are widened to match so the cards read as plates in
        a brochure rather than as tiles.
      */}
      <section className="mx-auto max-w-[90rem] px-5 py-24 sm:px-8 sm:py-36 lg:px-12">
        <div className="reveal flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow text-ink-400">Available now</p>
            <h2 className="mt-5 font-display text-5xl text-ink-900 sm:text-6xl">
              Featured residences
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ink-500">
              Six homes currently released for sale, from two-bedroom residences to
              the upper-floor penthouses.
            </p>
          </div>
          <Link
            href="/properties"
            className="group inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-ink-700 transition-colors hover:text-brand-600"
          >
            View all residences
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>

        <ul className="reveal-stagger mt-16 grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((property) => (
            <li key={property.id}>
              <PropertyCard property={property} />
            </li>
          ))}
        </ul>
      </section>

      {/* Closing CTA on the dark ground, which sets up the footer below it. */}
      <section className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-[90rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
          <div className="reveal flex flex-wrap items-end justify-between gap-10">
            <div className="max-w-2xl">
              <p className="eyebrow text-ink-400">Private viewing</p>
              <h2 className="mt-5 font-display text-5xl leading-[1.05] text-ink-900 sm:text-6xl">
                See it at golden hour.
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-ink-500">
                The sales gallery is open seven days a week. Choose a residence and
                pick a date — we confirm by phone before you travel.
              </p>
            </div>
            <Link
              href="/properties"
              className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-8 py-4 text-xs
                         uppercase tracking-[0.16em] text-white transition-colors hover:bg-brand-600"
            >
              Explore homes
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
