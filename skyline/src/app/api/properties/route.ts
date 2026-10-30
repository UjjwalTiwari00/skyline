import { NextResponse } from 'next/server';

import { listProperties } from '@/lib/repository';
import { parsePropertyQuery } from '@/lib/query';

/**
 * GET /api/properties
 *
 * Query params: q, minPrice, maxPrice, bhk, type, furnished, sort, page, limit.
 * Validation lives in parsePropertyQuery, the same function the listing page
 * uses, so a URL that renders a page and a URL that hits the API can never
 * disagree about what is valid.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parsePropertyQuery(searchParams);

  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'invalid_query', message: parsed.error },
      { status: 400 },
    );
  }

  const result = listProperties(parsed.query);

  return NextResponse.json(result, {
    headers: {
      /**
       * The catalogue is static between deploys, so a shared cache can hold
       * each filter combination for a minute and keep serving it for five
       * more while it revalidates. Browsers get no private copy: the Back
       * button is served by the router cache, and a stale private copy would
       * outlive a deploy.
       */
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
