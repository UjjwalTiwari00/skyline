/**
 * Display formatting. Dependency-free — these run in client components, and
 * Intl is already in every target browser, so there is no reason to ship a
 * date or currency library.
 */

const CRORE = 10_000_000;
const LAKH = 100_000;

/**
 * Indian property prices are spoken in crore and lakh, not in millions, and a
 * listing that reads "₹2,45,00,000" is unreadable at a glance. Matches how the
 * price appears on 100acress and every other NCR portal.
 */
export function formatPrice(rupees: number): string {
  const lakh = rupees / LAKH;

  /**
   * Round to the displayed precision BEFORE picking the unit.
   *
   * Choosing the unit first produced "₹100 L" for 99,50,000: under a crore,
   * so it took the lakh branch, then rounded 99.5 up to 100. Nobody quotes a
   * price as 100 lakh — that is 1 crore. Deciding after rounding means a
   * value that rounds up to 100 lakh is shown in crore instead.
   */
  const roundedLakh = Math.round(lakh * 10) / 10;

  // Only once the lakh figure would round to 100 does it become a crore
  // figure. 99.5 lakh stays "₹99.5 L" — "₹0.99 Cr" is as unidiomatic as
  // "₹100 L", and an earlier fix for one produced the other.
  if (roundedLakh >= 100) {
    const crore = rupees / CRORE;
    // 1.5 Cr, not 1.50 Cr; 2 Cr, not 2.00 Cr.
    const text = crore >= 10 ? crore.toFixed(1) : crore.toFixed(2);
    return `₹${text.replace(/\.?0+$/, '')} Cr`;
  }

  // String() drops a trailing .0 on its own: 43 -> "43", 99.5 -> "99.5".
  if (roundedLakh >= 1) {
    return `₹${String(roundedLakh)} L`;
  }

  return `₹${rupees.toLocaleString('en-IN')}`;
}

/** Full rupee value, for the detail page and for screen readers. */
export function formatPriceExact(rupees: number): string {
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export function formatArea(sqft: number): string {
  return `${sqft.toLocaleString('en-IN')} sq ft`;
}

/** Derived, not stored — one less field to keep consistent in the seed data. */
export function pricePerSqft(rupees: number, sqft: number): string {
  if (sqft <= 0) return '—';
  return `₹${Math.round(rupees / sqft).toLocaleString('en-IN')}/sq ft`;
}

const STATUS_LABELS: Record<string, string> = {
  'ready-to-move': 'Ready to move',
  'under-construction': 'Under construction',
  'new-launch': 'New launch',
};

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  'independent-floor': 'Independent floor',
  plot: 'Plot',
  studio: 'Studio',
};

export function formatStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatType(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/** "Mar 2027" — possession is a month, never a day, in Indian listings. */
export function formatPossession(iso: string | null): string {
  if (!iso) return 'Ready to move';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
