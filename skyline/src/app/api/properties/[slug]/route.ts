import { NextResponse } from 'next/server';

import { getPropertyBySlug } from '@/lib/repository';

/** GET /api/properties/:slug — one property, or 404. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const property = getPropertyBySlug(slug);

  if (!property) {
    return NextResponse.json(
      { error: 'not_found', message: `No property with slug "${slug}".` },
      { status: 404 },
    );
  }

  return NextResponse.json(property, {
    headers: {
      // A single property changes less often than the filtered list, so it
      // gets a longer shared-cache window.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
