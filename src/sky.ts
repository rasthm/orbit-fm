/**
 * Where things are in the sky, as unit vectors in the Earth-fixed frame
 * (x → lon 0°/lat 0°, y → lon 90°E, z → north pole), so they line up with the globe.
 *
 * Low-precision formulas: the Sun to ~0.01°, the Moon to ~1°, planets (circular,
 * coplanar orbits) to a few degrees. Plenty for a backdrop that is "really there".
 */

const RAD = Math.PI / 180;

export type Vec3 = [number, number, number];

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Unit vector for a lon/lat in degrees. */
export function lonLatToVec(lon: number, lat: number): Vec3 {
  const φ = lat * RAD;
  const λ = lon * RAD;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

const daysSinceJ2000 = (date: Date) => date.getTime() / 86_400_000 + 2440587.5 - 2451545.0;

/** Greenwich sidereal angle in degrees: how far Earth has turned under the stars. */
export const gmstDeg = (date: Date) => ((18.697374558 + 24.06570982441908 * daysSinceJ2000(date)) % 24) * 15;

const obliquity = (n: number) => (23.439 - 0.0000004 * n) * RAD;

/** Ecliptic longitude/latitude (deg) → Earth-fixed unit vector at `date`. */
function eclipticToEarth(lonDeg: number, latDeg: number, date: Date): Vec3 {
  const n = daysSinceJ2000(date);
  const ε = obliquity(n);
  const λ = lonDeg * RAD;
  const β = latDeg * RAD;
  // ecliptic → equatorial (celestial) frame
  const x = Math.cos(β) * Math.cos(λ);
  const y = Math.cos(β) * Math.sin(λ) * Math.cos(ε) - Math.sin(β) * Math.sin(ε);
  const z = Math.cos(β) * Math.sin(λ) * Math.sin(ε) + Math.sin(β) * Math.cos(ε);
  return celestialToEarth([x, y, z], date);
}

/** Celestial (RA/Dec) frame → Earth-fixed frame: rotate by −GMST about the pole. */
export function celestialToEarth(v: Vec3, date: Date): Vec3 {
  const θ = -gmstDeg(date) * RAD;
  const c = Math.cos(θ);
  const s = Math.sin(θ);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

export function sunVec(date = new Date()): Vec3 {
  const n = daysSinceJ2000(date);
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  return eclipticToEarth(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g), 0, date);
}

export function moonVec(date = new Date()): Vec3 {
  const n = daysSinceJ2000(date);
  const L = 218.316 + 13.176396 * n;
  const M = (134.963 + 13.064993 * n) * RAD;
  const F = (93.272 + 13.22935 * n) * RAD;
  return eclipticToEarth(L + 6.289 * Math.sin(M), 5.128 * Math.sin(F), date);
}

type Planet = { name: string; a: number; L0: number; rate: number; color: string; size: number; ring?: boolean };

/** Semi-major axis (AU), mean longitude at J2000 (deg), daily motion (deg/day). */
export const PLANETS: Planet[] = [
  { name: 'Mercury', a: 0.387, L0: 252.25, rate: 4.09233, color: '#b9b1a8', size: 3 },
  { name: 'Venus', a: 0.723, L0: 181.98, rate: 1.60213, color: '#ffe9b8', size: 6 },
  { name: 'Mars', a: 1.524, L0: 355.43, rate: 0.524033, color: '#ff6b3d', size: 5 },
  { name: 'Jupiter', a: 5.203, L0: 34.35, rate: 0.083091, color: '#e8c9a0', size: 11 },
  { name: 'Saturn', a: 9.537, L0: 50.08, rate: 0.033494, color: '#f2dc9b', size: 9, ring: true },
];

const EARTH = { a: 1.0, L0: 100.46, rate: 0.985609 };

export function planetVecs(date = new Date()): { planet: Planet; v: Vec3 }[] {
  const n = daysSinceJ2000(date);
  const ex = EARTH.a * Math.cos((EARTH.L0 + EARTH.rate * n) * RAD);
  const ey = EARTH.a * Math.sin((EARTH.L0 + EARTH.rate * n) * RAD);
  return PLANETS.map((p) => {
    const L = (p.L0 + p.rate * n) * RAD;
    const gx = p.a * Math.cos(L) - ex;
    const gy = p.a * Math.sin(L) - ey;
    return { planet: p, v: eclipticToEarth(Math.atan2(gy, gx) / RAD, 0, date) };
  });
}

/** Moon phase: 0 = new, 0.5 = full. Also the illuminated fraction. */
export function moonPhase(date = new Date()) {
  const s = sunVec(date);
  const m = moonVec(date);
  const elongation = Math.acos(Math.max(-1, Math.min(1, dot(s, m))));
  return { illuminated: (1 - Math.cos(elongation)) / 2 };
}

/** Deterministic pseudo-random starfield in the celestial frame (so it turns with the sky). */
export function makeStars(count: number, seed = 7): { v: Vec3; mag: number; tint: number; tw: number }[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const stars = [];
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    stars.push({
      v: [r * Math.cos(t), r * Math.sin(t), z] as Vec3,
      mag: Math.pow(rand(), 3), // mostly faint, a few bright
      tint: rand(),
      tw: rand() * Math.PI * 2,
    });
  }
  return stars;
}
