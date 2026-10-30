/**
 * Generates the property dataset.
 *
 * Deterministic on purpose: a fixed PRNG seed means `npm run seed` produces
 * byte-identical output every time, so builds, Open Graph tags and the
 * filter tests stay stable instead of shifting under us.
 *
 * Localities and price-per-sqft bands are real Delhi-NCR micro-markets (the
 * markets the 100acress project covers). Builder and project names are
 * fictional, so no real developer appears attached to invented listings.
 *
 * Run: npm run seed
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Property, PropertyStatus, PropertyType } from '../src/lib/property.ts';

const TARGET_COUNT = 54;
const SEED = 0x5ca1ab1e;

/** mulberry32 — small, fast, good enough for fixture data. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(SEED);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const intBetween = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

interface Locality {
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  /** Rupees per sq ft — the band that actually separates these markets. */
  pricePerSqft: [number, number];
}

const LOCALITIES: readonly Locality[] = [
  { name: 'Golf Course Road', city: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0726, pricePerSqft: [18000, 26000] },
  { name: 'Golf Course Extension Road', city: 'Gurugram', state: 'Haryana', lat: 28.4211, lng: 77.0589, pricePerSqft: [12000, 18000] },
  { name: 'Dwarka Expressway', city: 'Gurugram', state: 'Haryana', lat: 28.5021, lng: 77.0263, pricePerSqft: [9500, 14500] },
  { name: 'Sohna Road', city: 'Gurugram', state: 'Haryana', lat: 28.4089, lng: 77.0378, pricePerSqft: [8500, 12500] },
  { name: 'MG Road', city: 'Gurugram', state: 'Haryana', lat: 28.4796, lng: 77.0802, pricePerSqft: [14000, 20000] },
  { name: 'Sushant Lok Phase 1', city: 'Gurugram', state: 'Haryana', lat: 28.4663, lng: 77.0729, pricePerSqft: [13000, 17500] },
  { name: 'New Gurugram, Sector 84', city: 'Gurugram', state: 'Haryana', lat: 28.4089, lng: 76.9532, pricePerSqft: [7200, 10500] },
  { name: 'Southern Peripheral Road', city: 'Gurugram', state: 'Haryana', lat: 28.4215, lng: 77.0411, pricePerSqft: [9000, 13500] },
  { name: 'Sector 150', city: 'Noida', state: 'Uttar Pradesh', lat: 28.4254, lng: 77.5305, pricePerSqft: [8000, 12000] },
  { name: 'Sector 128, Noida Expressway', city: 'Noida', state: 'Uttar Pradesh', lat: 28.5168, lng: 77.3607, pricePerSqft: [11000, 16000] },
  { name: 'Raj Nagar Extension', city: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.7041, lng: 77.4381, pricePerSqft: [5200, 7800] },
  { name: 'Vasant Kunj', city: 'New Delhi', state: 'Delhi', lat: 28.5200, lng: 77.1591, pricePerSqft: [22000, 32000] },
];

/** Fictional names, deliberately — see file header. */
const BUILDERS = [
  'Aurelia Estates', 'Trevon Group', 'Meridian Realty', 'Kalpavriksh Developers',
  'Stonecrest Infra', 'Vaayu Habitats', 'Norhaven Projects', 'Suryam Build',
  'Anvaya Realty', 'Thirdwave Developers',
] as const;

const PROJECT_WORDS = [
  'Skyline', 'Aurum', 'Verdant', 'Celeste', 'Meadowbrook', 'Solaris', 'Rivendell',
  'Highgrove', 'Astoria', 'Lumen', 'Tessera', 'Northbank', 'Quayside', 'Emberly',
  'Marigold', 'Westwind', 'Oakhaven', 'Zenith',
] as const;

const PROJECT_SUFFIX = ['Residences', 'Heights', 'Greens', 'Towers', 'Enclave', 'Park', 'Manor'] as const;

/**
 * Weighted, not uniform. Picking evenly across five types made plots and
 * studios 40% of the catalogue — neither has a meaningful BHK, so the 1-4 BHK
 * filters were left with a handful of records each. These weights match the
 * mix an actual NCR portal carries.
 */
const TYPE_POOL: readonly PropertyType[] = [
  ...(Array<PropertyType>(8).fill('apartment')),
  ...(Array<PropertyType>(3).fill('independent-floor')),
  ...(Array<PropertyType>(2).fill('villa')),
  ...(Array<PropertyType>(2).fill('plot')),
  ...(Array<PropertyType>(1).fill('studio')),
];

const STATUSES: readonly PropertyStatus[] = ['ready-to-move', 'under-construction', 'new-launch'];

/** Vocabulary taken from the amenity lists in the existing 100acress admin forms. */
const AMENITIES = [
  'Swimming Pool', 'Clubhouse', 'Gymnasium', 'Kids Play Area', 'Landscaped Garden',
  'Power Backup', '24x7 Security', 'CCTV Surveillance', 'Covered Parking',
  'Jogging Track', 'Yoga Deck', 'Indoor Games Room', 'Banquet Hall', 'Spa & Sauna',
  'Amphitheatre', 'Tennis Court', 'Basketball Court', 'Senior Citizen Corner',
  'Rainwater Harvesting', 'Sewage Treatment Plant', 'Intercom Facility',
  'Multipurpose Hall', 'Cafeteria', 'Library',
] as const;

/**
 * Sixteen photo sets shared across the catalogue — normal for fixture data.
 * One high-quality source each; next/image derives AVIF/WebP at device widths,
 * so only the bytes a given viewport needs go over the wire.
 */
const PHOTO_COUNT = 16;
const PHOTO_W = 1600;
const PHOTO_H = 1067;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Area bands that correspond to each configuration in NCR. */
function areaFor(bhk: number, type: PropertyType): number {
  if (type === 'plot') return intBetween(1800, 4500);
  if (type === 'studio') return intBetween(420, 650);
  if (type === 'villa') return intBetween(2600, 5200);
  const base: Record<number, [number, number]> = {
    1: [520, 780],
    2: [980, 1450],
    3: [1480, 2250],
    4: [2300, 3400],
  };
  const [min, max] = base[bhk] ?? [1000, 1500];
  return intBetween(min, max);
}

function configLabelFor(bhk: number | null, type: PropertyType): string {
  if (type === 'plot') return 'Residential Plot';
  if (type === 'studio') return 'Studio Apartment';
  if (type === 'villa') return `${bhk} BHK Villa`;
  if (type === 'independent-floor') return `${bhk} BHK Independent Floor`;
  return `${bhk} BHK Apartment`;
}

function buildProperty(index: number, createdAt: Date): Property {
  const locality = pick(LOCALITIES);
  const type = pick(TYPE_POOL);

  /**
   * Plots have no bedroom count at all. Studios are always 1 BHK. Everything
   * else is weighted so each of 1-4 ends up with enough stock that filtering
   * any single configuration returns a usable page rather than two cards.
   */
  const bhk: 1 | 2 | 3 | 4 | null =
    type === 'plot'
      ? null
      : type === 'studio'
        ? 1
        : pick([1, 2, 2, 2, 3, 3, 3, 4, 4] as const);

  const areaSqft = areaFor(bhk ?? 2, type);

  const [psfMin, psfMax] = locality.pricePerSqft;
  const psf = intBetween(psfMin, psfMax);
  // Plots trade below built-up rates; studios carry a per-sqft premium.
  const typeFactor = type === 'plot' ? 0.55 : type === 'studio' ? 1.15 : 1;
  // Round to the nearest 50,000 — real listings are never priced to the rupee.
  const priceInr = Math.round((areaSqft * psf * typeFactor) / 50000) * 50000;

  const projectName = `${pick(PROJECT_WORDS)} ${pick(PROJECT_SUFFIX)}`;
  const configLabel = configLabelFor(bhk, type);
  const title = `${configLabel} in ${projectName}, ${locality.name}`;
  const builder = pick(BUILDERS);

  const status = pick(STATUSES);
  const possessionDate =
    status === 'ready-to-move'
      ? null
      : new Date(Date.UTC(2027 + intBetween(0, 2), intBetween(0, 11), 1))
          .toISOString()
          .slice(0, 10);

  const amenityCount = intBetween(6, 12);
  const amenities: string[] = [];
  while (amenities.length < amenityCount) {
    const amenity = pick(AMENITIES);
    if (!amenities.includes(amenity)) amenities.push(amenity);
  }

  const photoStart = intBetween(0, PHOTO_COUNT - 1);
  const imageCount = intBetween(4, 6);
  const images = Array.from({ length: imageCount }, (_, i) => {
    const photo = ((photoStart + i) % PHOTO_COUNT) + 1;
    return {
      url: `/properties/home-${String(photo).padStart(2, '0')}.jpg`,
      width: PHOTO_W,
      height: PHOTO_H,
      alt: `${configLabel} at ${projectName} — view ${i + 1}`,
    };
  });

  const statusPhrase =
    status === 'ready-to-move'
      ? 'Ready to move in'
      : status === 'new-launch'
        ? 'Newly launched'
        : 'Under construction';

  return {
    id: `p-${String(index + 1).padStart(3, '0')}`,
    slug: `${slugify(configLabel)}-${slugify(projectName)}-${slugify(locality.name)}-${index + 1}`,
    title,
    description:
      `${configLabel} of ${areaSqft.toLocaleString('en-IN')} sq ft at ${projectName}, ` +
      `${locality.name}, ${locality.city}. ${statusPhrase}, developed by ${builder}. ` +
      (type === 'plot'
        ? `A ${areaSqft.toLocaleString('en-IN')} sq ft freehold plot on a ${intBetween(9, 18)} m sector road.`
        : `The home opens onto ${(bhk ?? 0) > 2 ? 'a double-height living room' : 'a bright living room'} ` +
          `with ${intBetween(1, 3)} balconies overlooking the central green.`),
    locality: locality.name,
    city: locality.city,
    state: locality.state,
    lat: Number((locality.lat + (rng() - 0.5) * 0.02).toFixed(5)),
    lng: Number((locality.lng + (rng() - 0.5) * 0.02).toFixed(5)),
    priceInr,
    areaSqft,
    bhk,
    bathrooms: bhk === null ? 0 : Math.max(1, bhk - (rng() > 0.6 ? 0 : 1)),
    balconies: type === 'plot' ? 0 : intBetween(1, 3),
    type,
    furnished: rng() > 0.55,
    builder,
    status,
    possessionDate,
    reraNo: `RC/REP/HARERA/GGM/${intBetween(500, 900)}/${intBetween(100, 400)}/2024/${intBetween(10, 99)}`,
    amenities,
    images,
    createdAt: createdAt.toISOString(),
  };
}

function main(): void {
  const properties: Property[] = [];
  const seen = new Set<string>();
  // Spread createdAt across roughly 18 months so sort=newest is meaningful.
  const now = Date.UTC(2026, 9, 1);
  const day = 86_400_000;

  for (let i = 0; i < TARGET_COUNT; i += 1) {
    const property = buildProperty(i, new Date(now - i * intBetween(5, 14) * day));
    if (seen.has(property.slug)) continue;
    seen.add(property.slug);
    properties.push(property);
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'properties.json');
  writeFileSync(outFile, `${JSON.stringify(properties, null, 2)}\n`, 'utf8');

  console.log(`Seeded ${properties.length} properties -> ${outFile}`);
}

main();
