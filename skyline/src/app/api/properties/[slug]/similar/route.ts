import { NextResponse } from 'next/server';

import { getPropertyBySlug, getSimilarProperties } from '@/lib/repository';

const SIMILAR_LIMIT = 4;

/**
 * GET /api/properties/:slug/similar — up to 4 similar properties.
 *
 * 404s on an unknown slug rather than returning an empty array, so a typo is
 * distinguishable from a property that genuinely has no neighbours.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!getPropertyBySlug(slug)) {
    return NextResponse.json(
      { error: 'not_found', message: `No property with slug "${slug}".` },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { items: getSimilarProperties(slug, SIMILAR_LIMIT) },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    },
  );
}
