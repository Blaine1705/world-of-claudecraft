// Camera occlusion for built set pieces (the dungeon entrances): the pure plan
// (set_piece_occluders_core.ts: one occluder box per collider row, tested with
// the fade family's own segment test) and the registry
// (set_piece_occluders.ts: a set's meshes get their own material clones at
// registration, the per-frame pass fades the blocking set only and restores
// it when the view clears, a blended ghost draws behind its own depth veil,
// dispose and clear unregister). Three.js runs headless in Node; both ghost
// styles (the blend and the low-tier dither) are forced in turn.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDitherFadeEnabledForTest } from '../src/render/occluder_dither_fade';
import { OCCLUDER_FADE_ALPHA } from '../src/render/occluder_fade_core';
import {
  installOccluderFadeGate,
  resetOccluderFadeGateForTest,
} from '../src/render/occluder_fade_gate';
import {
  clearSetPieceOccluders,
  registerSetPieceOccluders,
  SET_PIECE_GHOST_ORDER,
  SET_PIECE_VEIL_ORDER,
  setPieceOccludersInternalsForTest,
  updateSetPieceOccluders,
} from '../src/render/set_piece_occluders';
import {
  type SetPieceSolid,
  setPieceBoxesBlock,
  setPieceBoxesCentre,
  setPieceOccluderBox,
} from '../src/render/set_piece_occluders_core';
import { isSharedMaterial, markSharedMaterial } from '../src/render/shared_resource';

beforeEach(() => {
  resetOccluderFadeGateForTest();
  setDitherFadeEnabledForTest(false);
});

afterEach(() => {
  clearSetPieceOccluders();
  resetOccluderFadeGateForTest();
  setDitherFadeEnabledForTest(null);
});

const FRAME = 1 / 60;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const WALL: SetPieceSolid = { type: 'obb', x: 0, z: 0, hw: 3, hd: 0.5, rot: 0, topY: 8 };
const TOWER: SetPieceSolid = { type: 'circle', x: 20, z: 0, r: 3, topY: 12 };
/** Eye south of WALL, camera north of it: the wall blocks. */
const blocked = (reducedMotion = false): void =>
  updateSetPieceOccluders(0, 4, 6, 0, 1.6, -3, FRAME, reducedMotion);
/** Eye and camera both south of WALL: the plain follow view. */
const clear = (reducedMotion = false): void =>
  updateSetPieceOccluders(0, 4, -12, 0, 1.6, -3, FRAME, reducedMotion);

describe('the occluder boxes of a set piece', () => {
  it('an obb row is its own box; a round row is the square round it', () => {
    expect(setPieceOccluderBox(WALL)).toEqual({ x: 0, z: 0, hw: 3, hd: 0.5, rot: 0, topY: 8 });
    expect(setPieceOccluderBox(TOWER)).toEqual({ x: 20, z: 0, hw: 3, hd: 3, rot: 0, topY: 12 });
    // missing fields never produce NaN
    const bare = setPieceOccluderBox({ type: 'obb', x: 1, z: 2, topY: 3 });
    expect(bare).toEqual({ x: 1, z: 2, hw: 0, hd: 0, rot: 0, topY: 3 });
    const centre = setPieceBoxesCentre([WALL, TOWER].map(setPieceOccluderBox), { x: 9, z: 9 });
    expect(centre).toEqual({ x: 10, z: 0 });
  });

  it('a wall between the eye and the camera blocks; over its top, beside it or on one side of it does not', () => {
    const boxes = [setPieceOccluderBox(WALL)];
    // eye south of the wall, camera north of it, both under its top
    expect(setPieceBoxesBlock(boxes, 0, 1.6, -3, 0, 4, 6)).toBe(true);
    // the same segment high over the wall
    expect(setPieceBoxesBlock(boxes, 0, 9, -3, 0, 12, 6)).toBe(false);
    // both on the south side: the plain follow view toward the wall
    expect(setPieceBoxesBlock(boxes, 0, 1.6, -3, 0, 4, -12)).toBe(false);
    // crossing the wall's line beyond its end
    expect(setPieceBoxesBlock(boxes, 6, 1.6, -3, 6, 4, 6)).toBe(false);
    // a camera INSIDE the solid, under its top
    expect(setPieceBoxesBlock(boxes, 0, 1.6, -3, 0, 4, 0)).toBe(true);
    // a rotated wall blocks along its own line
    const turned = [setPieceOccluderBox({ ...WALL, rot: Math.PI / 2 })];
    expect(setPieceBoxesBlock(turned, -3, 1.6, 0, 6, 4, 0)).toBe(true);
    expect(setPieceBoxesBlock(turned, 0, 1.6, -3, 0, 4, 6)).toBe(false);
    // any box of the set is enough
    const both = [WALL, TOWER].map(setPieceOccluderBox);
    expect(setPieceBoxesBlock(both, 20, 1.6, -6, 20, 4, 6)).toBe(true);
    expect(setPieceBoxesBlock([], 0, 1.6, -3, 0, 4, 6)).toBe(false);
  });
});

function model(shared: THREE.Material, extra?: THREE.Material): THREE.Group {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  root.add(new THREE.Mesh(geometry, shared));
  root.add(new THREE.Mesh(geometry, shared));
  if (extra) root.add(new THREE.Mesh(geometry, extra));
  return root;
}

const isVeil = (o: THREE.Object3D): boolean => o.name.endsWith(':veil');

/** The meshes the set piece was built with (never their veil twins). */
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !isVeil(o)) out.push(o as THREE.Mesh);
  });
  return out;
}

function veils(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && isVeil(o)) out.push(o as THREE.Mesh);
  });
  return out;
}

const materials = (root: THREE.Object3D): THREE.Material[] =>
  meshes(root).map((mesh) => mesh.material as THREE.Material);

describe('the set piece occluder registry', () => {
  it('registration gives the meshes their own material clones, one per source material', () => {
    const stone = markSharedMaterial(new THREE.MeshStandardMaterial({ color: 0x808080 }));
    const leaf = new THREE.MeshStandardMaterial({ color: 0x206020, side: THREE.DoubleSide });
    const root = model(stone, leaf);
    const handle = registerSetPieceOccluders([WALL], [root]);
    const [a, b, c] = materials(root);
    // never the shared source: a fade must not ghost every other user of it
    expect(a).not.toBe(stone);
    expect(c).not.toBe(leaf);
    // the clone belongs to the set: a shared source's tag does not follow it
    expect(isSharedMaterial(stone)).toBe(true);
    expect(isSharedMaterial(a)).toBe(false);
    // two meshes of one source share one clone (one fade record, one program)
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect((c as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide);
    expect(a.transparent).toBe(false);
    expect(handle.boxes).toHaveLength(1);
    expect(handle.alpha()).toBe(1);
    expect(setPieceOccludersInternalsForTest.setCount()).toBe(1);
    expect(setPieceOccludersInternalsForTest.boxCount()).toBe(1);
  });

  it('the pass fades the blocking set only, toward the ghost, and restores it when the view clears', () => {
    const wallRoot = model(new THREE.MeshStandardMaterial());
    const towerRoot = model(new THREE.MeshStandardMaterial());
    const wall = registerSetPieceOccluders([WALL], [wallRoot]);
    const tower = registerSetPieceOccluders([TOWER], [towerRoot]);
    const wallMat = materials(wallRoot)[0];
    const towerMat = materials(towerRoot)[0];
    // the camera has gone round behind the wall; the tower is nowhere near the segment
    for (let i = 0; i < 30; i++) blocked();
    // the ghost of the fade family: the character is readable at once, at its alpha
    expect(wall.alpha()).toBe(OCCLUDER_FADE_ALPHA);
    expect(wallMat.transparent).toBe(true);
    expect(wallMat.opacity).toBeCloseTo(OCCLUDER_FADE_ALPHA, 6);
    // the ghost keeps writing depth
    expect(wallMat.depthWrite).toBe(true);
    expect(tower.alpha()).toBe(1);
    expect(towerMat.transparent).toBe(false);
    expect(towerMat.opacity).toBe(1);
    // back in front of the wall: it eases back, never a jump, and ends as authored
    let previous = wall.alpha();
    let frames = 0;
    while (wall.alpha() < 1 && frames < 600) {
      clear();
      expect(wall.alpha()).toBeGreaterThanOrEqual(previous);
      expect(wall.alpha() - previous).toBeLessThan(0.12);
      previous = wall.alpha();
      frames++;
    }
    expect(frames).toBeGreaterThan(10);
    expect(wall.alpha()).toBe(1);
    expect(wallMat.transparent).toBe(false);
    expect(wallMat.opacity).toBe(1);
  });

  it('reduced motion restores in one step, as the fade family does', () => {
    const wallRoot = model(new THREE.MeshStandardMaterial());
    const wall = registerSetPieceOccluders([WALL], [wallRoot]);
    blocked(true);
    expect(wall.alpha()).toBe(OCCLUDER_FADE_ALPHA);
    clear(true);
    expect(wall.alpha()).toBe(1);
    expect(materials(wallRoot)[0].transparent).toBe(false);
  });

  it('a blended ghost draws behind its own depth veil, last in the transparent pass', () => {
    const stone = new THREE.MeshStandardMaterial();
    const leaf = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const root = model(stone, leaf);
    const [first, , leafMesh] = meshes(root);
    first.renderOrder = 3;
    first.castShadow = true;
    registerSetPieceOccluders([WALL], [root]);
    const twins = veils(root);
    // one twin per mesh, on the mesh, sharing its geometry
    expect(twins).toHaveLength(3);
    expect(setPieceOccludersInternalsForTest.veilCount()).toBe(3);
    expect(twins[0].parent).toBe(first);
    expect(twins[0].geometry).toBe(first.geometry);
    for (const twin of twins) {
      const material = twin.material as THREE.MeshBasicMaterial;
      // depth only: no colour, no shadow, nothing a click can hit
      expect(material.colorWrite).toBe(false);
      expect(material.depthWrite).toBe(true);
      expect(material.transparent).toBe(true);
      expect(material.polygonOffset).toBe(true);
      expect(material.polygonOffsetFactor).toBeGreaterThan(0);
      expect(isSharedMaterial(material)).toBe(true);
      expect(twin.castShadow).toBe(false);
      expect(twin.visible).toBe(false);
      expect(twin.renderOrder).toBe(SET_PIECE_VEIL_ORDER);
      const hits: THREE.Intersection[] = [];
      twin.raycast(new THREE.Raycaster(), hits);
      expect(hits).toHaveLength(0);
    }
    // one shared veil material per face culling, whatever the set
    expect(twins[0].material).toBe(twins[1].material);
    expect((twins[0].material as THREE.Material).side).toBe(THREE.FrontSide);
    expect((veils(leafMesh)[0].material as THREE.Material).side).toBe(THREE.DoubleSide);
    expect(setPieceOccludersInternalsForTest.veilProgramKeys()).toHaveLength(2);
    expect(SET_PIECE_GHOST_ORDER).toBeGreaterThan(SET_PIECE_VEIL_ORDER);
    // ghosted: the veil is laid just before the ghost, after the transparents of the world
    blocked();
    for (const twin of twins) expect(twin.visible).toBe(true);
    for (const mesh of meshes(root)) expect(mesh.renderOrder).toBe(SET_PIECE_GHOST_ORDER);
    // shadows are untouched by the ghost
    expect(first.castShadow).toBe(true);
    // still ghosted while it eases back
    clear();
    expect(twins[0].visible).toBe(true);
    for (let i = 0; i < 600; i++) clear();
    // solid again: no veil, and every mesh back on its authored order
    for (const twin of twins) expect(twin.visible).toBe(false);
    expect(first.renderOrder).toBe(3);
    expect(leafMesh.renderOrder).toBe(0);
  });

  it('the dithered ghost stays opaque and needs no veil', () => {
    setDitherFadeEnabledForTest(true);
    const root = model(new THREE.MeshStandardMaterial());
    const wall = registerSetPieceOccluders([WALL], [root]);
    expect(veils(root)).toHaveLength(0);
    expect(setPieceOccludersInternalsForTest.veilCount()).toBe(0);
    blocked();
    expect(wall.alpha()).toBe(OCCLUDER_FADE_ALPHA);
    // fragments are dropped on an opaque material: no blend, no sorting, no reorder
    expect(materials(root)[0].transparent).toBe(false);
    expect(meshes(root)[0].renderOrder).toBe(0);
    clear();
    expect(wall.alpha()).toBe(1);
  });

  it('the ghost waits for the fade gate to link its veil, and asks ahead of the first occlusion', async () => {
    const compiles: { root: THREE.Object3D; resolve: () => void }[] = [];
    installOccluderFadeGate({
      compile: (root: object) =>
        new Promise<void>((resolve) => {
          compiles.push({ root: root as THREE.Object3D, resolve });
        }),
      schedule: () => () => undefined,
    });
    const root = model(new THREE.MeshStandardMaterial());
    const wall = registerSetPieceOccluders([WALL], [root]);
    const veilCompiles = () => compiles.filter((c) => c.root.name.startsWith('set-piece-veil|'));
    // the plain view near the gate: the programs are asked for, nothing fades
    clear();
    expect(veilCompiles()).toHaveLength(1);
    const probe = veilCompiles()[0].root as THREE.Mesh;
    expect(probe.visible).toBe(false);
    expect(probe.material).toBe(veils(root)[0].material);
    // the fade program of the wall itself is asked for too
    expect(compiles.length).toBeGreaterThan(1);
    // blocked before anything linked: the wall keeps drawing solid, unreordered
    for (let i = 0; i < 5; i++) blocked();
    expect(wall.alpha()).toBe(1);
    expect(materials(root)[0].transparent).toBe(false);
    expect(veils(root)[0].visible).toBe(false);
    expect(meshes(root)[0].renderOrder).toBe(0);
    // the edge frame escalates the queued link once (the gate's own rule), and
    // no later frame asks again
    expect(veilCompiles()).toHaveLength(2);
    expect(veilCompiles()[1].root).toBe(probe);
    for (const c of compiles) c.resolve();
    await flush();
    blocked();
    expect(wall.alpha()).toBe(OCCLUDER_FADE_ALPHA);
    expect(materials(root)[0].transparent).toBe(true);
    expect(veils(root)[0].visible).toBe(true);
  });

  it('a set with solids but nothing to fade, and a set with models but no solids, are both inert', () => {
    const root = model(new THREE.MeshStandardMaterial());
    const empty = registerSetPieceOccluders([WALL], []);
    const free = registerSetPieceOccluders([], [root]);
    for (let i = 0; i < 30; i++) blocked();
    expect(empty.alpha()).toBe(1);
    expect(free.alpha()).toBe(1);
    expect(materials(root)[0].transparent).toBe(false);
    expect(veils(root)[0].visible).toBe(false);
  });

  it('dispose unregisters one set and leaves it solid; clear forgets them all', () => {
    const wallRoot = model(new THREE.MeshStandardMaterial());
    const wall = registerSetPieceOccluders([WALL], [wallRoot]);
    registerSetPieceOccluders([TOWER], [model(new THREE.MeshStandardMaterial())]);
    expect(setPieceOccludersInternalsForTest.setCount()).toBe(2);
    // disposed while ghosted: restored to the authored state on the spot
    blocked();
    expect(materials(wallRoot)[0].transparent).toBe(true);
    wall.dispose();
    wall.dispose();
    expect(setPieceOccludersInternalsForTest.setCount()).toBe(1);
    expect(wall.alpha()).toBe(1);
    expect(materials(wallRoot)[0].transparent).toBe(false);
    expect(materials(wallRoot)[0].opacity).toBe(1);
    expect(veils(wallRoot)[0].visible).toBe(false);
    expect(meshes(wallRoot)[0].renderOrder).toBe(0);
    // a disposed set is no longer faded
    for (let i = 0; i < 60; i++) blocked();
    expect(wall.alpha()).toBe(1);
    expect(materials(wallRoot)[0].transparent).toBe(false);
    clearSetPieceOccluders();
    expect(setPieceOccludersInternalsForTest.setCount()).toBe(0);
    expect(setPieceOccludersInternalsForTest.boxCount()).toBe(0);
  });
});
