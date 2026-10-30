# Skyline

A showcase site for a fictional 48-storey residential tower in Gurugram: a scroll-driven 3D landing page, a filterable catalogue of 54 homes, per-property detail pages, and a validated enquiry API.

Built with Next.js App Router and TypeScript.

---

## Run it

```bash
npm install
npm run seed        # writes src/data/properties.json (54 properties)
npm run renders     # writes public/properties/*.jpg (16 generated images)
npm run dev         # http://localhost:3000
```

Four commands. `seed` and `renders` are deterministic, so they produce identical output on every machine; the generated files are committed, so you can skip straight to `npm run dev` if you prefer.

Other scripts:

```bash
npm test            # 27 unit tests (filter/URL logic, enquiry validation)
npm run build       # production build
npm run measure     # first-load JS per route, gzipped, against the budgets
npm run analyze     # bundle analyzer -> .next/analyze/
```

`npm run measure` needs a production server running (`npm run build && npx next start -p 3100`).

Copy `.env.example` to `.env.local` if you want to change the enquiry storage path or the `/admin` password. Nothing is required to run locally.

---

## Architecture

```
src/
  app/
    page.tsx                      landing — Server Component, hero is the only client island
    properties/page.tsx           listings — Server Component, no client data fetching
    properties/[slug]/page.tsx    detail — 54 pages prerendered at build
    api/properties/...            read endpoints
    api/enquiries/route.ts        POST, validated + rate limited + honeypot
  components/
    hero/HeroCanvas.tsx           client boundary; dynamically imports the scene
    hero/scene.ts                 all the Three.js — the only module that imports three
    FilterBar.tsx                 the one client component on /properties
    EnquiryForm.tsx               client; shares its validation with the server
    PropertyCard.tsx  Gallery.tsx  Pagination.tsx  SiteHeader.tsx  SiteFooter.tsx
  lib/
    property.ts                   the Property schema + type — one definition, both sides
    enquiry.ts                    the Enquiry schema — imported by the form AND the route
    query.ts                      filter <-> URL translation, dependency-free
    repository.ts                 filtering, sorting, pagination, "similar"
    rate-limit.ts  enquiry-store.ts  format.ts
scripts/
  seed.ts                         generates the catalogue
  generate-renders.mjs            generates the imagery
  measure-bundle.mjs              measures first-load JS against the budgets
```

### Shared types

`lib/property.ts` and `lib/enquiry.ts` are Valibot schemas with the TypeScript types inferred from them. The route handler and the React form import the *same* `validateEnquiry`, so the client cannot accept something the server rejects.

Valibot rather than Zod specifically for the bundle: it tree-shakes to a few hundred bytes per validator, and `EnquiryForm` is on a route with ~5 KB of headroom. Zod would have cost roughly 13 KB gzipped for the same rules.

### Why the pages don't call their own API

`/properties` reads `lib/repository.ts` directly instead of `fetch`-ing `/api/properties`. A Server Component calling its own route handler adds a network hop, a second JSON serialisation, and a self-referential cache entry, for no benefit. The API exists for external consumers and is covered by the same validation.

---

## The 3D, and how it loads

### Load order

The hero is **server-rendered HTML** — headline, sub-copy, CTA and a poster image. That poster is the LCP element and needs no JavaScript.

After mount, `HeroCanvas` does three things in order:

1. Checks `prefers-reduced-motion` and probes for a WebGL context.
2. If either says no, it stops. The poster is the final state — never a blank canvas, never an error.
3. Otherwise it schedules `import('./scene')` on `requestIdleCallback` (timeout 1800 ms, `setTimeout` fallback for Safari). That dynamic import is the only reference to `three` anywhere in the app.

Measured result: the landing route's first-load JS is **112.4 KB** gzipped, of which the hero component is about 2 KB. The 3D code is **133.7 KB** in two lazily-fetched chunks that no route pulls in.

### Scroll driver

Scroll position maps to a single `progress` value in `[0, 1]`. Camera, floor assembly, facade opacity and label positions are all pure functions of it — there is no accumulated state, which is why scrubbing backwards unwinds cleanly.

Each frame the *displayed* progress eases toward the target (`shown += (target - shown) * 0.12`) rather than snapping, so a fast flick decelerates into place.

**No GSAP/ScrollTrigger, and no Lenis.** The 3D budget is 200 KB; Three.js is ~134 KB of it, and GSAP + ScrollTrigger would have been ~45 KB more. The driver that replaces them is about 30 lines. Pinning is `position: sticky`, which costs nothing and does not hijack native scrolling — better for keyboard users and for mobile.

### The five scenes

| Progress | Scene | What happens |
| --- | --- | --- |
| 0.00–0.18 | Arrival | Slow orbit around the tower in its surroundings; headline fades in |
| 0.18–0.44 | Structure | 34 floors stack bottom-up; slabs land first, glass follows |
| 0.44–0.64 | Inside | Camera pushes through the facade; glass dissolves to reveal a floor plan with Living / Bedroom / Balcony labels pinned to 3D positions |
| 0.64–0.90 | Amenities | Three camera stops — pool, gym, garden — each with its own label |
| 0.90–1.00 | Settle | Returns to a hero framing; "Explore homes" CTA |

Scene text is real DOM, not canvas, so the story is readable by a screen reader and survives with WebGL disabled. Labels are positioned by projecting their 3D anchor to screen space and writing `transform` **directly to the element** — routing six positions through React state would re-render the tree 60 times a second.

### Degradation and frame cost

- `prefers-reduced-motion` → no rAF loop, no scrubbed camera, shadows off; renders one static frame.
- No WebGL → the poster stays, panels still advance with scroll.
- `IntersectionObserver` stops rendering when the canvas leaves the viewport; `visibilitychange` stops it when the tab is hidden.
- The loop **also stops when the scene settles** — once displayed progress reaches the target it cancels its own rAF rather than re-rendering an identical frame. Reading a panel costs no GPU time.
- Device pixel ratio capped at 1.75.
- Geometry is instanced: 34 floors are two `InstancedMesh` draws, not 68.

### Assets

The tower is **built procedurally** — no GLB, no Draco, no Meshopt, nothing to decompress, **0 bytes of model over the wire** against a 2 MB budget. The environment map is a 32×128 canvas gradient generated at runtime (~1 KB of code) rather than an HDR download, which is what gives the glass a graded reflection instead of flat grey.

Property imagery is generated too (`npm run renders`): 16 SVG compositions rasterised by sharp, four times of day × two camera archetypes, ~75 KB per master. `next/image` derives AVIF and WebP at device widths from those masters, so the browser only ever downloads what its viewport needs.

Generated rather than stock because the catalogue is mostly "new launch" and "under construction" — developers market those with renders, not photographs — and because sixteen unrelated stock photos do not look like one development.

---

## Performance

Budgets are checked by `npm run measure`, which loads each route from a production server, collects every script the document actually pulls in, and gzips the build artefacts.

| Budget | Limit | Measured |
| --- | --- | --- |
| First-load JS, `/` before 3D | ≤ 130 KB | **112.4 KB** |
| First-load JS, `/properties` | ≤ 120 KB | **114.7 KB** |
| First-load JS, `/properties/[slug]` | ≤ 120 KB | **115.4 KB** |
| 3D chunk, lazy-loaded | ≤ 200 KB | **133.7 KB** |
| 3D model + textures over the wire | ≤ 2 MB | **0 MB** (procedural) |

### Next 15, not Next 16 — and why

This is the decision that shaped the project. Next 16.4.3 was the starting point. Measured on identical application code:

| | Next 16.4.3 | Next 15.5.28 |
| --- | --- | --- |
| `/properties` first-load JS | ~150 KB | **114.7 KB** |
| `/` first-load JS | ~140 KB | **112.4 KB** |

Next 16's client runtime is roughly 36 KB heavier. The landing page, which has **zero** client components, measured 177 KB gross on 16 — meaning essentially all of it is framework, and no amount of application-level trimming would have reached 120 KB. Switching to 15.5.28 was the only lever that moved the number into budget.

Turbopack vs webpack was also measured and is not the cause: webpack saved about 7 KB on Next 16, nowhere near enough.

### Where the client boundary goes

`/properties` has about 5 KB of headroom after the framework. So:

- The grid, all 12 cards, the pager and the header/footer are **Server Components** — zero JS.
- `FilterBar` is the only client component, inside a tight `Suspense` boundary (it needs `useSearchParams`, which opts a subtree into client rendering).
- Pagination is real `<a>` links, not buttons with state — so pages are shareable, crawlable, open in a new tab, and work without JS.
- No icon library: the handful of icons are inline SVG. No UI kit, no CSS-in-JS, no client-side data layer.

### Other decisions

- **Images**: `next/image` with AVIF then WebP. Every image has intrinsic `width`/`height` in the data and sits in a fixed `aspect-ratio` box, so nothing reserves zero space — CLS stays at 0. The first row of cards is `priority`; everything below is lazy.
- **Fonts**: Inter and Abril Fatface via `next/font/google`, which downloads at build and self-hosts. `display: swap`, two families exactly.
- **Detail pages**: all 54 prerendered at build time via `generateStaticParams`.

---

## Stability

**The URL is the source of truth.** Search, filters, sort and page live entirely in the query string. `lib/query.ts` owns both directions — parse and serialise — so they cannot drift, and it is covered by round-trip tests (`parse(serialise(q)) === q`).

**Stale results are structurally impossible, not guarded against.** There is no client-side fetching on the listings route. Results are rendered by the server for whichever URL the router last committed, and superseded navigations are discarded by the router. A slow response for an old query has no path by which it could overwrite a newer one. The 300 ms debounce on the search box exists to cut the *number* of navigations while someone types, not to fix ordering.

Typing uses `router.replace` so Back isn't one press per character; discrete filter changes use `push`. Any filter change resets `page` to 1.

**Back from a detail page** returns to the same listing URL, and therefore the same results and scroll position.

**Every state is designed**: skeletons that match the real grid's box exactly (`properties/loading.tsx`), an empty state with a one-click clear, an error boundary with a working retry, and a real 404.

**That 404 is genuinely a 404.** With Next's default `dynamicParams: true`, an unknown slug rendered the 404 *body* but answered **200** — verified before the fix. `dynamicParams = false` makes Next answer 404 before our code runs.

**Forms**: same validation client and server; inline errors keyed to field names; focus moves to the first invalid field; the button disables while sending and the handler also returns early if a submit arrives mid-flight; values are never cleared on failure, so a dropped request costs no retyping.

One subtle one: the visit-date check uses **today in IST**, not `new Date().toISOString()`. The server runs in UTC, so between 00:00 and 05:30 IST a date of "today" would parse as yesterday and be rejected. There is a test for it.

**Accessibility**: skip link, visible focus on everything, labels on all inputs, `aria-invalid`/`aria-describedby` wired to error text, gallery as a tablist with roving tabindex (six images = one tab stop, arrow keys to move), `aria-live` on the result count and scene headings, alt text throughout, and the canvas marked `aria-hidden` because the narrative lives in the DOM beside it.

---

## Backend

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/properties` | `q`, `minPrice`, `maxPrice`, `bhk`, `type`, `furnished`, `sort`, `page`, `limit` (max 24). Returns `{ items, total, page, hasMore }`. Invalid params → `400` with a readable message. |
| `GET /api/properties/:slug` | One property, or `404`. |
| `GET /api/properties/:slug/similar` | Up to 4. Same locality outranks same BHK; ties broken by closeness in price. `404` on unknown slug rather than an empty array, so a typo is distinguishable from a property with no neighbours. |
| `POST /api/enquiries` | Valibot-validated, honeypot, rate limited 5 per IP per 10 minutes → `429` with `Retry-After`. Returns `201`. |

**Caching.** Read endpoints send `public, s-maxage=60, stale-while-revalidate=300` for the list and `s-maxage=300, stale-while-revalidate=3600` for a single property. A shared cache holds each filter combination for a minute and keeps serving it for five more while it revalidates. No private browser copy: Back is served by the router cache, and a stale private copy would outlive a deploy.

The pages themselves are static — all 54 detail pages and the landing page are prerendered at build. `/properties` is server-rendered per request because it reads `searchParams`.

**Honeypot behaviour is deliberate**: a filled `company` field returns `201` and writes nothing. Returning an error would teach a scraper to stop filling the field.

**Rate limiting is in-memory**, so on a multi-instance deploy the effective limit is `5 × instances`. That is a real limitation, stated here rather than hidden; for abuse that matters it belongs in middleware backed by a shared store.

**Storage** is JSON Lines via an `EnquiryStore` interface — appending a line is atomic enough, where rewriting a JSON array loses concurrent writes. On Vercel only `/tmp` is writable and it is per-instance and ephemeral, so enquiries there do not survive an instance recycling. Fine for a demo, wrong for production; swapping in Postgres means implementing two methods.

---

## Reuse disclosure

I work on [100acress.com](https://www.100acress.com), a production real-estate site. **No code was copied from it.** What I reused:

- **The data model.** `lib/property.ts` is derived from that project's Mongoose project schema (`projectName`, `projectAddress`, `city`, `builderName`, `BhK_Details[]`, `Amenities[]`, `minPrice`/`maxPrice`, `project_Status`, `possessionDate`, `project_url`), flattened to one unit-level record.
- **The enquiry shape**, from its `postEnquiry` schema.
- **Domain vocabulary** for the seed data — real Delhi-NCR localities with realistic price-per-sqft bands, and the amenity list from its admin forms.
- **Brand tokens**: the `#C13B44` red and the Abril Fatface + Inter pairing.
- **Information architecture** of the listing card and detail page.

Its listing card (`PropViewCardPro.jsx`) is styled-components with `width: 811px`, `.imgeProp { width: 242px; height: 210px }` and `height: 100vh` on the list wrapper. That cannot hold from 360 px to 1920 px and ships a runtime CSS-in-JS dependency the budget has no room for, so the markup here is new.

Builder and project names in the seed data are **fictional**, so no real developer appears attached to invented listings. Localities are real.

---

## Known issues

- **`/properties` sits 5 KB under its 120 KB budget.** Adding any client-side dependency to that route will break it. `npm run measure` is the guard; run it before merging anything.
- **Rate limiting and enquiry storage are per-instance**, as described above.
- **`dynamicParams = false`** means adding properties requires a rebuild. Correct for a seeded catalogue, wrong the moment the data becomes dynamic.
- **The location block is not a real map.** Embedding Google Maps or Mapbox would add a third-party script and cookies for one decorative panel; it renders coordinates and links out instead.
- **No E2E test.** Unit tests cover the filter/URL logic and validation — the two places where a regression would be silent — but there is no Playwright run.
- **Next 16 is blocked** until its client runtime shrinks or the budget changes. Noted so nobody "helpfully" upgrades it.
- The generated renders read as stylised architectural illustrations rather than photographs. Deliberate, but worth knowing.

## With another day

1. **Playwright E2E** for the three flows that unit tests can't reach: filter → share URL → reload → identical results; Back from detail restoring listing position; double-submitting the enquiry form.
2. **Postgres behind `EnquiryStore`** and a shared-store rate limiter, which together remove both multi-instance caveats.
3. **Shortlist with optimistic UI** — the card already has the affordance space for it.
4. **Day/night toggle on the 3D**, which is cheap here: the scene's lighting and environment are already parameterised, and the generated imagery already ships four times of day.
5. **Tighten the facade shader.** The glass is a `MeshStandardMaterial` with a canvas environment map; a small custom shader with a fresnel term would make the tower read as glass rather than as dark metal, for very few bytes.
