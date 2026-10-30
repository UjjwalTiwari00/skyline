/**
 * The single source of truth for what a Property is.
 *
 * Shape derived from the production Mongoose model at
 * backend/models/projectDetail/project.js (projectName, projectAddress, city,
 * builderName, BhK_Details[], Amenities[], minPrice/maxPrice, project_Status,
 * possessionDate, project_url) and flattened into one unit-level record, which
 * is what the listing and detail routes actually need.
 *
 * Imported by both the Route Handlers and the React components, so there is
 * exactly one definition of Property in the codebase.
 */
import * as v from 'valibot';

export const PROPERTY_TYPES = [
  'apartment',
  'villa',
  'independent-floor',
  'plot',
  'studio',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_STATUSES = [
  'ready-to-move',
  'under-construction',
  'new-launch',
] as const;

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const BHK_OPTIONS = [1, 2, 3, 4] as const;

export const ImageSchema = v.object({
  url: v.string(),
  /** Intrinsic dimensions are stored so every <Image> can reserve space and keep CLS at 0. */
  width: v.number(),
  height: v.number(),
  alt: v.string(),
});

export const PropertySchema = v.object({
  id: v.string(),
  /** URL segment for /properties/[slug]. Unique. */
  slug: v.string(),
  title: v.string(),
  description: v.string(),

  locality: v.string(),
  city: v.string(),
  state: v.string(),
  /** Used by the location block on the detail page. */
  lat: v.number(),
  lng: v.number(),

  /** Always stored in whole rupees. Formatting to lakh/crore is a view concern. */
  priceInr: v.number(),
  areaSqft: v.number(),
  /**
   * null for plots, which have no bedroom count. Nullable rather than 0 so
   * the BHK filter can exclude them instead of matching them against a
   * sentinel value.
   */
  bhk: v.nullable(v.picklist(BHK_OPTIONS)),
  bathrooms: v.number(),
  balconies: v.number(),
  type: v.picklist(PROPERTY_TYPES),
  furnished: v.boolean(),

  builder: v.string(),
  status: v.picklist(PROPERTY_STATUSES),
  /** ISO date string; null for ready-to-move stock. */
  possessionDate: v.nullable(v.string()),
  reraNo: v.string(),

  amenities: v.array(v.string()),
  images: v.array(ImageSchema),

  /** ISO timestamp, drives sort=newest. */
  createdAt: v.string(),
});

export type Property = v.InferOutput<typeof PropertySchema>;
export type PropertyImage = v.InferOutput<typeof ImageSchema>;

/** The envelope every listing response uses, per the brief. */
export interface PropertyListResponse {
  items: Property[];
  total: number;
  page: number;
  hasMore: boolean;
}
