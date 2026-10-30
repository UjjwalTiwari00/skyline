/**
 * Measures first-load JavaScript per route, gzipped.
 *
 * Next 16's Turbopack build no longer prints the First Load JS table, and the
 * assignment's budgets are stated in gzipped kilobytes, so this measures the
 * thing directly: load each route from a running production server, collect
 * every script the document actually pulls in, and gzip the corresponding
 * build artefacts.
 *
 * Counts <script src> and <link rel=preload as=script> — a modulepreload is
 * fetched on first load just as a script tag is, so excluding it would
 * flatter the number.
 *
 * Usage:
 *   npm run build && npx next start -p 3100
 *   node scripts/measure-bundle.mjs http://localhost:3100
 */
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3100';

/** Budgets from the assignment brief, in KB gzipped. */
const ROUTES = [
  { path: '/', budget: 130, label: 'Landing (before 3D loads)' },
  { path: '/properties', budget: 120, label: 'Listings' },
  { path: null, budget: 120, label: 'Detail', resolve: 'firstSlug' },
];

async function firstSlug() {
  const properties = JSON.parse(
    await readFile(new URL('../src/data/properties.json', import.meta.url), 'utf8'),
  );
  return `/properties/${properties[0].slug}`;
}

function extractScripts(html) {
  const urls = new Set();

  for (const match of html.matchAll(/<script\b[^>]*>/g)) {
    const tag = match[0];
    /**
     * Skip `noModule` bundles. Next emits its legacy polyfills (~112 KB raw)
     * with this attribute, and every browser that supports ES modules — i.e.
     * every browser Lighthouse scores on — ignores the tag entirely. Counting
     * it made all three routes look ~35 KB over budget when they were not.
     */
    if (/\bnomodule\b/i.test(tag)) continue;

    const src = tag.match(/\bsrc="([^"]+\.js)"/)?.[1];
    if (src?.startsWith('/_next/')) urls.add(src);
  }

  for (const match of html.matchAll(/<link\b[^>]*>/g)) {
    const tag = match[0];
    if (!/rel="(?:preload|modulepreload)"/.test(tag)) continue;
    if (/\bas="(?!script)/.test(tag)) continue;
    const href = tag.match(/\bhref="([^"]+\.js)"/)?.[1];
    if (href?.startsWith('/_next/')) urls.add(href);
  }

  return [...urls];
}

async function gzippedSize(url) {
  // /_next/static/... maps to .next/static/...
  const relative = url.replace(/^\/_next\//, '').split('?')[0];
  const file = join(process.cwd(), '.next', relative);
  try {
    const raw = await readFile(file);
    return gzipSync(raw, { level: 9 }).length;
  } catch {
    // Fall back to the network for anything not on disk under that name.
    const response = await fetch(`${BASE}${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return gzipSync(buffer, { level: 9 }).length;
  }
}

const kb = (bytes) => bytes / 1024;

async function main() {
  let failures = 0;
  console.log(`\nFirst-load JS, gzipped — measured against ${BASE}\n`);
  console.log(
    `${'Route'.padEnd(34)}${'Scripts'.padStart(8)}${'Size'.padStart(11)}${'Budget'.padStart(9)}  Result`,
  );
  console.log('-'.repeat(78));

  for (const route of ROUTES) {
    const path = route.resolve === 'firstSlug' ? await firstSlug() : route.path;
    const response = await fetch(`${BASE}${path}`);
    if (!response.ok) {
      console.log(`${route.label.padEnd(34)}  HTTP ${response.status}`);
      failures += 1;
      continue;
    }

    const html = await response.text();
    const scripts = extractScripts(html);
    const sizes = await Promise.all(scripts.map(gzippedSize));
    const total = sizes.reduce((sum, size) => sum + size, 0);

    const pass = kb(total) <= route.budget;
    if (!pass) failures += 1;

    console.log(
      `${route.label.padEnd(34)}${String(scripts.length).padStart(8)}` +
        `${`${kb(total).toFixed(1)} KB`.padStart(11)}${`${route.budget} KB`.padStart(9)}` +
        `  ${pass ? 'PASS' : 'OVER'}`,
    );
  }

  console.log('-'.repeat(78));

  // The 3D chunk is budgeted separately because it is explicitly NOT part of
  // first load: it is reached only through the dynamic import in HeroCanvas.
  // Measuring it here is also the check that it never leaked into a route
  // above — if it had, the landing number would jump by this much.
  const threeChunks = await findLazyChunks();
  if (threeChunks.length > 0) {
    const total = threeChunks.reduce((sum, entry) => sum + entry.size, 0);
    const pass = kb(total) <= 200;
    if (!pass) failures += 1;
    console.log(
      `\n3D chunk (lazy-loaded, not first load)` +
        `${`${kb(total).toFixed(1)} KB`.padStart(16)}${'200 KB'.padStart(9)}  ${pass ? 'PASS' : 'OVER'}`,
    );
    for (const entry of threeChunks) {
      console.log(`   ${entry.name.padEnd(44)}${`${kb(entry.size).toFixed(1)} KB`.padStart(10)}`);
    }
  }

  console.log(failures === 0 ? '\nAll budgets met.\n' : `\n${failures} budget(s) exceeded.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * Finds the async chunks that hold the scene. They are not referenced by any
 * document, so they cannot be discovered the way first-load scripts are —
 * we look for the build artefacts that actually contain three's code.
 */
async function findLazyChunks() {
  const { readdir } = await import('node:fs/promises');
  const dir = join(process.cwd(), '.next', 'static', 'chunks');
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const results = [];
  for (const name of names) {
    if (!name.endsWith('.js')) continue;
    const raw = await readFile(join(dir, name));
    /**
     * Identify by content, not by filename. Next hashes async chunk names
     * (`b536a0f1.68e596ed.js`), so any name-based heuristic silently matches
     * nothing — which is exactly what an earlier version of this script did.
     * `WebGLRenderer` appears in three and in nothing else we ship.
     */
    if (!raw.includes('WebGLRenderer')) continue;
    results.push({ name, size: gzipSync(raw, { level: 9 }).length });
  }
  return results;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
