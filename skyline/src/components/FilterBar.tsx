'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

import { BHK_OPTIONS, PROPERTY_TYPES } from '@/lib/property';
import {
  EMPTY_QUERY,
  SORT_OPTIONS,
  buildPropertiesHref,
  parsePropertyQuery,
  type PropertyQuery,
} from '@/lib/query';
import { formatType } from '@/lib/format';

const SEARCH_DEBOUNCE_MS = 300;

/** Buckets in rupees, phrased the way buyers actually talk about budget. */
const PRICE_STEPS = [
  { label: 'Any', value: '' },
  { label: '₹50 L', value: '5000000' },
  { label: '₹1 Cr', value: '10000000' },
  { label: '₹2 Cr', value: '20000000' },
  { label: '₹5 Cr', value: '50000000' },
  { label: '₹10 Cr', value: '100000000' },
] as const;

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
  newest: 'Newest first',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
};

/**
 * The filters. The URL is the only source of truth — this component holds no
 * filter state of its own except the in-flight text of the search box.
 *
 * Why that matters: refresh, Back, and a shared link all go through the same
 * path (URL -> parsePropertyQuery -> server render), so there is no second
 * copy of the state to fall out of sync.
 *
 * Staleness is structurally impossible here rather than guarded against:
 * results are rendered by the server component for whichever URL the router
 * last committed. There is no client fetch to race, so a slow response for an
 * old query cannot overwrite a newer one — the router discards superseded
 * navigations. The debounce exists to cut the number of navigations while
 * someone is typing, not to fix ordering.
 */
export function FilterBar({ total }: { total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const parsed = parsePropertyQuery(searchParams);
  // A hand-edited, invalid URL is reported by the page. The controls still
  // need something to render against, so they fall back to defaults rather
  // than disappearing and stranding the user on a broken screen.
  const current: PropertyQuery = parsed.ok ? parsed.query : EMPTY_QUERY;

  const urlQ = current.q;
  const [text, setText] = useState(urlQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /**
   * Resync when the URL changes underneath us — Back/Forward, or "clear
   * filters". This only ever calls setState; it never navigates, so it cannot
   * feed back into itself. The pending debounce is cancelled because a
   * keystroke from before a Back press must not land after it.
   */
  useEffect(() => {
    clearTimeout(debounceRef.current);
    setText(urlQ);
  }, [urlQ]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function navigate(next: Partial<PropertyQuery>, mode: 'push' | 'replace') {
    // Any filter change invalidates the current page number: page 4 of an
    // unfiltered list is usually page 0 of a filtered one.
    const merged: PropertyQuery = { ...current, ...next, page: next.page ?? 1 };
    const href = buildPropertiesHref(merged);
    startTransition(() => {
      // scroll: false keeps the viewport on the filters being adjusted.
      router[mode](href, { scroll: false });
    });
  }

  function onSearchChange(value: string) {
    setText(value);
    clearTimeout(debounceRef.current);
    // replace, not push: otherwise every keystroke becomes a history entry
    // and Back has to be pressed once per character.
    debounceRef.current = setTimeout(
      () => navigate({ q: value }, 'replace'),
      SEARCH_DEBOUNCE_MS,
    );
  }

  function toggleBhk(value: number) {
    const next = current.bhk.includes(value)
      ? current.bhk.filter((b) => b !== value)
      : [...current.bhk, value];
    navigate({ bhk: next }, 'push');
  }

  const searchId = useId();
  const minId = useId();
  const maxId = useId();
  const typeId = useId();
  const furnishedId = useId();
  const sortId = useId();

  const isFiltered = buildPropertiesHref(current) !== '/properties';

  return (
    <section
      aria-label="Filter homes"
      // aria-busy tells assistive tech the results below are being replaced,
      // which the visual skeleton communicates to everyone else.
      aria-busy={isPending}
      className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card sm:p-5"
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor={searchId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Search
          </label>
          <input
            id={searchId}
            type="search"
            value={text}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Try “3 BHK Sohna Road”"
            autoComplete="off"
            className="w-full rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm
                       text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor={minId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Min price
          </label>
          <select
            id={minId}
            value={current.minPrice === null ? '' : String(current.minPrice)}
            onChange={(e) =>
              navigate({ minPrice: e.target.value === '' ? null : Number(e.target.value) }, 'push')
            }
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none"
          >
            {PRICE_STEPS.map((step) => (
              <option key={`min-${step.value}`} value={step.value}>
                {step.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={maxId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Max price
          </label>
          <select
            id={maxId}
            value={current.maxPrice === null ? '' : String(current.maxPrice)}
            onChange={(e) =>
              navigate({ maxPrice: e.target.value === '' ? null : Number(e.target.value) }, 'push')
            }
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none"
          >
            {PRICE_STEPS.map((step) => (
              <option key={`max-${step.value}`} value={step.value}>
                {step.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={typeId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Property type
          </label>
          <select
            id={typeId}
            value={current.type ?? ''}
            onChange={(e) =>
              navigate(
                { type: e.target.value === '' ? null : (e.target.value as PropertyQuery['type']) },
                'push',
              )
            }
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none"
          >
            <option value="">Any type</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatType(type)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={furnishedId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Furnished
          </label>
          <select
            id={furnishedId}
            value={current.furnished === null ? '' : String(current.furnished)}
            onChange={(e) =>
              navigate(
                { furnished: e.target.value === '' ? null : e.target.value === 'true' },
                'push',
              )
            }
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none"
          >
            <option value="">Any</option>
            <option value="true">Furnished</option>
            <option value="false">Unfurnished</option>
          </select>
        </div>

        <div>
          <label htmlFor={sortId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Sort
          </label>
          <select
            id={sortId}
            value={current.sort}
            onChange={(e) => navigate({ sort: e.target.value as PropertyQuery['sort'] }, 'push')}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-4">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Bedrooms</legend>
          <span aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            BHK
          </span>
          {BHK_OPTIONS.map((value) => {
            const checked = current.bhk.includes(value);
            return (
              <label
                key={value}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors
                  ${
                    checked
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400'
                  }`}
              >
                {/* A real checkbox, visually replaced — keeps keyboard and
                    screen-reader behaviour without rebuilding either. */}
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleBhk(value)}
                />
                {value} BHK
              </label>
            );
          })}
        </fieldset>

        <div className="flex items-center gap-3">
          <p aria-live="polite" className="text-sm text-ink-500">
            {isPending ? 'Updating…' : `${total} ${total === 1 ? 'home' : 'homes'}`}
          </p>
          {isFiltered ? (
            <button
              type="button"
              onClick={() => startTransition(() => router.push('/properties', { scroll: false }))}
              className="rounded-full border border-ink-300 px-4 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:border-ink-400 hover:bg-ink-100"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
