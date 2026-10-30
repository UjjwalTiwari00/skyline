'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LabelPosition, SceneHandle } from './scene';

/** The five scroll scenes, with the progress range each one owns. */
const SCENES = [
  {
    id: 'arrival',
    from: 0,
    to: 0.18,
    eyebrow: 'Arrival',
    title: 'Rising on Golf Course Road',
    body: 'Forty-eight floors set back from the ridge, with the Aravallis on three sides.',
  },
  {
    id: 'build',
    from: 0.18,
    to: 0.44,
    eyebrow: 'Structure',
    title: 'Two hundred and twelve homes, stacked',
    body: 'Post-tensioned slabs on a central core. Scroll back to take it apart again.',
  },
  {
    id: 'inside',
    from: 0.44,
    to: 0.64,
    eyebrow: 'Inside',
    title: 'The eighteenth floor',
    body: 'The facade peels away to a three-bedroom plan: living room west, bedrooms east, balcony to the ridge.',
  },
  {
    id: 'amenities',
    from: 0.64,
    to: 0.9,
    eyebrow: 'Amenities',
    title: 'The podium',
    body: 'A 25-metre pool, a gym on the third level, and two acres of planting between them.',
  },
  {
    id: 'cta',
    from: 0.9,
    to: 1,
    eyebrow: 'Skyline',
    title: 'Homes from ₹2.4 Cr',
    body: '',
  },
] as const;

const ROOM_LABELS: Record<string, string> = {
  living: 'Living',
  bedroom: 'Bedroom',
  balcony: 'Balcony',
  pool: '25 m pool',
  gym: 'Gym',
  garden: 'Garden',
};

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Runs `callback` when the main thread is free, falling back to a short
 * timeout on browsers without requestIdleCallback (Safari). Returns a cancel
 * function so the caller does not have to remember which one to call.
 */
function scheduleIdle(callback: () => void, timeout: number): () => void {
  const scope = window as IdleWindow;
  if (typeof scope.requestIdleCallback === 'function') {
    const handle = scope.requestIdleCallback(callback, { timeout });
    return () => scope.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, 320);
  return () => window.clearTimeout(handle);
}

/** Cheap capability probe — a failed context means we show the poster instead. */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

type Mode = 'poster' | 'live' | 'static';

/**
 * The scroll-driven hero.
 *
 * Load order matters and is the whole reason this component exists:
 *
 *  1. The server renders the headline, the sub-copy and a poster image. That
 *     is the LCP element and it needs no JavaScript at all.
 *  2. After mount, we check for reduced motion and WebGL. If either says no,
 *     we stop here and the poster is the final state — never a blank canvas.
 *  3. Only then is ./scene imported, which is the only module that pulls in
 *     three. The import is deferred to idle time so it cannot compete with
 *     hydration for the main thread.
 *
 * The canvas renders only while it is on screen and the tab is visible.
 */
export function HeroCanvas({ poster }: { poster: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const labelRefs = useRef(new Map<string, HTMLSpanElement>());

  const [mode, setMode] = useState<Mode>('poster');
  const [activeScene, setActiveScene] = useState(0);

  /** Scroll position of the pinned section, as 0-1. */
  const readProgress = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return 0;
    const rect = section.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    if (scrollable <= 0) return 0;
    const progress = -rect.top / scrollable;
    return progress < 0 ? 0 : progress > 1 ? 1 : progress;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!supportsWebGL()) {
      // Designed fallback, not an error: the poster stays and the overlay
      // panels still advance with scroll.
      setMode('poster');
      return;
    }

    let disposed = false;
    let handle: SceneHandle | null = null;
    let rafPending = false;

    const applyProgress = () => {
      rafPending = false;
      const progress = readProgress();
      handle?.setProgress(progress);
      const index = SCENES.findIndex((s) => progress >= s.from && progress < s.to);
      setActiveScene(index === -1 ? SCENES.length - 1 : index);
    };

    const onScroll = () => {
      // One read per frame. Reading getBoundingClientRect on every scroll
      // event forces layout and is the usual cause of jank here.
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(applyProgress);
    };

    const load = async () => {
      // The only import of three in the app.
      const { createTowerScene } = await import('./scene');
      if (disposed) return;

      handle = createTowerScene(canvas, { reducedMotion: reduced });
      sceneRef.current = handle;

      handle.onLabels((labels: LabelPosition[]) => {
        // Written straight to the DOM. Routing 6 label positions through
        // React state would re-render the tree 60 times a second.
        for (const label of labels) {
          const element = labelRefs.current.get(label.id);
          if (!element) continue;
          element.style.transform = `translate3d(${label.x}px, ${label.y}px, 0) translate(-50%, -50%)`;
          element.style.opacity = label.visible ? '1' : '0';
        }
      });

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        handle?.setSize(rect.width, rect.height);
      };
      resize();
      applyProgress();

      setMode(reduced ? 'static' : 'live');

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);

      // Render only while the canvas is actually on screen.
      const visibility = new IntersectionObserver(
        ([entry]) => handle?.setRunning(Boolean(entry?.isIntersecting) && !document.hidden),
        { threshold: 0 },
      );
      visibility.observe(canvas);

      const onVisibilityChange = () => {
        if (document.hidden) handle?.setRunning(false);
        else handle?.setProgress(readProgress());
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      const onPointerMove = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        handle?.setPointer(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          ((event.clientY - rect.top) / rect.height) * 2 - 1,
        );
      };
      if (!reduced) {
        // Pointer only: on touch this would fight the scroll gesture.
        window.addEventListener('pointermove', onPointerMove, { passive: true });
      }

      cleanupExtras = () => {
        resizeObserver.disconnect();
        visibility.disconnect();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pointermove', onPointerMove);
      };
    };

    let cleanupExtras: (() => void) | null = null;

    // Defer past hydration so WebGL setup never delays interactivity.
    // Safari still lacks requestIdleCallback, hence the timeout fallback.
    const cancelIdle = scheduleIdle(() => void load(), 1800);

    window.addEventListener('scroll', onScroll, { passive: true });
    applyProgress();

    return () => {
      disposed = true;
      window.removeEventListener('scroll', onScroll);
      cancelIdle();
      cleanupExtras?.();
      handle?.dispose();
      sceneRef.current = null;
    };
  }, [readProgress]);

  const scene = SCENES[activeScene] ?? SCENES[0];

  return (
    <section
      ref={sectionRef}
      // 460vh of scroll for 5 scenes — roughly a screen each, which is slow
      // enough to read a panel without feeling like the page has stalled.
      className="relative h-[460vh] bg-ink-900"
      aria-label="The Skyline tower, told in five scenes"
    >
      <div className="sticky top-0 h-dvh overflow-hidden">
        {/* Poster: server-rendered, the LCP candidate, and the permanent
            fallback when WebGL is unavailable. */}
        <Image
          src={poster}
          alt="The Skyline tower at dusk, seen from the approach road"
          fill
          priority
          sizes="100vw"
          className={`object-cover transition-opacity duration-700 ${
            mode === 'poster' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <canvas
          ref={canvasRef}
          // Decorative: the narrative is in the text panels, which are real
          // DOM and are what a screen reader should read.
          aria-hidden="true"
          className={`absolute inset-0 size-full transition-opacity duration-700 ${
            mode === 'poster' ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* Labels pinned to 3D positions. Positioned imperatively each frame. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {Object.entries(ROOM_LABELS).map(([id, text]) => (
            <span
              key={id}
              ref={(element) => {
                if (element) labelRefs.current.set(id, element);
                else labelRefs.current.delete(id);
              }}
              style={{ opacity: 0 }}
              className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-ink-900/80 px-3 py-1.5
                         text-xs font-semibold text-white backdrop-blur-sm transition-opacity duration-300"
            >
              {text}
            </span>
          ))}
        </div>

        {/*
          Bottom-weighted scrim. The previous one was heavy at the top too,
          which buried the sky — the brightest, most expensive part of the
          frame — behind a wash. This keeps contrast under the headline and
          leaves the upper two-thirds clear.
        */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-ink-900 via-ink-900/55 via-40% to-transparent" />
        {/* A touch of top shade so the sticky header keeps its contrast. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-ink-900/55 to-transparent" />

        {/* Narrative panels. Rendered as real text in the DOM, with only the
            active one visible, so the story survives without WebGL. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
            <div className="max-w-3xl">
              <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-sand">
                <span aria-hidden="true" className="h-px w-8 bg-sand/60" />
                {scene.eyebrow}
              </p>

              {/*
                Editorial scale. The display face is the brand's voice, so the
                headline is sized to carry the frame rather than to sit
                politely under the nav — the type is doing as much work here as
                the geometry.
                aria-live announces the scene change rather than swapping it
                silently under a screen-reader user.
              */}
              <h2
                aria-live="polite"
                className="mt-5 font-display text-[2.6rem] leading-[0.95] tracking-[-0.02em] text-white
                           [text-wrap:balance] sm:text-6xl lg:text-7xl"
              >
                {scene.title}
              </h2>

              {scene.body ? (
                <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/70 sm:text-base">
                  {scene.body}
                </p>
              ) : null}

              {scene.id === 'cta' ? (
                <div className="pointer-events-auto mt-8 flex flex-col gap-7">
                  <dl className="flex flex-wrap gap-x-10 gap-y-4">
                    {[
                      ['48', 'floors'],
                      ['212', 'residences'],
                      ['2.4', 'acres of podium'],
                    ].map(([value, label]) => (
                      <div key={label}>
                        <dt className="sr-only">{label}</dt>
                        <dd>
                          <span className="font-display text-3xl text-white sm:text-4xl">
                            {value}
                          </span>
                          <span className="ml-2 text-xs uppercase tracking-[0.18em] text-white/50">
                            {label}
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-3">
                    <a href="/properties" className="btn-primary">
                      Explore homes
                    </a>
                    <a
                      href="/properties"
                      className="inline-flex items-center justify-center rounded-full border border-white/25
                                 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                    >
                      Book a visit
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <SceneRail active={activeScene} />
        <ScrollHint hidden={activeScene > 0} />
      </div>
    </section>
  );
}

/**
 * Chapter rail.
 *
 * Five scenes over 460vh is a long way to scroll without knowing how far in
 * you are or how much is left. The rail gives that orientation, and doubles as
 * a progress indicator. Hidden on small screens, where it would crowd the
 * headline, and aria-hidden because the headings already announce the scene.
 */
function SceneRail({ active }: { active: number }) {
  return (
    <ol
      aria-hidden="true"
      className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-4 lg:flex"
    >
      {SCENES.map((scene, index) => (
        <li key={scene.id} className="flex items-center justify-end gap-3">
          <span
            className={`text-[10px] uppercase tracking-[0.2em] transition-colors duration-300 ${
              index === active ? 'text-white' : 'text-white/35'
            }`}
          >
            {scene.eyebrow}
          </span>
          <span
            className={`h-px transition-all duration-300 ${
              index === active ? 'w-8 bg-sand' : 'w-3 bg-white/30'
            }`}
          />
        </li>
      ))}
    </ol>
  );
}

function ScrollHint({ hidden }: { hidden: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px]
                  uppercase tracking-[0.2em] text-white/60 transition-opacity duration-500
                  ${hidden ? 'opacity-0' : 'opacity-100'}`}
    >
      Scroll
    </div>
  );
}
