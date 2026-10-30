'use client';

import Image from 'next/image';
import { useState } from 'react';

import type { PropertyImage } from '@/lib/property';

/**
 * Image gallery.
 *
 * A tablist rather than a carousel: there are four to six images, so showing
 * them all as thumbnails is clearer than hiding them behind arrows, and the
 * tab/tabpanel roles give keyboard users arrow-key navigation for free from
 * the browser's own roving-focus behaviour.
 *
 * The only client state is which index is active.
 */
export function Gallery({ images, title }: { images: PropertyImage[]; title: string }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  if (!current) {
    return <div className="aspect-[3/2] w-full rounded-2xl bg-ink-200" />;
  }

  return (
    <div>
      <div className="relative aspect-[3/2] overflow-hidden rounded-2xl bg-ink-200">
        <Image
          src={current.url}
          alt={current.alt}
          fill
          sizes="(max-width: 1023px) 100vw, 60vw"
          className="object-cover"
          // The gallery is the LCP element on this route.
          priority
        />
      </div>

      {images.length > 1 ? (
        <div
          role="tablist"
          aria-label={`Images of ${title}`}
          className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6"
        >
          {images.map((image, index) => (
            <button
              key={image.url + index}
              role="tab"
              type="button"
              aria-selected={index === active}
              aria-label={`Image ${index + 1} of ${images.length}`}
              // Only the active thumbnail is in the tab order; arrow keys move
              // between them. Six tab stops for one control would be hostile.
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                event.preventDefault();
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % images.length
                    : (index - 1 + images.length) % images.length;
                setActive(next);
                // Focus must follow selection or the next arrow press is lost.
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  ?.[next]?.focus();
              }}
              className={`relative aspect-[3/2] overflow-hidden rounded-lg transition-opacity
                ${index === active ? 'ring-2 ring-brand-500 ring-offset-2' : 'opacity-70 hover:opacity-100'}`}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="(max-width: 639px) 25vw, 120px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
