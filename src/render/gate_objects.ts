// Object views for gate entities: the Ignivar raid's herald and lift gates
// (ignivar_raid_gate.ts) and the in-dungeon gates and seals of an authored
// field (sim/instances/dungeon_gates.ts). One plan, one builder, one call site
// in the renderer's view pipeline.
//
// An in-dungeon gate's STRUCTURE (the portcullis, the bone bridge, the ward)
// is part of the interior and animates there; its entity view is an empty
// anchor that reports the state it mirrors to the gate memory
// (hollow_crypt/crypt_gate_state_core.ts), so every template swap the view
// pipeline rebuilds on becomes a reveal instead of a pop.

import * as THREE from 'three';
import { DUNGEONS, instanceOrigin, instanceSlotForZ } from '../sim/data';
import { dungeonGateAt, dungeonGateStateOf } from '../sim/instances/dungeon_gates';
import { sharedUniforms } from './gfx';
import { gateMemoryKey, observeGate } from './hollow_crypt/crypt_gate_state_core';
import {
  buildIgnivarRaidGate,
  type IgnivarRaidGatePlan,
  ignivarRaidGatePlan,
} from './ignivar_raid_gate';

export interface DungeonGateAnchorPlan {
  dungeonGate: true;
  key: string;
  templateId: string;
  height: number;
}

export type GateObjectPlan = IgnivarRaidGatePlan | DungeonGateAnchorPlan;

interface GateEntityLike {
  templateId: string;
  dungeonId: string | null;
  pos: { x: number; z: number };
}

/** The gate view plan for an object entity, or null when it is no gate. */
export function gateObjectPlan(e: GateEntityLike): GateObjectPlan | null {
  const raid = ignivarRaidGatePlan(e.templateId, e.dungeonId);
  if (raid) return raid;
  if (dungeonGateStateOf(e.templateId) === null || !e.dungeonId) return null;
  const def = DUNGEONS[e.dungeonId];
  if (!def) return null;
  const o = instanceOrigin(def.index, instanceSlotForZ(e.pos.z));
  const gate = dungeonGateAt(e.dungeonId, e.pos.x - o.x, e.pos.z - o.z);
  if (!gate) return null;
  return {
    dungeonGate: true,
    key: gateMemoryKey(o.x, o.z, gate.id),
    templateId: e.templateId,
    height: 8,
  };
}

/** Build the view body for a gate plan. */
export function buildGateObject(plan: GateObjectPlan): THREE.Group {
  if ('dungeonGate' in plan) {
    observeGate(plan.key, plan.templateId, sharedUniforms.uTime.value);
    const anchor = new THREE.Group();
    anchor.name = 'dungeonGateAnchor';
    return anchor;
  }
  return buildIgnivarRaidGate(plan);
}
