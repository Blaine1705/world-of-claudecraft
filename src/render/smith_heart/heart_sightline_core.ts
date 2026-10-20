// The Smith's Heart's render-only solids as plain volumes, for the sightline
// pin: every rock block (a cylinder bounding it, lean included), every
// placeholder prop part (a cylinder bounding it, tilt included) and every
// gate part at a given openness (a turned box), all from the SAME plans the
// painters draw (heart_walls_core.ts, heart_plan_core.ts,
// heart_gates_core.ts). tests/smith_heart_render_core.test.ts casts the
// raid's key sightlines (the Ring and the Balcony to the seal, the Balcony
// to each causeway mouth) through them.
//
// Three-free, DOM-free, deterministic.

import { SMITH_HEART_GATES } from '../../sim/content/smith_heart';
import { SMITH_HEART_FIELD } from '../../sim/content/smith_heart_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { heartGatePartPose, heartGateParts, heartGateRig } from './heart_gates_core';
import { HEART_PROP_RECIPES, type HeartPart, heartPropBase } from './heart_plan_core';
import { heartWallReach, planHeartWalls } from './heart_walls_core';

/** An upright cylinder (y0 to y1, radius r) or a box turned by `yaw` about
 *  its centre (three's rotation.y), half extents hw x hh x hd. */
export type HeartSolid =
  | { kind: 'cyl'; x: number; z: number; r: number; y0: number; y1: number; what: string }
  | {
      kind: 'box';
      x: number;
      y: number;
      z: number;
      hw: number;
      hh: number;
      hd: number;
      yaw: number;
      what: string;
    };

/** Every rock block as its bounding cylinder. */
export function heartWallSolids(spacing = 5): HeartSolid[] {
  return planHeartWalls(spacing).map((b) => ({
    kind: 'cyl',
    x: b.x,
    z: b.z,
    r: heartWallReach(b),
    y0: b.base,
    y1: b.top,
    what: `wall (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`,
  }));
}

function partBound(p: HeartPart): { r: number; hh: number } {
  const across = p.shape === 'box' ? Math.hypot(p.w / 2, p.d / 2) : Math.max(p.w, p.d) / 2;
  const tilt = Math.max(Math.abs(Math.sin(p.tiltX ?? 0)), Math.abs(Math.sin(p.tiltZ ?? 0)));
  return { r: across + (p.h / 2) * tilt, hh: p.h / 2 + across * tilt };
}

/** Every placeholder prop part as its bounding cylinder. */
export function heartPropSolids(): HeartSolid[] {
  const out: HeartSolid[] = [];
  for (const prop of SMITH_HEART_FIELD.props) {
    const recipe = HEART_PROP_RECIPES[prop.kind] ?? [];
    if (recipe.length === 0) continue;
    const base = heartPropBase(prop.x, prop.z);
    const c = Math.cos(prop.rot);
    const s = Math.sin(prop.rot);
    const k = prop.scale ?? 1;
    for (const p of recipe) {
      const { r, hh } = partBound(p);
      out.push({
        kind: 'cyl',
        x: prop.x + (p.x * c + p.z * s) * k,
        z: prop.z + (-p.x * s + p.z * c) * k,
        r: r * k,
        y0: base + (p.y - hh) * k,
        y1: base + (p.y + hh) * k,
        what: prop.kind,
      });
    }
  }
  return out;
}

/** Every drawn gate part at openness `k` as a turned box. */
export function heartGateSolids(k: number): HeartSolid[] {
  const out: HeartSolid[] = [];
  for (const gate of SMITH_HEART_GATES) {
    const rig = heartGateRig(gate.kind);
    if (!rig) continue;
    const ground = authoredFieldHeight(SMITH_HEART_FIELD, gate.x, gate.z);
    const c = Math.cos(gate.rot);
    const s = Math.sin(gate.rot);
    for (const part of heartGateParts(rig, gate.hw * 2)) {
      const pose = heartGatePartPose(part, rig, k);
      if (!pose.shown) continue;
      out.push({
        kind: 'box',
        x: gate.x + pose.x * c + pose.z * s,
        y: ground + pose.y,
        z: gate.z - pose.x * s + pose.z * c,
        hw: part.w / 2,
        hh: part.h / 2,
        hd: part.d / 2,
        yaw: gate.rot,
        what: `${gate.id}:${part.role}`,
      });
    }
  }
  return out;
}

/** Does the point lie inside the solid? */
export function heartSolidContains(s: HeartSolid, x: number, y: number, z: number): boolean {
  if (s.kind === 'cyl') {
    return y >= s.y0 && y <= s.y1 && Math.hypot(x - s.x, z - s.z) <= s.r;
  }
  if (Math.abs(y - s.y) > s.hh) return false;
  const dx = x - s.x;
  const dz = z - s.z;
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  return Math.abs(dx * c - dz * sn) <= s.hw && Math.abs(dx * sn + dz * c) <= s.hd;
}

/** The solids a straight sightline from a to b passes through (sampled every
 *  `step` yards; a solid is skipped early when its footprint is far from the
 *  line's). */
export function heartSightlineHits(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  solids: readonly HeartSolid[],
  step = 0.2,
): string[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const length = Math.hypot(dx, b.y - a.y, dz);
  const n = Math.max(1, Math.ceil(length / step));
  const hits: string[] = [];
  for (const s of solids) {
    const reach = s.kind === 'cyl' ? s.r : Math.hypot(s.hw, s.hd);
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / len2)) : 0;
    if (Math.hypot(a.x + dx * t - s.x, a.z + dz * t - s.z) > reach + step) continue;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      if (heartSolidContains(s, a.x + dx * u, a.y + (b.y - a.y) * u, a.z + dz * u)) {
        hits.push(s.what);
        break;
      }
    }
  }
  return hits;
}
