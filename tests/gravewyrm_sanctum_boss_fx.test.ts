// SanctumBossFx (render/gravewyrm_sanctum_bosses/sanctum_boss_fx.ts) driven by
// a hand-built world: it binds the chain, plate, meltwater and statue objects
// the sim spawns, lays the boss bars' telegraphs, sends the presentation
// gestures, claims the boss beats it draws and replays the body's clip for
// them, and never throws through a fight's states.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SanctumBossFx } from '../src/render/gravewyrm_sanctum_bosses';
import {
  KORZUL_FROZEN_STANCE,
  KORZUL_HEARTBEAT_GESTURE,
  KORZUL_TAKEOFF_GESTURE,
  VELKHAR_THAW_GESTURE,
} from '../src/render/gravewyrm_sanctum_bosses/boss_model_core';
import {
  KORGATH_CHAIN_BREAK,
  KORGATH_ENRAGE,
  KORGATH_ID,
  KORGATH_STRAIN,
  KORZUL_AIRBORNE,
  KORZUL_GRAVE_BREATH,
  KORZUL_ID,
  KORZUL_WYRMS_EYE,
  plateTemplate,
  SANCTUM_HELD_STATUE,
  SANCTUM_MELT_STRIP,
  SANCTUM_PYRE_FLARE,
  SANCTUM_QUENCH_WATER,
  sanctumStoryTemplate,
  sealChainTemplate,
  VELKHAR_ID,
} from '../src/sim/encounters/gravewyrm_sanctum/ids';
import type { Entity, SimEvent } from '../src/sim/types';
import type { IWorld } from '../src/world_api';

let nextId = 1;
function ent(kind: string, templateId: string, x: number, z: number, extra: object = {}): Entity {
  return {
    id: nextId++,
    kind,
    templateId,
    pos: { x, y: 0, z },
    facing: 0,
    scale: 1,
    dead: false,
    inCombat: false,
    hp: 100,
    maxHp: 100,
    auras: [],
    castingAbility: null,
    castRemaining: 0,
    castTotal: 0,
    ...extra,
  } as unknown as Entity;
}

function setup() {
  nextId = 1;
  const entities = new Map<number, Entity>();
  const add = (e: Entity) => {
    entities.set(e.id, e);
    return e;
  };
  const me = add(ent('player', 'p', 0, 0));
  const world = { entities, playerId: me.id } as unknown as IWorld;
  const gestures: [number, string][] = [];
  const scene = new THREE.Scene();
  const fx = new SanctumBossFx(
    scene,
    () => 0,
    world,
    undefined,
    () => false,
    () => {},
    (id, g) => gestures.push([id, g]),
  );
  return { fx, add, entities, gestures, scene, me };
}

describe('SanctumBossFx', () => {
  it('draws Korgath chains, his Strain and a chain break, and replays ChainBreak on him', () => {
    const { fx, add, gestures } = setup();
    const korgath = add(ent('mob', KORGATH_ID, 0, -22, { inCombat: true, scale: 1.5 }));
    const chain = add(ent('object', sealChainTemplate('hammer', 'intact'), -10.5, -12));
    add(ent('object', sealChainTemplate('tongs', 'broken'), 10.5, -12));
    fx.update(0.2);
    korgath.castingAbility = KORGATH_STRAIN;
    korgath.castTotal = 2;
    korgath.castRemaining = 1;
    fx.update(0.2);
    // The broken tongs chain asks for the broken mesh, the whole hammer for none.
    expect(gestures).toContainEqual([korgath.id, 'sanctum_korgath_broken_tongs']);
    expect(gestures).toContainEqual([korgath.id, 'sanctum_korgath_whole_hammer']);
    const ev = {
      type: 'spellfx',
      sourceId: chain.id,
      targetId: chain.id,
      school: 'frost',
      fx: 'nova',
      ability: KORGATH_CHAIN_BREAK,
    } as unknown as SimEvent;
    expect(fx.handleEvent(ev)).toBe(true);
    expect(gestures).toContainEqual([korgath.id, KORGATH_CHAIN_BREAK]);
    const enrage = { ...ev, sourceId: korgath.id, ability: KORGATH_ENRAGE } as SimEvent;
    expect(fx.handleEvent(enrage)).toBe(true);
    expect(gestures).toContainEqual([korgath.id, KORGATH_ENRAGE]);
    for (let i = 0; i < 20; i++) fx.update(0.05);
    fx.dispose();
  });

  it('plays Velkhar thaw off a pyre flare and lays the meltwater and statues', () => {
    const { fx, add, gestures } = setup();
    const velkhar = add(ent('mob', VELKHAR_ID, 0, 107, { inCombat: true }));
    add(ent('object', SANCTUM_PYRE_FLARE, 0, 117.5, { scale: 7 }));
    add(ent('object', SANCTUM_MELT_STRIP, -5, 100, { scale: 30, facing: 0.4 }));
    add(ent('object', SANCTUM_HELD_STATUE, 3, 104));
    fx.update(0.2);
    fx.update(0.2);
    expect(gestures).toContainEqual([velkhar.id, VELKHAR_THAW_GESTURE]);
    fx.dispose();
  });

  it('holds Korzul frozen before his pull, then takes off with the airborne aura', () => {
    const { fx, add, gestures, me, entities } = setup();
    add(ent('object', sanctumStoryTemplate(7), 0, 150));
    const korzul = add(ent('mob', KORZUL_ID, 0, 214, { scale: 1.8 }));
    for (let i = 0; i < 19; i++)
      add(ent('object', plateTemplate(i === 3 ? 'cracked' : 'sound', 6), i * 4, 192, { scale: 8 }));
    fx.update(0.6);
    expect(gestures).toContainEqual([korzul.id, KORZUL_FROZEN_STANCE]);
    korzul.inCombat = true;
    korzul.castingAbility = KORZUL_GRAVE_BREATH;
    korzul.castTotal = 2;
    korzul.castRemaining = 1;
    me.auras.push({ id: KORZUL_WYRMS_EYE } as never, { id: SANCTUM_QUENCH_WATER } as never);
    fx.update(0.6);
    korzul.castingAbility = null;
    korzul.auras.push({ id: KORZUL_AIRBORNE } as never);
    fx.update(0.6);
    expect(gestures).toContainEqual([korzul.id, KORZUL_TAKEOFF_GESTURE]);
    // The heart-shard beats.
    expect(gestures).toContainEqual([korzul.id, KORZUL_HEARTBEAT_GESTURE]);
    expect(entities.size).toBeGreaterThan(19);
    fx.dispose();
  });
});
