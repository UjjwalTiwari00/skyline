/**
 * Runs Lighthouse (mobile profile) against the three graded routes and writes
 * HTML + JSON reports into /reports, plus a summary table.
 *
 * Usage:
 *   npm run build && npx next start -p 3100
 *   node scripts/lighthouse.mjs http://localhost:3100
 *
 * Point it at the deployed URL to produce the reports that actually count:
 *   node scripts/lighthouse.mjs https://your-deployment.vercel.app
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const BASE = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '');
const OUT_DIR = join(process.cwd(), 'reports');

/** Budgets that Lighthouse itself scores. */
const THRESHOLDS = {
  performance: 90,
  accessibility: 95,
  'best-practices': 95,
};

async function routes() {
  const properties = JSON.parse(
    await readFile(new URL('../src/data/properties.json', import.meta.url), 'utf8'),
  );
  return [
    { name: 'landing', path: '/' },
    { name: 'listings', path: '/properties' },
    { name: 'detail', path: `/properties/${properties[0].slug}` },
  ];
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const chrome = await launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  const summary = [];

  try {
    for (const route of await routes()) {
      const url = `${BASE}${route.path}`;
      process.stdout.write(`auditing ${url} ... `);

      const result = await lighthouse(
        url,
        { port: chrome.port, output: ['html', 'json'], logLevel: 'error' },
        // Default config is the mobile profile: Moto G Power emulation with
        // 4x CPU throttling and a simulated slow 4G link.
        undefined,
      );

      if (!result) {
        console.log('failed');
        continue;
      }

      const { lhr, report } = result;
      await writeFile(join(OUT_DIR, `lighthouse-${route.name}.html`), report[0], 'utf8');
      await writeFile(join(OUT_DIR, `lighthouse-${route.name}.json`), report[1], 'utf8');

      const scores = Object.fromEntries(
        Object.entries(lhr.categories).map(([key, category]) => [
          key,
          Math.round((category.score ?? 0) * 100),
        ]),
      );

      summary.push({
        route: route.path,
        ...scores,
        lcp: lhr.audits['largest-contentful-paint']?.displayValue ?? '—',
        cls: lhr.audits['cumulative-layout-shift']?.displayValue ?? '—',
        tbt: lhr.audits['total-blocking-time']?.displayValue ?? '—',
      });

      console.log('done');
    }
  } finally {
    await chrome.kill();
  }

  console.log(`\nLighthouse (mobile) — ${BASE}\n`);
  console.log(
    `${'Route'.padEnd(30)}${'Perf'.padStart(6)}${'A11y'.padStart(6)}${'BP'.padStart(6)}${'SEO'.padStart(6)}` +
      `${'LCP'.padStart(10)}${'CLS'.padStart(8)}${'TBT'.padStart(10)}`,
  );
  console.log('-'.repeat(82));

  let failures = 0;
  for (const row of summary) {
    for (const [key, min] of Object.entries(THRESHOLDS)) {
      if ((row[key] ?? 0) < min) failures += 1;
    }
    console.log(
      row.route.padEnd(30) +
        String(row.performance).padStart(6) +
        String(row.accessibility).padStart(6) +
        String(row['best-practices']).padStart(6) +
        String(row.seo).padStart(6) +
        row.lcp.padStart(10) +
        row.cls.padStart(8) +
        row.tbt.padStart(10),
    );
  }
  console.log('-'.repeat(82));
  console.log(
    failures === 0
      ? '\nAll category thresholds met (perf >= 90, a11y >= 95, best-practices >= 95).\n'
      : `\n${failures} category score(s) below threshold.\n`,
  );

  await writeFile(
    join(OUT_DIR, 'lighthouse-summary.json'),
    `${JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), summary }, null, 2)}\n`,
    'utf8',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
