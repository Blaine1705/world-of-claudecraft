// The Palmreach's dressing, render-only: procedural palms leaning over the
// beach shelf (the sim's decoration grid skips the sand, so the strand
// belongs to this module), giant vine-hung banyans at the greatTrees spots
// (the same records the sim's trunk colliders use), and vine curtains under
// their crowns. Same contract as the sibling realm modules: build once,
// update(time) animates gently.
import * as THREE from 'three';
import { PALMREACH_PROPS } from '../sim/content/palmreach';
import { hash2 } from '../sim/rng';
import { reachLandness, terrainHeight, WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';

export interface JungleFeaturesView {
  group: THREE.Group;
  update(time: number): void;
}

const REACH_ZMIN = 700;
const REACH_ZMAX = 1260;

// The banyans reuse the twisted-elder model the Hollow's centerpiece and the
// Wraithwood's giants wear (already preloaded twice over, so free), regrown
// lush and hung with vines.
const GREAT_TREE_URL = '/models/foliage/twisted_1.glb';
let greatTreeScene: THREE.Group | null = null;
registerPreload(
  loadGltf(GREAT_TREE_URL).then((gltf) => {
    greatTreeScene = gltf.scene;
  }),
);

function mat(color: number, rough = 0.85): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true })
    : new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// One palm, merged into two geometries (trunk wood + frond green) so the
// whole strand instances as two draws: a leaning segmented trunk and a
// crown of drooping frond blades.
function palmGeos(): { trunk: THREE.BufferGeometry; fronds: THREE.BufferGeometry } {
  const trunkParts: THREE.BufferGeometry[] = [];
  const SEGS = 5;
  const H = 7.2;
  let px = 0;
  for (let i = 0; i < SEGS; i++) {
    const seg = new THREE.CylinderGeometry(0.16 - i * 0.014, 0.19 - i * 0.014, H / SEGS + 0.12, 5);
    px += (i + 0.5) * 0.16; // the lean: each segment steps seaward
    seg.translate(px, (i + 0.5) * (H / SEGS), 0);
    seg.rotateZ(-0.06 * i);
    trunkParts.push(seg.toNonIndexed());
  }
  const frondParts: THREE.BufferGeometry[] = [];
  const crownX = px + 0.35;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const frond = new THREE.ConeGeometry(0.34, 3.4, 3);
    frond.scale(1, 1, 0.22); // flatten into a blade
    frond.rotateX(Math.PI / 2); // point outward
    frond.rotateZ(0); // droop handled below
    const droop = 0.55 + ((i * 5) % 3) * 0.12;
    const m = new THREE.Matrix4()
      .makeRotationY(ang)
      .multiply(new THREE.Matrix4().makeRotationX(droop));
    frond.translate(0, 3.4 / 2, 0); // pivot at the crown
    frond.applyMatrix4(new THREE.Matrix4().makeRotationX(-droop));
    frond.applyMatrix4(new THREE.Matrix4().makeRotationY(ang));
    frond.translate(crownX, H, 0);
    frondParts.push(frond.toNonIndexed());
  }
  // coconuts: a small cluster under the crown
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.SphereGeometry(0.14, 5, 4);
    nut.translate(crownX + (i - 1) * 0.16, H - 0.25, (i % 2) * 0.18 - 0.09);
    trunkParts.push(nut.toNonIndexed());
  }
  const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    let total = 0;
    for (const g of parts) total += g.getAttribute('position').count;
    const pos = new Float32Array(total * 3);
    const norm = new Float32Array(total * 3);
    let off = 0;
    for (const g of parts) {
      pos.set(g.getAttribute('position').array as Float32Array, off);
      norm.set(g.getAttribute('normal').array as Float32Array, off);
      off += g.getAttribute('position').count * 3;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    return out;
  };
  return { trunk: merge(trunkParts), fronds: merge(frondParts) };
}

const PALM_TRUNK_TINTS = [0xa8845c, 0x9a7852, 0xb08e66];
const PALM_FROND_TINTS = [0x3fa04a, 0x4cb058, 0x36923f];

export function buildJungleFeatures(seed: number): JungleFeaturesView {
  const group = new THREE.Group();
  group.name = 'jungle-features';

  const instance = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    spots: { x: number; z: number; y: number; s: number; rot: number; tint?: number }[],
    tinted = false,
  ) => {
    if (spots.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, material, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    spots.forEach((sp, i) => {
      q.setFromAxisAngle(up, sp.rot);
      v.set(sp.x, sp.y, sp.z);
      sc.set(sp.s, sp.s, sp.s);
      mesh.setMatrixAt(i, m.compose(v, q, sc));
      if (tinted && sp.tint !== undefined) mesh.setColorAt(i, new THREE.Color(sp.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };

  // --- the palms: a deterministic grid over the beach shelf, leaning at
  // the sea (each palm's own lean is baked into the geometry; the rot
  // spreads them so the strand never repeats) ---
  {
    const geos = palmGeos();
    const spots: { x: number; z: number; y: number; s: number; rot: number; tint: number }[] = [];
    for (let gx = -536; gx <= -184; gx += 8) {
      for (let gz = REACH_ZMIN + 10; gz <= REACH_ZMAX - 10; gz += 8) {
        const r = hash2(gx, gz, seed + 5101);
        if (r > 0.62) continue;
        const x = gx + (hash2(gx, gz, seed + 5111) - 0.5) * 7;
        const z = gz + (hash2(gz, gx, seed + 5121) - 0.5) * 7;
        const land = reachLandness(x, z);
        // the beach band only: off the deep jungle, out of the surf
        if (land < 0.045 || land > 0.24) continue;
        const y = terrainHeight(x, z, seed);
        if (y < WATER_LEVEL + 0.5 || y > 3.6) continue;
        spots.push({
          x,
          z,
          y: y - 0.15,
          s: 0.85 + hash2(x, z, seed + 5131) * 0.5,
          rot: hash2(z, x, seed + 5141) * Math.PI * 2,
          tint: 0,
        });
      }
    }
    const trunkSpots = spots.map((sp, i) => ({
      ...sp,
      tint: PALM_TRUNK_TINTS[i % PALM_TRUNK_TINTS.length],
    }));
    const frondSpots = spots.map((sp, i) => ({
      ...sp,
      tint: PALM_FROND_TINTS[i % PALM_FROND_TINTS.length],
    }));
    instance(geos.trunk, mat(0xffffff, 0.9), trunkSpots, true);
    instance(geos.fronds, mat(0xffffff, 0.8), frondSpots, true);
  }

  // --- the banyans: the twisted elder regrown lush, hung with vines ---
  {
    const lushened = new Map<string, THREE.Material>();
    const lushen = (source: THREE.Material): THREE.Material => {
      let m2 = lushened.get(source.uuid);
      if (!m2) {
        m2 = source.clone();
        const c = (m2 as THREE.MeshStandardMaterial).color;
        if (c) c.multiply(new THREE.Color(0.75, 1.05, 0.7));
        lushened.set(source.uuid, m2);
      }
      return m2;
    };
    const vineGeo = new THREE.CylinderGeometry(0.05, 0.028, 1, 3);
    vineGeo.translate(0, -0.5, 0); // hangs from its anchor
    const vineMat = mat(0x4a8c46, 0.9);
    const vineSpots: { x: number; z: number; y: number; s: number; rot: number }[] = [];
    const trees = PALMREACH_PROPS.greatTrees ?? [];
    if (greatTreeScene) {
      for (const t of trees) {
        const y = terrainHeight(t.x, t.z, seed);
        if (y < WATER_LEVEL) continue;
        const tree = greatTreeScene.clone(true);
        const scale = t.r * (2.5 + hash2(t.x, t.z, seed + 5201) * 0.5);
        tree.position.set(t.x, y - 0.2, t.z);
        tree.scale.setScalar(scale);
        tree.rotation.y = hash2(t.z, t.x, seed + 5211) * Math.PI * 2;
        tree.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map(lushen)
              : lushen(mesh.material);
          }
        });
        group.add(tree);
        // the vine curtain: strands hung in a ring under the crown
        const crownR = scale * 1.6;
        const crownY = y + scale * 2.6;
        const strands = 10 + Math.floor(hash2(t.x, t.z, seed + 5221) * 6);
        for (let k = 0; k < strands; k++) {
          const ang = (k / strands) * Math.PI * 2 + hash2(k, t.x, seed + 5231);
          const rad = crownR * (0.5 + hash2(k, t.z, seed + 5241) * 0.5);
          const len = 4 + hash2(t.x + k, t.z - k, seed + 5251) * 6;
          vineSpots.push({
            x: t.x + Math.sin(ang) * rad,
            z: t.z + Math.cos(ang) * rad,
            y: crownY + hash2(k, k + 1, seed + 5261) * scale * 0.8,
            s: len,
            rot: 0,
          });
        }
      }
    }
    // vines scale on Y only: compose with a per-instance non-uniform scale
    if (vineSpots.length > 0) {
      const mesh = new THREE.InstancedMesh(vineGeo, vineMat, vineSpots.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3();
      vineSpots.forEach((sp, i) => {
        v.set(sp.x, sp.y, sp.z);
        sc.set(1, sp.s, 1);
        mesh.setMatrixAt(i, m.compose(v, q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  return {
    group,
    update(): void {
      // still air: the global wind shader sways the modeled foliage; the
      // strand itself holds its pose
    },
  };
}
