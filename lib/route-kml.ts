export type LatLng = {
  lat: number;
  lng: number;
};

type ParsedPoint = LatLng & {
  order: number;
  stageNo: number | null;
};

type ParsedRoute = {
  points: ParsedPoint[];
  lines: LatLng[][];
};

function parseCoordToken(token: string): LatLng | null {
  const raw = token.trim();
  if (!raw) return null;
  const [lngRaw, latRaw] = raw.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function parseCoordinatesText(text: string): LatLng[] {
  return text
    .split(/\s+/)
    .map(parseCoordToken)
    .filter((v): v is LatLng => v !== null);
}

function extractStageNo(name: string | null) {
  if (!name) return null;
  const match = name.match(/(\d{1,3})/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function parsePlacemarkPoints(kmlText: string): ParsedPoint[] {
  const placemarkRe = /<Placemark[\s\S]*?<\/Placemark>/gi;
  const points: ParsedPoint[] = [];
  let order = 0;
  let match = placemarkRe.exec(kmlText);
  while (match) {
    const block = match[0] ?? "";
    const pointMatch = /<Point[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i.exec(block);
    if (pointMatch) {
      const coords = parseCoordinatesText(pointMatch[1] ?? "");
      if (coords[0]) {
        const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(block);
        const stageNo = extractStageNo(nameMatch?.[1] ?? null);
        points.push({
          ...coords[0],
          order,
          stageNo,
        });
      }
    }
    order += 1;
    match = placemarkRe.exec(kmlText);
  }

  const withStage = points.filter((p) => p.stageNo !== null);
  if (withStage.length >= 2) {
    return [...points].sort((a, b) => {
      if (a.stageNo !== null && b.stageNo !== null) return a.stageNo - b.stageNo;
      if (a.stageNo !== null) return -1;
      if (b.stageNo !== null) return 1;
      return a.order - b.order;
    });
  }
  return points.sort((a, b) => a.order - b.order);
}

function parseLineStrings(kmlText: string): LatLng[][] {
  const lines: LatLng[][] = [];
  const lineRe = /<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi;
  let match = lineRe.exec(kmlText);
  while (match) {
    const coords = parseCoordinatesText(match[1] ?? "");
    if (coords.length) lines.push(coords);
    match = lineRe.exec(kmlText);
  }
  return lines;
}

export function parseKmlRoute(kmlText: string): ParsedRoute {
  return {
    points: parsePlacemarkPoints(kmlText),
    lines: parseLineStrings(kmlText),
  };
}

export function pickRouteLine(lines: LatLng[][]): LatLng[] {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  const longest = [...lines].sort((a, b) => b.length - a.length)[0];
  return Array.isArray(longest) ? longest : [];
}

export function orderedDestinationPoints(kmlText: string): LatLng[] {
  const parsed = parseKmlRoute(kmlText);
  const parsedPoints = Array.isArray(parsed.points) ? parsed.points : [];
  const numberedPoints = parsedPoints.filter((p) => p.stageNo !== null);
  if (numberedPoints.length > 0) {
    return numberedPoints.map((p) => ({ lat: p.lat, lng: p.lng }));
  }
  if (parsedPoints.length > 0) {
    return parsedPoints.map((p) => ({ lat: p.lat, lng: p.lng }));
  }
  return pickRouteLine(parsed.lines);
}
