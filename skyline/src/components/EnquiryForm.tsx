'use client';

import { useId, useRef, useState } from 'react';

import {
  maxVisitDate,
  todayInIst,
  validateEnquiry,
  type EnquiryInput,
  type FieldErrors,
} from '@/lib/enquiry';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMPTY: EnquiryInput = {
  name: '',
  phone: '',
  email: '',
  message: '',
  visitDate: '',
  propertySlug: '',
  company: '',
};

/**
 * Enquiry form.
 *
 * Validation runs through validateEnquiry — the same function the route
 * handler calls — so the client cannot accept something the server rejects,
 * or vice versa. The client pass exists to give immediate feedback, not to be
 * trusted: the server validates independently on every request.
 *
 * Values live in component state and are never cleared on failure, so a
 * dropped request costs the user nothing.
 */
export function EnquiryForm({
  propertySlug,
  propertyTitle,
}: {
  propertySlug: string;
  propertyTitle: string;
}) {
  const [values, setValues] = useState<EnquiryInput>({ ...EMPTY, propertySlug });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const ids = {
    name: useId(),
    phone: useId(),
    email: useId(),
    message: useId(),
    visitDate: useId(),
  };

  function update<K extends keyof EnquiryInput>(key: K, value: EnquiryInput[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    // Clear the field's error as soon as it is edited; re-validating on every
    // keystroke would shout at someone halfway through typing a phone number.
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Guards double submission even if the button's disabled state is
    // bypassed — a second Enter press while the first request is in flight.
    if (status === 'submitting') return;

    setFormError(null);

    const local = validateEnquiry(values);
    if (!local.ok) {
      setErrors(local.errors);
      setStatus('error');
      // Move focus to the first problem so keyboard and screen-reader users
      // are not left guessing why nothing happened.
      const firstKey = Object.keys(local.errors)[0];
      if (firstKey) {
        formRef.current
          ?.querySelector<HTMLElement>(`[name="${firstKey}"]`)
          ?.focus();
      }
      return;
    }

    setStatus('submitting');
    setErrors({});

    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.status === 201) {
        setStatus('success');
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        fields?: FieldErrors;
      } | null;

      if (response.status === 400 && payload?.fields) {
        setErrors(payload.fields);
        setStatus('error');
        setFormError(payload.message ?? 'Please correct the highlighted fields.');
        return;
      }

      setStatus('error');
      setFormError(
        payload?.message ??
          (response.status === 429
            ? 'Too many enquiries from this address. Please try again later.'
            : 'Something went wrong. Please try again.'),
      );
    } catch {
      // Network failure, offline, or the request was cut off. Values are
      // untouched, so the user can retry without retyping.
      setStatus('error');
      setFormError('Could not reach the server. Check your connection and try again.');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-card"
      >
        <p className="font-display text-2xl text-ink-900">Enquiry received</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
          Our sales team will call you on {values.phone} to confirm your visit to{' '}
          {propertyTitle}.
        </p>
        <button
          type="button"
          onClick={() => {
            setValues({ ...EMPTY, propertySlug });
            setStatus('idle');
          }}
          className="btn-secondary mt-6"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  const submitting = status === 'submitting';

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      // The browser's own bubbles would compete with our inline messages.
      noValidate
      className="rounded-2xl border border-ink-200 bg-white p-5 shadow-card sm:p-6"
    >
      <h2 className="font-display text-2xl text-ink-900">Book a site visit</h2>
      <p className="mt-2 text-sm text-ink-500">
        We will call to confirm the slot before you travel.
      </p>

      {formError ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-700"
        >
          {formError}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          id={ids.name}
          name="name"
          label="Your name"
          error={errors.name}
          className="sm:col-span-2"
        >
          <input
            id={ids.name}
            name="name"
            type="text"
            autoComplete="name"
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${ids.name}-error` : undefined}
            className={inputClass(Boolean(errors.name))}
          />
        </Field>

        <Field id={ids.phone} name="phone" label="Mobile number" error={errors.phone}>
          <input
            id={ids.phone}
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            placeholder="98765 43210"
            value={values.phone}
            // Strip anything that is not a digit as it is typed, so a pasted
            // "+91 98765 43210" becomes something the validator accepts.
            onChange={(e) => update('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? `${ids.phone}-error` : undefined}
            className={inputClass(Boolean(errors.phone))}
          />
        </Field>

        <Field
          id={ids.email}
          name="email"
          label="Email"
          hint="Optional"
          error={errors.email}
        >
          <input
            id={ids.email}
            name="email"
            type="email"
            autoComplete="email"
            value={values.email ?? ''}
            onChange={(e) => update('email', e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${ids.email}-error` : undefined}
            className={inputClass(Boolean(errors.email))}
          />
        </Field>

        <Field
          id={ids.visitDate}
          name="visitDate"
          label="Preferred visit date"
          error={errors.visitDate}
          className="sm:col-span-2"
        >
          <input
            id={ids.visitDate}
            name="visitDate"
            type="date"
            // min/max give the native picker the same bounds the schema
            // enforces, so the common path never produces an error at all.
            min={todayInIst()}
            max={maxVisitDate()}
            value={values.visitDate}
            onChange={(e) => update('visitDate', e.target.value)}
            aria-invalid={errors.visitDate ? true : undefined}
            aria-describedby={errors.visitDate ? `${ids.visitDate}-error` : undefined}
            className={inputClass(Boolean(errors.visitDate))}
          />
        </Field>

        <Field
          id={ids.message}
          name="message"
          label="Message"
          error={errors.message}
          className="sm:col-span-2"
        >
          <textarea
            id={ids.message}
            name="message"
            rows={4}
            value={values.message}
            onChange={(e) => update('message', e.target.value)}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? `${ids.message}-error` : undefined}
            className={inputClass(Boolean(errors.message))}
          />
        </Field>
      </div>

      {/*
        Honeypot. aria-hidden and tabIndex -1 keep it away from screen readers
        and the keyboard; it is off-screen rather than display:none because
        some bots skip fields that are not rendered.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company (leave blank)</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.company ?? ''}
          onChange={(e) => update('company', e.target.value)}
        />
      </div>

      <button type="submit" disabled={submitting} className="btn-primary mt-6 w-full">
        {submitting ? 'Sending…' : 'Request a visit'}
      </button>
    </form>
  );
}

function inputClass(invalid: boolean): string {
  return `w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-800
          placeholder:text-ink-400 focus:outline-none
          ${invalid ? 'border-brand-500' : 'border-ink-300 focus:border-brand-500'}`;
}

function Field({
  id,
  label,
  hint,
  error,
  className = '',
  children,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-ink-700">
        {label}
        {hint ? <span className="text-xs font-normal text-ink-400">{hint}</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-brand-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
