import type { Map as MapLibre } from 'maplibre-gl';
import { lonLatToVec, type Vec3 } from './sky';

/** The live globe, shared so the space backdrop can follow the camera. */
export const camera: { map: MapLibre | null } = { map: null };

export type View = {
  /** globe centre on screen (CSS px) */
  cx: number;
  cy: number;
  /** globe radius on screen (CSS px) */
  R: number;
  /** unit vectors: towards the viewer (C), screen-right (E), screen-up (N) */
  C: Vec3;
  E: Vec3;
  N: Vec3;
};

const RAD = Math.PI / 180;

/** Camera basis for an unrotated, unpitched globe view (rotation and pitch are disabled). */
export function currentView(): View | null {
  const map = camera.map;
  if (!map) return null;
  const c = map.getCenter();
  const λ = c.lng * RAD;
  const φ = c.lat * RAD;
  const canvas = map.getCanvas();
  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight / 2;

  // Radius: project a point 89° away from the centre (just inside the limb).
  const rim = map.project([c.lng, c.lat > 0 ? c.lat - 89 : c.lat + 89]);
  const R = Math.hypot(rim.x - cx, rim.y - cy) / Math.sin(89 * RAD);

  return {
    cx,
    cy,
    R: Number.isFinite(R) && R > 0 ? R : Math.min(cx, cy) * 0.6,
    C: lonLatToVec(c.lng, c.lat),
    E: [-Math.sin(λ), Math.cos(λ), 0],
    N: [-Math.sin(φ) * Math.cos(λ), -Math.sin(φ) * Math.sin(λ), Math.cos(φ)],
  };
}
