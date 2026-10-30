/**
 * Filter <-> URL round-tripping.
 *
 * This logic is the backbone of the "URL is the source of truth" requirement:
 * if parse and serialise ever disagree, refreshing or sharing a link silently
 * changes the results. Run with `npm test`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_LIMIT,
  EMPTY_QUERY,
  buildPropertiesHref,
  isDefaultQuery,
  parsePropertyQuery,
  toSearchParams,
  type PropertyQuery,
} from '../src/lib/query.ts';

/** assert.fail returns never, so this narrows the result union for us. */
function parseOrThrow(search: string): PropertyQuery {
  const result = parsePropertyQuery(new URLSearchParams(search));
  if (!result.ok) assert.fail(`expected "${search}" to parse, got: ${result.error}`);
  return result.query;
}

function expectRejected(search: string): string {
  const result = parsePropertyQuery(new URLSearchParams(search));
  if (result.ok) assert.fail(`expected "${search}" to be rejected`);
  return result.error;
}

describe('parsePropertyQuery', () => {
  it('returns defaults for an empty query string', () => {
    const query = parseOrThrow('');
    assert.deepEqual(query, EMPTY_QUERY);
    assert.equal(query.limit, DEFAULT_LIMIT);
  });

  it('parses every supported parameter', () => {
    const query = parseOrThrow(
      'q=sohna&minPrice=5000000&maxPrice=20000000&bhk=2,3&type=villa&furnished=true&sort=price-asc&page=3',
    );
    assert.equal(query.q, 'sohna');
    assert.equal(query.minPrice, 5_000_000);
    assert.equal(query.maxPrice, 20_000_000);
    assert.deepEqual(query.bhk, [2, 3]);
    assert.equal(query.type, 'villa');
    assert.equal(query.furnished, true);
    assert.equal(query.sort, 'price-asc');
    assert.equal(query.page, 3);
  });

  it('deduplicates and sorts bhk so two spellings of one filter agree', () => {
    assert.deepEqual(parseOrThrow('bhk=3,2,3').bhk, [2, 3]);
  });

  it('rejects a price that is not a whole number', () => {
    // Number("1.5") and Number("1e3") both succeed, which is exactly why the
    // parser uses a digits-only regex rather than Number() alone.
    for (const bad of ['minPrice=1.5', 'minPrice=1e3', 'minPrice=12abc', 'minPrice=-5']) {
      expectRejected(bad);
    }
  });

  it('rejects an inverted price range', () => {
    assert.match(expectRejected('minPrice=20000000&maxPrice=5000000'), /greater than/);
  });

  it('rejects values outside the allowed sets', () => {
    for (const bad of ['bhk=7', 'type=castle', 'furnished=maybe', 'sort=cheapest', 'page=0']) {
      expectRejected(bad);
    }
  });

  it('caps limit at the documented maximum', () => {
    assert.equal(parseOrThrow('limit=24').limit, 24);
    expectRejected('limit=25');
  });

  it('reads the plain object shape a Server Component receives', () => {
    const result = parsePropertyQuery({ q: 'golf', bhk: '3', page: '2' });
    if (!result.ok) assert.fail(result.error);
    const query = result.query;
    assert.equal(query.q, 'golf');
    assert.deepEqual(query.bhk, [3]);
    assert.equal(query.page, 2);
  });
});

describe('toSearchParams', () => {
  it('omits defaults so shared URLs stay short', () => {
    assert.equal(toSearchParams(EMPTY_QUERY).toString(), '');
    assert.equal(buildPropertiesHref(EMPTY_QUERY), '/properties');
  });

  it('produces one canonical URL for equivalent states', () => {
    const a = toSearchParams({ ...EMPTY_QUERY, bhk: [3, 2] }).toString();
    const b = toSearchParams({ ...EMPTY_QUERY, bhk: [2, 3] }).toString();
    assert.equal(a, b);
  });

  it('round-trips: parse(serialise(q)) === q', () => {
    const cases = [
      { ...EMPTY_QUERY, q: 'golf course', bhk: [2, 4], sort: 'price-desc' as const },
      { ...EMPTY_QUERY, minPrice: 5_000_000, maxPrice: 50_000_000, page: 4 },
      { ...EMPTY_QUERY, type: 'studio' as const, furnished: false },
      { ...EMPTY_QUERY, furnished: true, limit: 24 },
    ];

    for (const original of cases) {
      const roundTripped = parseOrThrow(toSearchParams(original).toString());
      assert.deepEqual(roundTripped, original);
    }
  });
});

describe('isDefaultQuery', () => {
  it('is true only when nothing is set', () => {
    assert.equal(isDefaultQuery(EMPTY_QUERY), true);
    assert.equal(isDefaultQuery({ ...EMPTY_QUERY, page: 2 }), false);
    assert.equal(isDefaultQuery({ ...EMPTY_QUERY, furnished: false }), false);
  });
});
