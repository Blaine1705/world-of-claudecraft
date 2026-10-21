// Pure plan of the Hammer vein's air (hammer_air.ts draws it): where quarry
// dust hangs in the low sun, where grit trickles off the terraces' lips and
// the colossi's shoulders, where the collapse spot sheds its warning, the
// haze low over the pit floor, and the amber halos of the geodes. Cosmetic:
// all of it thins with the effects tier, nothing of it is a telegraph, and
// the collapse spot's grit is a warning of the scene, never a hazard's
// marking (the hazard, when it is built, telegraphs on the shared kit).
//
// Three-free, DOM-free, deterministic (a hash, never rng).

import {
  GALLERY_LANDINGS,
  HAMMER_PIT,
  QUARRY_TERRACES,
  SMITH_HEART_FIELD,
} from '../../sim/content/smith_heart_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { collapseSpot } from './hammer_kit_plan_core';
import { heartHash, heartPropBase } from './heart_plan_core';

/** A volume of drifting motes: a box over the floor, how many at full
 *  density. */
export interface MoteVolume {
  x: number;
  z: number;
  y0: number;
  y1: number;
  hw: number;
  hd: number;
  count: number;
}

/** A trickle of grit falling from (x, top, z) down `drop` yards; `heavy` is
 *  the collapse spot's (thicker, faster, more often). */
export interface GritStream {
  x: number;
  z: number;
  top: number;
  drop: number;
  heavy: boolean;
}

/** A soft haze card low over a floor. */
export interface HazeCard {
  x: number;
  z: number;
  y: number;
  size: number;
}

/** A geode's amber halo. */
export interface GeodeGlow {
  x: number;
  y: number;
  z: number;
  size: number;
}

export interface HammerAirPlan {
  motes: MoteVolume[];
  grit: GritStream[];
  haze: HazeCard[];
  geodes: GeodeGlow[];
}

const F = SMITH_HEART_FIELD;

/** The vein's whole air. `density` (0..1, the effects tier's) scales the
 *  counts; the low tier keeps a third. */
export function planHammerAir(density = 1): HammerAirPlan {
  const k = Math.max(0.2, Math.min(1, density));
  const pit = HAMMER_PIT;
  const motes: MoteVolume[] = [
    // The quarry: thick, lit, from the floor up past the colossi's knees.
    {
      x: pit.x,
      z: pit.z,
      y0: pit.h + 0.5,
      y1: pit.h + 26,
      hw: pit.rx + 8,
      hd: pit.rz + 8,
      count: Math.round(520 * k),
    },
    // The Gallery's three landings and the Cleft.
    ...Object.values(GALLERY_LANDINGS).map((l) => ({
      x: l.x,
      z: l.z,
      y0: l.h + 0.5,
      y1: l.h + 12,
      hw: 16,
      hd: 16,
      count: Math.round(120 * k),
    })),
  ];
  // Grit off the terrace lips: one stream every so many degrees on each
  // step's riser (staggered), and off the colossi's shoulders.
  const grit: GritStream[] = [];
  QUARRY_TERRACES.steps.forEach((step, i) => {
    const out = i === 0 ? 0 : QUARRY_TERRACES.steps[i - 1].out;
    for (let deg = QUARRY_TERRACES.fromDeg + 8 + i * 9; deg < QUARRY_TERRACES.toDeg; deg += 26) {
      const a = (deg * Math.PI) / 180;
      const x = pit.x + Math.sin(a) * (pit.rx + out - 0.6);
      const z = pit.z + Math.cos(a) * (pit.rz + out - 0.6);
      if (heartHash(deg, i) < 0.35 / Math.max(0.35, k)) continue;
      grit.push({ x, z, top: step.h - 0.2, drop: 7.2, heavy: false });
    }
  });
  for (const p of F.props) {
    if (p.kind !== 'sh_quarry_colossus') continue;
    for (const s of [-1, 1]) {
      const c = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const lx = s * 6;
      const lz = 2;
      grit.push({
        x: p.x + lx * c + lz * sn,
        z: p.z - lx * sn + lz * c,
        top: QUARRY_TERRACES.steps[0].h + 18,
        drop: 18,
        heavy: false,
      });
    }
  }
  // The collapse spot: heavy trickles from the overhang's lip onto the walk.
  const c = collapseSpot();
  for (let i = -2; i <= 2; i++) {
    const along = i * 3.2;
    const ux = Math.cos(c.rot);
    const uz = -Math.sin(c.rot);
    const fx = Math.sin(c.rot);
    const fz = Math.cos(c.rot);
    const x = c.x + ux * along + fx * (4 + heartHash(i, 9) * 4);
    const z = c.z + uz * along + fz * (4 + heartHash(i, 9) * 4);
    grit.push({ x, z, top: c.y + 9.5, drop: 9.5, heavy: true });
  }
  // Haze cards low over the pit and the landings.
  const haze: HazeCard[] = [];
  const cards = Math.round(14 * k);
  for (let i = 0; i < cards; i++) {
    const a = heartHash(i, 21) * Math.PI * 2;
    const r = Math.sqrt(heartHash(i, 23)) * (pit.rx - 6);
    const x = pit.x + Math.sin(a) * r;
    const z = pit.z + Math.cos(a) * r * (pit.rz / pit.rx);
    haze.push({
      x,
      z,
      y: authoredFieldHeight(F, x, z) + 1.2 + heartHash(i, 25) * 1.6,
      size: 16 + heartHash(i, 27) * 12,
    });
  }
  // The geodes' halos.
  const geodes: GeodeGlow[] = F.props
    .filter((p) => p.kind === 'sh_geode')
    .map((p) => ({ x: p.x, y: heartPropBase(p.x, p.z) + 1.6, z: p.z, size: 4.5 }));
  return { motes, grit, haze, geodes };
}
