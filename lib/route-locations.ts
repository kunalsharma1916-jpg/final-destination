import { readFile, stat } from "fs/promises";
import path from "path";
import { orderedDestinationPoints } from "@/lib/route-kml";

export type RouteLocation = {
  index: number;
  number: number;
  lat: number;
  lng: number;
  label: string;
};

const KML_PATH = path.join(process.cwd(), "public", "route.kml");
const GEOJSON_PATH = path.join(process.cwd(), "data", "route.geojson");

let cachePromise: Promise<RouteLocation[]> | null = null;
let cacheMtimeMs: number | null = null;

function toLocations(points: Array<{ lat: number; lng: number }>) {
  const safePoints = Array.isArray(points) ? points : [];
  return safePoints.map((point, idx) => ({
    index: idx,
    number: idx + 1,
    lat: point.lat,
    lng: point.lng,
    label: `Location ${idx + 1}`,
  }));
}

async function loadFromKml() {
  const text = await readFile(KML_PATH, "utf8");
  return toLocations(orderedDestinationPoints(text));
}

async function loadFromGeoJson() {
  const text = await readFile(GEOJSON_PATH, "utf8");
  const parsed = JSON.parse(text) as {
    features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }>;
  };

  const firstLine = parsed.features?.find((f) => f.geometry?.type === "LineString");
  const coords = Array.isArray(firstLine?.geometry?.coordinates) ? firstLine?.geometry?.coordinates : [];
  const points = coords
    .map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter((value): value is { lat: number; lng: number } => value !== null);

  return toLocations(points);
}

async function loadRouteLocationsInternal(): Promise<RouteLocation[]> {
  try {
    return await loadFromKml();
  } catch {
    try {
      return await loadFromGeoJson();
    } catch {
      return [];
    }
  }
}

export async function getRouteLocations() {
  try {
    const meta = await stat(KML_PATH);
    if (cachePromise && cacheMtimeMs === meta.mtimeMs) return cachePromise;
    cacheMtimeMs = meta.mtimeMs;
    cachePromise = loadRouteLocationsInternal();
    return cachePromise;
  } catch {
    if (!cachePromise) {
      cachePromise = loadRouteLocationsInternal();
    }
    return cachePromise;
  }
}

export function resetRouteLocationsCache() {
  cachePromise = null;
  cacheMtimeMs = null;
}
