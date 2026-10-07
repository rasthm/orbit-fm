import { useEffect, useRef } from 'preact/hooks';
import { currentView, type View } from '../camera';
import { reducedMotion, settings } from '../settings';
import { celestialToEarth, dot, makeStars, moonPhase, moonVec, planetVecs, sunVec, type Vec3 } from '../sky';

/**
 * The space around the globe, drawn on two canvases:
 *  - behind the map: stars, the Sun, the Moon, planets and shooting stars, all placed
 *    where they really are relative to the Earth and the current camera;
 *  - above the map (blended with "screen"): warm sunlight on the day side.
 */

type Pt = { x: number; y: number; behind: number };

const STARS = makeStars(520);
const SKY_REFRESH_MS = 30_000; // celestial positions barely move; recompute twice a minute

/**
 * Projects a direction in space onto the backdrop. The viewer looks at the Earth along -C;
 * directions near -C appear behind the globe, directions 90° off sit near the screen edge,
 * and directions towards the viewer run off-screen (stereographic-style).
 */
function project(v: Vec3, view: View, Rsky: number): Pt | null {
  const along = -dot(v, view.C); // 1 = straight behind the Earth, -1 = behind the camera
  const α = Math.acos(Math.max(-1, Math.min(1, along)));
  if (α > 2.6) return null;
  const px = dot(v, view.E);
  const py = dot(v, view.N);
  const len = Math.hypot(px, py) || 1;
  const r = Rsky * Math.tan(α / 2);
  return { x: view.cx + (px / len) * r, y: view.cy - (py / len) * r, behind: along };
}

type Shooting = { x: number; y: number; dx: number; dy: number; born: number; life: number; len: number };

export function Space() {
  const backRef = useRef<HTMLCanvasElement>(null);
  const lightRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const back = backRef.current!;
    const light = lightRef.current!;
    const g = back.getContext('2d')!;
    const gl = light.getContext('2d')!;
    let dpr = 1;
    let w = 0;
    let h = 0;

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = back.clientWidth;
      h = back.clientHeight;
      for (const c of [back, light]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(back);
    resize();

    let sky = computeSky();
    let skyAt = performance.now();
    let shooting: Shooting | null = null;
    let nextShot = performance.now() + 4000 + Math.random() * 8000;
    let frame = 0;
    let lastDraw = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      // 30fps is plenty for a backdrop; go full speed only while a meteor is flying.
      if (!shooting && now - lastDraw < 32) return;
      lastDraw = now;

      const view = currentView();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      gl.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      gl.clearRect(0, 0, w, h);
      if (!view) return;

      const s = settings.value;
      const motion = !reducedMotion.value;
      if (now - skyAt > SKY_REFRESH_MS) {
        sky = computeSky();
        skyAt = now;
      }
      const Rsky = Math.max(view.R * 1.6, 0.42 * Math.hypot(w, h));
      const t = now / 1000;

      drawStars(g, view, Rsky, sky.stars, motion ? t : 0);

      if (s.space) {
        for (const p of sky.planets) drawPlanet(g, project(p.v, view, Rsky), p.planet);
        // The Sun sits at its real direction in space, far beyond the Earth, like the Moon and planets.
        const sunPt = project(sky.sun, view, Rsky);
        drawMoon(g, project(sky.moon, view, Rsky), sunPt, sky.moonLit, view);
        if (sunPt) drawSun(g, sunPt, Math.min(w, h), motion ? t : 0);
      }

      if (s.shootingStars && motion) {
        if (!shooting && now > nextShot) shooting = spawnShootingStar(now, w, h);
        if (shooting) {
          if (!drawShootingStar(g, shooting, now)) {
            shooting = null;
            nextShot = now + 7000 + Math.random() * 18000;
          }
        }
      }

      if (s.dayNight === 'real') drawSunlight(gl, view, sky.sun);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  return (
    <>
      <canvas ref={backRef} class="space-back" aria-hidden="true" />
      <canvas ref={lightRef} class="space-light" aria-hidden="true" />
    </>
  );
}

function computeSky() {
  const now = new Date();
  return {
    sun: sunVec(now),
    moon: moonVec(now),
    moonLit: moonPhase(now).illuminated,
    planets: planetVecs(now),
    stars: STARS.map((s) => ({ ...s, e: celestialToEarth(s.v, now) })),
  };
}

// ---------- painters ----------

function drawStars(g: CanvasRenderingContext2D, view: View, Rsky: number, stars: ReturnType<typeof computeSky>['stars'], t: number) {
  for (const s of stars) {
    const p = project(s.e, view, Rsky);
    if (!p) continue;
    const twinkle = t ? 0.7 + 0.3 * Math.sin(t * (1.2 + s.tint * 2) + s.tw) : 1;
    const a = (0.25 + s.mag * 0.75) * twinkle;
    const size = 0.5 + s.mag * 1.5;
    g.fillStyle = s.tint < 0.25 ? `rgba(170, 200, 255, ${a})` : s.tint > 0.85 ? `rgba(255, 220, 180, ${a})` : `rgba(255, 255, 255, ${a})`;
    if (size > 1.4) {
      g.beginPath();
      g.arc(p.x, p.y, size, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
  }
}

function drawSun(g: CanvasRenderingContext2D, p: Pt, minSide: number, t: number) {
  const r = Math.max(40, Math.min(110, minSide * 0.085));

  // Wide corona: visible even when the Sun itself hides behind the Earth (eclipse look).
  const corona = g.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 7);
  corona.addColorStop(0, 'rgba(255, 196, 110, 0.42)');
  corona.addColorStop(0.25, 'rgba(255, 150, 70, 0.14)');
  corona.addColorStop(1, 'rgba(255, 120, 40, 0)');
  g.fillStyle = corona;
  g.fillRect(p.x - r * 7, p.y - r * 7, r * 14, r * 14);

  // Slowly turning rays.
  g.save();
  g.translate(p.x, p.y);
  g.rotate(t * 0.05);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    g.rotate((Math.PI * 2) / 12);
    const len = r * (2.6 + 0.6 * Math.sin(t * 0.7 + i * 1.7));
    const ray = g.createLinearGradient(0, 0, len, 0);
    ray.addColorStop(0, 'rgba(255, 220, 150, 0.22)');
    ray.addColorStop(1, 'rgba(255, 200, 120, 0)');
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(r * 0.6, -r * 0.08);
    g.lineTo(len, 0);
    g.lineTo(r * 0.6, r * 0.08);
    g.fill();
  }
  g.restore();

  // The disc.
  const disc = g.createRadialGradient(p.x - r * 0.2, p.y - r * 0.2, r * 0.1, p.x, p.y, r);
  disc.addColorStop(0, '#fffdf0');
  disc.addColorStop(0.55, '#ffe28a');
  disc.addColorStop(1, '#ffad3b');
  g.shadowColor = 'rgba(255, 190, 90, 0.9)';
  g.shadowBlur = r * 0.8;
  g.fillStyle = disc;
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;

  // A faint anamorphic flare, very "camera in orbit".
  const flare = g.createLinearGradient(p.x - r * 9, 0, p.x + r * 9, 0);
  flare.addColorStop(0, 'rgba(120, 200, 255, 0)');
  flare.addColorStop(0.5, 'rgba(200, 230, 255, 0.35)');
  flare.addColorStop(1, 'rgba(120, 200, 255, 0)');
  g.fillStyle = flare;
  g.fillRect(p.x - r * 9, p.y - 1, r * 18, 2);
}

function drawMoon(g: CanvasRenderingContext2D, p: Pt | null, sun: Pt | null, lit: number, view: View) {
  if (!p) return;
  const r = 13;
  // Orientation: the lit limb faces the Sun's direction on screen.
  const sx = sun ? sun.x : view.cx;
  const sy = sun ? sun.y : view.cy;
  const θ = Math.atan2(sy - p.y, sx - p.x);

  g.save();
  g.translate(p.x, p.y);
  g.shadowColor = 'rgba(200, 210, 255, 0.5)';
  g.shadowBlur = 14 * lit + 2;
  g.fillStyle = '#20222e';
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;

  g.rotate(θ);
  const k = 1 - 2 * lit; // >0 crescent, <0 gibbous
  g.fillStyle = '#e9ecf5';
  g.beginPath();
  g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  g.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
  g.fill();
  g.restore();

  label(g, 'MOON', p.x, p.y + r + 12);
}

function drawPlanet(g: CanvasRenderingContext2D, p: Pt | null, planet: { name: string; color: string; size: number; ring?: boolean }) {
  if (!p) return;
  const r = planet.size;
  const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
  glow.addColorStop(0, planet.color + '66');
  glow.addColorStop(1, planet.color + '00');
  g.fillStyle = glow;
  g.fillRect(p.x - r * 3, p.y - r * 3, r * 6, r * 6);

  if (planet.ring) {
    g.strokeStyle = planet.color + 'aa';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(p.x, p.y, r * 2.1, r * 0.6, -0.35, 0, Math.PI * 2);
    g.stroke();
  }
  const body = g.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.35, planet.color);
  body.addColorStop(1, '#1a1420');
  g.fillStyle = body;
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
  if (planet.name === 'Jupiter') {
    g.strokeStyle = 'rgba(150, 100, 70, 0.55)';
    g.lineWidth = 1;
    for (const dy of [-0.35, 0.1, 0.45]) {
      g.beginPath();
      g.moveTo(p.x - r * 0.9, p.y + dy * r);
      g.lineTo(p.x + r * 0.9, p.y + dy * r);
      g.stroke();
    }
  }
  label(g, planet.name.toUpperCase(), p.x, p.y + r + 12);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number) {
  g.font = '600 9px "JetBrains Mono", monospace';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(160, 165, 210, 0.55)';
  g.fillText(text.split('').join(' '), x, y);
}

function spawnShootingStar(now: number, w: number, h: number): Shooting {
  const fromLeft = Math.random() < 0.5;
  const angle = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.5;
  return {
    x: w * (fromLeft ? 0.05 + Math.random() * 0.45 : 0.5 + Math.random() * 0.45),
    y: h * (0.05 + Math.random() * 0.35),
    dx: Math.cos(angle),
    dy: Math.sin(angle),
    born: now,
    life: 700 + Math.random() * 500,
    len: 110 + Math.random() * 130,
  };
}

/** Returns false once the meteor has burnt out. */
function drawShootingStar(g: CanvasRenderingContext2D, s: Shooting, now: number): boolean {
  const k = (now - s.born) / s.life;
  if (k >= 1) return false;
  const speed = 900; // px per second
  const travelled = ((now - s.born) / 1000) * speed;
  const hx = s.x + s.dx * travelled;
  const hy = s.y + s.dy * travelled;
  const tail = s.len * Math.min(1, k * 3);
  const fade = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;

  const grad = g.createLinearGradient(hx, hy, hx - s.dx * tail, hy - s.dy * tail);
  grad.addColorStop(0, `rgba(255, 255, 255, ${0.95 * fade})`);
  grad.addColorStop(0.3, `rgba(170, 220, 255, ${0.45 * fade})`);
  grad.addColorStop(1, 'rgba(120, 180, 255, 0)');
  g.strokeStyle = grad;
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(hx, hy);
  g.lineTo(hx - s.dx * tail, hy - s.dy * tail);
  g.stroke();

  g.fillStyle = `rgba(255, 255, 255, ${fade})`;
  g.shadowColor = 'rgba(180, 220, 255, 0.9)';
  g.shadowBlur = 10;
  g.beginPath();
  g.arc(hx, hy, 1.8, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  return true;
}

/** Warm sunlight centred on the subsolar point, clipped to the globe (blended with "screen"). */
function drawSunlight(g: CanvasRenderingContext2D, view: View, sun: Vec3) {
  const facing = dot(sun, view.C); // >0: subsolar point on the visible hemisphere
  if (facing < -0.35) return;
  const x = view.cx + dot(sun, view.E) * view.R;
  const y = view.cy - dot(sun, view.N) * view.R;
  const strength = Math.min(1, (facing + 0.35) / 0.6);

  g.save();
  g.beginPath();
  g.arc(view.cx, view.cy, view.R, 0, Math.PI * 2);
  g.clip();
  const glow = g.createRadialGradient(x, y, 0, x, y, view.R * 1.25);
  glow.addColorStop(0, `rgba(255, 226, 170, ${0.3 * strength})`);
  glow.addColorStop(0.45, `rgba(255, 200, 140, ${0.13 * strength})`);
  glow.addColorStop(1, 'rgba(255, 180, 120, 0)');
  g.fillStyle = glow;
  g.fillRect(view.cx - view.R, view.cy - view.R, view.R * 2, view.R * 2);
  g.restore();
}
