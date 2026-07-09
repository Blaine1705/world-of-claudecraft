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

// The rift boulder / rolling boulder reuse a real detailed rock mesh (a shipped
// KayKit-style prop) instead of a bare dodecahedron, so they read as proper craggy
// stone; the procedural glow veins layer on top. Zero-cost asset reuse (the
// `--model-file` import lane's spirit): no new GLB, no Tripo credits. Cached +
// shared like the gate; buildRiftPuzzleProp falls back to a dodecahedron if absent.
const RIFT_ROCK_URL = '/models/props/rock_large_f.glb';
let riftRockGltf: GLTF | null = null;

function markGltfShared(gltf: GLTF): void {
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    markSharedGeometry(mesh.geometry);
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(markSharedMaterial);
    else markSharedMaterial(mat);
  });
}

/** Clone a preloaded prop GLB, center it on xz, drop its base to y=0, and scale it
 * to `height` world units (matches buildRiftGateBody's fit). `stone` recolors every
 * mesh to a dark rift material (the shipped rocks carry outdoor moss/grass that
 * clashes with the rift's void/fire mood; the craggy geometry is what we want).
 * Recolor allocates a NEW per-clone material (the cached original stays shared and
 * untouched), disposed with the view like the procedural props. */
function fittedPropClone(
  gltf: GLTF,
  height: number,
  stone?: { color: number; emissive: number },
): THREE.Group {
  const g = new THREE.Group();
  const model = gltf.scene.clone(true);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(size.y, 1e-3);
  model.scale.setScalar(s);
  model.position.set(
    -((box.min.x + box.max.x) / 2) * s,
    -box.min.y * s,
    -((box.min.z + box.max.z) / 2) * s,
  );
  const mat = stone
    ? new THREE.MeshLambertMaterial({ color: stone.color, emissive: stone.emissive })
    : null;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    if (mat) mesh.material = mat;
  });
  g.add(model);
  return g;
}

if (typeof window !== 'undefined') {
  registerPreload(
    loadGltf(RIFT_GATE_URL)
      .then((gltf) => {
        // Per-portal views clone the scene but SHARE geometry/material refs with
        // this cached original; mark them shared so the renderer's per-view
        // disposal guard never frees them (interest churn would otherwise poison
        // every later clone). Same contract as the procedural arch resources.
        markGltfShared(gltf);
        riftGateGltf = gltf;
      })
      .catch(() => {
        // Missing/broken asset: buildRiftGateBody falls back to the arch.
        riftGateGltf = null;
      }),
  );
  registerPreload(
    loadGltf(RIFT_ROCK_URL)
      .then((gltf) => {
        markGltfShared(gltf);
        riftRockGltf = gltf;
      })
      .catch(() => {
        riftRockGltf = null;
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
      // A cracked rune-boulder: a real craggy rock mesh (or a dodecahedron if the
      // asset is still loading) girdled by glowing veins that pulse (dim cyan loose,
      // hot gold once socketed), with a golden halo when placed.
      if (riftRockGltf) {
        const stone = placed
          ? { color: 0x8a7550, emissive: 0x2a1c04 } // warm, gold-lit once socketed
          : { color: 0x5f5c66, emissive: 0x0a0a12 }; // cold dark rift stone
        body.add(fittedPropClone(riftRockGltf, 2.1, stone));
      } else {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.1, 0),
          new THREE.MeshLambertMaterial({
            color: placed ? 0x8a7550 : 0x5f5c66,
            emissive: placed ? 0x2a1c04 : 0x0a0a12,
          }),
        );
        rock.position.y = 1.0;
        rock.castShadow = true;
        body.add(rock);
      }
      const veinColor = placed ? 0xffc24a : 0x6fa8d8;
      const veins: THREE.Object3D[] = [];
      for (let i = 0; i < 3; i++) {
        const vein = new THREE.Mesh(
          new THREE.TorusGeometry(1.03, 0.05, 6, 20),
          riftGlowMaterial(veinColor, placed ? 0.85 : 0.42),
        );
        vein.position.y = 1.0;
        vein.rotation.set((i * Math.PI) / 3, (i * Math.PI) / 5, 0);
        body.add(vein);
        veins.push(vein);
      }
      body.userData.riftPulse = veins;
      if (placed) {
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(1.2, 1.7, 22),
          riftGlowMaterial(0xffc24a, 0.5),
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.06;
        body.add(halo);
      }
      return { body };
    }
    case 'rift_roller': {
      // The rolling-boulder hazard: a big craggy rock (real mesh, or a dodecahedron
      // fallback) veined with molten embers. The whole roller group is exposed on
      // `userData.rollRock`; the renderer spins it about X as the entity advances
      // (rolling without slipping). It pivots about its CENTER (group origin at
      // y=1.4), and the ember veins ride along as children.
      const roller = new THREE.Group();
      if (riftRockGltf) {
        // Dark, ember-lit rift stone (strip the shipped rock's outdoor moss).
        const rock = fittedPropClone(riftRockGltf, 2.8, { color: 0x4a4650, emissive: 0x1a0a06 });
        rock.position.y = -1.4; // drop so the rock's center sits at the group origin
        roller.add(rock);
      } else {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.4, 0),
          new THREE.MeshLambertMaterial({ color: 0x4a4650, emissive: 0x1a0a06 }),
        );
        rock.castShadow = true;
        roller.add(rock);
      }
      for (let i = 0; i < 3; i++) {
        const vein = new THREE.Mesh(
          new THREE.TorusGeometry(1.32, 0.07, 6, 20),
          riftGlowMaterial(0xff6a2a, 0.7),
        );
        vein.rotation.set((i * Math.PI) / 3, (i * Math.PI) / 4, 0);
        roller.add(vein);
      }
      roller.position.y = 1.4; // sit the roller on the ground
      body.add(roller);
      body.userData.rollRock = roller;
      return { body };
    }
    case 'rift_locked_chest':
    case 'rift_chest_open':
    case 'rift_chest_jammed': {
      // The giga-boss's sealed reward cache. A banded wooden chest with a glowing
      // keyhole (cyan while pickable, red when jammed) that pulses via `portal`;
      // the lid swings open once solved.
      const opened = templateId === 'rift_chest_open';
      const jammed = templateId === 'rift_chest_jammed';
      const wood = new THREE.MeshLambertMaterial({
        color: 0x5a4a3a,
        emissive: opened ? 0x1a1206 : 0x000000,
      });
      const band = new THREE.MeshLambertMaterial({ color: 0x8a8a92 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), wood);
      base.position.y = 0.35;
      base.castShadow = true;
      body.add(base);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.34, 0.9), wood);
      if (opened) {
        lid.position.set(0, 0.72, -0.45);
        lid.rotation.x = -1.15;
      } else {
        lid.position.set(0, 0.72, 0);
      }
      lid.castShadow = true;
      body.add(lid);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.04), band);
      strap.position.set(0, 0.5, 0.46);
      body.add(strap);
      if (!opened) {
        const lock = new THREE.Mesh(
          new THREE.CircleGeometry(0.17, 16),
          riftGlowMaterial(jammed ? 0xff5a4a : 0x9fe8ff, jammed ? 0.7 : 0.95),
        );
        lock.position.set(0, 0.5, 0.48);
        body.add(lock);
        return { body, portal: jammed ? undefined : lock };
      }
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
      const accent = lit ? 0x9fe8ff : 0x2a4a6a;
      // A faceted crystalline obelisk: a flared stone base + a tapered hex shaft,
      // girdled by glowing collar rings, crowned by a floating rune crystal with
      // orbiting shards. Lit, a pulsing energy column erupts from the crown.
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.92, 1.1, 6), stone);
      base.position.y = 0.55;
      base.castShadow = true;
      body.add(base);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.5, 2.3, 6), stone);
      shaft.position.y = 2.0;
      shaft.castShadow = true;
      body.add(shaft);
      for (const y of [1.35, 2.05, 2.75]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.44, 0.07, 6, 16),
          riftGlowMaterial(accent, lit ? 0.85 : 0.38),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        body.add(ring);
      }
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        riftGlowMaterial(lit ? 0xbfe8ff : 0x2f5a7a, lit ? 0.98 : 0.5),
      );
      crystal.position.y = 3.6;
      body.add(crystal);
      // Orbiting shards (renderer spins each pivot about Y + bobs it).
      const orbiters: THREE.Object3D[] = [];
      const shardCount = lit ? 3 : 2;
      for (let i = 0; i < shardCount; i++) {
        const pivot = new THREE.Object3D();
        pivot.position.y = 3.6;
        pivot.rotation.y = (i / shardCount) * Math.PI * 2;
        const shard = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.15, 0),
          riftGlowMaterial(accent, lit ? 0.9 : 0.5),
        );
        shard.position.set(0.85, 0, 0);
        pivot.add(shard);
        body.add(pivot);
        orbiters.push(pivot);
      }
      body.userData.riftOrbiters = orbiters;
      if (lit) {
        // A tall additive beam column of energy (open-ended cylinder) that pulses.
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.34, 5.6, 12, 1, true),
          riftGlowMaterial(0xbfe8ff, 0.26),
        );
        beam.position.y = 3.1;
        body.add(beam);
        body.userData.riftPulse = [beam];
      }
      const ground = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 1.3, 20),
        riftGlowMaterial(accent, lit ? 0.5 : 0.2),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0.05;
      body.add(ground);
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
