/**
 * Generates the property imagery.
 *
 * Why generated rather than stock: the catalogue is a fictional tower that is
 * mostly "new launch" and "under construction", and developers market those
 * with architectural renders, not photographs. Generating them also means
 * every asset is ours (no licence to track), the whole set shares one palette
 * instead of looking like sixteen unrelated stock photos, and each master is
 * ~60 KB instead of ~250 KB.
 *
 * Each image is composed as SVG and rasterised by sharp. Deterministic: the
 * same seed produces the same sixteen renders every run.
 *
 * Usage: node scripts/generate-renders.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const WIDTH = 1600;
const HEIGHT = 1067;
const COUNT = 16;
const OUT_DIR = join(process.cwd(), 'public', 'properties');
const SHEET = join(process.cwd(), 'reports', 'render-contact-sheet.jpg');

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Four times of day. Window luminance is paired with the sky so lit windows
 * read as lit — bright windows against a bright sky just look like holes.
 */
const PALETTES = [
  {
    name: 'dawn',
    sky: ['#f3d2ad', '#eeae7d', '#d98f68'],
    haze: '#f6e0c6', sun: '#fff0d0',
    towerNear: '#4a3c38', towerMid: '#766059', towerFar: '#9c867e',
    slab: '#f3dcc2', window: '#ffdfa8', windowLit: 0.2,
    ground: '#39302c', green: '#5d5a3c',
  },
  {
    name: 'day',
    sky: ['#86b6de', '#bcd6ec', '#e4eef6'],
    haze: '#dce9f4', sun: '#ffffff',
    towerNear: '#5b6872', towerMid: '#85919b', towerFar: '#aeb9c1',
    slab: '#eef4f8', window: '#d8ecff', windowLit: 0.08,
    ground: '#48525c', green: '#5f7a52',
  },
  {
    name: 'dusk',
    sky: ['#273764', '#7c4a78', '#e58760'],
    haze: '#9a6a7d', sun: '#ffb37a',
    towerNear: '#221d2b', towerMid: '#3d3549', towerFar: '#5e5369',
    slab: '#d9af8c', window: '#ffcf85', windowLit: 0.42,
    ground: '#191520', green: '#2c2a33',
  },
  {
    name: 'night',
    sky: ['#060a19', '#0f1833', '#202d4b'],
    haze: '#1a2642', sun: '#4e6ea8',
    towerNear: '#0c1120', towerMid: '#171f36', towerFar: '#26304c',
    slab: '#3c4a6b', window: '#ffe2a3', windowLit: 0.58,
    ground: '#060911', green: '#0d1420',
  },
];

/**
 * A residential facade: vertical mullions, horizontal balcony slabs, and
 * glazing between them. The slab banding is what separates a flat window grid
 * from something that reads as an apartment building.
 */
function facade(rng, x, top, w, h, fill, palette, density, floorH = 34) {
  const floors = Math.max(2, Math.floor(h / floorH));
  const bays = Math.max(2, Math.round(w / 46));
  const bayW = w / bays;

  let out = `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;

  for (let f = 0; f < floors; f += 1) {
    const fy = top + f * floorH;
    // Glazing band.
    for (let b = 0; b < bays; b += 1) {
      const gx = x + b * bayW + bayW * 0.14;
      const gw = bayW * 0.72;
      const lit = rng() < density;
      const opacity = lit ? 0.5 + rng() * 0.45 : 0.07 + rng() * 0.07;
      out += `<rect x="${gx.toFixed(1)}" y="${(fy + 5).toFixed(1)}" width="${gw.toFixed(1)}" height="${(floorH * 0.56).toFixed(1)}" rx="1" fill="${palette.window}" opacity="${opacity.toFixed(2)}"/>`;
    }
    // Balcony slab — a thin lighter line catching the sky.
    out += `<rect x="${(x - 3).toFixed(1)}" y="${(fy + floorH * 0.72).toFixed(1)}" width="${(w + 6).toFixed(1)}" height="4" fill="${palette.slab}" opacity="0.5"/>`;
  }

  return out;
}

/** Distant block, simplified — detail at this scale is wasted bytes. */
function block(rng, x, baseY, w, h, fill, palette, density) {
  const top = baseY - h;
  return facade(rng, x, top, w, h, fill, palette, density, 26);
}

function skyDefs(palette, index) {
  const [c0, c1, c2] = palette.sky;
  return `
    <linearGradient id="sky${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c0}"/>
      <stop offset="58%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="sun${index}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${palette.sun}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${palette.sun}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="haze${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.haze}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${palette.haze}" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="vig${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.3"/>
      <stop offset="42%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.38"/>
    </linearGradient>`;
}

/**
 * Archetype A — hero facade.
 *
 * The tower fills most of the frame and is cropped by the top edge, viewed
 * slightly from below. This is the shot that actually sells a tower; the
 * distant-skyline view reads as stock scenery.
 */
function heroFacade(rng, palette, index) {
  const horizon = HEIGHT * 0.92;
  const sunX = WIDTH * (0.12 + rng() * 0.2);
  const sunY = HEIGHT * (0.12 + rng() * 0.18);

  // Neighbours, well behind and hazed back.
  let back = '';
  for (let i = 0; i < 7; i += 1) {
    const w = 110 + rng() * 150;
    const x = -70 + (i * WIDTH) / 6 + (rng() - 0.5) * 80;
    back += block(rng, x, horizon, w, HEIGHT * (0.2 + rng() * 0.3), palette.towerFar, palette, palette.windowLit * 0.45);
  }

  // Hero: tall, off-centre, cropped at the top of the frame.
  const w = WIDTH * (0.3 + rng() * 0.1);
  const x = rng() < 0.5 ? WIDTH * 0.1 : WIDTH * 0.54;
  const top = -HEIGHT * (0.1 + rng() * 0.12);
  const heroHeight = horizon - top - 10;

  // A second, shorter wing gives the massing some articulation.
  const wingW = w * 0.46;
  const wingX = x + w + 8;
  const wing = facade(rng, wingX, top + HEIGHT * 0.22, wingW, horizon - (top + HEIGHT * 0.22) - 10, palette.towerMid, palette, palette.windowLit * 0.8);

  const hero = facade(rng, x, top, w, heroHeight, palette.towerNear, palette, palette.windowLit);

  return `
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky${index})"/>
  <circle cx="${sunX.toFixed(0)}" cy="${sunY.toFixed(0)}" r="${(HEIGHT * 0.42).toFixed(0)}" fill="url(#sun${index})"/>
  <g opacity="0.75">${back}</g>
  <rect x="0" y="${(horizon - HEIGHT * 0.42).toFixed(1)}" width="${WIDTH}" height="${(HEIGHT * 0.42).toFixed(1)}" fill="url(#haze${index})"/>
  <g>${wing}</g>
  <g>${hero}</g>
  <rect x="0" y="${horizon.toFixed(1)}" width="${WIDTH}" height="${(HEIGHT - horizon).toFixed(1)}" fill="${palette.ground}"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vig${index})"/>`;
}

/**
 * Archetype B — the approach view: tower in its surroundings, with the
 * landscaped podium in the foreground.
 */
function approach(rng, palette, index) {
  const horizon = HEIGHT * (0.78 + rng() * 0.04);
  const sunX = WIDTH * (0.6 + rng() * 0.3);
  const sunY = HEIGHT * (0.16 + rng() * 0.14);

  let back = '';
  for (let i = 0; i < 10; i += 1) {
    const w = 80 + rng() * 130;
    const x = -60 + (i * WIDTH) / 9 + (rng() - 0.5) * 70;
    back += block(rng, x, horizon, w, HEIGHT * (0.12 + rng() * 0.2), palette.towerFar, palette, palette.windowLit * 0.4);
  }

  let mid = '';
  for (let i = 0; i < 5; i += 1) {
    const w = 130 + rng() * 150;
    const x = -90 + (i * WIDTH) / 4 + (rng() - 0.5) * 90;
    mid += block(rng, x, horizon + 12, w, HEIGHT * (0.26 + rng() * 0.22), palette.towerMid, palette, palette.windowLit * 0.75);
  }

  const heroW = 230 + rng() * 90;
  const heroX = WIDTH * (rng() < 0.5 ? 0.16 : 0.6);
  const heroH = HEIGHT * (0.62 + rng() * 0.12);
  const hero = block(rng, heroX, horizon + 26, heroW, heroH, palette.towerNear, palette, palette.windowLit);

  // Podium: a soft landscaped band rather than a flat bar, so the base of the
  // frame reads as ground and not as a border.
  const podium = `
    <rect x="0" y="${horizon.toFixed(1)}" width="${WIDTH}" height="${(HEIGHT - horizon).toFixed(1)}" fill="${palette.ground}"/>
    <ellipse cx="${(WIDTH * 0.3).toFixed(0)}" cy="${(horizon + 46).toFixed(0)}" rx="${(WIDTH * 0.34).toFixed(0)}" ry="34" fill="${palette.green}" opacity="0.55"/>
    <ellipse cx="${(WIDTH * 0.78).toFixed(0)}" cy="${(horizon + 70).toFixed(0)}" rx="${(WIDTH * 0.3).toFixed(0)}" ry="40" fill="${palette.green}" opacity="0.4"/>`;

  return `
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky${index})"/>
  <circle cx="${sunX.toFixed(0)}" cy="${sunY.toFixed(0)}" r="${(HEIGHT * 0.36).toFixed(0)}" fill="url(#sun${index})"/>
  <g opacity="0.7">${back}</g>
  <rect x="0" y="${(horizon - HEIGHT * 0.34).toFixed(1)}" width="${WIDTH}" height="${(HEIGHT * 0.34).toFixed(1)}" fill="url(#haze${index})"/>
  <g opacity="0.92">${mid}</g>
  <g>${hero}</g>
  ${podium}
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vig${index})"/>`;
}

function compose(index) {
  const rng = makeRng(0x51f17e + index * 7919);
  const palette = PALETTES[index % PALETTES.length];
  // Alternate archetypes so adjacent cards in a grid never look the same.
  const body =
    Math.floor(index / PALETTES.length) % 2 === 0
      ? heroFacade(rng, palette, index)
      : approach(rng, palette, index);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>${skyDefs(palette, index)}</defs>
  ${body}
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(join(process.cwd(), 'reports'), { recursive: true });

  const buffers = [];
  for (let i = 0; i < COUNT; i += 1) {
    const svg = compose(i);
    const jpeg = await sharp(Buffer.from(svg))
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    const name = `home-${String(i + 1).padStart(2, '0')}.jpg`;
    await writeFile(join(OUT_DIR, name), jpeg);
    buffers.push(jpeg);
    console.log(`${name}  ${(jpeg.length / 1024).toFixed(0)} KB  (${PALETTES[i % PALETTES.length].name})`);
  }

  const COLS = 4;
  const THUMB_W = 320;
  const THUMB_H = Math.round((THUMB_W * HEIGHT) / WIDTH);
  const composites = await Promise.all(
    buffers.map(async (buffer, index) => ({
      input: await sharp(buffer).resize(THUMB_W, THUMB_H).toBuffer(),
      left: (index % COLS) * THUMB_W,
      top: Math.floor(index / COLS) * THUMB_H,
    })),
  );

  await sharp({
    create: {
      width: COLS * THUMB_W,
      height: Math.ceil(buffers.length / COLS) * THUMB_H,
      channels: 3,
      background: { r: 10, g: 10, b: 10 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 72 })
    .toFile(SHEET);

  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  console.log(`\nTotal ${(total / 1024).toFixed(0)} KB across ${buffers.length} masters`);
  console.log(`Contact sheet -> ${SHEET}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
