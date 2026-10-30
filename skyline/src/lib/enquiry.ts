/**
 * Enquiry validation, shared by the client form and POST /api/enquiries so the
 * two cannot disagree. Shape follows backend/models/postProperty/enquiry.js
 * (custName / custNumber / custEmail / propertyAddress) with the assignment's
 * extra fields.
 */
import * as v from 'valibot';

/** Indian mobile numbers are 10 digits and start with 6-9. */
export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

/** How far ahead a site visit may be booked. */
export const MAX_VISIT_DAYS_AHEAD = 90;

/**
 * "Today" in IST, as yyyy-mm-dd.
 *
 * Deliberately not `new Date().toISOString()`: the server runs in UTC, so
 * between 00:00 and 05:30 IST a visit date of today would parse as yesterday
 * and the form would reject a date the user can legitimately pick.
 */
export function todayInIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Last selectable visit date, as yyyy-mm-dd. */
export function maxVisitDate(now: Date = new Date()): string {
  const today = new Date(`${todayInIst(now)}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() + MAX_VISIT_DAYS_AHEAD);
  return today.toISOString().slice(0, 10);
}

export const EnquirySchema = v.object({
  name: v.pipe(
    v.string('Please enter your name.'),
    v.trim(),
    v.minLength(2, 'Name must be at least 2 characters.'),
    v.maxLength(80, 'Name must be 80 characters or fewer.'),
  ),

  phone: v.pipe(
    v.string('Please enter your phone number.'),
    v.trim(),
    v.regex(INDIAN_MOBILE_RE, 'Enter a 10-digit Indian mobile number.'),
  ),

  /** Optional, but must be valid when provided. '' is normalised to undefined. */
  email: v.optional(
    v.union(
      [
        v.literal(''),
        v.pipe(
          v.string(),
          v.trim(),
          v.email('Enter a valid email address.'),
          v.maxLength(120, 'Email must be 120 characters or fewer.'),
        ),
      ],
      'Enter a valid email address.',
    ),
  ),

  message: v.pipe(
    v.string('Please add a message.'),
    v.trim(),
    v.minLength(10, 'Message must be at least 10 characters.'),
    v.maxLength(1000, 'Message must be 1000 characters or fewer.'),
  ),

  visitDate: v.pipe(
    v.string('Pick a preferred visit date.'),
    v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a preferred visit date.'),
    v.check(
      (value) => value >= todayInIst(),
      'Visit date cannot be in the past.',
    ),
    v.check(
      (value) => value <= maxVisitDate(),
      `Visit date must be within ${MAX_VISIT_DAYS_AHEAD} days.`,
    ),
  ),

  propertySlug: v.pipe(
    v.string('Missing property reference.'),
    v.trim(),
    v.minLength(1, 'Missing property reference.'),
  ),

  /**
   * Honeypot. Hidden from real users and from assistive tech; bots that fill
   * every field trip it.
   *
   * Deliberately NOT constrained here. An earlier version used
   * `v.maxLength(0)`, which made a filled honeypot fail validation — so the
   * endpoint answered 400 with `{"company": "Invalid length: Expected <=0 but
   * received 8"}`, announcing both that the field is a trap and how to defeat
   * it. The field has to pass validation so that POST /api/enquiries can
   * answer a normal 201 and quietly write nothing.
   */
  company: v.optional(v.string()),
});

export type EnquiryInput = v.InferInput<typeof EnquirySchema>;
export type Enquiry = v.InferOutput<typeof EnquirySchema>;

/** A saved enquiry, as the admin page reads it back. */
export interface StoredEnquiry extends Omit<Enquiry, 'company'> {
  id: string;
  createdAt: string;
}

/** Field-keyed messages, which is what the form needs to render inline errors. */
export type FieldErrors = Partial<Record<keyof EnquiryInput, string>>;

export function validateEnquiry(
  input: unknown,
): { ok: true; value: Enquiry } | { ok: false; errors: FieldErrors } {
  const result = v.safeParse(EnquirySchema, input);
  if (result.success) return { ok: true, value: result.output };

  const errors: FieldErrors = {};
  for (const issue of result.issues) {
    const key = issue.path?.[0]?.key as keyof EnquiryInput | undefined;
    // Keep the first message per field; later issues are usually redundant.
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
