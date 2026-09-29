// The Hollow Crypt's pure render cores: the authored-field terrain plan, the
// dressing plan, the render-only set dressing and the gate reveal memory.

import { afterEach, describe, expect, it } from 'vitest';
import {
  planFieldCliffs,
  planFieldTops,
  triangulatePolygon,
} from '../src/render/authored_field/field_mesh_core';
import {
  clearGateMemoryForTest,
  gateMemoryKey,
  gateView,
  observeGate,
} from '../src/render/hollow_crypt/crypt_gate_state_core';
import {
  GATE_REVEAL_SECONDS,
  gateOpenness,
  HOLLOW_CRYPT_LIGHTS,
  HOLLOW_CRYPT_WISP_RIVERS,
  planEdgeDressing,
  RITE_RING,
  riverPointAt,
} from '../src/render/hollow_crypt/crypt_plan_core';
import { HOLLOW_CRYPT_SET_DRESSING } from '../src/render/hollow_crypt/crypt_set_dressing_core';
import { HOLLOW_CRYPT_FIELD } from '../src/sim/content/hollow_crypt_layout';
import { authoredFieldHeight, authoredFieldSurfaceAt } from '../src/sim/instances/authored_field';

describe('authored field terrain plan', () => {
  it('ear-clips a concave polygon into triangles covering its exact area', () => {
    const l: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    const tris = triangulatePolygon(l);
    expect(tris.length).toBe((l.length - 2) * 3);
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const [a, b, c] = [l[tris[i]], l[tris[i + 1]], l[tris[i + 2]]];
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    expect(area).toBeCloseTo(64, 6);
  });

  it('seats every walkable top vertex on its own surface height', () => {
    const tops = planFieldTops(HOLLOW_CRYPT_FIELD, { maxEdge: 6, layerLift: 0 });
    for (const family of ['stone', 'soil'] as const) {
      const p = tops[family].positions;
      expect(p.length).toBeGreaterThan(0);
      for (let i = 0; i < p.length; i += 3 * 97) {
        const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
        // Interior samples read back the sim height exactly (edges may belong
        // to a neighbour, so only points well inside their surface count).
        const s = authoredFieldSurfaceAt(HOLLOW_CRYPT_FIELD, x, z);
        if (!s || s.kind === 'path') continue;
        const inside = authoredFieldSurfaceAt(HOLLOW_CRYPT_FIELD, x + 0.8, z + 0.8) === s;
        if (inside) expect(y).toBeCloseTo(authoredFieldHeight(HOLLOW_CRYPT_FIELD, x, z), 5);
      }
    }
  });

  it('pins every cliff face top to its walkable edge and drops it into the chasm', () => {
    const cliffs = planFieldCliffs(HOLLOW_CRYPT_FIELD, {
      voidFloor: -65,
      columnStep: 2,
      rowStep: 4,
      flare: 0.2,
    });
    const ys = cliffs.positions.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(24, 5); // the Rite Ring's rim
    expect(Math.min(...ys)).toBeCloseTo(-65, 5);
    expect(cliffs.indices.length % 3).toBe(0);
  });
});

describe('the Hollow Crypt dressing plan', () => {
  it('every soul river ends in the column over the Rite Ring', () => {
    for (const r of HOLLOW_CRYPT_WISP_RIVERS) {
      const end = riverPointAt(r, 0.99999);
      expect(Math.hypot(end[0] - RITE_RING.x, end[2] - RITE_RING.z), r.id).toBeLessThan(2);
      expect(end[1]).toBeGreaterThan(RITE_RING.h);
    }
  });

  it('keeps at most eight point lights per light zone', () => {
    for (const zone of HOLLOW_CRYPT_FIELD.lightZones) {
      const inside = HOLLOW_CRYPT_LIGHTS.filter(
        (l) => Math.hypot(l.x - zone.x, l.z - zone.z) <= zone.r,
      );
      expect(inside.length, zone.id).toBeLessThanOrEqual(8);
    }
  });

  it('dresses cliff edges on the high side, never over the chasm', () => {
    const edges = planEdgeDressing();
    expect(edges.length).toBeGreaterThan(40);
    for (const e of edges) {
      expect(authoredFieldHeight(HOLLOW_CRYPT_FIELD, e.x, e.z)).toBeGreaterThan(
        HOLLOW_CRYPT_FIELD.voidHeight,
      );
    }
  });

  it('stands no tall render-only piece on walkable ground', () => {
    const TALL = /ChapelRuin|RockPillar|BoneCrown|TraceryWindow|DistantSpire|BellTower/;
    for (const p of HOLLOW_CRYPT_SET_DRESSING) {
      if (!TALL.test(p.piece)) continue;
      // Anchored on the void side (or an authored absolute height off the
      // walkable terrain), never in the middle of a floor players cross.
      const floor = authoredFieldHeight(HOLLOW_CRYPT_FIELD, p.x, p.z);
      const onWalkable = floor > HOLLOW_CRYPT_FIELD.voidHeight;
      if (onWalkable) expect(p.piece, `${p.piece} at ${p.x},${p.z}`).toMatch(/BoneCrown/);
    }
  });
});

describe('gate reveal memory', () => {
  afterEach(() => clearGateMemoryForTest());

  it('snaps on first sight and plays the reveal on a later change', () => {
    const key = gateMemoryKey(100, 200, 'grille');
    expect(gateView(key, 0).openness).toBe(0);
    observeGate(key, 'dungeon_gate_open', 10);
    expect(gateView(key, 10).openness).toBe(1); // arrived to an open gate: no replay
    observeGate(key, 'dungeon_gate_sealed', 20);
    expect(gateView(key, 20).openness).toBeCloseTo(1, 5);
    expect(gateView(key, 20 + GATE_REVEAL_SECONDS / 2).openness).toBeCloseTo(0.5, 5);
    expect(gateView(key, 20 + GATE_REVEAL_SECONDS + 1).openness).toBe(0);
    expect(gateView(key, 21).state).toBe('sealed');
  });

  it('eases monotonically from closed to open', () => {
    let prev = -1;
    for (let t = 0; t <= GATE_REVEAL_SECONDS; t += 0.1) {
      const o = gateOpenness(0, 1, t);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
    expect(gateOpenness(0, 1, GATE_REVEAL_SECONDS)).toBe(1);
  });
});
