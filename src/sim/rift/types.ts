// Procedural "Rift" dungeons: the seed-driven, infinitely varied instanced
// dungeon system. A rift is generated ENTIRELY from a compact descriptor
// (seed + baseLevel), so the authoritative server and every client regenerate
// byte-identical geometry, mobs, and mechanics from the same pure functions in
// rift_gen.ts. Nothing about a rift is transmitted except that descriptor plus
// the player's current floor + the instance origin.
//
// Sim layer: no DOM/Three imports. This file is types only.

import type { DungeonLayout, InteriorStyle } from '../dungeon_layout';

/** The whole wire/persistence footprint of a rift instance. Both hosts turn this
 * into identical content via rift_gen. `origin` is the instance-space anchor the
 * floor's local coordinates are offset by (see rift/runs.ts). */
export interface RiftDescriptor {
  seed: number;
  baseLevel: number;
  floorIndex: number;
  origin: { x: number; z: number };
}

/** One placed creature, instance-local. `color`/`scale` are per-run re-grades of
 * the base template so the same creature reads differently across rifts; when
 * omitted the template's own values are used. `level` is already resolved. */
export interface RiftSpawn {
  templateId: string;
  x: number;
  z: number;
  level: number;
  boss?: boolean;
  color?: number;
  scale?: number;
}

export type RiftObjectKind = 'descent' | 'exit' | 'rune_pylon' | 'chest';

/** A placed interactable, instance-local. `descent` sinks the party to the next
 * floor; `exit` returns them to the overworld; `rune_pylon` is a puzzle node;
 * `chest` is the floor reward. */
export interface RiftObjectPlan {
  kind: RiftObjectKind;
  x: number;
  z: number;
  name: string;
}

/** The floor's gate mechanic. `none` = clear-to-open (the descent unlocks once
 * every hostile on the floor is dead). `rune_pylons` = a light puzzle: every
 * pylon must be lit (walk-on) before the descent opens, on top of the clear. */
export type RiftPuzzleKind = 'none' | 'rune_pylons';

export interface RiftPuzzle {
  kind: RiftPuzzleKind;
  /** Pylon interactable count for `rune_pylons`; 0 otherwise. */
  pylonCount: number;
}

/** A fully-resolved floor: geometry + visual style + spawn plan + gate. */
export interface RiftFloorPlan {
  seed: number;
  baseLevel: number;
  floorIndex: number;
  floorCount: number;
  isBoss: boolean;
  /** Human-facing floor label, e.g. "Emberforge Reaches — Depth 2". */
  name: string;
  /** Short environment-type label for the HUD, e.g. "Emberforge". */
  themeName: string;
  layout: DungeonLayout;
  style: InteriorStyle;
  /** Player arrival point, instance-local (just inside the entrance porch). */
  entry: { x: number; z: number };
  spawns: RiftSpawn[];
  objects: RiftObjectPlan[];
  puzzle: RiftPuzzle;
}

/** Live per-instance state for an active rift (a Sim field, one per slot in the
 * rift pool). A slot holds ONE floor at a time; descending regenerates it in
 * place. `partyKey` null = the slot is free. */
export interface RiftInstance {
  slot: number;
  partyKey: string | null;
  seed: number;
  baseLevel: number;
  floorIndex: number;
  floorCount: number;
  mobIds: number[];
  objectIds: number[];
  bossId: number | null;
  exitId: number | null;
  /** Planned descent-portal position (instance-local), spawned on clear. */
  descentAt: { x: number; z: number } | null;
  descentId: number | null;
  descentOpen: boolean;
  pylonIds: number[];
  litPylons: Set<number>;
  pylonTotal: number;
  /** Overworld position to return the player to when they leave. */
  returnPos: { x: number; z: number };
  emptyFor: number;
}

/** The rift as a whole (derived from the descriptor's seed + baseLevel), used for
 * naming/announcements and to know how many floors deep it runs. */
export interface RiftPlan {
  seed: number;
  baseLevel: number;
  /** Rift proper noun, e.g. "The Emberforge Abyss". */
  name: string;
  /** Theme id of the final (boss) floor, which names the rift. */
  themeId: string;
  floorCount: number;
}
