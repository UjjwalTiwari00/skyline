import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { FilterBar } from '@/components/FilterBar';
import { Pagination } from '@/components/Pagination';
import { PropertyCard } from '@/components/PropertyCard';
import { parsePropertyQuery } from '@/lib/query';
import { listProperties } from '@/lib/repository';

export const metadata: Metadata = {
  title: 'Homes for sale in Delhi NCR',
  description:
    'Browse 2, 3 and 4 BHK apartments, villas, independent floors and plots across Gurugram, Noida and Delhi. Filter by budget, configuration and furnishing.',
  // Filter permutations are near-infinite and none of them are worth indexing
  // separately; the canonical listing is the unfiltered one.
  alternates: { canonical: '/properties' },
};

/**
 * Listings.
 *
 * A Server Component: it reads the query out of the URL, calls the repository
 * directly, and streams real HTML. There is no client-side data fetching on
 * this route at all, which is both why the first-load JS stays small and why
 * a slow response can never overwrite a newer one.
 */
export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = parsePropertyQuery(params);

  if (!parsed.ok) {
    return <InvalidQuery message={parsed.error} />;
  }

  const query = parsed.query;
  const { items, total } = listProperties(query);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <header className="mb-8 max-w-2xl">
        <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">Homes at Skyline</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-500">
          {total} residences across Gurugram, Noida and Delhi. Every filter below is
          written to the address bar, so a link you share opens exactly what you see.
        </p>
      </header>

      {/*
        useSearchParams opts a component into client-side rendering, so the
        boundary has to exist. Keeping it tight around FilterBar means the
        grid, the pager and the cards all stay server-rendered.
      */}
      <Suspense fallback={<FilterBarFallback />}>
        <FilterBar total={total} />
      </Suspense>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((property, index) => (
              <li key={property.id}>
                {/* The first row is above the fold at every breakpoint and is
                    the LCP candidate, so those images load eagerly. */}
                <PropertyCard property={property} priority={index < 3} />
              </li>
            ))}
          </ul>
          <Pagination query={query} total={total} />
        </>
      )}
    </div>
  );
}

function FilterBarFallback() {
  // Same height as the real bar so the grid below does not jump when the
  // client boundary hydrates.
  return <div className="h-[13.5rem] rounded-2xl border border-ink-200 bg-white shadow-card sm:h-[11.5rem]" />;
}

function EmptyState() {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-16 text-center">
      <p className="font-display text-2xl text-ink-900">No homes match these filters</p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
        Try widening the budget or removing a configuration. Every filter is in the
        URL, so clearing them is a single step.
      </p>
      <Link href="/properties" className="btn-primary mt-6">
        Clear filters
      </Link>
    </div>
  );
}

function InvalidQuery({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="font-display text-3xl text-ink-900">That link isn’t valid</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">{message}</p>
      <Link href="/properties" className="btn-primary mt-8">
        Browse all homes
      </Link>
    </div>
  );
}
