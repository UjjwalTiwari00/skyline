import { PropertyCardSkeleton } from '@/components/PropertyCard';

/**
 * Streamed while the listing renders. The skeleton grid matches the real
 * grid's columns, gaps and card height exactly, so swapping in real cards
 * shifts nothing — the point of a skeleton is to hold the layout, not to
 * decorate the wait.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mb-8 max-w-2xl">
        <div className="skeleton h-10 w-72" />
        <div className="skeleton mt-4 h-4 w-full max-w-lg" />
      </div>

      <div className="h-[13.5rem] rounded-2xl border border-ink-200 bg-white shadow-card sm:h-[11.5rem]" />

      <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index}>
            <PropertyCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
