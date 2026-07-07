import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RIFT_TIER_COLORS, type RiftTier } from '../sim/types';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

// The dungeon door / exit-portal visual system, lifted out of renderer.ts so the
// orchestrator only calls buildDoorBody() (the same shape as buildProps /
// buildMailboxPillar / buildDelveInteractable). Geometry and materials are
// shared, process-lifetime resources tagged via shared_resource so the renderer's
// per-view disposal guard never frees them (see the note there).

// Additive boost applied to the portal shimmer on non-low tiers so it blooms on
// the composer.
const PORTAL_BOOST = 2;

let stoneMat: THREE.Material | null = null;
let archGeo: THREE.BufferGeometry | null = null;
let keystoneGeo: THREE.BufferGeometry | null = null;
let plinthGeo: THREE.BufferGeometry | null = null;
let portalGeo: THREE.BufferGeometry | null = null;
let nythraxisClickGeo: THREE.BufferGeometry | null = null;
let nythraxisClickMat: THREE.MeshBasicMaterial | null = null;
// Keyed by `${entering}:${lowGfx}`. In production lowGfx is fixed for the
// renderer's lifetime, so only two entries are ever created (identical to the
// previous per-entering caching that captured lowGfx at first build); keying it
// on both inputs just keeps the builder correct for any caller and unit-testable.
const portalMats = new Map<string, THREE.MeshBasicMaterial>();

function doorStoneMaterial(): THREE.Material {
  stoneMat ??= markSharedMaterial(new THREE.MeshLambertMaterial({ color: 0x6a6a72 }));
  return stoneMat;
}

function doorArchGeometry(): THREE.BufferGeometry {
  if (!archGeo) {
    const outer = new THREE.Shape();
    outer.moveTo(-2.1, 0);
    outer.lineTo(-2.1, 3.1);
    outer.quadraticCurveTo(-2.1, 4.85, 0, 5.05);
    outer.quadraticCurveTo(2.1, 4.85, 2.1, 3.1);
    outer.lineTo(2.1, 0);
    outer.closePath();
    const inner = new THREE.Path();
    inner.moveTo(-1.3, -0.5);
    inner.lineTo(-1.3, 2.9);
    inner.quadraticCurveTo(-1.3, 4.05, 0, 4.22);
    inner.quadraticCurveTo(1.3, 4.05, 1.3, 2.9);
    inner.lineTo(1.3, -0.5);
    inner.closePath();
    outer.holes.push(inner);
    const geo = new THREE.ExtrudeGeometry(outer, {
      depth: 0.7,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.07,
      bevelSegments: 1,
    });
    geo.translate(0, 0, -0.35);
    archGeo = markSharedGeometry(geo);
  }
  return archGeo;
}

function doorKeystoneGeometry(): THREE.BufferGeometry {
  keystoneGeo ??= markSharedGeometry(new THREE.BoxGeometry(0.7, 1.0, 0.95));
  return keystoneGeo;
}

function doorPlinthGeometry(): THREE.BufferGeometry {
  plinthGeo ??= markSharedGeometry(new THREE.BoxGeometry(1.15, 0.7, 1.15));
  return plinthGeo;
}

function doorPortalGeometry(): THREE.BufferGeometry {
  portalGeo ??= markSharedGeometry(new THREE.CircleGeometry(1.55, 24));
  return portalGeo;
}

function doorNythraxisClickGeometry(): THREE.BufferGeometry {
  nythraxisClickGeo ??= markSharedGeometry(new THREE.BoxGeometry(4.6, 4.2, 2.4));
  return nythraxisClickGeo;
}

function doorNythraxisClickMaterial(): THREE.MeshBasicMaterial {
  nythraxisClickMat ??= markSharedMaterial(
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.001,
      depthWrite: false,
    }),
  );
  return nythraxisClickMat;
}

function doorPortalMaterial(entering: boolean, lowGfx: boolean): THREE.MeshBasicMaterial {
  const key = `${entering}:${lowGfx}`;
  const existing = portalMats.get(key);
  if (existing) return existing;
  const tint = entering ? 0x9a5df0 : 0x6ab8ff;
  const material = markSharedMaterial(
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  if (!lowGfx) material.color.multiplyScalar(PORTAL_BOOST);
  portalMats.set(key, material);
  return material;
}

// Soft radial "energy membrane" texture for the rift gate: a bright core fading
// to transparent at the rim (so the disc fills the opening with soft edges that
// tuck behind the frame instead of a hard-edged spinning oval), plus faint
// spiral arms so the renderer's per-frame rotation reads as swirling energy
// rather than a rotating ball. White so the material colour tints it per rank.
let riftPortalTex: THREE.CanvasTexture | null = null;

function riftPortalTexture(): THREE.CanvasTexture | null {
  if (riftPortalTex) return riftPortalTex;
  if (typeof document === 'undefined') return null;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const c = S / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(235,235,255,0.6)');
  grad.addColorStop(0.78, 'rgba(210,210,255,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c, c, c, 0, Math.PI * 2);
  g.fill();
  // Faint spiral arms (deterministic, no rng): each is a widening curved streak
  // spun around the centre, giving the rotation something to carry.
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.lineCap = 'round';
  const ARMS = 5;
  for (let a = 0; a < ARMS; a++) {
    const base = (a / ARMS) * Math.PI * 2;
    g.beginPath();
    for (let t = 0; t <= 1; t += 0.04) {
      const r = t * c * 0.92;
      const ang = base + t * 2.4; // spiral twist
      const x = c + Math.cos(ang) * r;
      const y = c + Math.sin(ang) * r;
      if (t === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.lineWidth = 6;
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  riftPortalTex = tex;
  return tex;
}

// Rift-gate shimmer tinted by rank (shared with the rank badge + chat colour via
// RIFT_TIER_COLORS), so a C gate glows green, B blue, A violet, S gold. Cached
// per (tier, lowGfx) like doorPortalMaterial.
const riftPortalMats = new Map<string, THREE.MeshBasicMaterial>();

function riftPortalMaterial(tier: RiftTier, lowGfx: boolean): THREE.MeshBasicMaterial {
  const key = `${tier}:${lowGfx}`;
  const existing = riftPortalMats.get(key);
  if (existing) return existing;
  const material = markSharedMaterial(
    new THREE.MeshBasicMaterial({
      color: RIFT_TIER_COLORS[tier],
      map: riftPortalTexture() ?? undefined,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  if (!lowGfx) material.color.multiplyScalar(PORTAL_BOOST);
  riftPortalMats.set(key, material);
  return material;
}

// The world-spawned ranked rift portal uses a bespoke "dimensional gate" GLB
// (Solo Leveling style) instead of the procedural stone arch. Loaded once at
// boot (preload gate), then cloned per portal view. Falls back to the arch if
// the asset is missing.
const RIFT_GATE_URL = '/models/props/rift_portal.glb';
// Target world height (yards) the ~1.13-unit native model is scaled up to; the
// gate looms taller than the old 5 yd arch to read from across the zone.
const RIFT_GATE_HEIGHT = 6.0;
let riftGateGltf: GLTF | null = null;

if (typeof window !== 'undefined') {
  registerPreload(
    loadGltf(RIFT_GATE_URL)
      .then((gltf) => {
        // Per-portal views clone the scene but SHARE geometry/material refs with
        // this cached original; mark them shared so the renderer's per-view
        // disposal guard never frees them (interest churn would otherwise poison
        // every later clone). Same contract as the procedural arch resources.
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          markSharedGeometry(mesh.geometry);
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach(markSharedMaterial);
          else markSharedMaterial(mat);
        });
        riftGateGltf = gltf;
      })
      .catch(() => {
        // Missing/broken asset: buildRiftGateBody falls back to the arch.
        riftGateGltf = null;
      }),
  );
}

/** The world-spawned rift gate body (bespoke GLB), normalized to xz-center +
 * base at y=0 and scaled to RIFT_GATE_HEIGHT, with the portal shimmer filling
 * its opening. Returns null when the asset has not loaded (caller falls back to
 * the procedural arch). */
export function buildRiftGateBody(
  lowGfx: boolean,
  tier: RiftTier = 'A',
): { body: THREE.Group; portal?: THREE.Mesh } | null {
  if (!riftGateGltf) return null;
  const body = new THREE.Group();
  const gate = riftGateGltf.scene.clone(true);
  gate.updateMatrixWorld(true);
  // Native model bounds (Meshy export): center xz, drop base to y=0, scale to
  // the target height, keep the +z facing (the opening is thin in z).
  const box = new THREE.Box3().setFromObject(gate);
  const size = box.getSize(new THREE.Vector3());
  const s = RIFT_GATE_HEIGHT / Math.max(size.y, 1e-3);
  gate.scale.setScalar(s);
  gate.position.set(
    -((box.min.x + box.max.x) / 2) * s,
    -box.min.y * s,
    -((box.min.z + box.max.z) / 2) * s,
  );
  gate.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  body.add(gate);
  // A chunky 3D archway with a real see-through opening: the energy membrane
  // sits CENTERED in the hole (z=0, double-sided so it reads from either side).
  // It is UNIFORMLY scaled (a circle, not an ellipse) so the renderer's spin
  // reads as swirling energy via the spiral texture instead of a rotating oval,
  // and it is sized to overfill the opening so its soft-edged rim tucks behind
  // the frame pillars and the glow fills the whole arch.
  const gateWidth = size.x * s;
  const midY = RIFT_GATE_HEIGHT * 0.46;
  // Cover the larger opening dimension (the arch is taller than it is wide); the
  // radial falloff fades the spill-over behind the frame.
  const fillR = Math.max(gateWidth * 0.42, RIFT_GATE_HEIGHT * 0.4);
  const portal = new THREE.Mesh(doorPortalGeometry(), riftPortalMaterial(tier, lowGfx));
  portal.position.set(0, midY, 0);
  portal.scale.setScalar(fillR / 1.55);
  body.add(portal);
  return { body, portal };
}

// Build a dungeon-door (entering) or dungeon-exit (leaving) body: a stone arch +
// keystone + plinths framing an additive portal swirl. The Nythraxis crypt door
// is a bespoke invisible click-box instead (the visible arch is baked into that
// dungeon's geometry). Returns the portal mesh separately so the renderer can
// animate its swirl per frame.
export function buildDoorBody(
  entering: boolean,
  dungeonId: string | null | undefined,
  lowGfx: boolean,
): { body: THREE.Group; portal?: THREE.Mesh } {
  const body = new THREE.Group();
  if (entering && dungeonId === 'nythraxis_crypt') {
    const clickBox = new THREE.Mesh(doorNythraxisClickGeometry(), doorNythraxisClickMaterial());
    clickBox.position.y = 2.1;
    body.add(clickBox);
    return { body };
  }

  const stone = doorStoneMaterial();
  const arch = new THREE.Mesh(doorArchGeometry(), stone);
  arch.castShadow = true;
  body.add(arch);
  const keystone = new THREE.Mesh(doorKeystoneGeometry(), stone);
  keystone.position.set(0, 4.75, 0);
  keystone.castShadow = true;
  body.add(keystone);
  for (const sx of [-1.7, 1.7]) {
    const plinth = new THREE.Mesh(doorPlinthGeometry(), stone);
    plinth.position.set(sx, 0.35, 0);
    plinth.castShadow = true;
    body.add(plinth);
  }
  const portal = new THREE.Mesh(doorPortalGeometry(), doorPortalMaterial(entering, lowGfx));
  portal.position.y = 2.15;
  portal.scale.set(1, 1.35, 1);
  body.add(portal);
  return { body, portal };
}
