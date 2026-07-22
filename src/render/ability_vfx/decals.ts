import * as THREE from 'three';
import type { AbilityVfxTextures } from './fx_textures';

// Fading ground decals (scorch embers, frost rime, arcane runes, earth
// cracks, charred sunbursts), ported from
// the gallery's dissolve decal shader (arc_bolt_preview.js, decals section):
// visible where noise > uDissolve, with a bright dissolve edge, so marks etch
// in and burn away instead of alpha-popping. Fixed slot pool, one shared
// circle geometry, one material clone per slot at construction; a spawn only
// rebinds the style's shared texture uniform.

const DECAL_SLOTS = 12;

export type DecalStyle = 'ember' | 'rime' | 'rune' | 'crack' | 'char';

interface DecalSlot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  dur: number;
  spin: number;
  active: boolean;
}

export class GroundDecals {
  private slots: DecalSlot[] = [];
  private next = 0;
  private maps: Record<DecalStyle, THREE.CanvasTexture>;

  constructor(scene: THREE.Scene, tex: AbilityVfxTextures) {
    this.maps = {
      ember: tex.ember,
      rime: tex.rime,
      rune: tex.rune,
      crack: tex.crack,
      char: tex.char,
    };
    const geo = new THREE.CircleGeometry(1, 24);
    const proto = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex.rune },
        uNoise: { value: tex.noise },
        uColor: { value: new THREE.Color() },
        uDissolve: { value: 1 },
        uHdr: { value: 1.6 },
        uSpin: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform sampler2D uNoise;
        uniform vec3 uColor;
        uniform float uDissolve;
        uniform float uHdr;
        uniform float uSpin;
        varying vec2 vUv;
        void main() {
          vec2 c = vUv - 0.5;
          float cs = cos(uSpin), sn = sin(uSpin);
          vec2 ruv = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
          vec4 tex = texture2D(uMap, ruv);
          float n = texture2D(uNoise, vUv * 2.3).r;
          float body = tex.a * smoothstep(uDissolve, uDissolve + 0.14, n);
          float edge = (smoothstep(uDissolve - 0.02, uDissolve + 0.04, n)
            - smoothstep(uDissolve + 0.08, uDissolve + 0.16, n)) * tex.a;
          vec3 col = tex.rgb * uColor * uHdr + vec3(0.92, 0.95, 1.0) * edge * uHdr * 2.0;
          gl_FragColor = vec4(col, clamp(body + edge, 0.0, 1.0));
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < DECAL_SLOTS; i++) {
      const mat = proto.clone();
      mat.uniforms.uNoise.value = tex.noise;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3; // over terrain decals, under the shock rings
      mesh.userData.renderCategory = 'vfx';
      scene.add(mesh);
      this.slots.push({ mesh, mat, age: 0, dur: 3, spin: 0, active: false });
    }
    proto.dispose();
  }

  spawn(
    x: number,
    y: number,
    z: number,
    radius: number,
    colorHex: number,
    style: DecalStyle,
    dur: number,
  ): void {
    const slot = this.slots[this.next];
    this.next = (this.next + 1) % DECAL_SLOTS;
    slot.active = true;
    slot.age = 0;
    slot.dur = dur;
    slot.spin = style === 'rune' ? 0.35 : 0;
    slot.mat.uniforms.uMap.value = this.maps[style];
    (slot.mat.uniforms.uColor.value as THREE.Color).setHex(colorHex);
    slot.mat.uniforms.uDissolve.value = 1;
    slot.mat.uniforms.uSpin.value = 0;
    slot.mesh.position.set(x, y + 0.04, z); // lifted to dodge terrain z-fighting
    slot.mesh.scale.setScalar(radius);
    slot.mesh.visible = true;
  }

  update(dt: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += dt;
      const t = slot.age / slot.dur;
      if (t >= 1) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      // etch in over the first 18%, hold, then dissolve away over the last 45%
      const dissolve =
        t < 0.18 ? 1 - (t / 0.18) * 0.85 : t < 0.55 ? 0.15 : 0.15 + ((t - 0.55) / 0.45) * 0.85;
      slot.mat.uniforms.uDissolve.value = dissolve;
      if (slot.spin > 0) slot.mat.uniforms.uSpin.value = slot.age * slot.spin;
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.mesh.visible = false;
    }
  }
}
