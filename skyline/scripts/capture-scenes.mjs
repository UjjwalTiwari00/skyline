/**
 * Screenshots the five scroll scenes, plus the reduced-motion fallback.
 *
 * The scene is driven by scroll position, so one static screenshot proves
 * nothing. This drives the page to each scene's midpoint, waits for the damped
 * camera to settle, and writes a contact sheet — which is also what makes a
 * visual regression in the hero obvious at a glance.
 *
 * Usage: node scripts/capture-scenes.mjs http://localhost:3100
 */
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const BASE = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '');
const OUT_DIR = join(process.cwd(), 'reports', 'scenes');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** Midpoint of each scene's progress range, from HeroCanvas SCENES. */
const SCENES = [
  { id: '1-arrival', progress: 0.08 },
  { id: '2-structure', progress: 0.3 },
  { id: '3-inside', progress: 0.54 },
  { id: '4-pool', progress: 0.7 },
  { id: '5-garden', progress: 0.86 },
  { id: '6-cta', progress: 0.97 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error('No Chrome or Edge found.');
  return found;
}

async function capture({ reducedMotion }) {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: [
      '--no-sandbox',
      // Headless Chrome has no GPU here. Without a software rasteriser WebGL
      // fails silently and we would screenshot the poster fallback instead.
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  if (reducedMotion) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 90_000 });
  // The scene import is deferred to requestIdleCallback; give it room.
  await sleep(3500);

  const shots = [];
  for (const scene of SCENES) {
    await page.evaluate((progress) => {
      const section = document.querySelector('section[aria-label^="The Skyline tower"]');
      if (!section) return;
      const scrollable = section.offsetHeight - window.innerHeight;
      window.scrollTo({ top: section.offsetTop + scrollable * progress, behavior: 'instant' });
    }, scene.progress);

    // Let the damped camera settle before capturing.
    await sleep(1600);
    shots.push({ id: scene.id, buffer: await page.screenshot({ type: 'png' }) });
  }

  const webgl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'no canvas element';
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return context ? `live (${canvas.width}x${canvas.height})` : 'no context';
  });

  await browser.close();
  return { shots, consoleErrors, webgl };
}

async function sheet(shots, file, cols = 2) {
  const THUMB_W = 640;
  const THUMB_H = Math.round((THUMB_W * 900) / 1440);
  const rows = Math.ceil(shots.length / cols);

  const composites = await Promise.all(
    shots.map(async (shot, index) => ({
      input: await sharp(shot.buffer).resize(THUMB_W, THUMB_H).toBuffer(),
      left: (index % cols) * THUMB_W,
      top: Math.floor(index / cols) * THUMB_H,
    })),
  );

  await sharp({
    create: {
      width: cols * THUMB_W,
      height: rows * THUMB_H,
      channels: 3,
      background: { r: 12, g: 12, b: 12 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toFile(file);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log('capturing scroll scenes ...');
  const normal = await capture({ reducedMotion: false });
  await sheet(normal.shots, join(OUT_DIR, 'scenes.jpg'));
  console.log(`  WebGL: ${normal.webgl}`);

  console.log('capturing reduced-motion fallback ...');
  const reduced = await capture({ reducedMotion: true });
  await sheet(reduced.shots, join(OUT_DIR, 'scenes-reduced-motion.jpg'));
  console.log(`  WebGL: ${reduced.webgl}`);

  const errors = [...normal.consoleErrors, ...reduced.consoleErrors];
  console.log(`\nconsole errors: ${errors.length}`);
  for (const error of errors.slice(0, 10)) console.log(`  ${error}`);

  console.log(`\nSheets -> ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
