import { orderedDestinationPoints, parseKmlRoute, pickRouteLine } from "@/lib/route-kml";

export type RoutePoint = {
  lat: number;
  lng: number;
  label: string;
  stage_no: number;
};

export type RouteLine = {
  coords: Array<{ lat: number; lng: number }>;
};

export type KmlRenderData = {
  lines: RouteLine[];
  points: RoutePoint[];
  warning: string | null;
};

function sampleLinePoints(line: RouteLine, count: number) {
  if (line.coords.length === 0) return [] as RoutePoint[];
  if (line.coords.length === 1) {
    return [
      {
        ...line.coords[0],
        label: "Location 1",
        stage_no: 1,
      },
    ];
  }

  const out: RoutePoint[] = [];
  const n = Math.max(1, count);
  const last = line.coords.length - 1;

  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : i / (n - 1);
    const idx = t * last;
    const i0 = Math.floor(idx);
    const i1 = Math.min(last, i0 + 1);
    const frac = idx - i0;
    const a = line.coords[i0];
    const b = line.coords[i1];
    out.push({
      lat: a.lat + (b.lat - a.lat) * frac,
      lng: a.lng + (b.lng - a.lng) * frac,
      label: `Location ${i + 1}`,
      stage_no: i + 1,
    });
  }

  return out;
}

export function parseKmlToRenderData(kmlText: string, fallbackCount = 10): KmlRenderData {
  const parsed = parseKmlRoute(kmlText);
  const lines = parsed.lines.map((line) => ({ coords: line }));
  const longestLine = pickRouteLine(parsed.lines);
  const destinations = orderedDestinationPoints(kmlText);

  let warning: string | null = null;
  let points: RoutePoint[] = destinations.map((p, idx) => ({
    lat: p.lat,
    lng: p.lng,
    label: `Location ${idx + 1}`,
    stage_no: idx + 1,
  }));

  if (!points.length && longestLine.length) {
    points = sampleLinePoints({ coords: longestLine }, fallbackCount);
    warning = "KML has no point placemarks; sampled route points were generated.";
  }

  if (!lines.length && !points.length) {
    warning = "KML did not contain renderable route/points.";
  }

  return { lines, points, warning };
}
