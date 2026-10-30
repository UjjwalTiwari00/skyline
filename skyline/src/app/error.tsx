'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary.
 *
 * `reset` re-runs the failed render rather than reloading the page, so a
 * transient failure costs the user their place but not their session. The
 * digest is shown because without it a production error report is
 * untraceable — the real message is stripped from the client by design.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Stands in for the error reporter a real deployment would have.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center sm:px-6">
      <h1 className="font-display text-3xl text-ink-900">Something went wrong</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        This page failed to load. It is usually temporary — trying again often works.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <a href="/properties" className="btn-secondary">
          Browse all homes
        </a>
      </div>
      {error.digest ? (
        <p className="mt-8 font-mono text-xs text-ink-400">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
