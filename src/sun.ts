/**
 * Solar position + day/night geometry for the globe.
 * Low-precision almanac formulas (≈0.01° accuracy), plenty for a terminator line.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export type LngLat = { lon: number; lat: number };

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** The point on Earth where the sun is directly overhead. */
export function subsolarPoint(date = new Date()): LngLat {
  const n = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;

  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmstHours = 18.697374558 + 24.06570982441908 * n;

  return { lat: decl * DEG, lon: wrapLon(ra * DEG - (gmstHours % 24) * 15) };
}

/** Sun altitude in degrees as seen from a point (negative = below the horizon). */
export function sunAltitude(p: LngLat, sun = subsolarPoint()): number {
  const cosZ =
    Math.sin(p.lat * RAD) * Math.sin(sun.lat * RAD) +
    Math.cos(p.lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((p.lon - sun.lon) * RAD);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) * DEG;
}

/** Destination point given a start, bearing (deg) and angular distance (deg) on a sphere. */
function destination(from: LngLat, bearing: number, dist: number): LngLat {
  const φ1 = from.lat * RAD;
  const λ1 = from.lon * RAD;
  const θ = bearing * RAD;
  const δ = dist * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 * DEG, lon: λ2 * DEG };
}

/**
 * Polygon for the region where the sun is below `altitude` degrees: a spherical cap around
 * the antisolar point.
 *
 * Coordinates must stay within about one world-width of [-180, 180]: the tiler can't wrap
 * anything further, and a stalled source stalls the whole map style. So:
 *  - caps containing a pole are traced meridian by meridian (always exactly -180..180), and
 *  - other caps are traced as a circle with unwrapped longitudes, then shifted into range.
 */
function nightCap(sun: LngLat, altitude: number, steps = 180): GeoJSON.Position[] {
  const anti = { lat: -sun.lat, lon: wrapLon(sun.lon + 180) };
  const radius = 90 + altitude; // e.g. altitude -6 → cap of 84°
  const ring: GeoJSON.Position[] = [];

  const containsPole = radius > 90 - Math.abs(anti.lat);
  if (containsPole) {
    const pole = anti.lat >= 0 ? 90 : -90;
    const away = -pole;
    // Along each meridian the cap is one segment touching the pole: bisect for its edge.
    for (let i = 0; i <= steps; i++) {
      const lon = -180 + (i / steps) * 360;
      let inside = pole;
      let outside = away;
      for (let k = 0; k < 30; k++) {
        const mid = (inside + outside) / 2;
        if (angularDistance({ lon, lat: mid }, anti) < radius) inside = mid;
        else outside = mid;
      }
      ring.push([lon, (inside + outside) / 2]);
    }
    ring.push([180, pole], [-180, pole]);
  } else {
    let prevLon: number | null = null;
    for (let i = 0; i <= steps; i++) {
      const p = destination(anti, (i / steps) * 360, radius);
      let lon = wrapLon(p.lon);
      if (prevLon !== null) {
        while (lon - prevLon > 180) lon -= 360;
        while (lon - prevLon < -180) lon += 360;
      }
      prevLon = lon;
      ring.push([lon, p.lat]);
    }
    const minLon = Math.min(...ring.map((p) => p[0]));
    const shift = -360 * Math.floor((minLon + 180) / 360);
    if (shift) for (const p of ring) p[0] += shift;
  }

  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

function angularDistance(a: LngLat, b: LngLat): number {
  const cos =
    Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lon - b.lon) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
}

/** Sun-altitude steps from sunset (0°) to astronomical night (-18°); stacked they form a soft gradient. */
export const NIGHT_BANDS = [0, -2, -4, -6, -8, -10, -12, -14, -16, -18] as const;

export function nightGeoJSON(date = new Date()): GeoJSON.FeatureCollection {
  const sun = subsolarPoint(date);
  return {
    type: 'FeatureCollection',
    features: NIGHT_BANDS.map((alt) => ({
      type: 'Feature',
      properties: { alt },
      geometry: { type: 'Polygon', coordinates: [nightCap(sun, alt)] },
    })),
  };
}

/** "day" | "twilight" | "night" for a city, with the local sun altitude. */
export function dayPhase(p: LngLat, date = new Date()) {
  const alt = sunAltitude(p, subsolarPoint(date));
  return { alt, phase: alt > 0 ? 'day' : alt > -12 ? 'twilight' : 'night' } as const;
}
