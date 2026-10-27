import { z } from "zod";

/** A deliberate public area-centre query; never a request for precise property coordinates. */
export const mapBoundsSchema = z
  .object({
    west: z.number().finite().min(-180).max(180),
    south: z.number().finite().min(-85.05112878).max(85.05112878),
    east: z.number().finite().min(-180).max(180),
    north: z.number().finite().min(-85.05112878).max(85.05112878),
  })
  .strict()
  .refine((value) => value.west < value.east && value.south < value.north, "invalid_bounds");
export type MapBounds = z.infer<typeof mapBoundsSchema>;
export function parseMapBounds(value: string): MapBounds | null {
  const number = "-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d{1,3})?";
  if (value.length > 150 || !new RegExp(`^${number}(?:,${number}){3}$`, "i").test(value))
    return null;
  const [west, south, east, north] = value.split(",").map(Number);
  const parsed = mapBoundsSchema.safeParse({ west, south, east, north });
  return parsed.success ? parsed.data : null;
}
export const serializeMapBounds = (value: MapBounds) =>
  [value.west, value.south, value.east, value.north].map(String).join(",");
export function pointWithinMapBounds(
  point: { longitude: number; latitude: number } | null | undefined,
  bounds: MapBounds,
) {
  return Boolean(
    point &&
      point.longitude >= bounds.west &&
      point.longitude <= bounds.east &&
      point.latitude >= bounds.south &&
      point.latitude <= bounds.north,
  );
}
