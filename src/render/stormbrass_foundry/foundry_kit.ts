// The Stormbrass Foundry's Blender kit (docs/design/dungeon-rework/kit/
// build_stormbrass_foundry_kit.py, shipped as public/models/props/
// stormbrass_foundry_kit.glb): every Kit_* node baked once into shared
// geometry split by material slot (riveted metal: brass, copper, iron and
// steel, told apart by the vertex colour; dielectric paint: hazard paint,
// stone, timber, ceramic, canvas; emissive glow: molten brass, lamp bulbs and
// storm coils; translucent glass), then instanced per piece over the sim
// layout's props, the cliff-edge dressing and the render-only dressing (the
// rail loop, the belts' housings, the catwalk trusses, the pour line, the
// molten channel, the skyline in the drop). Placements come from the pure plan
// (foundry_kit_plan_core.ts).
//
// A kit that fails to load costs the Foundry its detail, never the player the
// dungeon: every piece has a plain procedural stand-in, and a kit that lands
// late swaps in under the same group. GPU preparation: the dressing is part of
// the interior group the renderer attaches through its compile gate; the
// stand-ins draw every slot material (metal, paint, glow, glass and the
// coil's driven glow) so a late swap links no new program. No lights here:
// the render's light sink owns lights (foundry_lights.ts).

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_FIELD } from '../../sim/content/stormbrass_foundry_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { loadGltf, releaseGltf } from '../assets/loader';
import { registerDeferredPreload } from '../assets/preload';
import { GFX } from '../gfx';
import { markSharedGeometry, markSharedMaterial } from '../shared_resource';
import { type FoundryKitPlacement, planFoundryKitPlacements } from './foundry_kit_plan_core';

export const STORMBRASS_FOUNDRY_KIT_URL = '/models/props/stormbrass_foundry_kit.glb';

export type FoundrySlot = 'metal' | 'paint' | 'glow' | 'glass';
export type FoundryBakedPiece = Partial<Record<FoundrySlot, THREE.BufferGeometry>>;

export const FOUNDRY_SLOTS: readonly FoundrySlot[] = ['metal', 'paint', 'glow', 'glass'];
/** The great coil's glow draws with its own material (the render drives its
 *  afterglow after every strike). */
const COIL_GLOW = 'Kit_GreatCoilGlow';
const KIT_WAIT_MS = 8000;

const baked = new Map<string, FoundryBakedPiece>();
let loading: Promise<void> | null = null;
let loaded = false;

function slotOf(materialName: string): FoundrySlot {
  if (/glow/i.test(materialName)) return 'glow';
  if (/glass/i.test(materialName)) return 'glass';
  if (/metal/i.test(materialName)) return 'metal';
  return 'paint';
}

function bakeNode(node: THREE.Object3D): FoundryBakedPiece {
  node.updateWorldMatrix(true, true);
  const parts: Record<FoundrySlot, THREE.BufferGeometry[]> = {
    metal: [],
    paint: [],
    glow: [],
    glass: [],
  };
  node.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const attr = child.geometry.getAttribute(name);
      if (!attr) continue;
      const size = name === 'color' ? 3 : attr.itemSize;
      const values = new Float32Array(attr.count * size);
      for (let i = 0; i < attr.count; i++)
        for (let j = 0; j < size; j++) values[i * size + j] = attr.getComponent(i, j);
      geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
    }
    if (child.geometry.index) geometry.setIndex(child.geometry.index.clone());
    geometry.applyMatrix4(child.matrixWorld);
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    parts[slotOf(material?.name ?? '')].push(geometry);
  });
  const out: FoundryBakedPiece = {};
  for (const slot of FOUNDRY_SLOTS) {
    if (parts[slot].length === 0) continue;
    out[slot] = markSharedGeometry(mergeParts(parts[slot]));
    for (const g of parts[slot]) g.dispose();
  }
  return out;
}

/** Merge geometries into ONE indexed geometry (position, normal, colour).
 *  The kit's own indices are kept (the shipped GLB shares its vertices: a
 *  third of the memory and upload of a triangle soup); a part without an
 *  index gets the trivial one. */
function mergeParts(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  let indices = 0;
  for (const g of list) {
    count += g.attributes.position.count;
    indices += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3).fill(1);
  const index = count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let o = 0;
  let io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    const c = g.attributes.color?.array as Float32Array | undefined;
    if (c) col.set(c, o * 3);
    if (g.index) {
      const src = g.index.array;
      for (let k = 0; k < src.length; k++) index[io++] = src[k] + o;
    } else {
      for (let k = 0; k < n; k++) index[io++] = o + k;
    }
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}

function startKitLoad(): Promise<void> {
  loading ??= loadGltf(STORMBRASS_FOUNDRY_KIT_URL)
    .then((gltf) => {
      gltf.scene.traverse((node) => {
        if (node.name.startsWith('Kit_') && !baked.has(node.name))
          baked.set(node.name, bakeNode(node));
      });
      releaseGltf(STORMBRASS_FOUNDRY_KIT_URL);
    })
    .catch(() => undefined)
    .then(() => {
      loaded = true;
    });
  return loading;
}

// World content: fetched on the deferred lane once the game starts, so the
// first ride up the cable lift usually finds the kit already baked.
if (typeof window !== 'undefined') registerDeferredPreload(() => startKitLoad());

/** Fetch and bake the kit once. Never rejects; resolves within the wait cap
 *  (a later arrival upgrades the stand-ins in place, see buildFoundryKitDressing). */
export function ensureFoundryKit(): Promise<void> {
  if (loaded || typeof window === 'undefined') return Promise.resolve();
  return Promise.race([
    startKitLoad(),
    new Promise<void>((resolve) => setTimeout(resolve, KIT_WAIT_MS)),
  ]);
}

/** Resolves once the kit has landed or failed for good (never rejects). For
 *  the painters that adopt kit pieces later (the press hammers). */
export function foundryKitReady(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return startKitLoad();
}

/** Has the real kit landed (not the stand-in shapes)? */
export function foundryKitLoaded(): boolean {
  return loaded && baked.size > 0;
}

/** A baked kit piece by node name (Kit_*), split by slot, or null until the
 *  real kit has landed (the painters that adopt a piece keep their own shape
 *  until then: Kit_PressHammer, Kit_PressCarriage). */
export function foundryKitPiece(piece: string): FoundryBakedPiece | null {
  return baked.get(piece) ?? null;
}

// ---- materials --------------------------------------------------------------------

const slotMats = new Map<FoundrySlot, THREE.Material>();
let coilGlowMat: THREE.MeshBasicMaterial | null = null;

function lit(name: string, metalness: number, roughness: number): THREE.Material {
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness, roughness, name })
    : new THREE.MeshLambertMaterial({ vertexColors: true, name });
}

/** The shared material of a slot (one program per slot for the whole kit). */
export function foundrySlotMaterial(slot: FoundrySlot): THREE.Material {
  let m = slotMats.get(slot);
  if (m) return m;
  // A low metalness: the kit's weathered vertex paint must read under the
  // storm's flat sky (a full metal goes black without a bright environment).
  if (slot === 'metal') m = lit('StormbrassKitMetal', 0.36, 0.5);
  else if (slot === 'paint') m = lit('StormbrassKitPaint', 0.05, 0.78);
  else if (slot === 'glow')
    m = new THREE.MeshBasicMaterial({
      vertexColors: true,
      name: 'StormbrassKitGlow',
      toneMapped: false,
    });
  else
    m = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      name: 'StormbrassKitGlass',
    });
  markSharedMaterial(m);
  slotMats.set(slot, m);
  return m;
}

/** Resting glow of the great coil between strikes. */
export const COIL_GLOW_REST = 0.42;

/** The great coil's glow: the glow slot's program with its own colour, so
 *  the strike clock can flare and fade it without a new link. */
export function foundryCoilGlowMaterial(): THREE.MeshBasicMaterial {
  if (!coilGlowMat) {
    coilGlowMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      name: 'StormbrassKitCoilGlow',
      toneMapped: false,
    });
    coilGlowMat.color.setScalar(COIL_GLOW_REST);
    markSharedMaterial(coilGlowMat);
  }
  return coilGlowMat;
}

/** Drive the coil's glow: 0 is its resting hum, 1 the strike's white flare.
 *  A colour write only (never a program change). */
export function setFoundryCoilGlow(k: number): void {
  const t = Math.max(0, Math.min(1, k));
  foundryCoilGlowMaterial().color.setScalar(COIL_GLOW_REST + (1.6 - COIL_GLOW_REST) * t);
}

function materialFor(piece: string, slot: FoundrySlot): THREE.Material {
  return piece === COIL_GLOW && slot === 'glow'
    ? foundryCoilGlowMaterial()
    : foundrySlotMaterial(slot);
}

// ---- procedural stand-ins --------------------------------------------------------------

type Rgb = readonly [number, number, number];

function tinted(g: THREE.BufferGeometry, rgb: Rgb): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  const col = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set(rgb, i);
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return n;
}

const BRASS: Rgb = [0.55, 0.36, 0.12];
const IRON: Rgb = [0.05, 0.05, 0.055];
const PAINT: Rgb = [0.06, 0.08, 0.1];
const STONE: Rgb = [0.11, 0.11, 0.12];
const MOLTEN: Rgb = [1.0, 0.42, 0.08];
const STORM: Rgb = [0.4, 0.62, 0.9];
const LAMP: Rgb = [1.0, 0.72, 0.4];
const PANE: Rgb = [0.55, 0.75, 0.9];

interface Part {
  slot: FoundrySlot;
  g: THREE.BufferGeometry;
  rgb: Rgb;
}

const box = (w: number, h: number, d: number, x = 0, y = h / 2, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r0: number, r1: number, h: number, x = 0, y = h / 2, z = 0, sides = 10) =>
  new THREE.CylinderGeometry(r1, r0, h, sides).translate(x, y, z);
/** A wheel or drum on the x axis, centred on the origin. */
const wheel = (r: number, w: number) =>
  new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2);

/** A plain shape per piece, sized to the contract, plus the glow or glass
 *  parts a piece carries, so the stand-ins exercise every slot material. */
function fallbackParts(piece: string): Part[] {
  const m = (g: THREE.BufferGeometry, rgb: Rgb = IRON): Part => ({ slot: 'metal', g, rgb });
  const p = (g: THREE.BufferGeometry, rgb: Rgb = PAINT): Part => ({ slot: 'paint', g, rgb });
  const glow = (g: THREE.BufferGeometry, rgb: Rgb): Part => ({ slot: 'glow', g, rgb });
  const glass = (g: THREE.BufferGeometry): Part => ({ slot: 'glass', g, rgb: PANE });
  switch (piece) {
    case 'Kit_LiftStation':
      return [
        m(box(12, 12, 3)),
        m(box(5, 5, 5, 0, 2.5, -5), BRASS),
        m(wheel(2.2, 0.6).translate(0, 14, -2), BRASS),
      ];
    case 'Kit_WorkLamp':
      return [
        m(cyl(0.16, 0.12, 3.6)),
        m(box(0.6, 0.5, 0.6, 0, 3.9), BRASS),
        glow(new THREE.SphereGeometry(0.22, 8, 6).translate(0, 3.75, 0), LAMP),
        glass(box(0.5, 0.45, 0.5, 0, 3.75)),
      ];
    case 'Kit_RailCart':
      return [m(box(3.2, 1.4, 6, 0, 1.0)), m(box(2.8, 0.8, 5.4, 0, 2.1), BRASS)];
    case 'Kit_PlateStack':
      return [m(box(4.8, 3, 3.2), BRASS)];
    case 'Kit_SteamVent':
      return [m(cyl(0.55, 0.45, 1.3))];
    case 'Kit_WaterTower':
      return [m(cyl(2.2, 1.8, 8)), m(cyl(2.9, 2.9, 4.5, 0, 10.25), [0.12, 0.3, 0.24])];
    case 'Kit_ConveyorRun':
      return [m(box(4, 1.4, 2.4)), p(box(4, 0.1, 2, 0, 1.42), [0.03, 0.03, 0.03])];
    case 'Kit_CraneMast':
      return [m(box(1.6, 16, 1.6), [0.08, 0.08, 0.09]), p(cyl(2.4, 2.4, 0.4), STONE)];
    case 'Kit_CraneJib':
      return [
        m(box(1, 1, 19, 0, 0.6, 4.5), [0.08, 0.08, 0.09]),
        m(box(1.6, 1.6, 2, 0, 0.2, -4.5)),
        m(cyl(0.05, 0.05, 7, 0, -3.5, 12)),
        glass(box(1.2, 1, 1.2, 1.2, 0.8, 0)),
        glow(new THREE.SphereGeometry(0.12, 6, 4).translate(1.2, 1.5, 0), LAMP),
      ];
    case 'Kit_PressPost':
      return [m(cyl(1.5, 1.3, 14))];
    case 'Kit_PressCrown':
      return [
        m(box(46, 3, 5.2)),
        m(cyl(2, 2, 18, -8, 5, 0, 16).rotateZ(Math.PI / 2), BRASS),
        m(cyl(1.2, 1, 13, 8, 9.5)),
        m(cyl(1.2, 1, 13, -8, 9.5)),
      ];
    case 'Kit_PressRam':
      return [m(cyl(0.5, 0.5, 5), [0.3, 0.3, 0.32])];
    case 'Kit_PressHammer':
      return [m(box(4.8, 2.8, 5.2)), m(cyl(0.5, 0.5, 4.2, 0, 4.9), BRASS)];
    case 'Kit_PressCarriage':
      return [m(box(3.2, 2.2, 4, 0, -1.1))];
    case 'Kit_PartsChute':
      return [
        m(box(42, 3, 4.8, 0, 7.8), BRASS),
        m(box(0.8, 7, 0.8, -23.4, 3.5)),
        m(box(0.8, 7, 0.8, 23.4, 3.5)),
      ];
    case 'Kit_Bunker':
      return [p(box(7, 1.6, 2), [0.2, 0.18, 0.12])];
    case 'Kit_TargetFrame':
      return [
        m(box(3.2, 3, 0.3)),
        p(
          cyl(1.2, 1.2, 0.2, 0, 0, 0, 16)
            .rotateX(Math.PI / 2)
            .translate(0, 1.9, 0.2),
          [0.5, 0.1, 0.06],
        ),
      ];
    case 'Kit_TurretEmplacement':
      return [p(cyl(2.2, 2.2, 1.2), [0.2, 0.18, 0.12]), m(box(0.9, 0.9, 3, 0, 2, 0.8), BRASS)];
    case 'Kit_CoilPylon':
      return [
        m(cyl(0.6, 0.35, 10)),
        glow(new THREE.SphereGeometry(0.5, 8, 6).translate(0, 10.4, 0), STORM),
      ];
    case 'Kit_GreatCoil':
      return [
        p(cyl(5.5, 5.5, 1.4), STONE),
        m(cyl(2.6, 2.2, 30, 0, 16), BRASS),
        m(new THREE.TorusGeometry(5, 1, 8, 24).rotateX(Math.PI / 2).translate(0, 29.5, 0)),
      ];
    case COIL_GLOW:
      return [
        glow(cyl(1.4, 1.4, 26, 0, 16), STORM),
        glow(new THREE.SphereGeometry(0.9, 8, 6).translate(0, 33, 0), STORM),
      ];
    case 'Kit_LightningRod':
      return [
        m(cyl(0.3, 0.12, 9.5)),
        m(new THREE.SphereGeometry(0.4, 8, 6).translate(0, 9.3, 0), BRASS),
      ];
    case 'Kit_BlueprintTable':
      return [
        p(box(8, 1.2, 5), [0.18, 0.12, 0.07]),
        p(box(7.4, 0.04, 4.4, 0, 1.22), [0.03, 0.09, 0.3]),
      ];
    case 'Kit_ModelFrame':
      return [m(box(4, 7, 4).scale(1, 1, 1)), m(box(1.8, 2.6, 1.2, 0, 3.4), BRASS)];
    case 'Kit_CellRackSmall':
    case 'Kit_CellRack': {
      const big = piece === 'Kit_CellRack';
      const w = big ? 6 : 5;
      const h = big ? 5.2 : 3.5;
      return [
        m(box(w, 0.4, big ? 2.8 : 2)),
        m(box(w, 0.3, big ? 2.8 : 2, 0, h - 0.15)),
        glass(box(w * 0.8, h - 1, 0.9, 0, h / 2)),
        glow(box(w * 0.6, h - 1.4, 0.3, 0, h / 2), STORM),
      ];
    }
    case 'Kit_GantryScaffold':
      return [m(box(3, 34, 3, -10, 17)), m(box(3, 34, 3, 10, 17)), m(box(24, 1.2, 1.6, 0, 33))];
    case 'Kit_Grinder':
      return [m(box(1.4, 1.2, 1)), p(wheel(0.6, 0.3).translate(0, 1.2, 0), STONE)];
    case 'Kit_RailingEdge':
      return [
        m(box(4, 0.12, 0.1, 0, 1.25)),
        m(box(0.1, 1.3, 0.1, -1.95, 0.65)),
        p(box(4, 0.9, 0.3, 0, -0.45), PAINT),
      ];
    case 'Kit_MachineLip':
      return [
        m(box(4, 8.35, 0.6, 0, -3.8)),
        m(cyl(0.3, 0.3, 4, 0, -1.5, 0.6).rotateZ(Math.PI / 2)),
      ];
    case 'Kit_PipeEdge':
      return [
        p(box(4, 6.4, 1, 0, -2.9), STONE),
        m(cyl(0.25, 0.25, 4, 0, 0.5, 0).rotateZ(Math.PI / 2), BRASS),
      ];
    case 'Kit_TowerPanel':
      return [m(box(4, 36.35, 0.6, 0, -17.8))];
    case 'Kit_Flywheel':
      return [m(wheel(2.4, 0.6)), m(box(0.6, 4.4, 0.4))];
    case 'Kit_Gear':
      return [m(wheel(1.6, 0.5), BRASS), m(box(0.5, 3.4, 0.5), BRASS)];
    case 'Kit_PistonEngine':
      return [m(box(3, 3, 2.4)), m(cyl(0.7, 0.7, 1.5, 0, 3.75), BRASS)];
    case 'Kit_PistonRod':
      return [m(cyl(0.25, 0.25, 2.5), [0.3, 0.3, 0.32])];
    case 'Kit_Smokestack':
      return [m(cyl(1.4, 1.1, 24))];
    case 'Kit_MachineBlock':
      return [m(box(6, 4.5, 4)), m(box(1, 2.6, 1.4, 3.3, 1.3), BRASS)];
    case 'Kit_Boiler':
      return [
        m(
          cyl(1.7, 1.7, 8, 0, 0, 0, 14)
            .rotateZ(Math.PI / 2)
            .translate(0, 2.6, 0),
          BRASS,
        ),
        glow(box(0.1, 1, 1, -4.05, 1.6), MOLTEN),
      ];
    case 'Kit_PipeRun':
      return [m(wheel(0.35, 4), BRASS)];
    case 'Kit_PipeElbow':
      return [m(wheel(0.35, 1).translate(-0.5, 0, 0), BRASS), m(cyl(0.35, 0.35, 1), BRASS)];
    case 'Kit_PipeValve':
      return [m(wheel(0.4, 1.2), BRASS), m(cyl(0.05, 0.05, 0.8))];
    case 'Kit_PipeRiser':
      return [m(cyl(0.35, 0.35, 10), BRASS)];
    case 'Kit_Catwalk':
      return [m(box(4, 0.2, 2.4, 0, -0.1))];
    case 'Kit_CatwalkTruss':
      return [m(box(4, 2.9, 9.8, 0, -1.55), [0.06, 0.06, 0.065])];
    case 'Kit_Scaffold':
      return [m(box(4, 4, 4))];
    case 'Kit_RailTrack':
      return [
        p(box(2, 0.12, 3, 0, 0.0), [0.15, 0.1, 0.06]),
        m(box(2, 0.22, 0.14, 0, 0.11, 1.1)),
        m(box(2, 0.22, 0.14, 0, 0.11, -1.1)),
      ];
    case 'Kit_RailBuffer':
      return [m(box(1.6, 1.5, 3))];
    case 'Kit_Crate':
      return [p(box(1.4, 1.4, 1.4), [0.2, 0.13, 0.07])];
    case 'Kit_CrateStack':
      return [p(box(3.2, 2.8, 2.2), [0.2, 0.13, 0.07])];
    case 'Kit_IngotStack':
      return [m(box(2, 1.1, 1.4), BRASS)];
    case 'Kit_DrumCluster':
      return [m(cyl(1.1, 1.1, 1.3))];
    case 'Kit_Workbench':
      return [
        p(box(3.2, 1.1, 1.2), [0.2, 0.13, 0.07]),
        glow(new THREE.SphereGeometry(0.15, 6, 4).translate(1.2, 1.4, 0), LAMP),
      ];
    case 'Kit_Spool':
      return [p(wheel(0.8, 1.2).translate(0, 0.8, 0), [0.2, 0.13, 0.07])];
    case 'Kit_Sandbags':
      return [p(box(3, 1.1, 1.2), [0.3, 0.24, 0.13])];
    case 'Kit_ScrapHeap':
      return [m(new THREE.ConeGeometry(1.6, 2.2, 7).translate(0, 1.1, 0))];
    case 'Kit_OreSeam':
      return [
        p(new THREE.DodecahedronGeometry(1.4).scale(1.1, 0.9, 0.7).translate(0, 1.2, 0), STONE),
        m(box(1, 0.2, 0.2, 0, 1.4, 0.9), BRASS),
      ];
    case 'Kit_ChainPost':
      return [m(cyl(0.35, 0.3, 1.5))];
    case 'Kit_ScrapCart':
      return [m(box(1.4, 1.2, 2.2, 0, 0.8))];
    case 'Kit_Ladle':
      return [m(cyl(1.0, 1.3, 2.6, 0, -1.9)), glow(cyl(1.1, 1.1, 0.05, 0, -0.8), MOLTEN)];
    case 'Kit_LadleRail':
      return [m(box(4, 0.8, 0.6, 0, 0.4))];
    case 'Kit_LadleTrolley':
      return [m(box(1.4, 1.5, 1.2, 0, -0.75))];
    case 'Kit_PourFrame':
      return [m(box(1.2, 9, 2))];
    case 'Kit_Mould':
      return [m(box(4, 0.8, 1.6)), glow(box(3.4, 0.04, 1.0, 0, 0.8), MOLTEN)];
    case 'Kit_FurnaceMouth':
      return [
        p(box(10, 12, 9, 0, 6, -1.5), [0.25, 0.12, 0.08]),
        glow(box(4, 3, 0.2, 0, 1.6, 3.0), MOLTEN),
        m(cyl(1.2, 1, 6, 0, 13, -4)),
      ];
    case 'Kit_ChannelSegment':
      return [p(box(4, 2, 7.6, 0, -0.2), STONE)];
    case 'Kit_Pier':
      return [p(box(14, 100, 14), STONE)];
    case 'Kit_BoilerHouse':
      return [
        m(box(18, 14, 14)),
        m(cyl(1.4, 1.2, 20, -4, 24, 2)),
        m(cyl(1.4, 1.2, 20, 4, 24, -2)),
        glow(box(12, 1.5, 0.1, 0, 7, 7.05), LAMP),
      ];
    case 'Kit_BeltHousing':
      return [m(box(4, 0.45, 0.7))];
    case 'Kit_BeltDrum':
      return [m(box(5.2, 0.7, 1.6))];
    case 'Kit_BridgeSpan':
      return [
        m(box(4, 0.3, 9, 0, -0.15)),
        m(box(4, 1.3, 0.3, 0, 0.65, 4.4)),
        m(box(4, 1.3, 0.3, 0, 0.65, -4.4)),
        m(box(4, 2.2, 8, 0, -1.4)),
      ];
    case 'Kit_HookBlock':
      return [m(box(1.4, 2.2, 1, 0, -1.1), BRASS)];
    case 'Kit_Chain':
    case 'Kit_Cable':
      return [m(box(1, 0.1, 0.1, 0.5, 0))];
    default:
      return [m(box(1, 1, 1))];
  }
}

function fallbackPiece(piece: string): FoundryBakedPiece {
  const parts: Record<FoundrySlot, THREE.BufferGeometry[]> = {
    metal: [],
    paint: [],
    glow: [],
    glass: [],
  };
  for (const part of fallbackParts(piece)) {
    const g = tinted(part.g, part.rgb);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    parts[part.slot].push(g);
  }
  const out: FoundryBakedPiece = {};
  for (const slot of FOUNDRY_SLOTS) {
    if (parts[slot].length > 0) out[slot] = markSharedGeometry(mergeParts(parts[slot]));
  }
  return out;
}

const fallbacks = new Map<string, FoundryBakedPiece>();

/** A piece's geometry: the baked kit node, else its stand-in. */
export function foundryPieceGeometry(piece: string): FoundryBakedPiece {
  const got = baked.get(piece);
  if (got) return got;
  let fb = fallbacks.get(piece);
  if (!fb) {
    fb = fallbackPiece(piece);
    fallbacks.set(piece, fb);
  }
  return fb;
}

/** The material every slot of a piece draws with (the coil's own glow). */
export function foundryPieceMaterial(piece: string, slot: FoundrySlot): THREE.Material {
  return materialFor(piece, slot);
}

// ---- the painter ------------------------------------------------------------------------

const fieldGround = (x: number, z: number): number =>
  authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z);

const tmpM = new THREE.Matrix4();
const tmpShear = new THREE.Matrix4();
const tmpScale = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScl = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

/** A placement's instance matrix (the kit test reproduces it in plain math). */
export function foundryPlacementMatrix(
  p: FoundryKitPlacement,
  out: THREE.Matrix4,
  ground: (x: number, z: number) => number = fieldGround,
): THREE.Matrix4 {
  tmpQ.setFromAxisAngle(UP, p.rot);
  tmpPos.set(p.x, p.y ?? ground(p.x, p.z) + (p.lift ?? 0), p.z);
  tmpScl.set(p.scale * (p.stretch ?? 1), p.scale * (p.scaleY ?? 1), p.scale);
  if (p.shear) {
    out.compose(tmpPos, tmpQ, ONE);
    tmpShear.set(1, 0, 0, 0, p.shear, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    out.multiply(tmpShear).multiply(tmpScale.makeScale(tmpScl.x, tmpScl.y, tmpScl.z));
  } else {
    out.compose(tmpPos, tmpQ, tmpScl);
  }
  return out;
}

/** The side of a culling cell (yards). The dungeon is 230 by 480 yd: one
 *  InstancedMesh per piece over the whole plan would never leave either the
 *  camera's frustum or the shadow box, so instances are bucketed by cell and
 *  each bucket carries a local bounding sphere. */
const CULL_CELL = 110;

/** Pieces that never cast a shadow: the skyline and its piers and mains out in
 *  the drop, the trim hanging down the cliff faces under the walk surface, and
 *  the pieces lying flat on the floor. (They still receive.) */
const NO_SHADOW: ReadonlySet<string> = new Set([
  'Kit_BoilerHouse',
  'Kit_Pier',
  'Kit_PipeRun',
  'Kit_PipeValve',
  'Kit_MachineLip',
  'Kit_PipeEdge',
  'Kit_TowerPanel',
  'Kit_CatwalkTruss',
  'Kit_ChannelSegment',
  'Kit_RailTrack',
  'Kit_FloorGrille',
  'Kit_BeltHousing',
  'Kit_Cable',
  'Kit_DraftScaffoldTower',
]);

/** Instance a list of placements (one InstancedMesh per piece, culling cell
 *  and slot). A placement without `y` stands on the field's ground. */
export function instanceFoundryPlacements(
  list: readonly FoundryKitPlacement[],
  lowGfx: boolean,
  name: string,
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const byPiece = new Map<string, FoundryKitPlacement[]>();
  for (const p of list) {
    if (lowGfx && p.cosmetic) continue;
    const key = `${p.piece}|${Math.floor(p.x / CULL_CELL)}|${Math.floor(p.z / CULL_CELL)}`;
    const bucket = byPiece.get(key) ?? [];
    bucket.push(p);
    byPiece.set(key, bucket);
  }
  for (const bucket of byPiece.values()) {
    const piece = bucket[0].piece;
    const geo = foundryPieceGeometry(piece);
    const casts = !lowGfx && !NO_SHADOW.has(piece);
    for (const slot of FOUNDRY_SLOTS) {
      const g = geo[slot];
      if (!g) continue;
      const mesh = new THREE.InstancedMesh(g, materialFor(piece, slot), bucket.length);
      mesh.name = `${piece}:${slot}`;
      for (const [i, p] of bucket.entries()) mesh.setMatrixAt(i, foundryPlacementMatrix(p, tmpM));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = casts && (slot === 'metal' || slot === 'paint');
      mesh.receiveShadow = slot === 'metal' || slot === 'paint';
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}

function buildDressingGroup(lowGfx: boolean): THREE.Group {
  return instanceFoundryPlacements(planFoundryKitPlacements(), lowGfx, 'stormbrassFoundryKit');
}

/** Swap a group built from stand-ins for the real kit the moment it lands
 *  (same materials, so no new program). `build` rebuilds it. */
export function upgradeWhenKitLands(group: THREE.Object3D, build: () => THREE.Object3D): void {
  if (loaded || !loading) return;
  void loading.then(() => {
    const parent = group.parent;
    if (!parent || baked.size === 0) return;
    parent.add(build());
    group.removeFromParent();
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
  });
}

/** Instance the whole static kit over the layout (instance-local frame). */
export function buildFoundryKitDressing(lowGfx: boolean): THREE.Group {
  const group = buildDressingGroup(lowGfx);
  upgradeWhenKitLands(group, () => buildDressingGroup(lowGfx));
  return group;
}

/** One plain Mesh per slot of a kit piece under a group (for the painters
 *  that move a single piece: the gates' shutters, the Crane Bridge's crane).
 *  `transform` bakes a matrix into a private copy of the geometry. */
export function foundryKitMeshes(piece: string, transform?: THREE.Matrix4): THREE.Group {
  const group = new THREE.Group();
  group.name = piece;
  const geo = foundryPieceGeometry(piece);
  for (const slot of FOUNDRY_SLOTS) {
    const g = geo[slot];
    if (!g) continue;
    const mesh = new THREE.Mesh(
      transform ? g.clone().applyMatrix4(transform) : g,
      materialFor(piece, slot),
    );
    mesh.name = `${piece}:${slot}`;
    mesh.castShadow = slot === 'metal' || slot === 'paint';
    mesh.receiveShadow = slot === 'metal' || slot === 'paint';
    group.add(mesh);
  }
  return group;
}

/** A piece tiled `count` times along its local x (each tile `step` apart,
 *  stretched to it), merged into one geometry per slot: a bridge span, a
 *  rail, a run of pipe that moves as ONE mesh per slot. `tile` is the
 *  piece's own length along x. */
export function foundryKitRun(
  piece: string,
  count: number,
  step: number,
  tile: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `${piece}:run`;
  const geo = foundryPieceGeometry(piece);
  const m = new THREE.Matrix4();
  for (const slot of FOUNDRY_SLOTS) {
    const g = geo[slot];
    if (!g) continue;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      m.makeScale(step / tile, 1, 1).setPosition(step * (i + 0.5), 0, 0);
      parts.push(g.clone().applyMatrix4(m));
    }
    const merged = mergeParts(parts);
    for (const p of parts) p.dispose();
    const mesh = new THREE.Mesh(merged, materialFor(piece, slot));
    mesh.name = `${piece}:${slot}:run`;
    mesh.castShadow = slot === 'metal' || slot === 'paint';
    mesh.receiveShadow = slot === 'metal' || slot === 'paint';
    group.add(mesh);
  }
  return group;
}
