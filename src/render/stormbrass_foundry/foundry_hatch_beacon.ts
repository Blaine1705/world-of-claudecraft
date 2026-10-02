// The Prime Draft's open Core Hatch, called from across the Gantry: a gold
// shaft of light standing on the hatch ring while it is open (the ring's
// own floor telegraph pulses with it, foundry_fx.ts), so a Storm Cell
// carrier sees where to go and when. Gone the moment the hatch shuts.
//
// ACTIONABLE (the open window is the whole mechanic), so it draws on every
// graphics tier. One open-ended cylinder and one additive material built at
// construction under the FoundryFx root (attached through its compile gate);
// its breathing and its rising bands are shader-side on the shared uTime
// clock (the same rate as the ring's hatchPulse, not its phase), and a frame
// writes one position.

import * as THREE from 'three';
import { FOUNDRY_HATCH_TEMPLATES } from '../../sim/encounters/stormbrass_foundry/ids';
import type { IWorld } from '../../world_api';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { sharedUniforms } from '../gfx';
import { FOUNDRY_MECHANIC_COLORS } from './foundry_fx_core';

/** The shaft's height and its foot's radius (yards; the ring is 4 yd). */
export const HATCH_BEACON_HEIGHT = 18;
const FOOT = 2.2;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Bright at its foot, fading up; bands of light climbing it; the whole
 *  shaft breathing on the hatch's beat (hatchPulse: sin(t * 12)). */
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
void main() {
  float up = vUv.y;
  float fall = pow(1.0 - up, 1.6);
  float bands = smoothstep(0.55, 1.0, sin((up * 7.0 - uTime * 1.8) * 6.2831) * 0.5 + 0.5);
  float pulse = 0.5 + 0.5 * sin(uTime * 12.0);
  float a = fall * (0.32 + 0.22 * pulse) + bands * fall * 0.35;
  gl_FragColor = vec4(uColor * (1.2 + 0.6 * pulse), a);
}
`;

export class FoundryHatchBeacon {
  private readonly geometry: THREE.CylinderGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  private hatchId = -1;

  constructor(
    parent: THREE.Object3D,
    private readonly groundY: (x: number, z: number) => number,
  ) {
    this.geometry = new THREE.CylinderGeometry(FOOT * 0.55, FOOT, HATCH_BEACON_HEIGHT, 20, 1, true);
    // Its foot on the origin: the mesh stands on the floor point it is set to.
    this.geometry.translate(0, HATCH_BEACON_HEIGHT / 2, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(FOUNDRY_MECHANIC_COLORS.hatchOpen) },
        uTime: sharedUniforms.uTime,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'stormbrass-foundry-hatch-beacon';
    this.mesh.frustumCulled = false;
    // Over the hatch ring's own floor telegraph (foundry_fx.ts objects, step
    // 16) and its curtain: the ring never cuts the shaft's foot.
    this.mesh.renderOrder = floorVfxRenderOrder('encounter', 19);
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /** The scan pass offers every encounter object: an open hatch is tracked. */
  scan(e: { id: number; templateId: string }): void {
    if (e.templateId === FOUNDRY_HATCH_TEMPLATES.open) this.hatchId = e.id;
  }

  /** Every frame: stand on the open hatch's ring, or hide. */
  update(world: IWorld): void {
    if (this.hatchId < 0) return;
    const e = world.entities.get(this.hatchId);
    if (!e || e.templateId !== FOUNDRY_HATCH_TEMPLATES.open) {
      this.hatchId = -1;
      this.mesh.visible = false;
      return;
    }
    this.mesh.position.set(e.pos.x, this.groundY(e.pos.x, e.pos.z), e.pos.z);
    this.mesh.visible = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
