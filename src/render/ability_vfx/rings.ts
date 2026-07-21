import * as THREE from 'three';
import type { AbilityVfxTextures } from './fx_textures';

// Expanding shockwave rings, ported from the gallery's shock-ring shader
// (arc_bolt_preview.js). Fixed slot pool (the renderer's aoeRings idiom): one
// shared unit plane, one material clone per slot at construction, nothing
// cloned or disposed per spawn. Ground rings lie on the terrain; vertical
// rings billboard the camera (impact halos).

const RING_SLOTS = 16;

const easeOutQuart = (t: number): number => 1 - (1 - t) ** 4;

interface RingSlot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  dur: number;
  vertical: boolean;
  active: boolean;
}

export class ShockRings {
  private slots: RingSlot[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, tex: AbilityVfxTextures) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const proto = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: new THREE.Color() },
        uIntensity: { value: 1 },
        uNoise: { value: tex.noise },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uProgress;
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform sampler2D uNoise;
        varying vec2 vUv;
        void main() {
          vec2 d2 = vUv - 0.5;
          float d = length(d2) * 2.0;
          float ang = atan(d2.y, d2.x + 1e-6); // guarded: atan(0,0) would NaN into bloom
          float band = smoothstep(uProgress - 0.32, uProgress - 0.06, d)
            * (1.0 - smoothstep(uProgress - 0.03, uProgress, d));
          float n = texture2D(uNoise, vec2(ang * 0.6366, d * 1.4 - uProgress * 0.35)).r;
          band *= smoothstep(0.18, 0.62, n + (1.0 - uProgress) * 0.45);
          float fade = pow(1.0 - uProgress, 1.35);
          vec3 col = uColor * uIntensity * (0.6 + 1.6 * band);
          gl_FragColor = vec4(col * band * fade, band * fade);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < RING_SLOTS; i++) {
      const mat = proto.clone();
      mat.uniforms.uNoise.value = tex.noise;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 5;
      mesh.userData.renderCategory = 'vfx';
      scene.add(mesh);
      this.slots.push({ mesh, mat, age: 0, dur: 1, vertical: false, active: false });
    }
    proto.dispose();
  }

  spawn(
    x: number,
    y: number,
    z: number,
    maxR: number,
    dur: number,
    colorHex: number,
    intensity: number,
    vertical = false,
  ): void {
    const slot = this.slots[this.next];
    this.next = (this.next + 1) % RING_SLOTS;
    slot.active = true;
    slot.age = 0;
    slot.dur = dur;
    slot.vertical = vertical;
    (slot.mat.uniforms.uColor.value as THREE.Color).setHex(colorHex);
    slot.mat.uniforms.uIntensity.value = intensity;
    slot.mat.uniforms.uProgress.value = 0;
    slot.mesh.position.set(x, y, z);
    slot.mesh.rotation.set(vertical ? 0 : -Math.PI / 2, 0, 0);
    slot.mesh.scale.setScalar(maxR * 2);
    slot.mesh.visible = true;
  }

  update(dt: number, camQuat: THREE.Quaternion): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += dt;
      const t = Math.min(1, slot.age / slot.dur);
      slot.mat.uniforms.uProgress.value = easeOutQuart(t);
      if (slot.vertical) slot.mesh.quaternion.copy(camQuat);
      if (t >= 1) {
        slot.active = false;
        slot.mesh.visible = false;
      }
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.mesh.visible = false;
    }
  }
}
