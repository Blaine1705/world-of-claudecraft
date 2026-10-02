// The Rangewarden's Target Lock, read over the marked player's head: a red
// crosshair (a camera-facing quad, the reticle drawn in its shader, turning
// and breathing on the shared uTime clock) for as long as the player wears
// the RANGE_TARGET_LOCK aura. It replaced a floor ring that followed the
// runner and read as the landing circle; the circles themselves are the
// shell objects (foundry_fx.ts), painted where each one was sampled.
//
// ACTIONABLE (who is marked), so it draws on every graphics tier. Pooled:
// one geometry and one material built at construction under the FoundryFx
// root (attached through its compile gate), a handful of meshes; per frame
// one position write per live crosshair, no allocation.

import * as THREE from 'three';
import { RANGE_TARGET_LOCK } from '../../sim/encounters/stormbrass_foundry/ids';
import type { IWorld } from '../../world_api';
import { TELEGRAPH_THREAT_COLORS } from '../floor_telegraph';
import { sharedUniforms } from '../gfx';

/** Heroic Walking Barrage marks three; room for two locks overlapping. */
const SLOTS = 6;
/** Yards over the player's feet the crosshair hangs (clear above the nameplate's
 *  head room of a standing player). */
export const LOCK_MARKER_HEIGHT = 4.7;
/** Drawn after the whole floor ladder (its reticle band ends at 53) and the
 *  encounter effects: with depthTest off, whatever draws later would paint
 *  over it, and who is marked must never hide. */
const LOCK_MARKER_ORDER = 60;
/** The crosshair's size in yards. */
const SIZE = 1.6;

const VERT = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}
`;

/** A reticle: a ring, four ticks crossing it (turning slowly), a centre dot,
 *  a dark rim under all of it so it reads on snow and on fire alike. */
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
float shape(vec2 p, float grow) {
  float r = length(p);
  float ring = smoothstep(0.6 - grow, 0.66 - grow, r) * (1.0 - smoothstep(0.8 + grow, 0.86 + grow, r));
  float a = uTime * 0.9;
  vec2 q = vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y);
  float w = 0.075 + grow;
  float h = step(abs(q.y), w) * step(0.3 - grow, abs(q.x)) * step(abs(q.x), 1.0);
  float v = step(abs(q.x), w) * step(0.3 - grow, abs(q.y)) * step(abs(q.y), 1.0);
  float dot = 1.0 - smoothstep(0.1 + grow, 0.15 + grow, r);
  return max(max(ring, max(h, v)), dot);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float body = shape(p * 1.08, 0.0);
  float rim = shape(p * 1.08, 0.05);
  float pulse = 0.5 + 0.5 * sin(uTime * 7.0);
  vec3 col = mix(vec3(0.06, 0.02, 0.02), uColor * (1.15 + 0.5 * pulse), body);
  float alpha = max(body, rim * 0.75);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

interface Slot {
  mesh: THREE.Mesh;
  entityId: number;
}

interface Marked {
  id: number;
  dead?: boolean;
  auras?: readonly { id: string }[];
}

function locked(e: Marked): boolean {
  const auras = e.auras;
  if (e.dead || !auras) return false;
  for (let i = 0; i < auras.length; i++) if (auras[i].id === RANGE_TARGET_LOCK) return true;
  return false;
}

export class FoundryLockMarkers {
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly slots: Slot[] = [];

  constructor(parent: THREE.Object3D) {
    this.group.name = 'stormbrass-foundry-lock-markers';
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(TELEGRAPH_THREAT_COLORS.lethal) },
        uSize: { value: SIZE },
        uTime: sharedUniforms.uTime,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // Over the head and over the scenery: who is marked must never hide.
      depthTest: false,
    });
    for (let i = 0; i < SLOTS; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.frustumCulled = false;
      mesh.renderOrder = LOCK_MARKER_ORDER;
      mesh.visible = false;
      this.group.add(mesh);
      this.slots.push({ mesh, entityId: -1 });
    }
    parent.add(this.group);
  }

  /** The scan pass offers every player: a marked one gets a crosshair. */
  scan(e: Marked): void {
    if (!locked(e)) return;
    for (const s of this.slots) if (s.entityId === e.id) return;
    const free = this.slots.find((s) => s.entityId < 0);
    if (!free) return;
    free.entityId = e.id;
    free.mesh.visible = true;
  }

  /** Every frame: hang each crosshair over its player; free a slot whose
   *  player lost the mark (or left). */
  update(world: IWorld): void {
    for (const s of this.slots) {
      if (s.entityId < 0) continue;
      const e = world.entities.get(s.entityId);
      if (!e || !locked(e)) {
        s.entityId = -1;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.set(e.pos.x, e.pos.y + LOCK_MARKER_HEIGHT * (e.scale || 1), e.pos.z);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
