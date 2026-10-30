/**
 * Downloads the property photography and writes a contact sheet for review.
 *
 * Photos come from Lorem Picsum, which serves Unsplash images under the
 * Unsplash licence (free to use, no attribution required — credited in the
 * README anyway). Fixed ids, so the catalogue is reproducible.
 *
 * Each photo is resized to 1600x1067 and re-encoded as JPEG at quality 82.
 * next/image derives AVIF and WebP at device widths from these sources at
 * request time, so what lands in the repo is the master, not what ships.
 *
 * Usage: node scripts/fetch-photos.mjs [--sheet-only]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Picsum serves a general-purpose photo set, so most ids are landscapes, food
 * or objects — useless on a property site. The ids below are the ones that
 * survived visual review on the contact sheet; pass `--ids a,b,c` to screen a
 * new batch before committing to it.
 */
const DEFAULT_IDS = [
  1048, 1081, 1076, 164, 455, 1061, 274, 142,
  101, 236, 357, 440, 211, 416, 319, 260,
];

function candidateIds() {
  const flag = process.argv.find((arg) => arg.startsWith('--ids='));
  if (!flag) return DEFAULT_IDS;
  return flag
    .slice('--ids='.length)
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
}

const CANDIDATES = candidateIds();

const WIDTH = 1600;
const HEIGHT = 1067;
const OUT_DIR = join(process.cwd(), 'public', 'properties');
const SHEET = join(process.cwd(), 'reports', 'photo-contact-sheet.jpg');

async function fetchPhoto(id) {
  const response = await fetch(`https://picsum.photos/id/${id}/${WIDTH}/${HEIGHT}`, {
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`id ${id}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(join(process.cwd(), 'reports'), { recursive: true });

  const results = [];
  for (const id of CANDIDATES) {
    try {
      const raw = await fetchPhoto(id);
      const jpeg = await sharp(raw)
        .resize(WIDTH, HEIGHT, { fit: 'cover' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      results.push({ id, jpeg });
      console.log(`id ${id}: ${(jpeg.length / 1024).toFixed(0)} KB`);
    } catch (error) {
      console.warn(`id ${id}: skipped — ${error.message}`);
    }
  }

  // Contact sheet: 4 columns, thumbnails labelled by index so a bad photo can
  // be identified and swapped without opening twenty files.
  const COLS = 4;
  const THUMB_W = 320;
  const THUMB_H = Math.round((THUMB_W * HEIGHT) / WIDTH);
  const rows = Math.ceil(results.length / COLS);

  const composites = await Promise.all(
    results.map(async (entry, index) => ({
      input: await sharp(entry.jpeg).resize(THUMB_W, THUMB_H).toBuffer(),
      left: (index % COLS) * THUMB_W,
      top: Math.floor(index / COLS) * THUMB_H,
    })),
  );

  await sharp({
    create: {
      width: COLS * THUMB_W,
      height: rows * THUMB_H,
      channels: 3,
      background: { r: 20, g: 20, b: 20 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 70 })
    .toFile(SHEET);

  console.log(`\nContact sheet -> ${SHEET}`);

  if (process.argv.includes('--sheet-only')) {
    console.log('Sheet only; no photos written to public/.');
    return;
  }

  // Write the first 16 that survived, numbered to match the seed script.
  const chosen = results.slice(0, 16);
  await Promise.all(
    chosen.map((entry, index) =>
      writeFile(join(OUT_DIR, `home-${String(index + 1).padStart(2, '0')}.jpg`), entry.jpeg),
    ),
  );
  console.log(`Wrote ${chosen.length} photos -> ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
