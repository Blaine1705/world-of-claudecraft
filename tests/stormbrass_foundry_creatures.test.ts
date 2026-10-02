// The Stormbrass Foundry's own Blender creatures (phase 3): every mob of the
// dungeon wears its built model (no placeholder left: the Prime Draft and the
// Voltaic Warden are their own deliveries, tests/stormbrass_foundry_boss_models
// .test.ts), the GLBs carry the bones the renderer drives (the
// dials, the portrait head) and no held tool rides a bone of its own, and the
// pure presentation plan (gauge steps, plate faces, anchors, arcs) holds.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dialGesture, stepDial } from '../src/render/characters/bone_dials';
import { FOUNDRY_CREATURE_LOOKS } from '../src/render/characters/foundry_creature_looks';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  arcPathInto,
  FOUNDRY_DRAW,
  foundryAnchor,
  TOCK_GAUGE_DIAL,
  TOCK_GAUGE_STEPS,
  tockGaugeGesture,
  tockGaugeLevel,
  VOLTAIC_PLATES,
  voltaicFaces,
  voltaicPlateDial,
  voltaicPlateGesture,
} from '../src/render/stormbrass_foundry/foundry_creature_fx_core';
import { hammerDrop } from '../src/render/stormbrass_foundry/foundry_press_core';
import { VOLTAIC_CHARGED, VOLTAIC_GROUNDED } from '../src/sim/encounters/stormbrass_foundry/ids';
import type { Entity } from '../src/sim/types';

const FOUNDRY_MOBS: Record<string, string> = {
  line_master_tock: 'foundry_line_master',
  rangewarden: 'foundry_rangewarden',
  voltaic_warden: 'foundry_voltaic_warden',
  gantry_hauler: 'foundry_gantry_hauler',
  brass_sentry: 'foundry_brass_sentry',
  shieldbearer_frame: 'foundry_shieldbearer',
  steam_bruiser: 'foundry_steam_bruiser',
  half_built_frame: 'foundry_half_built_frame',
  foundry_engineer: 'foundry_engineer',
  gearwright_apprentice: 'foundry_apprentice',
  clockwork_hound: 'foundry_hound',
  arc_drone: 'foundry_arc_drone',
  tripod_turret: 'foundry_tripod_turret',
  prime_draft: 'foundry_prime_draft',
};

function glbNodeNames(url: string): string[] {
  const buf = fs.readFileSync(path.join('public', url));
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as {
    nodes: { name?: string }[];
    skins?: { joints: number[] }[];
  };
  // The skeleton's bones only (the body mesh may well be named after a shield).
  const joints = new Set((json.skins ?? []).flatMap((s) => s.joints));
  return json.nodes.filter((_, i) => joints.has(i)).map((n) => n.name ?? '');
}

/** Per animation, the (sanitised) node names it keys a rotation for. */
function glbRotationTracks(url: string): Map<string, Set<string>> {
  const buf = fs.readFileSync(path.join('public', url));
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as {
    nodes: { name?: string }[];
    animations: {
      name: string;
      channels: { sampler: number; target: { node: number; path: string } }[];
    }[];
  };
  const out = new Map<string, Set<string>>();
  for (const a of json.animations) {
    const set = new Set<string>();
    for (const c of a.channels)
      if (c.target.path === 'rotation')
        set.add((json.nodes[c.target.node].name ?? '').replace(/[[\].:/]/g, ''));
    out.set(a.name, set);
  }
  return out;
}

describe('the Foundry creatures wear their own models', () => {
  it('maps every Foundry mob to its built look, the Prime Draft included', () => {
    for (const [mob, key] of Object.entries(FOUNDRY_MOBS)) {
      expect(visualKeyFor({ kind: 'mob', templateId: mob } as Entity)).toBe(key);
      const def = VISUALS[key];
      expect(def, key).toBe(FOUNDRY_CREATURE_LOOKS[key]);
      expect(def.url).toMatch(/^models\/creatures\/foundry_/);
      expect(fs.existsSync(path.join('public', def.url)), def.url).toBe(true);
      expect(def.authoredAtlas).toBe(true);
    }
  });

  it('stands every boss three to four players tall and every machine past a player', () => {
    const scale: Record<string, number> = {
      foundry_line_master: 1.9,
      foundry_rangewarden: 2.2,
      foundry_voltaic_warden: 2.4,
      foundry_gantry_hauler: 2.6,
    };
    for (const [key, s] of Object.entries(scale)) {
      const tall = FOUNDRY_CREATURE_LOOKS[key].height * s;
      expect(tall / 2.6, key).toBeGreaterThanOrEqual(2.9);
      expect(tall / 2.6, key).toBeLessThanOrEqual(4.2);
    }
    // The last boss is the biggest fighter: taller than every other, under five players.
    const draft = FOUNDRY_CREATURE_LOOKS.foundry_prime_draft.height * 2.6;
    for (const [key, s] of Object.entries(scale))
      expect(draft, key).toBeGreaterThan(FOUNDRY_CREATURE_LOOKS[key].height * s);
    expect(draft / 2.6).toBeLessThan(5);
  });

  it('ships the bones the renderer drives and no held tool on a bone of its own', () => {
    for (const key of new Set(Object.values(FOUNDRY_MOBS))) {
      const def = FOUNDRY_CREATURE_LOOKS[key];
      const names = new Set(glbNodeNames(def.url).map((n) => n.replace(/[[\].:/]/g, '')));
      for (const d of def.dials ?? [])
        expect(names.has(d.bone.replace(/[[\].:/]/g, '')), d.bone).toBe(true);
      for (const n of names)
        expect(n, `${key}: ${n}`).not.toMatch(
          /wrench|spanner|shield|weapon|sword|staff|riveter|tool/i,
        );
    }
    // The dials lay their turn on what the mixer wrote: every clip must key them.
    for (const key of ['foundry_line_master', 'foundry_voltaic_warden', 'foundry_prime_draft']) {
      const def = FOUNDRY_CREATURE_LOOKS[key];
      const keyed = glbRotationTracks(def.url);
      for (const d of def.dials ?? []) {
        const want = d.bone.replace(/[[\].:/]/g, '');
        for (const [clip, bones] of keyed)
          expect(bones.has(want), `${key} ${clip} ${d.bone}`).toBe(true);
      }
    }
    const portraitHeads = ['foundry_line_master', 'foundry_voltaic_warden', 'foundry_rangewarden'];
    for (const key of portraitHeads)
      expect(glbNodeNames(FOUNDRY_CREATURE_LOOKS[key].url)).toContain('Head');
  });
});

describe('the Foundry creatures presentation plan', () => {
  it("climbs Tock's gauge from the low stop to the red as the lever nears", () => {
    expect(tockGaugeLevel(20)).toBe(0);
    expect(tockGaugeLevel(10)).toBe(TOCK_GAUGE_STEPS / 2);
    expect(tockGaugeLevel(0)).toBe(TOCK_GAUGE_STEPS);
    expect(tockGaugeLevel(undefined)).toBe(0);
    const stops = Array.from(
      { length: TOCK_GAUGE_STEPS + 1 },
      (_, k) => TOCK_GAUGE_DIAL.stops[tockGaugeGesture(k)],
    );
    for (let k = 1; k < stops.length; k++) expect(stops[k]).toBeLessThan(stops[k - 1]);
    expect(stops[TOCK_GAUGE_STEPS]).toBeCloseTo((-270 * Math.PI) / 180);
  });

  it('turns the plates per half: the charged face half a turn, split plating opposite', () => {
    const grounded = voltaicFaces([{ id: VOLTAIC_GROUNDED }], VOLTAIC_GROUNDED, VOLTAIC_CHARGED);
    expect(grounded).toEqual({ front: 'grounded', back: 'grounded' });
    const split = voltaicFaces(
      [{ id: VOLTAIC_CHARGED, value2: 1 }],
      VOLTAIC_GROUNDED,
      VOLTAIC_CHARGED,
    );
    expect(split).toEqual({ front: 'charged', back: 'grounded' });
    const front = voltaicPlateDial('Plate_ChestL', 'front');
    const back = voltaicPlateDial('Plate_BackL', 'back');
    const g = voltaicPlateGesture('charged', 'grounded');
    expect(front.stops[g]).toBeCloseTo(Math.PI);
    expect(back.stops[g]).toBe(0);
    expect(front.stops[voltaicPlateGesture('grounded', 'grounded')]).toBe(0);
    expect(VOLTAIC_PLATES).toHaveLength(12);
    expect(VOLTAIC_PLATES.filter(([, h]) => h === 'front')).toHaveLength(6);
  });

  it('eases a dial toward its stop and lets a gesture address only its own dials', () => {
    const st = { angle: 0, target: Math.PI, rattleLeft: 0 };
    const a1 = stepDial(st, 5, 0.1);
    expect(a1).toBeGreaterThan(0);
    expect(a1).toBeLessThan(Math.PI);
    for (let i = 0; i < 100; i++) stepDial(st, 5, 0.1);
    expect(st.angle).toBe(Math.PI);
    const defs = [TOCK_GAUGE_DIAL, voltaicPlateDial('Plate_ChestL', 'front')];
    expect(dialGesture(defs, tockGaugeGesture(3)).map(([i]) => i)).toEqual([0]);
    expect(dialGesture(defs, 'foundry_plates_rattle')).toEqual([[1, 'rattle']]);
    expect(dialGesture(defs, 'nothing')).toEqual([]);
  });

  it('carries an anchor by the facing: forward is +z at facing 0, the left is +x', () => {
    const out = { x: 0, y: 0, z: 0 };
    foundryAnchor({ x: 10, y: 1, z: 5 }, 0, 2, { side: 1, up: 3, fwd: 2 }, out);
    expect(out).toEqual({ x: 12, y: 7, z: 9 });
    foundryAnchor({ x: 0, y: 0, z: 0 }, Math.PI / 2, 1, { side: 0, up: 0, fwd: 1 }, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
    expect(FOUNDRY_DRAW.line_master_tock).toBeGreaterThan(0.8);
  });

  it('winds the press hammer up, slams it on the strip at the strike and lifts it after', () => {
    expect(hammerDrop(0, 2)).toBeCloseTo(0);
    expect(hammerDrop(1.5, 2)).toBeLessThan(0);
    expect(hammerDrop(2.1, 2)).toBe(1);
    expect(hammerDrop(4, 2)).toBe(0);
  });

  it('pins a bolt to its two ends and keeps it jagged in between', () => {
    const pts = Array.from({ length: 10 }, () => {
      const p = {
        x: 0,
        y: 0,
        z: 0,
        set(x: number, y: number, z: number) {
          p.x = x;
          p.y = y;
          p.z = z;
        },
      };
      return p;
    });
    arcPathInto({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 7, 0.2, pts);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[9].x).toBeCloseTo(10);
    expect(pts.some((p) => Math.abs(p.z) > 0.05 || Math.abs(p.y) > 0.05)).toBe(true);
  });
});
