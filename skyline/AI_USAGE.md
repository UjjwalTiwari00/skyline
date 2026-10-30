# AI usage

## Tools

| Tool | Used for |
| --- | --- |
| **Claude (Claude Code)** | The bulk of the implementation: scaffolding, the Three.js scene, components, route handlers, seed and measurement scripts, and this documentation. |

No other AI tools were used. No paid templates, no generated code copied from a third-party repository.

## What it was used for, and what it was not

**Used for:**

- Scaffolding the Next.js App Router project and the Tailwind v4 token layer.
- Writing the first draft of nearly every file, which I then read, corrected and in several places redesigned (see below).
- The procedural image generator (`scripts/generate-renders.mjs`) and the bundle measurement script.
- Porting the information architecture of the listing card and detail page out of an existing production React app I work on, into typed Server Components.

**Not used for:**

- The architectural decisions. The three that mattered — Server Components instead of client fetching, Next 15 instead of 16, and a hand-written scroll driver instead of GSAP — were made by reading measurements, and are explained in the README.

## Prompts that worked well

**1. Asking for the measurement before the implementation.**

> Before writing any UI, scaffold the app and run a production build so we know the real first-load JS headroom. If Next's baseline is higher than ~105 KB gzipped, the whole UI approach has to change.

This surfaced the single most important constraint on day one rather than at submission time. It is the reason the project is on Next 15.

**2. Making a constraint explicit and letting it drive the design.**

> `/properties` has to come in under 120 KB gzipped first-load JS, and Next's own baseline eats most of that. Decide where the client boundary goes with that number in mind.

The result was the structure the project actually has: one tight `Suspense` boundary around `FilterBar`, with the grid, the pager and all 54 cards staying server-rendered.

**3. Asking it to argue against the obvious choice.**

> GSAP + ScrollTrigger is the default answer for scroll-driven 3D. Cost it against the 200 KB 3D budget alongside Three.js, and tell me what a hand-written scroll driver would cost instead.

Three.js (~150 KB) plus GSAP and ScrollTrigger (~45 KB) does not fit in 200 KB. The damped scroll driver in `scene.ts` is about 30 lines.

## Where the AI was wrong, and how I caught it

### 1. A measurement bug that would have caused me to redesign the whole app

`scripts/measure-bundle.mjs` reported all three routes roughly 35 KB **over** budget:

```
Landing      147.6 KB   130 KB   OVER
Listings     152.6 KB   120 KB   OVER
Detail       153.2 KB   120 KB   OVER
```

I had already started planning how to cut 30 KB of framework weight. What caught it: Next's own build output disagreed, reporting 112 kB and 117 kB for the same routes. A ~35 KB discrepancy in the same direction on every route is a systematic error, not noise.

The cause was in the script's own `extractScripts`: it collected every `<script src>` in the document, including Next's legacy polyfill bundle, which is emitted as

```html
<script src="/_next/static/chunks/polyfills-42372ed130431b0a.js" noModule=""></script>
```

`noModule` means every browser that supports ES modules — including every browser Lighthouse scores on — ignores the tag completely. 112 KB raw, about 35 KB gzipped, counted against a budget it never touches.

The fix is the `nomodule` skip in `extractScripts`, with a comment explaining why it is there. Corrected, every route passes.

**The lesson I took from it:** a tool written by the same process that wrote the code under test is not an independent check. The thing that actually caught this was cross-referencing a second, independent source of truth.

### 2. Seed data that made a filter return nonsense

The first version of `scripts/seed.ts` typed `bhk` as a required `1 | 2 | 3 | 4` and assigned plots `bhk: 1`, because the type did not allow anything else. Filtering the listings by "1 BHK" therefore returned residential plots, which have no bedrooms at all.

I caught it by checking the distribution of the generated data rather than reading the code:

```
bhk: { '1': 22, '2': 4, '3': 21, '4': 7 }
```

Two problems in one output. `bhk: 1` was inflated by plots and studios, and `2 BHK` had only four records out of 54 — filtering it would have shown an almost-empty page to a reviewer.

Fixes: `bhk` became `v.nullable(...)` with plots set to `null`, the repository's BHK filter now excludes null-BHK records explicitly, and the property-type picker was changed from a uniform pick across five types to a weighted pool, because picking evenly made plots and studios 40% of a residential catalogue.

### 3. Markup that could not meet the responsive requirement

Asked to port `PropViewCardPro.jsx` from the existing app, the first attempt translated it fairly literally. The original is `styled-components` with hard pixel sizes — `width: 811px`, `.imgeProp { width: 242px; height: 210px }`, and `height: 100vh` on the list wrapper. That cannot hold from 360 px to 1920 px, and it ships a runtime CSS-in-JS dependency the budget has no room for.

I kept the card's information architecture and rewrote the markup as a Tailwind Server Component.

---

*Written for the reviewers. I have read every file in this repository and can explain any of it.*
