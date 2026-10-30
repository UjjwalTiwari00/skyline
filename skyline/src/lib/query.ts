/**
 * Filter state <-> URL translation.
 *
 * The URL is the source of truth for search, filters, sort and page, so this
 * module is the only place that knows how to read a query string into state
 * and write state back out. Both directions live here so they cannot drift.
 *
 * Deliberately dependency-free: the client FilterBar imports it, and anything
 * it pulled in would land in the /properties bundle, which has ~15 KB of
 * headroom after Next's baseline.
 */
import { BHK_OPTIONS, PROPERTY_TYPES, type PropertyType } from './property';

export const SORT_OPTIONS = ['newest', 'price-asc', 'price-desc'] as const;
export type Sort = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: Sort = 'newest';
export const DEFAULT_LIMIT = 12;
export const MAX_LIMIT = 24;

export interface PropertyQuery {
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
  /** Multi-select; empty means "any". */
  bhk: number[];
  type: PropertyType | null;
  furnished: boolean | null;
  sort: Sort;
  page: number;
  limit: number;
}

export const EMPTY_QUERY: PropertyQuery = {
  q: '',
  minPrice: null,
  maxPrice: null,
  bhk: [],
  type: null,
  furnished: null,
  sort: DEFAULT_SORT,
  page: 1,
  limit: DEFAULT_LIMIT,
};

export type ParseResult =
  | { ok: true; query: PropertyQuery }
  | { ok: false; error: string };

/** Accepts URLSearchParams or the plain object Next hands a Server Component. */
export type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function read(params: RawParams, key: string): string | undefined {
  // Duck-typed rather than `instanceof URLSearchParams`: on the client this is
  // Next's ReadonlyURLSearchParams, and relying on the prototype chain of a
  // framework wrapper is a silent-failure waiting to happen.
  if (typeof (params as URLSearchParams).get === 'function') {
    return (params as URLSearchParams).get(key) ?? undefined;
  }
  const value = (params as Record<string, string | string[] | undefined>)[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseIntParam(
  raw: string | undefined,
  key: string,
  { min, max }: { min: number; max?: number },
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === '') return { ok: true, value: null };
  // Reject "12abc", "1.5", "1e3" — Number() alone would accept some of these.
  if (!/^\d+$/.test(raw)) {
    return { ok: false, error: `"${key}" must be a whole number.` };
  }
  const value = Number(raw);
  if (value < min) {
    return { ok: false, error: `"${key}" must be at least ${min}.` };
  }
  if (max !== undefined && value > max) {
    return { ok: false, error: `"${key}" must be at most ${max}.` };
  }
  return { ok: true, value };
}

/**
 * Parses raw params into a validated query, or returns a human-readable error
 * the API can send straight back as a 400 body.
 */
export function parsePropertyQuery(params: RawParams): ParseResult {
  const q = (read(params, 'q') ?? '').trim().slice(0, 100);

  const minPrice = parseIntParam(read(params, 'minPrice'), 'minPrice', { min: 0 });
  if (!minPrice.ok) return { ok: false, error: minPrice.error };

  const maxPrice = parseIntParam(read(params, 'maxPrice'), 'maxPrice', { min: 0 });
  if (!maxPrice.ok) return { ok: false, error: maxPrice.error };

  if (
    minPrice.value !== null &&
    maxPrice.value !== null &&
    minPrice.value > maxPrice.value
  ) {
    return { ok: false, error: '"minPrice" cannot be greater than "maxPrice".' };
  }

  const bhkRaw = read(params, 'bhk');
  const bhk: number[] = [];
  if (bhkRaw) {
    for (const part of bhkRaw.split(',')) {
      const trimmed = part.trim();
      if (trimmed === '') continue;
      const value = Number(trimmed);
      if (!(BHK_OPTIONS as readonly number[]).includes(value)) {
        return {
          ok: false,
          error: `"bhk" must be a comma-separated list of ${BHK_OPTIONS.join(', ')}.`,
        };
      }
      if (!bhk.includes(value)) bhk.push(value);
    }
    bhk.sort((a, b) => a - b);
  }

  const typeRaw = read(params, 'type');
  let type: PropertyType | null = null;
  if (typeRaw) {
    if (!(PROPERTY_TYPES as readonly string[]).includes(typeRaw)) {
      return { ok: false, error: `"type" must be one of ${PROPERTY_TYPES.join(', ')}.` };
    }
    type = typeRaw as PropertyType;
  }

  const furnishedRaw = read(params, 'furnished');
  let furnished: boolean | null = null;
  if (furnishedRaw) {
    if (furnishedRaw !== 'true' && furnishedRaw !== 'false') {
      return { ok: false, error: '"furnished" must be "true" or "false".' };
    }
    furnished = furnishedRaw === 'true';
  }

  const sortRaw = read(params, 'sort');
  let sort: Sort = DEFAULT_SORT;
  if (sortRaw) {
    if (!(SORT_OPTIONS as readonly string[]).includes(sortRaw)) {
      return { ok: false, error: `"sort" must be one of ${SORT_OPTIONS.join(', ')}.` };
    }
    sort = sortRaw as Sort;
  }

  const page = parseIntParam(read(params, 'page'), 'page', { min: 1 });
  if (!page.ok) return { ok: false, error: page.error };

  const limit = parseIntParam(read(params, 'limit'), 'limit', { min: 1, max: MAX_LIMIT });
  if (!limit.ok) return { ok: false, error: limit.error };

  return {
    ok: true,
    query: {
      q,
      minPrice: minPrice.value,
      maxPrice: maxPrice.value,
      bhk,
      type,
      furnished,
      sort,
      page: page.value ?? 1,
      limit: limit.value ?? DEFAULT_LIMIT,
    },
  };
}

/**
 * Serialises query state back to a search string, omitting anything at its
 * default so shared URLs stay short and two equivalent states produce one
 * canonical URL.
 */
export function toSearchParams(query: Partial<PropertyQuery>): URLSearchParams {
  const params = new URLSearchParams();
  const merged = { ...EMPTY_QUERY, ...query };

  if (merged.q) params.set('q', merged.q);
  if (merged.minPrice !== null) params.set('minPrice', String(merged.minPrice));
  if (merged.maxPrice !== null) params.set('maxPrice', String(merged.maxPrice));
  if (merged.bhk.length > 0) params.set('bhk', [...merged.bhk].sort((a, b) => a - b).join(','));
  if (merged.type !== null) params.set('type', merged.type);
  if (merged.furnished !== null) params.set('furnished', String(merged.furnished));
  if (merged.sort !== DEFAULT_SORT) params.set('sort', merged.sort);
  if (merged.page > 1) params.set('page', String(merged.page));
  if (merged.limit !== DEFAULT_LIMIT) params.set('limit', String(merged.limit));

  return params;
}

/** Href for /properties with the given state applied. */
export function buildPropertiesHref(query: Partial<PropertyQuery>): string {
  const search = toSearchParams(query).toString();
  return search ? `/properties?${search}` : '/properties';
}

/** True when nothing but defaults is set — drives the "clear filters" affordance. */
export function isDefaultQuery(query: PropertyQuery): boolean {
  return toSearchParams(query).toString() === '';
}
