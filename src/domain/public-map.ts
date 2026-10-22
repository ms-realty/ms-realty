import type { LocationPrecision } from "./facts";

/** An area centre, never a property's exact coordinates. Frozen in a publication manifest. */
export interface PublicMapPoint {
  readonly latitude: number;
  readonly longitude: number;
  readonly level: "district" | "settlement";
  readonly placeId: string;
}

export function parsePublicMapPoint(
  value: unknown,
  precision: LocationPrecision,
): PublicMapPoint | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<Record<keyof PublicMapPoint, unknown>>;
  if (
    (p.level !== "district" && p.level !== "settlement") ||
    (precision === "region" && p.level !== "district") ||
    typeof p.placeId !== "string" ||
    !p.placeId ||
    typeof p.latitude !== "number" ||
    !Number.isFinite(p.latitude) ||
    typeof p.longitude !== "number" ||
    !Number.isFinite(p.longitude) ||
    Math.abs(p.latitude) > 85.05112878 ||
    Math.abs(p.longitude) > 180
  )
    return null;
  return { latitude: p.latitude, longitude: p.longitude, level: p.level, placeId: p.placeId };
}
