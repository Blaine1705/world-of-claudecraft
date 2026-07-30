// Pure, host-agnostic core for the gathering HUD (issue 1124): per-viewer node
// ready/cooldown classification plus the gathering-proficiency display rows.
//
// DOM/Three-free so tests/gathering_view.test.ts can drive it directly. Two
// consumers read this core's output:
//   - minimap_markers.ts projects nearby node positions to canvas pixels and
//     asks classifyGatherNode for each one's ready/cooldown state (the
//     world-space indicator, see IWorldProfessions#nodeHarvestableByMe).
//   - char_window.ts renders buildGatheringProficiencyRows as the "Gathering"
//     section of the character sheet (the proficiency read surface, see
//     IWorldProfessions#professionsState).
//
// `nodeHarvestableByMe` is per-VIEWER (see src/world_api/professions.ts): two
// different IWorld-shaped inputs (one per player) asking about the SAME node
// id can and do return different states, because each player's respawn timer
// for a node is independent. This core never assumes otherwise: it always
// re-resolves through the passed-in `world`, never caches across callers.

import {
  GATHERING_PROFESSION_IDS,
  GATHERING_PROFESSIONS,
  type GatheringProfessionId,
} from '../sim/content/professions';
import { GATHER_NODES, ITEMS } from '../sim/data';
import { NODE_HARVEST_TABLE } from '../sim/professions/gathering';
import { canGatherTier } from '../sim/professions/tools';
import {
  bestWieldableGatherToolTierOrNone,
  minWieldRequirementToWork,
} from '../sim/professions/wield_gate';
import type { GatherNodeDef } from '../sim/types';
import type { IWorld } from '../world_api';
import type { TranslationKey } from './i18n.catalog';

/** Whether a gather node is harvestable right now for the local viewer, or on
 *  cooldown for them specifically (another player may see the opposite state
 *  for the same node id). */
export type GatherNodeState = 'ready' | 'cooldown';

/** Resolves one node's per-viewer state via IWorldProfessions#nodeHarvestableByMe. */
export function classifyGatherNode(world: IWorld, nodeId: string): GatherNodeState {
  return world.nodeHarvestableByMe(nodeId) ? 'ready' : 'cooldown';
}

/** The viewer's best USABLE gatherTool tier for one gathering profession:
 *  the same IWorld bags read the bags window renders
 *  (IWorldInventory#inventory), filtered by the R22 wield gate against the
 *  viewer's own counter (the plain `gatheringProficiency` map both worlds
 *  expose and the vendor advisory already reads: the Sim getter copies the
 *  live map, ClientWorld mirrors the gprof wire field). Guarded end to end:
 *  a partial IWorld stub or a malformed mirror reads undefined here, and
 *  bestWieldableGatherToolTierOrNone coerces absent-or-malformed to 0,
 *  which LOCKS (the documented fail-closed contract; a thrown read one
 *  level above the coercion would defeat it). 0 means nothing usable at
 *  all (#2343: bare hands never gather, so every node, tier 1 included,
 *  reads locked without a usable tool). This is the ONE client-side scan:
 *  the minimap lock, the node tooltip, and the interact pre-verdict all
 *  read it, so what the client shows can never disagree with what the
 *  sim's wield-filtered harvest gate refuses. Fishing passes through
 *  unfiltered inside the shared resolver (rods are R22-exempt). */
export function viewerUsableToolTier(
  world: IWorld,
  professionId: GatheringProfessionId,
  // A caller resolving several professions in one pass (the minimap's
  // 10 Hz marker build) hands the map it already read: the offline world's
  // gatheringProficiency getter COPIES the live map per access, so
  // re-reading it per profession is per-build garbage the reference probe
  // cannot see. Single-callers omit it and read through as before. The
  // pairing is on the caller: hand the map from THE SAME world as the bags,
  // read within the same synchronous pass (nothing guards a cross-world or
  // held-over map).
  proficiency: Readonly<Record<string, number>> | undefined = world.gatheringProficiency,
): number {
  const skill = proficiency?.[professionId];
  return bestWieldableGatherToolTierOrNone(world.inventory, professionId, skill, ITEMS);
}

/** Whether a node of this tier is tool-locked for the viewer: a SEPARATE
 *  dimension from ready/cooldown (respawn state), so the minimap can compose
 *  both. Uses the sim's own canGatherTier comparator, never a local copy. */
export function isNodeToolLockedFor(
  world: IWorld,
  node: Pick<GatherNodeDef, 'type' | 'tier'>,
): boolean {
  return !canGatherTier(
    viewerUsableToolTier(world, NODE_HARVEST_TABLE[node.type].professionId),
    node.tier,
  );
}

/** One nearby gather node, classified for the local viewer. `locked` is the
 *  tool-tier access dimension; `state` stays the respawn dimension. */
export interface NearbyGatherNode {
  id: string;
  type: GatherNodeDef['type'];
  x: number;
  z: number;
  state: GatherNodeState;
  tier: number;
  locked: boolean;
}

/** All GATHER_NODES within `radiusYd` of the viewer's current position,
 *  classified ready/cooldown for that viewer. Flat 2D distance (node
 *  placements carry no y, matching sim/professions/gathering.ts). */
export function buildNearbyGatherNodes(world: IWorld, radiusYd: number): NearbyGatherNode[] {
  const p = world.player;
  const out: NearbyGatherNode[] = [];
  for (const node of GATHER_NODES) {
    const dx = node.pos.x - p.pos.x;
    const dz = node.pos.z - p.pos.z;
    if (Math.sqrt(dx * dx + dz * dz) > radiusYd) continue;
    out.push({
      id: node.id,
      type: node.type,
      x: node.pos.x,
      z: node.pos.z,
      state: classifyGatherNode(world, node.id),
      tier: node.tier,
      locked: isNodeToolLockedFor(world, node),
    });
  }
  return out;
}

/** Everything the gather-node hover tooltip renders, resolved for
 *  the local viewer: name by node family, the access-tier requirement, whether
 *  the viewer's best USABLE tool meets it (owned-but-unearned locks, R22),
 *  the wield shortfall when that is the lock, and the respawn state. Null for an
 *  unknown node id (a stale pick after a content change). */
export interface GatherNodeTooltipModel {
  type: GatherNodeDef['type'];
  professionId: GatheringProfessionId;
  tier: number;
  /** True when the viewer cannot work this node: no covering USABLE tool
   *  (the wield-filtered scan; 0 owned and owned-but-unearned both lock). */
  locked: boolean;
  /** The R22 wield arm, present exactly when the lock is a COUNTER
   *  shortfall: a covering tool is already carried and this is the smallest
   *  proficiency that would put something owned to work (the same
   *  minWieldRequirementToWork the sim's denial names). Absent when the
   *  lock is a plain tool/tier shortfall, so the painter keeps the tier
   *  line for that arm. */
  wieldSkill?: number;
  state: GatherNodeState;
}

export function buildGatherNodeTooltip(
  world: IWorld,
  nodeId: string,
): GatherNodeTooltipModel | null {
  const node = GATHER_NODES.find((n) => n.id === nodeId);
  if (!node) return null;
  const professionId = NODE_HARVEST_TABLE[node.type].professionId;
  const locked = isNodeToolLockedFor(world, node);
  const wieldReq = locked
    ? minWieldRequirementToWork(world.inventory, professionId, node.tier, ITEMS)
    : null;
  return {
    type: node.type,
    professionId,
    tier: node.tier,
    locked,
    ...(wieldReq !== null && wieldReq > 0 ? { wieldSkill: wieldReq } : {}),
    state: classifyGatherNode(world, node.id),
  };
}

/** The i18n key the gatherDenied SimEvent's error toast resolves (the sim is
 *  text-free: the client composes its own copy off surface + professionId +
 *  requiredTier). Surface 'fishing' carries BOTH fishing denials and splits on
 *  requiredTier exactly like the node arm below: tier 1 is the startFishing
 *  implement gate (#2343, no tackle at all, so no tier is named), tier 2 and
 *  up is the zone rod gate (D9, this water takes a better rod, so the tier IS
 *  named). Without the split a player standing in Thornpeak holding a tier-2
 *  rod would be told to go and get a fishing pole they are already carrying.
 *  Surface 'node' splits the same way; anything unexpected falls back to the
 *  profession-neutral corpse line. */
export function gatherDeniedLineKey(
  surface: 'node' | 'corpse' | 'fishing',
  professionId?: GatheringProfessionId,
  requiredTier?: number,
  wieldProficiency?: number,
): TranslationKey {
  if (surface === 'fishing') {
    return requiredTier !== undefined && requiredTier > 1
      ? 'hudChrome.gathering.toolTierUnmet.fishing'
      : 'hudChrome.gathering.toolRequired.fishing';
  }
  if (surface === 'node') {
    if (professionId === 'mining' || professionId === 'logging' || professionId === 'herbalism') {
      // The R22 wield arm outranks the tier arms: when the event carries a
      // wield requirement, the player already OWNS a covering tool and the
      // actionable fact is the counter, not the tier.
      if (wieldProficiency !== undefined && wieldProficiency > 0) {
        return `hudChrome.gathering.wieldUnmet.${professionId}`;
      }
      return requiredTier !== undefined && requiredTier <= 1
        ? `hudChrome.gathering.toolRequired.${professionId}`
        : `hudChrome.gathering.toolTierUnmet.${professionId}`;
    }
  }
  if (wieldProficiency !== undefined && wieldProficiency > 0) {
    return 'hudChrome.gathering.wieldUnmetCorpse';
  }
  return 'hudChrome.gathering.toolTierUnmetCorpse';
}

/** The i18n key the gatherToolNoNode SimEvent's error toast resolves (#2343:
 *  a gathering tool was used from the bags with no matching node within
 *  reach). Fishing never emits it (rods route to startFishing), so anything
 *  but the three node professions takes a safe fallback. */
export function gatherToolNoNodeKey(professionId: GatheringProfessionId): TranslationKey {
  if (professionId === 'logging' || professionId === 'herbalism') {
    return `hudChrome.gathering.noNodeNearby.${professionId}`;
  }
  return 'hudChrome.gathering.noNodeNearby.mining';
}

/** The i18n key the gatherDowngrade SimEvent's toast resolves (the
 *  sim is text-free): 'mark' means the yield arrived as a plain unsigned
 *  top-up, 'find' means a pure-extra specimen jackpot was dropped outright. */
export function gatherDowngradeLineKey(lost: 'mark' | 'find'): TranslationKey {
  return lost === 'find'
    ? 'hudChrome.gathering.downgradeFind'
    : 'hudChrome.gathering.downgradeMark';
}

/** Which layered rarity stinger (if any) a gather's loot event should play on
 *  top of the node-type impact cue. A rare event forces at least the epic
 *  stinger regardless of the rolled material rarity (a rare event is rarer
 *  than a legendary material roll at every proficiency level:
 *  GATHER_RARE_EVENT_CHANCE is a flat 1/90 draw, gather_events.ts); otherwise
 *  the stinger tracks the rolled tier 1:1. common/uncommon get no stinger. */
export function gatherRareTierFor(
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary',
  rareEvent: unknown,
): 'rare' | 'epic' | 'legendary' | null {
  if (rarity === 'legendary') return 'legendary';
  if (rarity === 'epic' || rareEvent !== null) return 'epic';
  if (rarity === 'rare') return 'rare';
  return null;
}

/** One row of the gathering-proficiency display: a profession id plus its
 *  current point value, in the fixed GATHERING_PROFESSION_IDS order. `value`
 *  is the raw, possibly fractional proficiency (the repaint-signature input,
 *  full granularity); `displayValue` floors it for readouts, the
 *  buildSkillBar convention (issue 2339): a fractional value never rounds a
 *  threshold forward, so 99.5 reads 99, not a fake crossed 100 while the
 *  100-proficiency deed is still locked. `maxSkill` is the profession's
 *  content cap, carried so every readout can render a DENOMINATOR: a bare
 *  moving integer is what reads as a character level to a new player. */
export interface GatheringProficiencyRow {
  professionId: GatheringProfessionId;
  value: number;
  displayValue: number;
  maxSkill: number;
}

/** Builds the proficiency display rows from IWorldProfessions#professionsState,
 *  in the fixed profession order, defaulting an absent/malformed entry to 0.
 *  The cap comes from the GATHERING_PROFESSIONS content table rather than the
 *  per-row wire value: it is the same number (gatheringSkillsView projects it
 *  from this very table) but it is total, so a missing or malformed skills row
 *  can never produce a nonsense "12 / 0" denominator. */
export function buildGatheringProficiencyRows(world: IWorld): GatheringProficiencyRow[] {
  const bySkill = new Map(world.professionsState.skills.map((s) => [s.professionId, s.skill]));
  return GATHERING_PROFESSION_IDS.map((professionId) => {
    const raw = bySkill.get(professionId);
    const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0;
    return {
      professionId,
      value,
      displayValue: Math.floor(value),
      maxSkill: GATHERING_PROFESSIONS[professionId].maxSkill,
    };
  });
}
