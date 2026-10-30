/**
 * Price formatting.
 *
 * Indian property prices are quoted in crore and lakh, and the unit boundary
 * is where this goes wrong — which is exactly what happened on the deployed
 * site, where 99,50,000 rendered as "₹100 L".
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatPrice, pricePerSqft } from '../src/lib/format.ts';

describe('formatPrice', () => {
  it('quotes crore above a crore', () => {
    assert.equal(formatPrice(10_000_000), '₹1 Cr');
    assert.equal(formatPrice(24_500_000), '₹2.45 Cr');
    assert.equal(formatPrice(92_200_000), '₹9.22 Cr');
    assert.equal(formatPrice(145_100_000), '₹14.5 Cr');
  });

  it('quotes lakh below a crore', () => {
    assert.equal(formatPrice(4_300_000), '₹43 L');
    assert.equal(formatPrice(5_000_000), '₹50 L');
  });

  it('keeps lakh precision near the boundary, and promotes only at 100', () => {
    // Two unidiomatic forms to avoid: "₹100 L" (reached by rounding 99.5 up
    // before choosing the unit) and "₹0.99 Cr" (reached by switching to crore
    // too early). 99.5 lakh is quoted as 99.5 lakh.
    assert.equal(formatPrice(9_950_000), '₹99.5 L');
    assert.equal(formatPrice(9_999_999), '₹1 Cr');
  });

  it('never emits a trailing zero decimal', () => {
    for (const value of [10_000_000, 20_000_000, 50_000_000, 100_000_000]) {
      assert.ok(!/\.0+ Cr$/.test(formatPrice(value)), `${value} -> ${formatPrice(value)}`);
    }
  });

  it('falls back to plain rupees under a lakh', () => {
    assert.equal(formatPrice(45_000), '₹45,000');
  });
});

describe('pricePerSqft', () => {
  it('divides and formats with Indian grouping', () => {
    assert.equal(pricePerSqft(10_000_000, 1000), '₹10,000/sq ft');
  });

  it('does not divide by zero', () => {
    assert.equal(pricePerSqft(10_000_000, 0), '—');
  });
});
