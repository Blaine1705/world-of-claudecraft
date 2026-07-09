// Pure, host-agnostic draw model for the world-map window (overworld branch).
//
// The pure-core half of the pure-core + canvas-painter split (root CLAUDE.md
// Conventions; reference delve_map.ts / delve_map_painter.ts). It maps IWorld
// state plus the committed zone to a flat geometry model in canvas-pixel space:
// the background blit rect, the zoomed-detail overlay, and every label / portal /
// npc glyph / player arrow / ally dot already projected to (mx, my). No DOM, no
// Three, no 2D context, no i18n, no color: the painter owns the context and
// resolves the --color-map-* tokens + the localized label text. The delve branch
// of the map is owned by delve_map_painter.ts; this core models only the
// overworld branch, plus the mode discriminator the painter switches on.
//
// DOM-free / i18n-free / deterministic so tests/map_window_view.test.ts can drive
// it directly with both a Sim-shaped and a ClientWorld-mirror-shaped IWorld stub.
// Markers carry the identity (zoneId / poiIndex / dungeonId / cls)
// the painter needs to resolve their localized text, never the resolved string.

import {
  DUNGEON_LIST,
  isDelvePos,
  PROPS,
  QUESTS,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  ZONES,
  type ZoneDef,
} from '../sim/data';
import { type QuestObjectiveRef, questObjectiveAreas } from '../sim/quest_targets';
import { isQuestTurnInNpc } from '../sim/types';
import type { Decoration } from '../sim/world';
import type { FriendInfo, IWorld } from '../world_api';
import { overworldDungeonPortals } from './map_dungeon_portals';
import { questNumbersByLog } from './map_quest_list_view';

// World-map zoom band: the map is world-relative now. zoom 1 = the whole
// continent framed square (open ocean east and west of the tall, narrow
// landmass); MAP_MAX_ZOOM frames roughly a single realm. The view scales the
// square uniformly between the two, centred on the player (or the pan target).
export const MAP_MAX_ZOOM = 6;
// The default zoom the map opens at: about four realms in view.
export const MAP_OPEN_ZOOM = 1.5;
// A square margin of open sea around the continent bounds, so the landmass does
// not touch the top/bottom edges at full zoom-out.
const WORLD_MARGIN = 120;
// Below this visible span (world units across the view) the POI / NPC / ally
// labels draw; wider than this (the continent / multi-realm overview) they are
// suppressed so the map is not a wall of overlapping text.
const LABEL_SPAN = 900;
// Below this visible span the zoomed-detail overlay (buildings + vegetation)
// draws (roughly a single realm in view).
const DETAIL_SPAN = 480;

// The zoomed-detail overlay only considers props/decorations within this many
// world units of the visible region, so a footprint half-off the edge still draws.
const DETAIL_VIEW_MARGIN = 6;
// Markers (POIs / portals / NPCs / allies) within this many world units of the
// visible region still draw, so a label anchored just off the edge is not clipped.
const MARKER_VIEW_MARGIN = 24;
// Marker radii in the detail overlay: a px floor plus a per-pixel-per-yard scale,
// so dots stay visible when zoomed out yet grow with the map (matches the inline
// site verbatim). ppu = pixels per world unit.
const ROCK_MIN_RADIUS = 1.2;
const ROCK_RADIUS_PPU = 0.5;
const FOLIAGE_MIN_RADIUS = 1.6;
const FOLIAGE_RADIUS_PPU = 0.8;
const PROP_MIN_RADIUS = 1.8;
const PROP_RADIUS_PPU = 0.7;
const CAMPFIRE_MIN_RADIUS = 1.4;
const CAMPFIRE_RADIUS_PPU = 0.5;

/** Which world-map surface a given world renders: the delve schematic (owned by
 *  delve_map_painter) or the overworld map (this core). */
export type MapWindowMode = 'delve' | 'overworld';

/** A map region in world coords, used with two meanings for spanX/spanZ. The
 *  internal `full` rect carries the framed-continent square (its full spans). The
 *  returned model `view` (which Hud stores as mapView for the drag handler) keeps
 *  those FULL min/max bounds but carries the current ZOOMED spans (full span /
 *  zoom). So min/max are always the framed-continent bounds; spanX/spanZ are the
 *  full square on `full` and the zoomed square on the returned `view`. */
export interface MapViewRect {
  spanX: number;
  spanZ: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A zone POI label: canvas position + the identity the painter localizes. */
export interface MapPoiMarker {
  mx: number;
  my: number;
  zoneId: string;
  poiIndex: number;
}

/** A dungeon entrance portal: canvas position + the dungeon id to localize. */
export interface MapPortalMarker {
  mx: number;
  my: number;
  dungeonId: string;
}

/** One quest carried by a map quest-giver glyph, for its hover tooltip. */
export interface MapNpcQuestRef {
  questId: string;
  /** true = ready to turn in (the '?' state); false = available to pick up. */
  ready: boolean;
}

/** A quest-giver glyph: '?' (turn-in ready) wins over '!' (available). Carries
 *  the quest identities behind the glyph so the hover tooltip can resolve
 *  their localized titles + level requirements (this core stays i18n-free). */
export interface MapNpcMarker {
  mx: number;
  my: number;
  ready: boolean;
  quests: MapNpcQuestRef[];
}

/** The glyph hit radius for the map hover tooltip, in canvas px: the '?'/'!'
 *  glyphs draw at a ~15px font, and a touch of slack keeps the hover forgiving. */
export const MAP_NPC_GLYPH_HIT_RADIUS = 10;

/** The nearest quest-giver glyph within the hit radius of a canvas point, or
 *  null. Nearest (not first) so two adjacent givers resolve intuitively. */
export function npcMarkerAt(
  npcs: readonly MapNpcMarker[],
  mx: number,
  my: number,
): MapNpcMarker | null {
  let best: MapNpcMarker | null = null;
  let bestD2 = MAP_NPC_GLYPH_HIT_RADIUS * MAP_NPC_GLYPH_HIT_RADIUS;
  for (const n of npcs) {
    const dx = mx - n.mx;
    const dy = my - n.my;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = n;
    }
  }
  return best;
}

/** A translucent active-quest objective area (the classic quest-POI blob):
 *  canvas-pixel center + radius over where the objective's targets live, plus
 *  the objective identities it stands for (the hover tooltip resolves their
 *  localized labels + live counts; this core stays i18n-free). */
export interface MapQuestAreaMarker {
  mx: number;
  my: number;
  radius: number;
  objectives: QuestObjectiveRef[];
  /** Distinct 1-based quest numbers (acceptance order) of the objectives
   *  here, ascending: the painter draws one numbered badge per entry, and the
   *  same numbers head the map's quest side list. */
  numbers: number[];
}

/** The distinct objectives under a canvas point, across every quest area that
 *  contains it (overlapping blobs merge into one tooltip). Pure hit-test the
 *  hover handler calls with the last painted model's areas. */
export function questAreaObjectivesAt(
  areas: readonly MapQuestAreaMarker[],
  mx: number,
  my: number,
): QuestObjectiveRef[] {
  const refs: QuestObjectiveRef[] = [];
  const seen = new Set<string>();
  for (const a of areas) {
    const dx = mx - a.mx;
    const dy = my - a.my;
    if (dx * dx + dy * dy > a.radius * a.radius) continue;
    for (const ref of a.objectives) {
      const key = `${ref.questId}#${ref.objectiveIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
  }
  return refs;
}

/** The local player's facing arrow (canvas rotation matches -facing). */
export interface MapPlayerMarker {
  mx: number;
  my: number;
  angle: number;
}

/** An online ally dot: friends win ties over guild members (dedup by id). */
export interface MapAllyMarker {
  mx: number;
  my: number;
  name: string;
  kind: 'friend' | 'guild';
}

/** A vegetation dot in the detail overlay (rock vs pine/oak foliage). */
export interface MapDecorationMarker {
  mx: number;
  my: number;
  kind: 'rock' | 'tree' | 'oak';
  radius: number;
}

/** A building footprint in the detail overlay: four rotated, projected corners. */
export interface MapBuildingMarker {
  points: { mx: number; my: number }[];
  kind: 'chapel' | 'inn' | 'house';
}

/** A small prop dot in the detail overlay (well / stall / tent / ...). */
export interface MapPropMarker {
  mx: number;
  my: number;
  kind: 'well' | 'stall' | 'tent' | 'mine' | 'graveyard' | 'mudhut' | 'campfire';
  radius: number;
}

/** The zoomed-detail overlay (only present at/above MAP_DETAIL_ZOOM). */
export interface MapDetail {
  decorations: MapDecorationMarker[];
  buildings: MapBuildingMarker[];
  props: MapPropMarker[];
}

/** Everything the painter draws for one overworld map frame, all in canvas-pixel
 *  space and derived purely from IWorld + the committed zone. */
export interface OverworldMapModel {
  /** The framed-continent bounds + current zoomed spans (Hud's mapView). */
  view: MapViewRect;
  /** Drag cursor when zoomed past the full-continent view. */
  cursor: 'grab' | 'default';
  /** The visible world rect. The painter composites each realm's cached
   *  background into it (+X is map-left, +Z map-down) over an ocean fill. */
  region: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The committed zone id (the painter localizes the on-canvas title + summary). */
  zoneId: string;
  pois: MapPoiMarker[];
  portals: MapPortalMarker[];
  npcs: MapNpcMarker[];
  questAreas: MapQuestAreaMarker[];
  player: MapPlayerMarker | null;
  allies: MapAllyMarker[];
  /** The zoomed-detail overlay, or null below MAP_DETAIL_ZOOM. */
  detail: MapDetail | null;
}

/** Inputs the painter feeds the builder each redraw. The cached terrain bg + the
 *  cached whole-world decorations are owned by the painter and passed in. */
export interface OverworldMapInput {
  world: IWorld;
  /** The committed zone (resolved by Hud, which also keys the cached bg by it). */
  zone: ZoneDef;
  /** Current world-map zoom (1 = whole zone). */
  zoom: number;
  /** Pan target in world coords, or null to follow the player. */
  center: { x: number; z: number } | null;
  /** The square map-canvas side in px. */
  canvasSize: number;
  /** The cached whole-world decorations (generated once from the seed). */
  decorations: readonly Decoration[];
  /** Quest ids the player untracked from the map side list: their objective
   *  areas are not plotted. Omitted = every quest tracked. */
  untrackedQuestIds?: ReadonlySet<string>;
}

/** Which world-map surface this world renders. Delve when the player stands in a
 *  delve band and a run is active (matches the inline guard); overworld otherwise. */
export function mapWindowMode(world: IWorld): MapWindowMode {
  return isDelvePos(world.player.pos.x) && world.delveRun ? 'delve' : 'overworld';
}

/**
 * Build the overworld map draw model. Reads only IWorld members (player /
 * entities / socialInfo / questState / questLog) plus the committed zone and
 * shared world content (ZONES bounds, dungeon portals, camps, props,
 * decorations), so the offline Sim and the online ClientWorld mirror produce
 * identical output. Every
 * position is projected to canvas pixels here; the painter only resolves colors +
 * localized text and strokes.
 */
export function buildOverworldMapModel(input: OverworldMapInput): OverworldMapModel {
  const { world, zone, zoom, center, canvasSize: S, decorations } = input;
  const untracked = input.untrackedQuestIds;
  const p = world.player;

  // The whole continent, framed SQUARE so the tall, narrow landmass sits in the
  // middle with open ocean east and west at full zoom-out. The view scales this
  // square uniformly (no distortion), centred on the pan target or the player.
  const worldCx = (WORLD_MIN_X + WORLD_MAX_X) / 2;
  const worldCz = (WORLD_MIN_Z + WORLD_MAX_Z) / 2;
  const fullSpan = WORLD_MAX_Z - WORLD_MIN_Z + WORLD_MARGIN; // the square side
  const full: MapViewRect = {
    spanX: fullSpan,
    spanZ: fullSpan,
    minX: worldCx - fullSpan / 2,
    maxX: worldCx + fullSpan / 2,
    minZ: worldCz - fullSpan / 2,
    maxZ: worldCz + fullSpan / 2,
  };
  // Zoomed view: a smaller square centred on the player (or pan target), clamped
  // to the framed-continent bounds. zoom 1 = the whole square (the continent).
  const spanX = fullSpan / zoom;
  const spanZ = fullSpan / zoom;
  const baseX = center ? center.x : p.pos.x;
  const baseZ = center ? center.z : p.pos.z;
  const cx = Math.max(full.minX + spanX / 2, Math.min(full.maxX - spanX / 2, baseX));
  const cz = Math.max(full.minZ + spanZ / 2, Math.min(full.maxZ - spanZ / 2, baseZ));
  const region = {
    minX: cx - spanX / 2,
    maxX: cx + spanX / 2,
    minZ: cz - spanZ / 2,
    maxZ: cz + spanZ / 2,
  };

  // +X is map-left (east = -X); +Z is map-down.
  const toMap = (x: number, z: number): { mx: number; my: number } => ({
    mx: ((region.maxX - x) / spanX) * S,
    my: ((region.maxZ - z) / spanZ) * S,
  });
  const inView = (x: number, z: number): boolean =>
    x >= region.minX - MARKER_VIEW_MARGIN &&
    x <= region.maxX + MARKER_VIEW_MARGIN &&
    z >= region.minZ - MARKER_VIEW_MARGIN &&
    z <= region.maxZ + MARKER_VIEW_MARGIN;

  // Declutter: the POI / NPC / ally labels only draw at the realm-local scale
  // (a narrow span); the continent / multi-realm overview keeps just the player
  // and the dungeon portals so it is not a wall of overlapping text.
  const labels = spanX < LABEL_SPAN;
  const detail = spanX < DETAIL_SPAN ? buildDetail(region, toMap, S / spanX, decorations) : null;

  // POIs across every realm in view (was the committed zone only).
  const pois: MapPoiMarker[] = [];
  if (labels) {
    for (const zn of ZONES) {
      for (let poiIndex = 0; poiIndex < zn.pois.length; poiIndex++) {
        const poi = zn.pois[poiIndex];
        if (!inView(poi.x, poi.z)) continue;
        const { mx, my } = toMap(poi.x, poi.z);
        pois.push({ mx, my, zoneId: zn.id, poiIndex });
      }
    }
  }

  // Active-quest objective areas (the classic "your targets live here" blobs),
  // derived from the static content tables (camps / ground objects / NPCs), so
  // the online interest radius never hides a far-away camp. Culled to the visible
  // map rect (inView) like every other grid-map marker; radius scales with zoom.
  // Untracked quests (hidden from the map side list) drop out here, and each
  // surviving area carries its quests' acceptance-order numbers for the badges.
  const questNumbers = questNumbersByLog(world.questLog);
  const questAreas: MapQuestAreaMarker[] = [];
  for (const area of questObjectiveAreas(world.questLog)) {
    if (!inView(area.center.x, area.center.z)) continue;
    const objectives = untracked
      ? area.objectives.filter((ref) => !untracked.has(ref.questId))
      : area.objectives;
    if (objectives.length === 0) continue;
    const numbers: number[] = [];
    for (const ref of objectives) {
      const n = questNumbers.get(ref.questId);
      if (n !== undefined && !numbers.includes(n)) numbers.push(n);
    }
    numbers.sort((a, b) => a - b);
    const { mx, my } = toMap(area.center.x, area.center.z);
    questAreas.push({ mx, my, radius: (area.radius / spanX) * S, objectives, numbers });
  }

  // Dungeon portals across the whole world, filtered to the view (shown always).
  const portals: MapPortalMarker[] = [];
  for (const portal of overworldDungeonPortals(DUNGEON_LIST, WORLD_MIN_Z, WORLD_MAX_Z)) {
    if (!inView(portal.x, portal.z)) continue;
    const { mx, my } = toMap(portal.x, portal.z);
    portals.push({ mx, my, dungeonId: portal.id });
  }

  // Quest-giver glyphs show at every zoom (actionable markers, unlike the
  // zoom-gated zone/POI text labels), culled to the visible map rect.
  const npcs: MapNpcMarker[] = [];
  for (const e of world.entities.values()) {
    if (e.kind !== 'npc') continue;
    if (!inView(e.pos.x, e.pos.z)) continue;
    const avail = e.questIds.filter(
      (q) => QUESTS[q].giverNpcId === e.templateId && world.questState(q) === 'available',
    );
    const readyQuests = e.questIds.filter(
      (q) => isQuestTurnInNpc(QUESTS[q], e.templateId) && world.questState(q) === 'ready',
    );
    if (avail.length > 0 || readyQuests.length > 0) {
      const { mx, my } = toMap(e.pos.x, e.pos.z);
      npcs.push({
        mx,
        my,
        ready: readyQuests.length > 0,
        // turn-ins first: the '?' state wins the glyph, so its quests lead the tooltip
        quests: [
          ...readyQuests.map((questId) => ({ questId, ready: true })),
          ...avail.map((questId) => ({ questId, ready: false })),
        ],
      });
    }
  }

  let player: MapPlayerMarker | null = null;
  if (inView(p.pos.x, p.pos.z) && p.pos.x <= WORLD_MAX_X) {
    const { mx, my } = toMap(p.pos.x, p.pos.z);
    player = { mx, my, angle: -p.facing };
  }

  // Friends (green) and guild members (blue), plotted from the live positions the
  // server streams for online allies. socialInfo is null offline, so this is
  // online-only; friends are plotted first and win ties (dedup by id).
  const allies: MapAllyMarker[] = [];
  const social = world.socialInfo;
  if (labels && social) {
    const selfName = p.name;
    const drawn = new Set<number>();
    const plotAlly = (m: FriendInfo, kind: 'friend' | 'guild'): void => {
      if (
        !m.online ||
        m.x === undefined ||
        m.z === undefined ||
        m.name === selfName ||
        drawn.has(m.id)
      )
        return;
      if (!inView(m.x, m.z) || m.x > WORLD_MAX_X) return;
      drawn.add(m.id);
      const { mx, my } = toMap(m.x, m.z);
      allies.push({ mx, my, name: m.name, kind });
    };
    for (const f of social.friends) plotAlly(f, 'friend');
    if (social.guild) for (const m of social.guild.members) plotAlly(m, 'guild');
  }

  return {
    view: { spanX, spanZ, minX: full.minX, maxX: full.maxX, minZ: full.minZ, maxZ: full.maxZ },
    cursor: zoom > 1 ? 'grab' : 'default',
    region: { minX: region.minX, maxX: region.maxX, minZ: region.minZ, maxZ: region.maxZ },
    zoneId: zone.id,
    pois,
    portals,
    npcs,
    questAreas,
    player,
    allies,
    detail,
  };
}

// Buildings + vegetation overlay for the zoomed-in map, drawn from the same shared
// world data the renderer uses (PROPS + the cached decorations), so it matches the
// actual world. Only built at/above MAP_DETAIL_ZOOM. `ppu` is pixels per world
// unit (the X axis; footprints stay roughly to scale).
function buildDetail(
  region: { minX: number; maxX: number; minZ: number; maxZ: number },
  toMap: (x: number, z: number) => { mx: number; my: number },
  ppu: number,
  decorations: readonly Decoration[],
): MapDetail {
  const inView = (x: number, z: number): boolean =>
    x >= region.minX - DETAIL_VIEW_MARGIN &&
    x <= region.maxX + DETAIL_VIEW_MARGIN &&
    z >= region.minZ - DETAIL_VIEW_MARGIN &&
    z <= region.maxZ + DETAIL_VIEW_MARGIN;

  const decoMarkers: MapDecorationMarker[] = [];
  for (const d of decorations) {
    if (!inView(d.x, d.z)) continue;
    const { mx, my } = toMap(d.x, d.z);
    if (d.kind === 'rock') {
      decoMarkers.push({
        mx,
        my,
        kind: 'rock',
        radius: Math.max(ROCK_MIN_RADIUS, ppu * ROCK_RADIUS_PPU),
      });
    } else {
      // pine ('tree') darker, oak lighter; same radius.
      decoMarkers.push({
        mx,
        my,
        kind: d.kind === 'tree' ? 'tree' : 'oak',
        radius: Math.max(FOLIAGE_MIN_RADIUS, ppu * FOLIAGE_RADIUS_PPU),
      });
    }
  }

  const buildings: MapBuildingMarker[] = [];
  for (const b of PROPS.buildings) {
    if (!inView(b.x, b.z)) continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const corner = (dx: number, dz: number): { mx: number; my: number } =>
      toMap(b.x + dx * c - dz * s, b.z + dx * s + dz * c);
    const points = [
      corner(-b.w / 2, -b.d / 2),
      corner(b.w / 2, -b.d / 2),
      corner(b.w / 2, b.d / 2),
      corner(-b.w / 2, b.d / 2),
    ];
    const kind = b.kind === 'chapel' ? 'chapel' : b.kind === 'inn' ? 'inn' : 'house';
    buildings.push({ points, kind });
  }

  const props: MapPropMarker[] = [];
  const dot = (
    x: number,
    z: number,
    kind: MapPropMarker['kind'],
    radius = Math.max(PROP_MIN_RADIUS, ppu * PROP_RADIUS_PPU),
  ): void => {
    if (!inView(x, z)) return;
    const { mx, my } = toMap(x, z);
    props.push({ mx, my, kind, radius });
  };
  for (const w of PROPS.wells) dot(w.x, w.z, 'well');
  for (const st of PROPS.stalls) dot(st.x, st.z, 'stall');
  for (const tn of PROPS.tents) dot(tn.x, tn.z, 'tent');
  for (const m of PROPS.mines) dot(m.x, m.z, 'mine');
  for (const g of PROPS.graveyards) dot(g.x, g.z, 'graveyard');
  for (const [x, z] of PROPS.mudHuts) dot(x, z, 'mudhut');
  for (const [x, z] of PROPS.campfires)
    dot(x, z, 'campfire', Math.max(CAMPFIRE_MIN_RADIUS, ppu * CAMPFIRE_RADIUS_PPU));

  return { decorations: decoMarkers, buildings, props };
}
