// Gatherable world nodes: ore veins, wood stands, herb patches. Placed as
// permanent, unowned world fixtures; visibility only (see G3 for harvesting).
// Adding a new node type or placement should touch only this file plus the
// render prop lookup that draws it (src/render/gather_nodes.ts).

import type { GatherNodeDef, GatherNodeType } from '../types';

export const GATHER_NODE_TYPES: readonly GatherNodeType[] = ['ore', 'wood', 'herb'];

// `level` (issue: profession XP) is a one-time snapshot of each node's zone
// levelRange midpoint (eastbrook_vale [1,7] -> 4; mirefen_marsh, zone2's
// levelRange [6,13] -> 10), not a live lookup: see types.ts GatherNodeDef.
export const GATHER_NODES: GatherNodeDef[] = [
  // Eastbrook Vale (eastbrook_vale), ore around the Copper Dig outcrops (the
  // zone's mine-themed POI, zone1.ts pois); moved here from Boar Meadow (a
  // wolf/boar mob area with no mining flavor and no discoverable landmark)
  // so q_prof_intro's ore veins actually sit somewhere players can find them.
  // Nudged toward the town-facing edge of the tunnel_rat camp (center -82,-62,
  // radius 20) so a level 1-2 miner picking up q_prof_intro can reach ore
  // without crossing all the way to the camp's interior first.
  {
    id: 'ore_eastbrook_1',
    zoneId: 'eastbrook_vale',
    type: 'ore',
    pos: { x: -70, z: -53 },
    level: 4,
    tier: 1,
  },
  {
    id: 'ore_eastbrook_2',
    zoneId: 'eastbrook_vale',
    type: 'ore',
    pos: { x: -73, z: -49 },
    level: 4,
    tier: 1,
  },
  {
    id: 'ore_eastbrook_3',
    zoneId: 'eastbrook_vale',
    type: 'ore',
    pos: { x: -67, z: -57 },
    level: 4,
    tier: 1,
  },

  // Eastbrook Vale, wood stands around Webwood
  {
    id: 'wood_eastbrook_1',
    zoneId: 'eastbrook_vale',
    type: 'wood',
    pos: { x: -62, z: 8 },
    level: 4,
    tier: 1,
  },
  {
    id: 'wood_eastbrook_2',
    zoneId: 'eastbrook_vale',
    type: 'wood',
    pos: { x: -57, z: -6 },
    level: 4,
    tier: 1,
  },
  {
    id: 'wood_eastbrook_3',
    zoneId: 'eastbrook_vale',
    type: 'wood',
    pos: { x: -68, z: 18 },
    level: 4,
    tier: 1,
  },

  // Eastbrook Vale, herb patches along Mirror Lake's bank. All three used to sit
  // ON the lake floor, about 4 yards under the surface (the lake is centred at
  // (-92, 88) with radius 30, and its basin bottoms out at waterLevel - 4), so
  // the only way to pick a herb in the starting zone was to swim to the bottom
  // of a lake, and none of the three had anywhere inside harvest reach a player
  // could stand. They now run along the dry bank 33 to 36 yards out from the
  // lake centre, still in sight of the water, clearing its surface by 3.2 to 4.4
  // yards on ground flat enough to work.
  // tests/gather_node_placement.test.ts pins every arm.
  //
  // One deliberate consequence: the old spots sat inside the Mirror Lake POI's
  // 20-yard visit radius, so a herbalist used to be credited that landmark just
  // by picking here, and the bank is 10 to 14 yards outside it. Wayfarer of the
  // Vale now asks for an actual walk to the shore, which is what a landmark
  // ought to ask, and the walk stays dry: the visit radius holds plenty of dry
  // standable ground, up to 4.96 yards of freeboard, so nothing about that deed
  // requires swimming. tests/gather_node_placement.test.ts pins that property
  // too, since after this change nothing else in the suite touches that POI.
  {
    id: 'herb_eastbrook_1',
    zoneId: 'eastbrook_vale',
    type: 'herb',
    pos: { x: -59, z: 91 },
    level: 4,
    tier: 1,
  },
  {
    id: 'herb_eastbrook_2',
    zoneId: 'eastbrook_vale',
    type: 'herb',
    pos: { x: -57, z: 82 },
    level: 4,
    tier: 1,
  },
  {
    id: 'herb_eastbrook_3',
    zoneId: 'eastbrook_vale',
    type: 'herb',
    pos: { x: -58, z: 99 },
    level: 4,
    tier: 1,
  },

  // Mirefen Marsh (mirefen_marsh)
  {
    id: 'ore_mirefen_1',
    zoneId: 'mirefen_marsh',
    type: 'ore',
    pos: { x: 40, z: 340 },
    level: 10,
    tier: 1,
  },
  {
    id: 'ore_mirefen_2',
    zoneId: 'mirefen_marsh',
    type: 'ore',
    pos: { x: -30, z: 360 },
    level: 10,
    tier: 1,
  },
  {
    id: 'ore_mirefen_3',
    zoneId: 'mirefen_marsh',
    type: 'ore',
    pos: { x: 35, z: 345 },
    level: 10,
    tier: 1,
  },

  {
    id: 'wood_mirefen_1',
    zoneId: 'mirefen_marsh',
    type: 'wood',
    pos: { x: 10, z: 330 },
    level: 10,
    tier: 1,
  },
  {
    id: 'wood_mirefen_2',
    zoneId: 'mirefen_marsh',
    type: 'wood',
    pos: { x: -15, z: 355 },
    level: 10,
    tier: 1,
  },
  {
    id: 'wood_mirefen_3',
    zoneId: 'mirefen_marsh',
    type: 'wood',
    pos: { x: -20, z: 315 },
    level: 10,
    tier: 1,
  },

  // Two of the three marsh herb patches were also on a lake floor, each in the
  // dead centre of one of the zone's two smaller pools ((60, 380) radius 25 and
  // (-40, 450) radius 20), about 4 yards under. Both moved out to the dry shore
  // of the same pool, so a marsh herb still grows by marsh water and the patch
  // is workable. herb_mirefen_3 was already on dry ground and has not moved.
  {
    id: 'herb_mirefen_1',
    zoneId: 'mirefen_marsh',
    type: 'herb',
    pos: { x: 29, z: 395 },
    level: 10,
    tier: 1,
  },
  {
    id: 'herb_mirefen_2',
    zoneId: 'mirefen_marsh',
    type: 'herb',
    pos: { x: -66, z: 458 },
    level: 10,
    tier: 1,
  },
  {
    id: 'herb_mirefen_3',
    zoneId: 'mirefen_marsh',
    type: 'herb',
    pos: { x: 30, z: 355 },
    level: 10,
    tier: 1,
  },

  // Thornpeak Heights (thornpeak_heights) had no gather nodes at all, forcing
  // higher-level players back down to zone 1 for every mining/logging/herb
  // trip. Ore sits by Deeprock Burrows (the zone's mine-themed POI, guarded by
  // the deeprock_kobold camp, matching the eastbrook_vale ore-vs-tunnel_rat
  // precedent); wood sits near The Glimmermere and herb near Highwatch.
  {
    id: 'ore_thornpeak_1',
    zoneId: 'thornpeak_heights',
    type: 'ore',
    pos: { x: 90, z: 608 },
    level: 17,
    tier: 1,
  },
  {
    id: 'ore_thornpeak_2',
    zoneId: 'thornpeak_heights',
    type: 'ore',
    pos: { x: 78, z: 630 },
    level: 17,
    tier: 1,
  },

  // This stand was the near-vertical one: it stood in the Glimmermere shallows
  // with only 0.46 yards of freeboard, and the lake wall inside its own harvest
  // reach climbs at 3.28 rise/run against a movement climb limit of 1.5, so a
  // player working it was pushed off the face. The node itself measured a
  // walkable 0.94, which is why nothing short of a reach sweep found it. Moved
  // round to a rise 13 yards out from the lake centre. That is still inside the
  // Glimmermere's authored 18-yard disc, so this is a hummock standing 5 yards
  // clear of the water plane rather than a shore, which is fine: what the old
  // spot got wrong was the 0.46 yards of freeboard and the wall, and this has
  // 5.00 and stays under 0.94 across the whole reach. Nearer the lake than
  // before, and still the anchor the tier-2 stand sits a short walk from
  // (18.7 yards). It also happens to sit clear of every mob camp radius, as the
  // old spot did, which is worth keeping if a later edit moves it again: damage
  // cancels a gather cast outright rather than pushing it back, so a contested
  // patch is materially harder to work. Not a rule, though, and no arm pins it:
  // a third of the shipped nodes sit inside a camp on purpose.
  {
    id: 'wood_thornpeak_1',
    zoneId: 'thornpeak_heights',
    type: 'wood',
    pos: { x: -63, z: 771 },
    level: 17,
    tier: 1,
  },
  {
    id: 'wood_thornpeak_2',
    zoneId: 'thornpeak_heights',
    type: 'wood',
    pos: { x: -82, z: 782 },
    level: 17,
    tier: 1,
  },

  {
    id: 'herb_thornpeak_1',
    zoneId: 'thornpeak_heights',
    type: 'herb',
    pos: { x: 18, z: 648 },
    level: 17,
    tier: 1,
  },
  {
    id: 'herb_thornpeak_2',
    zoneId: 'thornpeak_heights',
    type: 'herb',
    pos: { x: -18, z: 678 },
    level: 17,
    tier: 1,
  },

  // Tool-tier ramp. Zone 1 (eastbrook_vale) stays ALL tier 1: every node
  // above keeps tier 1, so the 20-copper starter tools cover the whole zone
  // (#2343: every harvest needs its profession's tool, tier 1 included; the
  // starter tools are sold a few steps from spawn). The
  // ramp comes only from the NEW veins
  // below: mirefen_marsh gains one tier-2 node per type, thornpeak_heights
  // gains one tier-2 and one tier-3 node per type. Each sits a short walk
  // (5 to 20 yd) from the matching existing cluster of the same type, and
  // grants the zone's existing material via the zone-keyed
  // NODE_MATERIAL_TABLE: no new materials and no yield changes (deliberate;
  // rhythm and richer yields are handled separately).
  {
    id: 'ore_mirefen_t2',
    zoneId: 'mirefen_marsh',
    type: 'ore',
    pos: { x: 48, z: 352 },
    level: 10,
    tier: 2,
  },
  {
    id: 'wood_mirefen_t2',
    zoneId: 'mirefen_marsh',
    type: 'wood',
    pos: { x: 2, z: 342 },
    level: 10,
    tier: 2,
  },
  // Followed herb_mirefen_1 off the pool it shared: it sat inside the same
  // footprint at 3.55 yards under. Still 12 yards from that patch, holding the
  // short-walk-from-the-cluster rule this block describes.
  {
    id: 'herb_mirefen_t2',
    zoneId: 'mirefen_marsh',
    type: 'herb',
    pos: { x: 34, z: 406 },
    level: 10,
    tier: 2,
  },
  {
    id: 'ore_thornpeak_t2',
    zoneId: 'thornpeak_heights',
    type: 'ore',
    pos: { x: 102, z: 615 },
    level: 17,
    tier: 2,
  },
  {
    id: 'ore_thornpeak_t3',
    zoneId: 'thornpeak_heights',
    type: 'ore',
    pos: { x: 70, z: 640 },
    level: 17,
    tier: 3,
  },
  {
    id: 'wood_thornpeak_t2',
    zoneId: 'thornpeak_heights',
    type: 'wood',
    pos: { x: -45, z: 776 },
    level: 17,
    tier: 2,
  },
  {
    id: 'wood_thornpeak_t3',
    zoneId: 'thornpeak_heights',
    type: 'wood',
    pos: { x: -92, z: 793 },
    level: 17,
    tier: 3,
  },
  {
    id: 'herb_thornpeak_t2',
    zoneId: 'thornpeak_heights',
    type: 'herb',
    pos: { x: 28, z: 658 },
    level: 17,
    tier: 2,
  },
  {
    id: 'herb_thornpeak_t3',
    zoneId: 'thornpeak_heights',
    type: 'herb',
    pos: { x: -28, z: 690 },
    level: 17,
    tier: 3,
  },
];
