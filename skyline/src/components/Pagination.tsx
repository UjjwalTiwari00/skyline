import Link from 'next/link';

import { buildPropertiesHref, type PropertyQuery } from '@/lib/query';

/**
 * Real <a> links, not buttons.
 *
 * Pagination is navigation, so each page gets a URL that can be opened in a
 * new tab, shared, crawled and restored by Back. A button-plus-state version
 * would need client JS and would lose all four.
 *
 * Server component. Zero JavaScript.
 */
export function Pagination({ query, total }: { query: PropertyQuery; total: number }) {
  const pageCount = Math.max(1, Math.ceil(total / query.limit));
  if (pageCount <= 1) return null;

  const current = Math.min(query.page, pageCount);
  const pages = pageWindow(current, pageCount);

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      <PageLink
        query={query}
        page={current - 1}
        disabled={current === 1}
        label="Previous page"
      >
        <span aria-hidden="true">‹</span>
      </PageLink>

      {pages.map((page, index) =>
        page === null ? (
          <span
            // Gaps are positional, so the index is the only stable key here.
            key={`gap-${index}`}
            aria-hidden="true"
            className="px-1.5 text-sm text-ink-400"
          >
            …
          </span>
        ) : (
          <Link
            key={page}
            href={buildPropertiesHref({ ...query, page })}
            scroll={false}
            aria-current={page === current ? 'page' : undefined}
            aria-label={`Page ${page}`}
            className={`min-w-10 rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors
              ${
                page === current
                  ? 'bg-ink-900 text-white'
                  : 'border border-ink-200 bg-white text-ink-600 hover:border-ink-400'
              }`}
          >
            {page}
          </Link>
        ),
      )}

      <PageLink
        query={query}
        page={current + 1}
        disabled={current === pageCount}
        label="Next page"
      >
        <span aria-hidden="true">›</span>
      </PageLink>
    </nav>
  );
}

function PageLink({
  query,
  page,
  disabled,
  label,
  children,
}: {
  query: PropertyQuery;
  page: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    // Rendered as a non-link so it is skipped by the keyboard rather than
    // focusable-but-inert, which is the usual trap at the ends of a pager.
    return (
      <span
        aria-hidden="true"
        className="min-w-10 cursor-not-allowed rounded-lg border border-ink-200 px-3 py-2 text-center text-sm text-ink-300"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={buildPropertiesHref({ ...query, page })}
      scroll={false}
      aria-label={label}
      className="min-w-10 rounded-lg border border-ink-200 bg-white px-3 py-2 text-center text-sm text-ink-600 transition-colors hover:border-ink-400"
    >
      {children}
    </Link>
  );
}

/**
 * First, last, and a window around the current page; null marks an ellipsis.
 * Keeps the control a fixed width so it does not reflow as the page number
 * grows — one fewer source of layout shift.
 */
function pageWindow(current: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, pageCount, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < pageCount) pages.add(current + 1);
  // Keep the control the same width at the ends as in the middle.
  if (current <= 3) pages.add(2).add(3).add(4);
  if (current >= pageCount - 2) pages.add(pageCount - 1).add(pageCount - 2).add(pageCount - 3);

  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const output: (number | null)[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) output.push(null);
    output.push(page);
    previous = page;
  }
  return output;
}
