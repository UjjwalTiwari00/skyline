import { NextResponse } from 'next/server';

import { validateEnquiry } from '@/lib/enquiry';
import { enquiryStore } from '@/lib/enquiry-store';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { getPropertyBySlug } from '@/lib/repository';

/**
 * POST /api/enquiries
 *
 * Order matters: rate limit, then parse, then validate, then check the
 * honeypot, then persist. Cheap rejections happen before expensive ones, and
 * nothing touches disk until the body is known good.
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(`enquiry:${clientIp(request)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Too many enquiries from this address. Please try again later.',
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const result = validateEnquiry(body);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        message: 'Please correct the highlighted fields.',
        fields: result.errors,
      },
      { status: 400 },
    );
  }

  const enquiry = result.value;

  /**
   * The honeypot is checked after validation so a bot cannot tell the two
   * apart by response shape, and we answer 201 rather than an error: telling
   * a scraper it was detected just teaches it to stop filling the field.
   * Nothing is written.
   */
  if (enquiry.company) {
    return NextResponse.json({ id: 'accepted' }, { status: 201 });
  }

  // An enquiry about a property that does not exist is a client bug or a
  // forged post; either way it should not reach storage.
  if (!getPropertyBySlug(enquiry.propertySlug)) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        message: 'That property no longer exists.',
        fields: { propertySlug: 'Unknown property.' },
      },
      { status: 400 },
    );
  }

  const saved = await enquiryStore.save(enquiry);

  return NextResponse.json(
    { id: saved.id, createdAt: saved.createdAt },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
