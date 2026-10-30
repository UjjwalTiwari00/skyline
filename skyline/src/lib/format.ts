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
  if (rupees >= CRORE) {
    const crore = rupees / CRORE;
    // 1.5 Cr, not 1.50 Cr; 2 Cr, not 2.00 Cr.
    const text = crore >= 10 ? crore.toFixed(1) : crore.toFixed(2);
    return `₹${text.replace(/\.?0+$/, '')} Cr`;
  }
  if (rupees >= LAKH) {
    const lakh = rupees / LAKH;
    const text = lakh >= 10 ? lakh.toFixed(0) : lakh.toFixed(1);
    return `₹${text.replace(/\.0$/, '')} L`;
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
