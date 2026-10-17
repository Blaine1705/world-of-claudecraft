// Old Thatchgrin and his strawlings: the shipped assets, their wiring, and the pure
// halves of the effects layer.
//
// A rebake that drops or renames a clip, or a manifest edit naming one the GLB does not
// carry, fails at no build step: the rig would sit in bind pose the first time he throws.
// So the clip names inside each GLB and the manifest map that names them are pinned
// together, with the glow materials the renderer drives by name, plus the field's
// dressing ring and the gourd's flight math.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isHostileSelectionTarget } from '../src/render/reaction';
import {
  bodyLocalToWorld,
  chaffFlameCalls,
  chaffStrength,
  GOURD_ABILITY,
  GOURD_RELEASE_SEC,
  gourdApex,
  gourdArc,
  SUMMON_ABILITY,
  SUMMON_PEAK_SEC,
  THATCHGRIN_TEMPLATE,
} from '../src/render/scarecrow_fx_core';
import {
  GOURDLIGHT_CROW_ID,
  STRAWLING_ID,
  THATCHGRIN_GOURD_ABILITY,
  THATCHGRIN_ID,
  THATCHGRIN_KIT,
  THATCHGRIN_SUMMON_ABILITY,
} from '../src/sim/content/gourdlight_eve_scarecrow';
import { resolveScarecrowField, SCARECROW_FIELD_RADIUS } from '../src/sim/seasonal/scarecrow_field';
import { SCARECROW_FIELD_RING, seasonalDecorLayout } from '../src/sim/seasonal_decor_layout';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';

const ROOT = resolve(__dirname, '..');
const BOSS_GLB = resolve(ROOT, 'public/models/creatures/gourdlight_thatchgrin.glb');
const ADD_GLB = resolve(ROOT, 'public/models/creatures/gourdlight_strawling.glb');
const MANIFEST = readFileSync(resolve(ROOT, 'src/render/characters/manifest.ts'), 'utf8');

function glbJson(path: string): {
  meshes?: Array<{ primitives: Array<{ indices?: number }> }>;
  accessors?: Array<{ count: number }>;
  animations?: Array<{ name?: string }>;
  materials?: Array<{ name?: string }>;
  skins?: Array<{ joints: number[] }>;
  nodes: Array<{ name?: string }>;
} {
  const buf = readFileSync(path);
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
}
const clips = (path: string) => (glbJson(path).animations ?? []).map((a) => a.name ?? '').sort();
const joints = (path: string) => {
  const j = glbJson(path);
  return (j.skins?.[0]?.joints ?? []).map((i) => j.nodes[i].name);
};

const CLIP_SET = ['Chop', 'Death', 'Hit', 'Idle', 'Run', 'Summon', 'Swipe', 'Throw', 'Walk'];

describe('the shipped GLBs', () => {
  it('carry the one shared clip set on both bodies', () => {
    expect(clips(BOSS_GLB)).toEqual(CLIP_SET);
    expect(clips(ADD_GLB)).toEqual(CLIP_SET);
  });

  it('share one rig: the boss adds only the crows, the strawling nothing', () => {
    const boss = joints(BOSS_GLB);
    const add = joints(ADD_GLB);
    for (const bone of add) expect(boss).toContain(bone);
    expect(boss.filter((b) => !add.includes(b)).every((b) => b?.startsWith('Crow'))).toBe(true);
    expect(boss).toContain('Head');
    expect(boss).toContain('R_Hand');
    expect(boss.filter((b) => b?.startsWith('Crow') && !b.includes('_'))).toHaveLength(3);
  });

  it('name the glow materials the renderer drives (the candle and the ember eyes)', () => {
    const boss = (glbJson(BOSS_GLB).materials ?? []).map((m) => m.name);
    const add = (glbJson(ADD_GLB).materials ?? []).map((m) => m.name);
    expect(boss).toContain('GourdGlow');
    expect(boss).toContain('ScarecrowGlow'); // the crows' eyes
    expect(add).toContain('ScarecrowGlow');
    expect(MANIFEST).toContain("selfLitMaterial: 'GourdGlow'");
    expect(MANIFEST).toContain("selfLitMaterial: 'ScarecrowGlow'");
  });
});

describe('the draw budget', () => {
  const budget = (path: string) => {
    const j = glbJson(path);
    const prims = (j.meshes ?? []).flatMap((m) => m.primitives);
    const tris = prims.reduce(
      (sum, p) => sum + (j.accessors?.[p.indices ?? -1]?.count ?? 0) / 3,
      0,
    );
    return { prims: prims.length, tris };
  };

  it('stays a large-boss body and a light add (one matte material, glow kept apart)', () => {
    const boss = budget(BOSS_GLB);
    const add = budget(ADD_GLB);
    // Balgath's cyclops is ~52.6k; a dungeon trash body 24k to 44k
    expect(boss.tris).toBeLessThan(50_000);
    expect(add.tris).toBeLessThan(20_000);
    expect(boss.prims).toBeLessThanOrEqual(8);
    expect(add.prims).toBeLessThanOrEqual(2);
  });
});

describe('the manifest wiring', () => {
  const map = MANIFEST.slice(
    MANIFEST.indexOf('const THATCHGRIN: ClipMap = {'),
    MANIFEST.indexOf('\n};', MANIFEST.indexOf('const THATCHGRIN: ClipMap = {')),
  );

  it('names only clips the GLB carries, and keys the telegraphs by the kit ability ids', () => {
    for (const name of map.matchAll(/'([A-Z][A-Za-z]+)'/g)) expect(CLIP_SET).toContain(name[1]);
    expect(map).toContain(`${THATCHGRIN_GOURD_ABILITY}: 'Throw'`);
    expect(map).toContain(`${THATCHGRIN_SUMMON_ABILITY}: 'Summon'`);
    // the render layer and the sim agree on every id
    expect(GOURD_ABILITY).toBe(THATCHGRIN_GOURD_ABILITY);
    expect(SUMMON_ABILITY).toBe(THATCHGRIN_SUMMON_ABILITY);
    expect(THATCHGRIN_TEMPLATE).toBe(THATCHGRIN_ID);
  });

  it('maps every template to a body (the crows wear the crypt carrion crow)', () => {
    expect(MANIFEST).toContain(`${THATCHGRIN_ID}: 'mob_gourdlight_thatchgrin'`);
    expect(MANIFEST).toContain(`${STRAWLING_ID}: 'mob_gourdlight_strawling'`);
    expect(MANIFEST).toContain(`${GOURDLIGHT_CROW_ID}: 'mob_crypt_crow'`);
  });

  it('times the throw so the gourd leaves his hand inside the windup and lands on its end', () => {
    expect(GOURD_RELEASE_SEC).toBeLessThan(THATCHGRIN_KIT.gourd.windup);
    expect(SUMMON_PEAK_SEC).toBeCloseTo(THATCHGRIN_KIT.callWindup, 5);
  });
});

describe('the effects layer, pure half', () => {
  it('lobs the gourd from hand to ring, peaking over the middle', () => {
    const a = { x: 0, y: 6, z: 0 };
    const b = { x: 20, y: 0, z: 0 };
    expect(gourdArc(a, b, 0, 5)).toEqual(a);
    expect(gourdArc(a, b, 1, 5)).toEqual(b);
    const mid = gourdArc(a, b, 0.5, 5);
    expect(mid.x).toBe(10);
    expect(mid.y).toBe(3 + 5);
    expect(gourdApex(40)).toBeGreaterThan(gourdApex(5));
  });

  it('puts the release hand on his left and in front of him at any facing', () => {
    const at0 = bodyLocalToWorld(0, 0, 0, 1, 2);
    expect(at0.x).toBeCloseTo(1, 6); // his left is +x at facing 0
    expect(at0.z).toBeCloseTo(2, 6); // forward is +z
    const turned = bodyLocalToWorld(0, 0, Math.PI / 2, 0, 3);
    expect(turned.x).toBeCloseTo(3, 6);
    expect(turned.z).toBeCloseTo(0, 6);
  });

  it('burns a patch in, steady, and out, and never thins below a readable floor', () => {
    expect(chaffStrength(0, 8)).toBe(0);
    expect(chaffStrength(4, 8)).toBe(1);
    expect(chaffStrength(7.8, 8)).toBeGreaterThan(0);
    expect(chaffStrength(7.8, 8)).toBeLessThan(0.5);
    expect(chaffStrength(8, 8)).toBe(0);
    expect(chaffFlameCalls(0)).toBeGreaterThanOrEqual(3);
    expect(chaffFlameCalls(1)).toBeGreaterThan(chaffFlameCalls(0));
  });

  it('keeps the selection ring verdict the renderer moved out (a pet follows its owner)', () => {
    const owner = { id: 1, kind: 'player', ownerId: null, hostile: false } as unknown as Entity;
    const pet = { id: 2, kind: 'mob', ownerId: 1, hostile: false } as unknown as Entity;
    const wild = { id: 3, kind: 'mob', ownerId: null, hostile: true } as unknown as Entity;
    const entities = new Map<number, Entity>([
      [1, owner],
      [2, pet],
      [3, wild],
    ]);
    expect(isHostileSelectionTarget(pet, entities, () => true)).toBe(true);
    expect(isHostileSelectionTarget(pet, entities, () => false)).toBe(false);
    expect(isHostileSelectionTarget(wild, entities, () => false)).toBe(true);
    expect(isHostileSelectionTarget(owner, entities, () => true)).toBe(true);
  });
});

describe('his pumpkin patch dressing', () => {
  it('rings the field outside the fight, never inside it, and mostly seats', () => {
    new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    const field = resolveScarecrowField(WORLD_SEED);
    expect(field).not.toBeNull();
    if (!field) return;
    const ring = seasonalDecorLayout(WORLD_SEED).ground.filter((p) =>
      p.anchor.startsWith('field:'),
    );
    expect(ring.length).toBeGreaterThanOrEqual(Math.ceil(SCARECROW_FIELD_RING.count * 0.7));
    for (const p of ring) {
      expect(Math.hypot(p.x - field.x, p.z - field.z)).toBeGreaterThan(SCARECROW_FIELD_RADIUS);
    }
  });
});
