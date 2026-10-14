// The test arena: a walled square with pylons to give a sense of speed. Real tracks come in milestone 2.

import type { Craft, Vec } from './craft';

export const ARENA = 5000;   // arena is ARENA x ARENA px, centered on the origin
const HALF = ARENA / 2;
const CRAFT_RADIUS = 18;

export interface Pylon { x: number; y: number; r: number; hue: number }

export function makePylons(): Pylon[] {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pylons: Pylon[] = [];
  while (pylons.length < 90) {
    const x = (rand() - 0.5) * (ARENA - 200);
    const y = (rand() - 0.5) * (ARENA - 200);
    if (Math.hypot(x, y) < 400) continue; // keep the spawn clear
    pylons.push({ x, y, r: 14 + rand() * 16, hue: rand() < 0.5 ? 190 : 310 });
  }
  return pylons;
}

/** Push the craft out of walls and pylons. Returns impact speed (0 = no hit) for screen shake. */
export function collide(craft: Craft, pylons: Pylon[]): number {
  let impact = 0;
  const hit = (n: Vec) => {
    const before = craft.speed;
    craft.bounce(n);
    impact = Math.max(impact, before - craft.speed);
  };
  const p = craft.pos;
  const lim = HALF - CRAFT_RADIUS;
  if (p.x < -lim) { p.x = -lim; hit({ x: 1, y: 0 }); }
  if (p.x > lim) { p.x = lim; hit({ x: -1, y: 0 }); }
  if (p.y < -lim) { p.y = -lim; hit({ x: 0, y: 1 }); }
  if (p.y > lim) { p.y = lim; hit({ x: 0, y: -1 }); }

  for (const py of pylons) {
    const dx = p.x - py.x, dy = p.y - py.y;
    const d = Math.hypot(dx, dy);
    const min = py.r + CRAFT_RADIUS;
    if (d < min && d > 0) {
      const n = { x: dx / d, y: dy / d };
      p.x = py.x + n.x * min;
      p.y = py.y + n.y * min;
      hit(n);
    }
  }
  return impact;
}
