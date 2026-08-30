import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type PendingArenaWalls, pendingArenaWallsFor } from '../src/render/dungeon_arena_walls';
import {
  collectWallPropBindings,
  retireWallOcclusion,
  updateWallOcclusion,
  WALL_PROP_GROUP_PREFIX,
  WALL_PROP_SHOW_ALPHA,
  type WallHideable,
  type WallPropBinding,
} from '../src/render/dungeon_wall_occlusion';
import { occluderFadeMat, occluderFadeReady } from '../src/render/occluder_fade';
import { OCCLUDER_FADE_ALPHA } from '../src/render/occluder_fade_core';
import {
  installOccluderFadeGate,
  occluderFadeTwinCount,
  resetOccluderFadeGateForTest,
} from '../src/render/occluder_fade_gate';
import {
  occluderGhostTargetOf,
  occluderGhostVariantKey,
} from '../src/render/occluder_ghost_variant_key';
import { IGNIVAR_LAYOUT, SANCTUM_LAYOUT } from '../src/sim/dungeon_layout';

const DT = 1 / 60;

function hideable(backface?: WallHideable['backface']): WallHideable {
  const mat = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  return {
    group: new THREE.Group(),
    mats: [occluderFadeMat(mat, mesh)],
    hidden: false,
    alpha: 1,
    // footprint spans x -5..5 at z -58, top 16 (approach entry shape)
    footprint: { x: 0, z: -58, hw: 5, hd: 1, topY: 16 },
    backface,
  };
}

describe('pendingArenaWallsFor backface planes', () => {
  it('gives every ignivar polygon wall an outward cull plane in world space', () => {
    const walls: PendingArenaWalls = pendingArenaWallsFor(IGNIVAR_LAYOUT, 1000, -2000, 'ignivar');
    expect(walls.all.length).toBeGreaterThan(0);
    const pole = IGNIVAR_LAYOUT.shellPole;
    if (!pole) throw new Error('ignivar layout lost its pole');
    for (const wall of walls.all) {
      expect(wall.backface).toBeDefined();
      const plane = wall.backface;
      if (!plane) continue;
      expect(plane.x).toBeCloseTo(wall.footprint.x, 6);
      expect(plane.z).toBeCloseTo(wall.footprint.z, 6);
      // outward: the world-space pole sits on the inner side
      const d = (1000 + pole.x - plane.x) * plane.nx + (-2000 + pole.z - plane.z) * plane.nz;
      expect(d).toBeLessThan(0);
    }
  });

  it('leaves every other variant on the sightline fade (no plane)', () => {
    const layout = { ...IGNIVAR_LAYOUT };
    const marsh = pendingArenaWallsFor(layout, 0, 0, 'delve_marsh');
    for (const wall of marsh.all) expect(wall.backface).toBeUndefined();
    // rectangular shells never carry one either
    const rect = pendingArenaWallsFor(SANCTUM_LAYOUT, 0, 0, 'ignivar');
    for (const wall of rect.all) expect(wall.backface).toBeUndefined();
  });
});

describe('updateWallOcclusion, backface mode', () => {
  const plane = { x: 0, z: -58, nx: 0, nz: -1 };

  it('culls the wall outright when the camera is outside its plane', () => {
    const h = hideable(plane);
    // camera outside the south wall, player mid-room: the reproduced bug
    updateWallOcclusion([h], [], 0, 4, -70, 0, 2, -40, DT);
    expect(h.hidden).toBe(true);
    expect(h.alpha).toBe(0);
    expect(h.mats[0].mat.opacity).toBe(0);
    expect(h.mats[0].mat.transparent).toBe(true);
    expect(h.group.visible).toBe(false);
  });

  it('culls even when the sightline does not cross this segment (whole face, no peephole)', () => {
    const h = hideable({ x: 20, z: -58, nx: 0, nz: -1 });
    h.footprint = { x: 20, z: -58, hw: 3, hd: 1, topY: 16 };
    // eye and camera both at x 0: the ray never touches the x 20 segment,
    // but the camera is outside the face plane, so the segment culls anyway
    updateWallOcclusion([h], [], 0, 4, -70, 0, 2, -40, DT);
    expect(h.hidden).toBe(true);
    expect(h.alpha).toBe(0);
  });

  it('eases back to the authored state once the camera returns inside', () => {
    const h = hideable(plane);
    updateWallOcclusion([h], [], 0, 4, -70, 0, 2, -40, DT);
    expect(h.group.visible).toBe(false);
    updateWallOcclusion([h], [], 0, 4, -40, 0, 2, -20, DT);
    expect(h.hidden).toBe(false);
    expect(h.alpha).toBeGreaterThan(0);
    expect(h.alpha).toBeLessThan(1);
    expect(h.group.visible).toBe(true);
    for (let i = 0; i < 400; i++) updateWallOcclusion([h], [], 0, 4, -40, 0, 2, -20, DT);
    expect(h.alpha).toBe(1);
    expect(h.mats[0].mat.opacity).toBe(1);
    expect(h.mats[0].mat.transparent).toBe(false);
  });

  it('keeps the legacy sightline ghost for walls without a plane', () => {
    const h = hideable();
    updateWallOcclusion([h], [], 0, 4, -70, 0, 2, -40, DT);
    expect(h.hidden).toBe(true);
    expect(h.alpha).toBe(OCCLUDER_FADE_ALPHA);
    expect(h.mats[0].mat.opacity).toBeCloseTo(OCCLUDER_FADE_ALPHA, 6);
    // legacy mode never toggles visibility
    expect(h.group.visible).toBe(true);
  });
});

describe('updateWallOcclusion, backface twin staging', () => {
  const plane = { x: 0, z: -58, nx: 0, nz: -1 };
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  interface Compile {
    root: THREE.Object3D;
    imminent: boolean;
    resolve: () => void;
  }

  /** A reveal compile host whose links settle only when the test says so. */
  function fakeHost() {
    const compiles: Compile[] = [];
    const host = {
      compile: (root: object, imminent: boolean) =>
        new Promise<void>((resolve) => {
          compiles.push({ root: root as THREE.Object3D, imminent, resolve });
        }),
      schedule: () => () => undefined,
    };
    return { host, compiles };
  }

  /** A backface hideable shaped like emitArenaHideable's output: several
   *  module-kind materials on instanced meshes, each its own fade record. */
  function backfaceHideable(): WallHideable {
    const stone = new THREE.MeshStandardMaterial({ name: 'stone' });
    const banner = new THREE.MeshLambertMaterial({ name: 'banner' });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    return {
      group: new THREE.Group(),
      mats: [
        occluderFadeMat(stone, new THREE.InstancedMesh(geometry, stone, 2)),
        occluderFadeMat(banner, new THREE.Mesh(geometry, banner)),
      ],
      hidden: false,
      alpha: 1,
      footprint: { x: 0, z: -58, hw: 5, hd: 1, topY: 16 },
      backface: plane,
    };
  }

  const keyOf = (mat: THREE.Material, mesh: THREE.Mesh): string =>
    occluderGhostVariantKey(occluderGhostTargetOf(mat, mesh));

  beforeEach(() => resetOccluderFadeGateForTest());
  afterEach(() => resetOccluderFadeGateForTest());

  it('stages a twin for EVERY backface record on the first advanced frame, camera still inside', () => {
    const { host, compiles } = fakeHost();
    installOccluderFadeGate(host);
    const h = backfaceHideable();
    // Camera and eye both inside the room: no hide, no re-show, and the
    // staging must fire anyway (a within-reach or on-hide trigger would be
    // too late for a wall the camera exits and re-enters in one orbit).
    updateWallOcclusion([h], [], 0, 4, -40, 0, 2, -20, DT);
    expect(h.hidden).toBe(false);
    expect(compiles).toHaveLength(h.mats.length);
    expect(occluderFadeTwinCount()).toBe(h.mats.length);
    // Exact coverage, not a lookalike set: the staged twins key the very
    // programs the flip will ask for, one per record in h.mats.
    const staged = new Set(
      compiles.map((c) =>
        keyOf((c.root as THREE.Mesh).material as THREE.Material, c.root as THREE.Mesh),
      ),
    );
    const flipped = new Set(
      h.mats.map((f) =>
        occluderGhostVariantKey({
          material: f.mat,
          geometry: f.geometry,
          instanced: f.instanced,
          instanceColor: f.instanceColor,
        }),
      ),
    );
    expect(staged).toEqual(flipped);
    // Once: later frames add nothing.
    updateWallOcclusion([h], [], 0, 4, -40, 0, 2, -20, DT);
    expect(compiles).toHaveLength(h.mats.length);
  });

  it('by the first re-show frame every twin program is already warm: no consult remains', async () => {
    const { host, compiles } = fakeHost();
    installOccluderFadeGate(host);
    const h = backfaceHideable();
    // Frame 1, camera inside: the staging fires and the links land.
    updateWallOcclusion([h], [], 0, 4, -40, 0, 2, -20, DT);
    for (const c of compiles) c.resolve();
    await flush();
    // Camera pushed outside: the wall culls outright, drawing nothing.
    updateWallOcclusion([h], [], 0, 4, -70, 0, 2, -40, DT);
    expect(h.group.visible).toBe(false);
    expect(compiles).toHaveLength(h.mats.length);
    // The camera returns inside: the FIRST re-show frame flips transparent
    // with the staged programs already linked, and asks the gate nothing new.
    updateWallOcclusion([h], [], 0, 4, -40, 0, 2, -20, DT);
    expect(h.group.visible).toBe(true);
    expect(h.alpha).toBeGreaterThan(0);
    for (const f of h.mats) expect(f.mat.transparent).toBe(true);
    expect(compiles).toHaveLength(h.mats.length);
    expect(occluderFadeReady(h.mats, 'prefetch')).toBe(true);
  });

  it('the sightline arm keeps its reach latch: a far no-backface wall stages nothing', () => {
    const { host, compiles } = fakeHost();
    installOccluderFadeGate(host);
    const h = backfaceHideable();
    h.backface = undefined;
    // Anchor far beyond OCCLUDER_FADE_PREFETCH_YD of the camera.
    h.footprint = { x: 500, z: 500, hw: 5, hd: 1, topY: 16 };
    updateWallOcclusion([h], [], 0, 4, -40, 0, 2, -20, DT);
    expect(compiles).toHaveLength(0);
    expect(occluderFadeTwinCount()).toBe(0);
  });
});

describe('updateWallOcclusion, wall prop bindings', () => {
  const plane = { x: 0, z: -58, nx: 0, nz: -1 };

  function binding(): WallPropBinding {
    return { node: new THREE.Group(), plane, owner: new THREE.Group(), alpha: 1 };
  }

  it('hides mounted props on the frame their wall culls', () => {
    const b = binding();
    updateWallOcclusion([], [b], 0, 4, -70, 0, 2, -40, DT);
    expect(b.node.visible).toBe(false);
    expect(b.alpha).toBe(0);
  });

  it('re-shows props only once the returning wall mostly covers them', () => {
    const b = binding();
    updateWallOcclusion([], [b], 0, 4, -70, 0, 2, -40, DT);
    expect(b.node.visible).toBe(false);
    let shownAt = -1;
    for (let i = 0; i < 400 && shownAt < 0; i++) {
      updateWallOcclusion([], [b], 0, 4, -40, 0, 2, -20, DT);
      if (b.node.visible) shownAt = b.alpha;
    }
    expect(shownAt).toBeGreaterThanOrEqual(WALL_PROP_SHOW_ALPHA);
  });
});

describe('collectWallPropBindings', () => {
  it('lifts the dressing face groups into world-space bindings', () => {
    const dressing = new THREE.Group();
    const face = new THREE.Group();
    face.name = `${WALL_PROP_GROUP_PREFIX}3`;
    face.userData.wallPlane = { x: 5, z: -58, nx: 0, nz: -1 };
    dressing.add(face);
    const plain = new THREE.Group();
    plain.name = 'ignivarApproachAssemblyRails';
    dressing.add(plain);
    const owner = new THREE.Group();
    const bindings = collectWallPropBindings(dressing, 1000, -2000, owner);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].node).toBe(face);
    expect(bindings[0].owner).toBe(owner);
    expect(bindings[0].plane).toEqual({ x: 1005, z: -2058, nx: 0, nz: -1 });
    expect(bindings[0].alpha).toBe(1);
  });
});

describe('retireWallOcclusion', () => {
  it('drops records owned by retired roots and keeps the rest', () => {
    const keep = hideable();
    const drop = hideable();
    const owner = new THREE.Group();
    const bindingKeep: WallPropBinding = {
      node: new THREE.Group(),
      plane: { x: 0, z: 0, nx: 0, nz: 1 },
      owner: new THREE.Group(),
      alpha: 1,
    };
    const bindingDrop: WallPropBinding = { ...bindingKeep, owner };
    const hideables = [keep, drop];
    const bindings = [bindingKeep, bindingDrop];
    retireWallOcclusion(hideables, bindings, new Set([drop.group, owner]));
    expect(hideables).toEqual([keep]);
    expect(bindings).toEqual([bindingKeep]);
  });
});
