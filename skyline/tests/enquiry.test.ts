/**
 * Enquiry validation.
 *
 * The same `validateEnquiry` runs in the browser and in the route handler, so
 * these tests cover both at once — which is the point of sharing the schema.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INDIAN_MOBILE_RE,
  maxVisitDate,
  todayInIst,
  validateEnquiry,
} from '../src/lib/enquiry.ts';

const valid = {
  name: 'Ankit Sharma',
  phone: '9876543210',
  email: 'ankit@example.com',
  message: 'I would like to see the 3 BHK this weekend.',
  visitDate: todayInIst(),
  propertySlug: '3-bhk-apartment-aurum-heights-sohna-road-7',
  company: '',
};

describe('phone numbers', () => {
  it('accepts the four valid Indian mobile prefixes', () => {
    for (const prefix of ['6', '7', '8', '9']) {
      assert.ok(INDIAN_MOBILE_RE.test(`${prefix}876543210`), `${prefix} should be allowed`);
    }
  });

  it('rejects landlines, short numbers and country codes', () => {
    for (const bad of ['1234567890', '5876543210', '98765432', '98765432101', '+919876543210']) {
      const result = validateEnquiry({ ...valid, phone: bad });
      assert.equal(result.ok, false, `${bad} should be rejected`);
    }
  });
});

describe('required fields', () => {
  it('rejects a name under two characters', () => {
    const result = validateEnquiry({ ...valid, name: 'A' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.name ?? '', /at least 2/);
  });

  it('rejects a message under ten characters', () => {
    const result = validateEnquiry({ ...valid, message: 'call me' });
    assert.equal(result.ok, false);
  });

  it('reports one message per field, keyed by field name', () => {
    const result = validateEnquiry({ ...valid, name: '', phone: '123', message: '' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      // The form focuses errors[firstKey], so the keys must match input names.
      assert.deepEqual(Object.keys(result.errors).sort(), ['message', 'name', 'phone']);
    }
  });
});

describe('email is optional', () => {
  it('accepts an omitted or empty email', () => {
    assert.equal(validateEnquiry({ ...valid, email: '' }).ok, true);
    const { email: _omitted, ...withoutEmail } = valid;
    assert.equal(validateEnquiry(withoutEmail).ok, true);
  });

  it('still rejects a malformed email when one is given', () => {
    assert.equal(validateEnquiry({ ...valid, email: 'not-an-email' }).ok, false);
  });
});

describe('visit date', () => {
  it('accepts today in IST', () => {
    // Regression guard: comparing against a UTC "today" rejects the current
    // date for the first five and a half hours of every Indian day.
    assert.equal(validateEnquiry({ ...valid, visitDate: todayInIst() }).ok, true);
  });

  it('rejects a date in the past', () => {
    const result = validateEnquiry({ ...valid, visitDate: '2020-01-01' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors.visitDate ?? '', /past/);
  });

  it('rejects a date beyond the booking window', () => {
    const beyond = new Date(`${maxVisitDate()}T00:00:00Z`);
    beyond.setUTCDate(beyond.getUTCDate() + 1);
    const result = validateEnquiry({
      ...valid,
      visitDate: beyond.toISOString().slice(0, 10),
    });
    assert.equal(result.ok, false);
  });

  it('rejects a non-date string', () => {
    assert.equal(validateEnquiry({ ...valid, visitDate: 'next tuesday' }).ok, false);
  });
});

describe('honeypot', () => {
  it('passes validation when empty', () => {
    assert.equal(validateEnquiry({ ...valid, company: '' }).ok, true);
  });

  it('passes validation when filled, so the route can answer 201 silently', () => {
    /**
     * Regression guard. Constraining `company` in the schema made the endpoint
     * reply 400 with "Invalid length: Expected <=0 but received 8" — which
     * tells a scraper exactly which field is the trap. Validation must accept
     * it; POST /api/enquiries is what detects it, answers a normal 201, and
     * writes nothing.
     */
    const result = validateEnquiry({ ...valid, company: 'Acme Corp' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.company, 'Acme Corp');
  });
});

describe('normalisation', () => {
  it('trims surrounding whitespace', () => {
    const result = validateEnquiry({ ...valid, name: '  Ankit Sharma  ' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.name, 'Ankit Sharma');
  });

  it('rejects a non-object body', () => {
    for (const bad of [null, 'string', 42, []]) {
      assert.equal(validateEnquiry(bad).ok, false);
    }
  });
});
