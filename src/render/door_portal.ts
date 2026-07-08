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

// Bespoke bodies for the in-rift puzzle props (boulders, sockets, the ice-slide
// goal sigil, sequence runes, and the "way out" beacon). Kept procedural (no new
// GLB) and small; the returned `portal` mesh, when present, is spun per frame by
// the renderer so glowing nodes shimmer. templateId variants (`_lit`/`_placed`)
// trigger a rebuild, so the lit/socketed states light up for free.
function riftGlowMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function buildRiftPuzzleProp(
  templateId: string,
  _lowGfx: boolean,
): { body: THREE.Group; portal?: THREE.Mesh } {
  const body = new THREE.Group();
  const stone = doorStoneMaterial();
  switch (templateId) {
    case 'rift_boulder':
    case 'rift_boulder_placed': {
      const placed = templateId === 'rift_boulder_placed';
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.1, 0),
        new THREE.MeshLambertMaterial({
          color: placed ? 0x9a875f : 0x6a6a72,
          emissive: placed ? 0x3a2a08 : 0x000000,
        }),
      );
      rock.position.y = 1.0;
      rock.castShadow = true;
      body.add(rock);
      return { body };
    }
    case 'rift_roller': {
      // The rolling-boulder hazard: a big cracked boulder. Its rock is exposed on
      // `userData.rollRock` so the renderer can spin it about X as the entity moves
      // (rolling without slipping).
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.4, 0),
        new THREE.MeshLambertMaterial({ color: 0x59565e, emissive: 0x120e08 }),
      );
      rock.position.y = 1.4;
      rock.castShadow = true;
      body.add(rock);
      body.userData.rollRock = rock;
      return { body };
    }
    case 'rift_boulder_pad': {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.3, 0.18, 8, 24),
        riftGlowMaterial(0xffb24a, 0.8),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      body.add(ring);
      return { body };
    }
    case 'rift_ice_goal': {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.7, 28),
        riftGlowMaterial(0x9fe8ff, 0.85),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.06;
      body.add(disc);
      return { body, portal: disc };
    }
    case 'rift_seq_rune':
    case 'rift_seq_rune_lit': {
      const lit = templateId === 'rift_seq_rune_lit';
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), stone);
      pillar.position.y = 0.8;
      pillar.castShadow = true;
      body.add(pillar);
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        riftGlowMaterial(lit ? 0x9fffc4 : 0x3a6a4a, lit ? 0.95 : 0.5),
      );
      gem.position.y = 1.95;
      body.add(gem);
      return { body, portal: lit ? gem : undefined };
    }
    case 'rift_beacon': {
      const plinth = new THREE.Mesh(doorPlinthGeometry(), stone);
      plinth.position.y = 0.35;
      body.add(plinth);
      const orb = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 24),
        riftGlowMaterial(0x88ccff, 0.9),
      );
      orb.position.y = 1.7;
      body.add(orb);
      return { body, portal: orb };
    }
    case 'rift_pylon':
    case 'rift_pylon_lit': {
      const lit = templateId === 'rift_pylon_lit';
      // A tapered hex spire with a floating rune crystal that spins and pulses;
      // the crystal blazes bright once the pylon is lit (walk-on toggles the id).
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.72, 3.0, 6), stone);
      spire.position.y = 1.5;
      spire.castShadow = true;
      body.add(spire);
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.1, 6, 12),
        riftGlowMaterial(lit ? 0x9fe8ff : 0x2a4a6a, lit ? 0.85 : 0.4),
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 2.7;
      body.add(collar);
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.5, 0),
        riftGlowMaterial(lit ? 0xbfe8ff : 0x2f5a7a, lit ? 0.95 : 0.5),
      );
      crystal.position.y = 3.5;
      body.add(crystal);
      return { body, portal: crystal };
    }
  }
  return { body };
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
