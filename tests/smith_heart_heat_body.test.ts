// The Guardian of the Heat's provisional body (the pure plan
// src/render/smith_heart_fx/heat_body_core.ts and its painter heat_body.ts):
// a giant of the first flame sunk to its waist in its wellspring (matching
// the manifest and the template, melee reaching it from the shore), every
// piece a real node of its kit, the stages owning the body (it sinks all the
// way under through an overflow and climbs back), then Basalt Fist's bar,
// then the one-shots; the fire whitens with the phase, every pose and the
// fall are finite; the painter draws it over the bodyless guardian, sunk to
// its waist, plunges it under with a splash, never claims an event, and
// disposes.

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import { SMITH_HEART_PLACEHOLDER_LOOKS } from '../src/render/characters/smith_heart_placeholder_looks';
import { HeatBody } from '../src/render/smith_heart_fx';
import {
  HEAT_BODY_KITS,
  HEAT_BODY_PIECES,
  HEAT_BODY_SCALE,
  HEAT_FALL,
  HEAT_FULL_SUNK,
  HEAT_HALF_SUNK,
  HEAT_RIG_JOINTS,
  HEAT_SLAM_SECONDS,
  HEAT_SWING_SECONDS,
  HEAT_THREAD_PAIRS,
  type HeatBodyAction,
  type HeatBodyInput,
  HJ,
  heatArm,
  heatBodyAction,
  heatBodyLook,
  heatBodyState,
  heatBodyTop,
  heatFallProgress,
  heatFallRest,
  heatSink,
  heatWhiteness,
  heatWristTarget,
  restJoint,
} from '../src/render/smith_heart_fx/heat_body_core';
import { SMITH_HEART_MOBS } from '../src/sim/content/smith_heart';
import { HEARTH_WELL } from '../src/sim/content/smith_heart_layout';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import {
  HEAT_AURAS,
  HEAT_CASTS,
  HEAT_CUES,
  HEAT_GUARDIAN,
  HEAT_STAGES,
} from '../src/sim/encounters/smith_heart/heat_ids';
import type { Entity, SimEvent } from '../src/sim/types';
import type { IWorld } from '../src/world_api';

const PLAYER = 1.9;
const finite = (p: { x: number; y: number; z: number }) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

function glbNodeNames(url: string): string[] {
  const buf = readFileSync(`public${url}`);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as {
    nodes?: { name?: string }[];
  };
  return (json.nodes ?? []).map((n) => n.name ?? '');
}

const IDLE: HeatBodyInput = {
  castId: null,
  castFill: 0,
  phase: 1,
  stage: HEAT_STAGES.fight,
  stageFill: 0,
  sinceSlam: Number.POSITIVE_INFINITY,
  sinceSwing: Number.POSITIVE_INFINITY,
};

const ACTIONS: HeatBodyAction[] = ['idle', 'swing', 'fist', 'slam', 'sink', 'under', 'rise'];

describe('heat_body_core: the provisional body', () => {
  it('towers out of its wellspring, matching the manifest and the template', () => {
    const look = SMITH_HEART_PLACEHOLDER_LOOKS[HEAT_GUARDIAN];
    expect(look).toBe('smith_heart_heat_guardian');
    const visual = VISUALS[look];
    expect(visual?.bodyless).toBe(true);
    const template = SMITH_HEART_MOBS[HEAT_GUARDIAN];
    // What shows over the lava: the crown less the waist sunk, at its scale.
    const shown = (heatBodyTop() - HEAT_HALF_SUNK) * HEAT_BODY_SCALE;
    expect(Math.abs((visual?.height ?? 0) * (template?.scale ?? 0) - shown)).toBeLessThan(1.5);
    // The Ragnaros scale: five players and more, waist up.
    expect(shown / PLAYER).toBeGreaterThanOrEqual(5);
    // Melee reaches it from the shore: its body is the pool's.
    expect(template?.bodyRadius).toBe(HEARTH_WELL.r);
  });

  it('is built of real kit nodes, nothing of a forge, each piece unique on a real joint', () => {
    const nodes = {
      heat: new Set(glbNodeNames(HEAT_BODY_KITS.heat)),
      heart: new Set(glbNodeNames(HEAT_BODY_KITS.heart)),
    };
    const ids = new Set<string>();
    expect(HEAT_BODY_PIECES.length).toBeGreaterThan(10);
    for (const p of HEAT_BODY_PIECES) {
      expect(nodes[p.kit].has(p.node), `${p.id}: ${p.kit} ${p.node}`).toBe(true);
      expect(/anvil|bellows|hammer|crucible|chain|forge/i.test(p.node), p.node).toBe(false);
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(p.joint).toBeLessThan(HEAT_RIG_JOINTS);
      if (p.to !== undefined) expect(p.to).toBeLessThan(HEAT_RIG_JOINTS);
      expect(p.size.x * p.size.y * p.size.z).toBeGreaterThan(0);
    }
    // Both kits: the colossus basalt and the Hearth's crystal and columns;
    // a white-gold heart of crystal in its chest.
    expect(HEAT_BODY_PIECES.some((p) => p.kit === 'heart')).toBe(true);
    expect(HEAT_BODY_PIECES.some((p) => p.kit === 'heat')).toBe(true);
    expect(HEAT_BODY_PIECES.find((p) => p.id === 'core')?.light).toBe('crystal');
    for (const [a, b] of HEAT_THREAD_PAIRS) {
      expect(a).toBeLessThan(HEAT_RIG_JOINTS);
      expect(b).toBeLessThan(HEAT_RIG_JOINTS);
    }
  });

  it('rests symmetric, feet on the floor and head over the chest', () => {
    for (let i = 0; i < HEAT_RIG_JOINTS; i++) expect(finite(restJoint(i)), `${i}`).toBe(true);
    expect(restJoint(HJ.shoulderL).x).toBeCloseTo(-restJoint(HJ.shoulderR).x);
    expect(restJoint(HJ.footL).y).toBeLessThan(0.5);
    expect(restJoint(HJ.head).y).toBeGreaterThan(restJoint(HJ.chest).y);
  });

  it('lets the stages own the body, then the fist, then the one-shots', () => {
    expect(heatBodyAction(IDLE).action).toBe('idle');
    expect(heatBodyAction({ ...IDLE, stage: HEAT_STAGES.sinking, stageFill: 0.4 })).toEqual({
      action: 'sink',
      k: 0.4,
    });
    expect(
      heatBodyAction({ ...IDLE, stage: HEAT_STAGES.under, castId: HEAT_CASTS.fist }).action,
    ).toBe('under');
    expect(heatBodyAction({ ...IDLE, stage: HEAT_STAGES.rising, stageFill: 2 })).toEqual({
      action: 'rise',
      k: 1,
    });
    expect(
      heatBodyAction({ ...IDLE, castId: HEAT_CASTS.fist, castFill: 0.5, sinceSlam: 0.1 }),
    ).toEqual({ action: 'fist', k: 0.5 });
    expect(heatBodyAction({ ...IDLE, sinceSlam: 0.1, sinceSwing: 0.1 }).action).toBe('slam');
    expect(heatBodyAction({ ...IDLE, sinceSwing: 0.1 }).action).toBe('swing');
    expect(heatBodyAction({ ...IDLE, sinceSlam: HEAT_SLAM_SECONDS + 0.01 }).action).toBe('idle');
    expect(heatBodyAction({ ...IDLE, sinceSwing: HEAT_SWING_SECONDS + 0.01 }).action).toBe('idle');
  });

  it('stands sunk to its waist, goes all the way under, climbs back', () => {
    for (const a of ['idle', 'swing', 'fist', 'slam'] as const)
      expect(heatSink(a, 0.5)).toBe(HEAT_HALF_SUNK);
    expect(heatSink('under', 0)).toBe(HEAT_FULL_SUNK);
    expect(heatSink('sink', 0)).toBeCloseTo(HEAT_HALF_SUNK, 9);
    expect(heatSink('sink', 1)).toBeCloseTo(HEAT_FULL_SUNK, 9);
    expect(heatSink('rise', 0)).toBeCloseTo(HEAT_FULL_SUNK, 9);
    expect(heatSink('rise', 1)).toBeCloseTo(HEAT_HALF_SUNK, 9);
    let last = 0;
    for (let k = 0; k <= 1; k += 0.05) {
      expect(heatSink('sink', k)).toBeGreaterThanOrEqual(last - 1e-9);
      last = heatSink('sink', k);
    }
    // Fully under, nothing of it shows over the lava.
    expect(HEAT_FULL_SUNK).toBeGreaterThanOrEqual(heatBodyTop());
    // Waist deep: the hips under the lava, the chest over it.
    expect(restJoint(HJ.hip).y).toBeLessThan(HEAT_HALF_SUNK + 0.6);
    expect(restJoint(HJ.chest).y).toBeGreaterThan(HEAT_HALF_SUNK);
  });

  it('burns whiter with the phase and flashes as its fist lands', () => {
    expect(heatWhiteness(2)).toBeGreaterThan(heatWhiteness(1));
    expect(heatWhiteness(3)).toBeGreaterThan(heatWhiteness(2));
    expect(heatWhiteness(9)).toBe(heatWhiteness(3));
    expect(heatWhiteness(0)).toBe(heatWhiteness(1));
    const early = heatBodyLook('idle', 0, 1, 1);
    const late = heatBodyLook('idle', 0, 1, 3);
    expect(late.glow).toBeGreaterThan(early.glow);
    expect(late.white).toBeGreaterThan(early.white);
    expect(late.haze).toBeGreaterThan(early.haze);
    expect(early.flash).toBe(0);
    expect(heatBodyLook('slam', 0, 0, 1).flash).toBeGreaterThan(0.5);
    expect(heatBodyLook('fist', 1, 0, 1).glow).toBeGreaterThan(early.glow);
  });

  it('keeps every pose finite; the fist goes up over its head and comes down before it', () => {
    for (const a of ACTIONS)
      for (const k of [0, 0.25, 0.5, 0.75, 1]) {
        const look = heatBodyLook(a, k, 3.7, 1 + 2 * k);
        for (const v of Object.values(look)) expect(Number.isFinite(v), `${a} ${k}`).toBe(true);
        for (const side of [1, -1] as const) {
          const w = heatWristTarget(a, side, k);
          expect(finite(w), `${a} ${k} ${side}`).toBe(true);
          const arm = heatArm(side, w);
          expect(finite(arm.elbow) && finite(arm.wrist), `${a} ${k}`).toBe(true);
        }
      }
    // The fist is its right (side -1): over its head at the top of the bar,
    // then out and down before it at the hit.
    expect(heatWristTarget('fist', -1, 0.8).y).toBeGreaterThan(restJoint(HJ.head).y);
    const hit = heatWristTarget('fist', -1, 1);
    expect(hit.z).toBeGreaterThan(1.5);
    expect(hit.y).toBeLessThan(restJoint(HJ.chest).y);
  });

  it('falls, and reads its phase and stage off its state aura', () => {
    for (let i = 0; i < HEAT_BODY_PIECES.length; i++) {
      const rest = heatFallRest(i, restJoint(HEAT_BODY_PIECES[i].joint));
      expect(finite(rest.at) && finite(rest.tilt)).toBe(true);
      expect(rest.delay + 0.75).toBeLessThanOrEqual(HEAT_FALL.end);
      expect(heatFallProgress(HEAT_FALL.end, rest.delay).landed).toBe(true);
    }
    expect(heatBodyState([{ id: 'x' }])).toEqual({ phase: 0, stage: 0, fill: 0 });
    const st = heatBodyState([
      { id: 'x' },
      { id: HEAT_AURAS.state, value: 2, value2: HEAT_STAGES.sinking, remaining: 1, duration: 4 },
    ]);
    expect(st.phase).toBe(2);
    expect(st.stage).toBe(HEAT_STAGES.sinking);
    expect(st.fill).toBeCloseTo(0.75, 9);
    // An untimed state (a phase's own aura) has no fill.
    expect(
      heatBodyState([{ id: HEAT_AURAS.state, value: 1, remaining: 1e9, duration: 1e9 }]).fill,
    ).toBe(0);
  });
});

describe('HeatBody over a fake world', () => {
  it('draws the giant sunk to its waist, plunges it under with a splash, claims nothing, disposes', () => {
    const o = instanceOrigin(DUNGEONS.smith_heart.index, 0);
    const entity = (id: number, kind: string, templateId: string, x: number, z: number) =>
      ({
        id,
        kind,
        templateId,
        name: templateId,
        pos: { x: o.x + x, y: 0, z: o.z + z },
        prevPos: { x: o.x + x, y: 0, z: o.z + z },
        facing: 0,
        scale: 1,
        hp: 100,
        maxHp: 100,
        dead: false,
        auras: [] as Entity['auras'],
        castingAbility: null as string | null,
        castTargetId: null,
        castRemaining: 0,
        castTotal: 0,
        resource: 0,
        maxResource: 100,
        inCombat: true,
      }) as unknown as Entity;
    const entities = new Map<number, Entity>();
    const me = entity(1, 'player', 'warrior', -206, 0);
    const boss = entity(2, 'mob', HEAT_GUARDIAN, HEARTH_WELL.x, HEARTH_WELL.z);
    entities.set(me.id, me);
    entities.set(boss.id, boss);
    const world = {
      entities,
      player: me,
      playerId: me.id,
      entityRosterVersion: 1,
    } as unknown as IWorld;
    const scene = new THREE.Scene();
    let shaken = 0;
    const body = new HeatBody(
      scene,
      () => 0,
      world,
      undefined,
      () => false,
      (a) => {
        shaken += a;
      },
    );
    const state = (stage: number, remaining = 1e9, duration = 1e9) => {
      boss.auras.length = 0;
      boss.auras.push({
        id: HEAT_AURAS.state,
        value: 1,
        value2: stage,
        remaining,
        duration,
      } as unknown as Entity['auras'][number]);
    };
    state(HEAT_STAGES.fight);
    for (let i = 0; i < 6; i++) body.update(1 / 20);
    const group = scene.getObjectByName('smithHeartHeatBody');
    expect(group?.visible).toBe(true);
    expect(group?.position.x).toBeCloseTo(boss.pos.x, 6);
    expect(group?.position.y).toBeCloseTo(-HEAT_HALF_SUNK * HEAT_BODY_SCALE, 6);
    expect(group?.scale.x).toBeCloseTo(HEAT_BODY_SCALE, 9);
    // Its fist lands: no claim.
    const land = {
      type: 'spellfxAt',
      x: boss.pos.x + 12,
      z: boss.pos.z,
      radius: 6,
      school: 'fire',
      fx: 'burst',
      ability: HEAT_CUES.fist,
    } as unknown as SimEvent;
    expect(body.handleEvent(land)).toBe(false);
    // The overflow: it sinks all the way under, a splash and a shake.
    state(HEAT_STAGES.sinking, 0.01, 3);
    body.update(1 / 20);
    state(HEAT_STAGES.under);
    for (let i = 0; i < 4; i++) body.update(1 / 20);
    expect(group?.position.y).toBeCloseTo(-HEAT_FULL_SUNK * HEAT_BODY_SCALE, 6);
    expect(shaken).toBeGreaterThan(0);
    (boss as { dead: boolean }).dead = true;
    for (let i = 0; i < 80; i++) body.update(1 / 20);
    body.dispose();
    expect(scene.getObjectByName('smith-heart-heat-body')).toBeUndefined();
  });
});
