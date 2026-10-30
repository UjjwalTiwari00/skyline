import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EnquiryForm } from '@/components/EnquiryForm';
import { Gallery } from '@/components/Gallery';
import { PropertyCard } from '@/components/PropertyCard';
import {
  formatArea,
  formatPossession,
  formatPrice,
  formatPriceExact,
  formatStatus,
  formatType,
  pricePerSqft,
} from '@/lib/format';
import { allSlugs, getPropertyBySlug, getSimilarProperties } from '@/lib/repository';

/**
 * Every slug is known at build time, so all 54 detail pages are prerendered.
 * That is what makes this route cheap to serve and gives it a static LCP.
 */
export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

/**
 * Any slug outside generateStaticParams is a genuine 404.
 *
 * This is not cosmetic. With the default (`true`), Next renders unknown params
 * on demand; our page then calls notFound(), which renders the 404 body but
 * still answers **200**. Measured, before this line:
 *
 *   GET /properties/definitely-not-a-real-slug -> 200, title "Property not found"
 *
 * A 200 on a missing page lets crawlers index nonexistent homes and hides
 * broken links from monitoring. Setting this to false makes Next answer 404
 * before our code runs. The trade-off is that adding stock requires a rebuild,
 * which is correct for a catalogue that ships as a seeded JSON file.
 */
export const dynamicParams = false;

/**
 * An unknown slug is a genuine 404 — not a redirect, and not an empty page
 * rendered with a 200, which would let search engines index nonexistent homes.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const property = getPropertyBySlug(slug);

  if (!property) {
    return { title: 'Property not found', robots: { index: false } };
  }

  const description =
    `${property.title} — ${formatPrice(property.priceInr)}, ${formatArea(property.areaSqft)}. ` +
    `${formatStatus(property.status)} in ${property.locality}, ${property.city}.`;

  const cover = property.images[0];

  return {
    title: property.title,
    description,
    alternates: { canonical: `/properties/${property.slug}` },
    openGraph: {
      title: property.title,
      description,
      url: `/properties/${property.slug}`,
      type: 'article',
      images: cover
        ? [{ url: cover.url, width: cover.width, height: cover.height, alt: cover.alt }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: property.title,
      description,
    },
  };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = getPropertyBySlug(slug);

  if (!property) notFound();

  const similar = getSimilarProperties(slug, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-brand-600">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/properties" className="hover:text-brand-600">
              Properties
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="truncate text-ink-700" aria-current="page">
            {property.locality}
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0">
          <Gallery images={property.images} title={property.title} />

          <header className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ink-900 px-3 py-1 text-xs font-semibold text-white">
                {formatStatus(property.status)}
              </span>
              <span className="rounded-full border border-ink-300 px-3 py-1 text-xs font-medium text-ink-600">
                {formatType(property.type)}
              </span>
              {property.furnished ? (
                <span className="rounded-full bg-sand/95 px-3 py-1 text-xs font-semibold text-ink-900">
                  Furnished
                </span>
              ) : null}
            </div>

            <h1 className="mt-4 font-display text-3xl leading-tight text-ink-900 sm:text-4xl">
              {property.title}
            </h1>
            <p className="mt-2 text-base text-ink-500">
              {property.locality}, {property.city}, {property.state}
            </p>

            <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="font-display text-3xl text-ink-900 sm:text-4xl">
                {formatPrice(property.priceInr)}
              </p>
              {/* The exact figure is the one that matters legally, and the
                  abbreviated form above is ambiguous to a screen reader. */}
              <p className="text-sm text-ink-500">{formatPriceExact(property.priceInr)}</p>
              <p className="text-sm text-ink-500">
                {pricePerSqft(property.priceInr, property.areaSqft)}
              </p>
            </div>
          </header>

          <section aria-labelledby="specs" className="mt-10">
            <h2 id="specs" className="font-display text-2xl text-ink-900">
              Specifications
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-200 sm:grid-cols-3">
              <Spec label="Configuration" value={property.bhk ? `${property.bhk} BHK` : 'Plot'} />
              <Spec label="Carpet area" value={formatArea(property.areaSqft)} />
              <Spec label="Bathrooms" value={property.bathrooms > 0 ? String(property.bathrooms) : '—'} />
              <Spec label="Balconies" value={property.balconies > 0 ? String(property.balconies) : '—'} />
              <Spec label="Possession" value={formatPossession(property.possessionDate)} />
              <Spec label="Developer" value={property.builder} />
            </dl>
            <p className="mt-3 text-xs text-ink-400">RERA {property.reraNo}</p>
          </section>

          <section aria-labelledby="about" className="mt-10">
            <h2 id="about" className="font-display text-2xl text-ink-900">
              About this home
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-600">{property.description}</p>
          </section>

          <section aria-labelledby="amenities" className="mt-10">
            <h2 id="amenities" className="font-display text-2xl text-ink-900">
              Amenities
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {property.amenities.map((amenity) => (
                <li
                  key={amenity}
                  className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-700"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 shrink-0 text-brand-500" fill="currentColor">
                    <path d="M8.1 13.3 4.8 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" />
                  </svg>
                  {amenity}
                </li>
              ))}
            </ul>
          </section>

          <LocationBlock property={property} />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <EnquiryForm propertySlug={property.slug} propertyTitle={property.title} />
        </aside>
      </div>

      {similar.length > 0 ? (
        <section aria-labelledby="similar" className="mt-20">
          <h2 id="similar" className="font-display text-2xl text-ink-900 sm:text-3xl">
            Similar homes
          </h2>
          <p className="mt-2 text-sm text-ink-500">
            Same locality or the same configuration nearby.
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((item) => (
              <li key={item.id}>
                <PropertyCard property={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <dt className="text-xs uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink-800">{value}</dd>
    </div>
  );
}

/**
 * Location block.
 *
 * Deliberately not an embedded map: Google Maps or Mapbox would add a
 * third-party script, cookies and a Best-Practices hit for one decorative
 * panel. This renders coordinates and context as server HTML, and links out
 * to a real map for anyone who wants one.
 */
function LocationBlock({
  property,
}: {
  property: { lat: number; lng: number; locality: string; city: string; state: string };
}) {
  const query = encodeURIComponent(`${property.locality}, ${property.city}`);

  return (
    <section aria-labelledby="location" className="mt-10">
      <h2 id="location" className="font-display text-2xl text-ink-900">
        Location
      </h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {/* Static, decorative street-grid motif — no network request. */}
        <div
          aria-hidden="true"
          className="h-40 bg-ink-100"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(0,0,0,.07) 1px, transparent 1px), linear-gradient(rgba(0,0,0,.07) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-200 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-ink-800">
              {property.locality}, {property.city}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              {property.lat.toFixed(4)}° N, {property.lng.toFixed(4)}° E
            </p>
          </div>
          <a
            href={`https://www.openstreetmap.org/search?query=${query}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Open in maps
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </section>
  );
}
