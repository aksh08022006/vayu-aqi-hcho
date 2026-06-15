// Stylized (not cartographic) India outline + helper fields for the canvas visuals.
// Coordinates are approximate lon/lat, enough to read clearly as India.

export const BBOX = { lonMin: 68, lonMax: 98, latMin: 6, latMax: 37 };

export const INDIA_POLY: [number, number][] = [
  [77.0, 35.5], [78.5, 34.5], [80.0, 32.5], [81.0, 30.3], [83.5, 29.0], [85.5, 28.2],
  [88.0, 27.2], [88.8, 26.5], [89.8, 26.0], [92.0, 27.5], [94.5, 27.8], [97.0, 28.2],
  [96.5, 27.0], [95.2, 26.6], [94.0, 24.0], [93.4, 24.0], [93.0, 22.2], [91.0, 23.0],
  [89.0, 22.0], [88.0, 21.6], [87.0, 21.3], [85.8, 20.3], [84.5, 18.5], [82.5, 17.0],
  [80.3, 15.8], [80.2, 13.5], [79.8, 11.5], [78.2, 8.5], [77.5, 8.1], [76.5, 8.9],
  [75.7, 11.5], [74.7, 14.5], [73.5, 16.0], [72.9, 18.5], [72.7, 20.5], [70.5, 20.8],
  [69.0, 22.2], [68.2, 23.7], [69.5, 24.0], [70.5, 25.5], [73.0, 27.5], [74.0, 29.0],
  [75.0, 31.5], [76.0, 33.5], [77.0, 35.5],
];

export function project(lon: number, lat: number, w: number, h: number): [number, number] {
  const x = ((lon - BBOX.lonMin) / (BBOX.lonMax - BBOX.lonMin)) * w;
  const y = (1 - (lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * h;
  return [x, y];
}

export function pointInPolygon(lon: number, lat: number, poly = INDIA_POLY): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Named places for hotspots / transport / labels (lon, lat).
export const PLACES = {
  delhi: [77.1, 28.65], mumbai: [72.88, 19.08], kolkata: [88.36, 22.57],
  chennai: [80.27, 13.08], bengaluru: [77.59, 12.97], hyderabad: [78.49, 17.39],
  lucknow: [80.95, 26.85], patna: [85.14, 25.61], ahmedabad: [72.57, 23.03],
  punjab: [75.5, 30.5], korba: [82.7, 22.36], jharia: [86.4, 23.75],
} as const;

// Synthetic "pollution intensity" 0..1 — high over the Indo-Gangetic Plain.
export function intensityAt(lon: number, lat: number): number {
  const igp = Math.exp(-(((lon - 80) ** 2) / 80 + ((lat - 27.5) ** 2) / 14));
  let urban = 0;
  for (const [clon, clat] of Object.values(PLACES)) {
    urban += 0.7 * Math.exp(-(((lon - clon) ** 2) + ((lat - clat) ** 2)) / 1.2);
  }
  return Math.min(1, 0.15 + 0.9 * igp + urban);
}

// CPCB AQI ramp (official).
export const AQI_STOPS = [
  { max: 50, color: "#009865", label: "Good" },
  { max: 100, color: "#84cf33", label: "Satisfactory" },
  { max: 200, color: "#ffd21f", label: "Moderate" },
  { max: 300, color: "#f2a93b", label: "Poor" },
  { max: 400, color: "#ea3324", label: "Very Poor" },
  { max: 500, color: "#9c2e2c", label: "Severe" },
];

export function aqiColor(aqi: number): string {
  for (const s of AQI_STOPS) if (aqi <= s.max) return s.color;
  return "#9c2e2c";
}

// map intensity 0..1 -> an AQI value 0..450 for demo coloring
export const intensityToAqi = (i: number) => Math.round(i * 430);
