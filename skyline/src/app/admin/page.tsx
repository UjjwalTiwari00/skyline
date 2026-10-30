import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { timingSafeEqual } from 'node:crypto';

import { enquiryStore } from '@/lib/enquiry-store';

export const metadata: Metadata = {
  title: 'Enquiries',
  // Never index an admin surface, even a trivially-protected one.
  robots: { index: false, follow: false },
};

/** Reads the current enquiries, so it must not be cached. */
export const dynamic = 'force-dynamic';

const COOKIE = 'skyline_admin';

/**
 * Compares in constant time. A plain `===` on a secret leaks its length and
 * prefix through response timing; this is cheap enough that there is no reason
 * not to do it properly.
 */
function matchesPassword(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function isAuthenticated(): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const token = (await cookies()).get(COOKIE)?.value;
  return Boolean(token && matchesPassword(token, expected));
}

async function signIn(formData: FormData) {
  'use server';

  const expected = process.env.ADMIN_PASSWORD;
  const submitted = String(formData.get('password') ?? '');

  if (!expected || !matchesPassword(submitted, expected)) {
    redirect('/admin?error=1');
  }

  (await cookies()).set(COOKIE, submitted, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: 60 * 60 * 8,
  });
  redirect('/admin');
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  if (!(await isAuthenticated())) {
    return <SignIn failed={params.error === '1'} configured={Boolean(process.env.ADMIN_PASSWORD)} />;
  }

  const enquiries = await enquiryStore.list();

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl text-ink-900">Enquiries</h1>
      <p className="mt-2 text-sm text-ink-500">
        {enquiries.length} received, newest first.
      </p>

      {enquiries.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-14 text-center text-sm text-ink-500">
          No enquiries yet.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-ink-200 bg-white">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Received</th>
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Phone</th>
                <th scope="col" className="px-4 py-3 font-semibold">Visit</th>
                <th scope="col" className="px-4 py-3 font-semibold">Property</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {enquiries.map((enquiry) => (
                <tr key={enquiry.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-500">
                    {new Date(enquiry.createdAt).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-800">{enquiry.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-700">{enquiry.phone}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-700">{enquiry.visitDate}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`/properties/${enquiry.propertySlug}`}
                      className="text-brand-600 hover:text-brand-700"
                    >
                      {enquiry.propertySlug}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SignIn({ failed, configured }: { failed: boolean; configured: boolean }) {
  return (
    <div className="mx-auto max-w-sm px-4 py-24 sm:px-6">
      <h1 className="font-display text-2xl text-ink-900">Enquiries</h1>

      {!configured ? (
        <p role="alert" className="mt-5 rounded-lg border border-ink-300 bg-ink-100 px-4 py-3 text-sm text-ink-600">
          <code>ADMIN_PASSWORD</code> is not set. Add it to <code>.env.local</code> to use this
          page.
        </p>
      ) : (
        <form action={signIn} className="mt-6">
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
          />
          {failed ? (
            <p role="alert" className="mt-2 text-sm text-brand-600">
              Incorrect password.
            </p>
          ) : null}
          <button type="submit" className="btn-primary mt-5 w-full">
            Sign in
          </button>
        </form>
      )}
    </div>
  );
}
