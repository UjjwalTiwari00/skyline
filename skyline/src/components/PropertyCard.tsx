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
    <article className="group relative flex flex-col focus-within:outline-none">
      {/*
        Portrait, not landscape. 4:5 gives the photography roughly 60% more
        height in the same column, which is what makes a listing read as
        editorial rather than as a search result. The fixed ratio still
        reserves space before the image decodes, holding CLS at 0.
      */}
      <div className="relative aspect-4/5 overflow-hidden rounded-sm bg-ink-200">
        {cover ? (
          <Image
            src={cover.url}
            alt={cover.alt}
            fill
            // Mirrors the grid below: 1 column under 640, 2 under 1024, else 3.
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
            // Slow, long zoom. A fast scale reads as a UI affordance; this
            // reads as the image breathing.
            className="object-cover transition-transform duration-900 ease-out group-hover:scale-105"
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : null}

        {/* Scrim only at the top, so the status chip stays legible on a pale
            image without greying the whole photograph. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-ink-900/35 to-transparent"
        />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span className="eyebrow rounded-full bg-white/92 px-3 py-1.5 text-[10px] text-ink-800 backdrop-blur-sm">
            {formatStatus(property.status)}
          </span>
          {property.furnished ? (
            <span className="eyebrow rounded-full bg-sand/95 px-3 py-1.5 text-[10px] text-ink-900">
              Furnished
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-5">
        {/* Price leads, in the display face and at a size that carries. */}
        <p className="font-display text-3xl leading-none text-ink-900">
          {formatPrice(property.priceInr)}
        </p>

        <h3 className="mt-3 font-sans text-[0.9375rem] font-medium leading-snug text-ink-800">
          {/* Stretched link: the whole card is clickable but there is exactly
              one tab stop, and the accessible name is the title. */}
          <Link
            href={`/properties/${property.slug}`}
            className="before:absolute before:inset-0 before:content-[''] focus-visible:outline-none"
          >
            <span className="line-clamp-2 transition-colors group-hover:text-brand-600">
              {property.title}
            </span>
          </Link>
        </h3>

        <p className="mt-1.5 text-sm text-ink-500">
          {property.locality}, {property.city}
        </p>

        {/*
          Restrained metadata row: a single hairline-separated line of small
          caps. The previous three-column <dl> with its own labels competed
          with the price for attention.
        */}
        <dl className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-200 pt-3">
          <MetaItem label="Configuration">
            {property.type === 'plot' ? 'Plot' : `${property.bhk} BHK`}
          </MetaItem>
          <Divider />
          <MetaItem label="Area">{formatArea(property.areaSqft)}</MetaItem>
          <Divider />
          <MetaItem label="Type">{formatType(property.type)}</MetaItem>
        </dl>
      </div>
    </article>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      {/* The label is for screen readers; sighted users read the row as a
          sequence, which is what keeps it quiet. */}
      <dt className="sr-only">{label}</dt>
      <dd className="text-xs uppercase tracking-[0.12em] text-ink-500">{children}</dd>
    </div>
  );
}

function Divider() {
  return (
    <span aria-hidden="true" className="h-3 w-px bg-ink-300" />
  );
}

/** Matches the card's exact box so switching to real data shifts nothing. */
export function PropertyCardSkeleton() {
  return (
    <div>
      <div className="aspect-4/5 rounded-sm bg-ink-200" />
      <div className="flex flex-col pt-5">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton mt-3 h-4 w-full" />
        <div className="skeleton mt-2 h-4 w-3/4" />
        <div className="skeleton mt-2 h-4 w-2/5" />
        <div className="mt-4 border-t border-ink-200 pt-3">
          <div className="skeleton h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
