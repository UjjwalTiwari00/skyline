/**
 * Read access to the property catalogue.
 *
 * The dataset is a seeded JSON file loaded once per server instance, so every
 * query is an in-memory pass over ~54 records. That is fast enough that the
 * listing page reads this directly instead of fetching its own HTTP API —
 * a server component calling fetch() on its own route handler would add a
 * network hop, a second serialisation and a self-referential cache entry for
 * no benefit. The route handlers in app/api exist for external consumers and
 * for the client-side "load more" path, and call the same functions.
 *
 * Swapping this for Postgres means reimplementing these four functions; no
 * caller changes.
 */
import 'server-only';

import properties from '@/data/properties.json';
import type { Property, PropertyListResponse } from './property';
import type { PropertyQuery } from './query';

const ALL: readonly Property[] = properties as Property[];

/**
 * Lowercased haystack per property, built once. Without this, every keystroke
 * would re-lowercase 54 titles and localities.
 */
const SEARCH_INDEX: ReadonlyMap<string, string> = new Map(
  ALL.map((p) => [p.id, `${p.title} ${p.locality} ${p.city}`.toLowerCase()]),
);

const BY_SLUG: ReadonlyMap<string, Property> = new Map(ALL.map((p) => [p.slug, p]));

function matches(property: Property, query: PropertyQuery): boolean {
  if (query.q) {
    const haystack = SEARCH_INDEX.get(property.id) ?? '';
    // Every whitespace-separated term must appear, so "3 bhk sohna" narrows
    // rather than widening the way an OR match would.
    for (const term of query.q.toLowerCase().split(/\s+/)) {
      if (term && !haystack.includes(term)) return false;
    }
  }
  if (query.minPrice !== null && property.priceInr < query.minPrice) return false;
  if (query.maxPrice !== null && property.priceInr > query.maxPrice) return false;
  // A plot has no bedroom count, so any active BHK filter excludes it rather
  // than matching it against a stand-in value.
  if (query.bhk.length > 0) {
    if (property.bhk === null || !query.bhk.includes(property.bhk)) return false;
  }
  if (query.type !== null && property.type !== query.type) return false;
  if (query.furnished !== null && property.furnished !== query.furnished) return false;
  return true;
}

function compare(a: Property, b: Property, sort: PropertyQuery['sort']): number {
  switch (sort) {
    case 'price-asc':
      return a.priceInr - b.priceInr || a.id.localeCompare(b.id);
    case 'price-desc':
      return b.priceInr - a.priceInr || a.id.localeCompare(b.id);
    case 'newest':
    default:
      // Tie-broken by id so the order is total: two records sharing a
      // timestamp must not swap places between requests, or pagination
      // would drop or repeat a card at the page boundary.
      return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  }
}

export function listProperties(query: PropertyQuery): PropertyListResponse {
  const filtered = ALL.filter((p) => matches(p, query)).sort((a, b) =>
    compare(a, b, query.sort),
  );

  const total = filtered.length;
  const start = (query.page - 1) * query.limit;
  const items = filtered.slice(start, start + query.limit);

  return {
    items,
    total,
    page: query.page,
    hasMore: start + items.length < total,
  };
}

export function getPropertyBySlug(slug: string): Property | null {
  return BY_SLUG.get(slug) ?? null;
}

/**
 * "Similar" means same locality first, then same configuration elsewhere.
 * Locality is the stronger signal for a buyer, so it outranks BHK.
 */
export function getSimilarProperties(slug: string, limit = 4): Property[] {
  const source = BY_SLUG.get(slug);
  if (!source) return [];

  const scored = ALL.filter((p) => p.slug !== slug)
    .map((p) => {
      let score = 0;
      if (p.locality === source.locality) score += 4;
      if (p.bhk === source.bhk) score += 2;
      if (p.type === source.type) score += 1;
      return { property: p, score };
    })
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Then closest in price, so the suggestions stay in the buyer's bracket.
    const da = Math.abs(a.property.priceInr - source.priceInr);
    const db = Math.abs(b.property.priceInr - source.priceInr);
    return da - db || a.property.id.localeCompare(b.property.id);
  });

  return scored.slice(0, limit).map((entry) => entry.property);
}

/** Every slug, for generateStaticParams on the detail route. */
export function allSlugs(): string[] {
  return ALL.map((p) => p.slug);
}

/** Drives the "Featured homes" strip on the landing page. */
export function featuredProperties(limit = 6): Property[] {
  return [...ALL]
    .sort((a, b) => b.priceInr - a.priceInr || a.id.localeCompare(b.id))
    .slice(0, limit);
}
