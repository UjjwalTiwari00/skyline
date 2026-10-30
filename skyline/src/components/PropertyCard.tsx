import Image from 'next/image';
import Link from 'next/link';

import type { Property } from '@/lib/property';
import { formatArea, formatPrice, formatStatus, formatType } from '@/lib/format';

/**
 * Listing card.
 *
 * Information architecture is carried over from PropViewCardPro.jsx in the
 * 100acress app (image, status badge, price, configuration, locality, spec
 * row, CTA). The markup is new: the original was styled-components with fixed
 * pixel sizes — `width: 811px`, `.imgeProp { width: 242px; height: 210px }`,
 * and `height: 100vh` on the list wrapper — which cannot hold from 360px to
 * 1920px, and shipped a runtime CSS-in-JS dependency we have no budget for.
 *
 * Server component. Zero JavaScript.
 */
export function PropertyCard({
  property,
  /**
   * The first row is above the fold on every breakpoint, so those images are
   * the LCP candidate and must not be lazy. Everything below stays lazy.
   */
  priority = false,
}: {
  property: Property;
  priority?: boolean;
}) {
  const cover = property.images[0];

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-200
                 bg-white shadow-card transition-shadow duration-300 hover:shadow-card-hover
                 focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2"
    >
      {/* Fixed aspect ratio reserves the space before the image decodes, which
          is what holds CLS at 0 on a slow connection. */}
      <div className="relative aspect-[3/2] overflow-hidden bg-ink-200">
        {cover ? (
          <Image
            src={cover.url}
            alt={cover.alt}
            fill
            // Mirrors the grid below: 1 column under 640, 2 under 1024, else 3.
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : null}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-ink-900/85 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            {formatStatus(property.status)}
          </span>
          {property.furnished ? (
            <span className="rounded-full bg-sand/95 px-2.5 py-1 text-[11px] font-semibold text-ink-900">
              Furnished
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-xl text-ink-900 sm:text-2xl">
            {formatPrice(property.priceInr)}
          </p>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
            {formatType(property.type)}
          </p>
        </div>

        <h3 className="font-sans text-sm font-semibold leading-snug text-ink-800">
          {/* Stretched link: the whole card is clickable but there is exactly
              one tab stop, and the accessible name is the title. */}
          <Link
            href={`/properties/${property.slug}`}
            className="before:absolute before:inset-0 before:content-[''] focus:outline-none"
          >
            <span className="line-clamp-2">{property.title}</span>
          </Link>
        </h3>

        <p className="flex items-center gap-1.5 text-sm text-ink-500">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-400"
            fill="currentColor"
          >
            <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
          </svg>
          <span className="truncate">
            {property.locality}, {property.city}
          </span>
        </p>

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-ink-200 pt-3 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-400">Config</dt>
            <dd className="font-medium text-ink-700">
              {property.type === 'plot' ? 'Plot' : `${property.bhk} BHK`}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-400">Area</dt>
            <dd className="font-medium text-ink-700">{formatArea(property.areaSqft)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-400">Bath</dt>
            <dd className="font-medium text-ink-700">
              {property.bathrooms > 0 ? property.bathrooms : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

/** Matches the card's exact box so switching to real data shifts nothing. */
export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
      <div className="aspect-[3/2] bg-ink-200" />
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="skeleton h-7 w-32" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-2/5" />
        <div className="grid grid-cols-3 gap-2 border-t border-ink-200 pt-3">
          <div className="skeleton h-8" />
          <div className="skeleton h-8" />
          <div className="skeleton h-8" />
        </div>
      </div>
    </div>
  );
}
