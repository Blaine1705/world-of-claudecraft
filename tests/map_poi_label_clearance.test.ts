// The POI-label-vs-navigation-badge clearance rule (map_poi_label_clearance_core)
// plus its wiring into the overworld map model: a delve door authored on a
// named place (Collapsed Reliquary on Reliquary Hill, Eastbrook Vale) must not
// paint its badge over the label text.

import { describe, expect, it } from 'vitest';
import { FARM_PATCHES } from '../src/sim/content/farm_patches';
import { DELVES, PROPS, STATIONS, ZONES } from '../src/sim/data';
import { MAP_MARKER_SIZES } from '../src/ui/map_marker_icon_art';
import type { MapMarkerProfile } from '../src/ui/map_marker_profile_core';
import {
  clearPoiLabelsOffBadges,
  MAP_POI_LABEL_BADGE_GAP,
  MAP_POI_LABEL_HEIGHT_BY_PROFILE,
  poiLabelTouchesBadge,
} from '../src/ui/map_poi_label_clearance_core';
import { buildOverworldMapModel, type OverworldMapInput } from '../src/ui/map_window_view';
import type { IWorld } from '../src/world_api';

const SIZE = 22;
const HEIGHT = 13;

describe('poiLabelTouchesBadge', () => {
  it('a badge centered on the label anchor covers the label', () => {
    expect(poiLabelTouchesBadge({ mx: 100, my: 100 }, { mx: 100, my: 100 }, SIZE, HEIGHT)).toBe(
      true,
    );
  });

  it('a badge sitting wholly under the baseline, or wholly above the cap, does not', () => {
    // badge top at 100 + 11 - 11 = 100: touching the baseline edge is not overlap
    expect(poiLabelTouchesBadge({ mx: 100, my: 100 }, { mx: 100, my: 111 }, SIZE, HEIGHT)).toBe(
      false,
    );
    expect(poiLabelTouchesBadge({ mx: 100, my: 100 }, { mx: 100, my: 76 }, SIZE, HEIGHT)).toBe(
      false,
    );
    expect(poiLabelTouchesBadge({ mx: 100, my: 100 }, { mx: 100, my: 110 }, SIZE, HEIGHT)).toBe(
      true,
    );
  });

  it('a badge far to the side is a neighbour, not a cover', () => {
    expect(poiLabelTouchesBadge({ mx: 100, my: 100 }, { mx: 125, my: 100 }, SIZE, HEIGHT)).toBe(
      false,
    );
    expect(poiLabelTouchesBadge({ mx: 100, my: 100 }, { mx: 123, my: 100 }, SIZE, HEIGHT)).toBe(
      true,
    );
  });
});

describe('clearPoiLabelsOffBadges', () => {
  it('lifts a covered label so its whole band sits above the badge, and keeps the rest', () => {
    const labels = [
      { mx: 100, my: 100, id: 'covered' },
      { mx: 300, my: 300, id: 'free' },
    ];
    const out = clearPoiLabelsOffBadges(labels, [{ mx: 100, my: 100 }], SIZE, HEIGHT);
    expect(out[1]).toBe(labels[1]);
    expect(out[0]).toEqual({
      mx: 100,
      my: 100 - SIZE / 2 - MAP_POI_LABEL_BADGE_GAP,
      id: 'covered',
    });
    expect(poiLabelTouchesBadge(out[0], { mx: 100, my: 100 }, SIZE, HEIGHT)).toBe(false);
  });

  it('drops the label under the badge when lifting would leave the canvas', () => {
    const out = clearPoiLabelsOffBadges([{ mx: 50, my: 14 }], [{ mx: 50, my: 14 }], SIZE, HEIGHT);
    expect(out[0].my).toBe(14 + SIZE / 2 + MAP_POI_LABEL_BADGE_GAP + HEIGHT);
    expect(poiLabelTouchesBadge(out[0], { mx: 50, my: 14 }, SIZE, HEIGHT)).toBe(false);
  });

  it('never moves anything with no badges (and returns a copy)', () => {
    const labels = [{ mx: 1, my: 2 }];
    const out = clearPoiLabelsOffBadges(labels, [], SIZE, HEIGHT);
    expect(out).toEqual(labels);
    expect(out).not.toBe(labels);
  });
});

describe('overworld map model: Reliquary Hill under the Collapsed Reliquary door', () => {
  const zone = ZONES.find((z) => z.id === 'eastbrook_vale') as (typeof ZONES)[number];
  const poiIndex = zone.pois.findIndex((p) => p.id === 'reliquary_hill');
  const CANVAS = 560;

  function world(): IWorld {
    const player = { id: 1, kind: 'player', name: 'Me', pos: { x: 0, z: 0 }, facing: 0 };
    return {
      player,
      entities: new Map([[1, player]]),
      socialInfo: null,
      delveRun: null,
      cfg: { seed: 42, playerClass: 'warrior' },
      playerId: 1,
      questState: () => 'unavailable',
      questLog: new Map(),
      questsDone: new Set<string>(),
      craftingIdentity: { version: 1, synced: false, cadenceBlockedQuests: [] },
      inventory: [],
      gatheringProficiency: {},
      nodeHarvestableByMe: () => true,
      stationPlacements: STATIONS,
      civicServicePlacements: [],
      farmPatches: FARM_PATCHES,
    } as unknown as IWorld;
  }

  function input(markerProfile: MapMarkerProfile): OverworldMapInput {
    return {
      world: world(),
      props: PROPS,
      zone,
      zoom: 1,
      center: null,
      canvasSize: CANVAS,
      decorations: [],
      markerProfile,
    };
  }

  it('the door is authored on the named place (the premise of the report)', () => {
    expect(poiIndex).toBeGreaterThanOrEqual(0);
    const poi = zone.pois[poiIndex];
    expect(DELVES.collapsed_reliquary.doorPos).toEqual({ x: poi.x, z: poi.z });
  });

  it.each(['standard', 'compact'] as const)('%s: the label band clears the badge', (profile) => {
    const model = buildOverworldMapModel(input(profile));
    const label = model.pois.find((p) => p.poiIndex === poiIndex);
    const badge = model.navigation.find(
      (n) => n.kind === 'delve-entrance' && n.delveId === 'collapsed_reliquary',
    );
    expect(label).toBeDefined();
    expect(badge).toBeDefined();
    const size = MAP_MARKER_SIZES[profile === 'compact' ? 'mapNavigationCompact' : 'mapNavigation'];
    const height = MAP_POI_LABEL_HEIGHT_BY_PROFILE[profile];
    expect(poiLabelTouchesBadge(label!, badge!, size, height)).toBe(false);
    // Lifted above, not thrown elsewhere: same column, baseline just over the badge top.
    expect(label!.mx).toBe(badge!.mx);
    expect(label!.my).toBe(badge!.my - size / 2 - MAP_POI_LABEL_BADGE_GAP);
  });

  it('every other Eastbrook Vale label keeps its authored projection', () => {
    const model = buildOverworldMapModel(input('standard'));
    for (const poi of model.pois) {
      if (poi.poiIndex === poiIndex) continue;
      for (const badge of model.navigation) {
        expect(
          poiLabelTouchesBadge(poi, badge, MAP_MARKER_SIZES.mapNavigation, 13),
          `poi ${poi.poiIndex} vs ${badge.kind}`,
        ).toBe(false);
      }
    }
  });
});
