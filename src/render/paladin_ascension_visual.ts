import * as THREE from 'three';
import type { PaladinAscensionVisualPlan } from './paladin_ascension_core';

const SYMBOL_COUNT = 5;
const REFERENCE_HEIGHT = 1.8;
const TAU = Math.PI * 2;
const HALO_GEOMETRY = new THREE.TorusGeometry(0.88, 0.035, 8, 40);
const CROWN_GEOMETRY = new THREE.TorusGeometry(0.62, 0.018, 6, 32);
const COLUMN_GEOMETRY = new THREE.CylinderGeometry(0.42, 0.72, 1, 24, 1, true);
const ASCENSION_GOLD = 0xffe88f;
const LAST_CHARGE_AMBER = 0xffb34f;

function buildSunSealTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const diamond = Math.abs(dx) + Math.abs(dy);
      const ring = Math.abs(Math.hypot(dx, dy) - 19) < 2;
      const cross =
        (Math.abs(dx) < 3 && Math.abs(dy) < 15) || (Math.abs(dy) < 3 && Math.abs(dx) < 15);
      const ray = Math.abs(diamond - 26) < 2;
      if (!ring && !cross && !ray) continue;
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 242;
      data[offset + 2] = 168;
      data[offset + 3] = cross ? 255 : 220;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

const SUN_SEAL_TEXTURE = buildSunSealTexture();

function haloMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: ASCENSION_GOLD,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export class PaladinAscensionVisual {
  readonly group = new THREE.Group();
  private readonly groundHalo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly crown: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly auraColumn: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly seals: THREE.Sprite[] = [];
  private time = 0;

  constructor(private readonly characterHeight: number) {
    this.group.name = 'paladin-ascension-visual';
    this.group.visible = false;

    this.groundHalo = new THREE.Mesh(HALO_GEOMETRY, haloMaterial(0.66));
    this.groundHalo.name = 'paladin-ascension-ground-halo';
    this.groundHalo.rotation.x = Math.PI / 2;
    this.groundHalo.position.y = 0.07;
    this.groundHalo.renderOrder = 8;
    this.group.add(this.groundHalo);

    this.crown = new THREE.Mesh(CROWN_GEOMETRY, haloMaterial(0.42));
    this.crown.name = 'paladin-ascension-crown';
    this.crown.rotation.x = Math.PI / 2;
    this.crown.position.y = characterHeight * 0.68;
    this.crown.renderOrder = 8;
    this.group.add(this.crown);

    this.auraColumn = new THREE.Mesh(
      COLUMN_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: ASCENSION_GOLD,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.auraColumn.name = 'paladin-ascension-column';
    this.auraColumn.position.y = characterHeight * 0.52;
    this.auraColumn.scale.set(1, characterHeight * 1.12, 1);
    this.auraColumn.renderOrder = 7;
    this.group.add(this.auraColumn);

    for (let index = 0; index < SYMBOL_COUNT; index++) {
      const seal = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: SUN_SEAL_TEXTURE,
          color: 0xffefaa,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      seal.name = `paladin-ascension-seal-${index + 1}`;
      seal.renderOrder = 10;
      this.seals.push(seal);
      this.group.add(seal);
    }
  }

  update(plan: PaladinAscensionVisualPlan, dt: number, reducedMotion: boolean): void {
    this.group.visible = plan.active;
    if (!plan.active) return;

    if (!reducedMotion) this.time += Math.max(0, dt);
    const size = Math.max(0.72, Math.min(1.4, this.characterHeight / REFERENCE_HEIGHT));
    const orbitRadius = 0.83 * size;
    const orbitY = this.characterHeight * 0.68;
    const speed = plan.lastCharge ? 2.15 : 0.82;
    const phase = reducedMotion ? 0.35 : this.time * speed;

    this.groundHalo.rotation.z = phase * 0.45;
    this.crown.rotation.z = -phase * 0.72;
    const haloPulse = reducedMotion
      ? 1
      : 1 + Math.sin(this.time * (plan.lastCharge ? 8 : 3.5)) * 0.07;
    const activeColor = plan.lastCharge ? LAST_CHARGE_AMBER : ASCENSION_GOLD;
    this.groundHalo.material.color.setHex(activeColor);
    this.crown.material.color.setHex(activeColor);
    this.auraColumn.material.color.setHex(activeColor);
    this.groundHalo.scale.setScalar(size * haloPulse);
    this.crown.scale.setScalar(size * (2 - haloPulse));
    this.auraColumn.rotation.y = phase * 0.24;
    this.auraColumn.material.opacity = reducedMotion
      ? 0.1
      : 0.085 + (haloPulse - 0.93) * (plan.lastCharge ? 0.9 : 0.45);

    for (let index = 0; index < this.seals.length; index++) {
      const seal = this.seals[index];
      seal.visible = index < plan.charges;
      if (!seal.visible) continue;
      const angle = phase + (index / SYMBOL_COUNT) * TAU;
      seal.position.set(
        Math.cos(angle) * orbitRadius,
        orbitY + (reducedMotion ? 0 : Math.sin(this.time * 2.4 + index) * 0.1 * size),
        Math.sin(angle) * orbitRadius,
      );
      const pulse = plan.lastCharge && !reducedMotion ? 1.18 + Math.sin(this.time * 8) * 0.18 : 1;
      seal.scale.setScalar(0.42 * size * pulse);
      seal.material.rotation = -phase - angle * 0.18;
      seal.material.opacity = plan.lastCharge ? 1 : 0.9;
    }
  }

  dispose(): void {
    this.groundHalo.material.dispose();
    this.crown.material.dispose();
    this.auraColumn.material.dispose();
    for (const seal of this.seals) seal.material.dispose();
  }
}

export function syncPaladinAscensionVisual(
  visual: PaladinAscensionVisual | null,
  parent: THREE.Group,
  characterHeight: number,
  plan: PaladinAscensionVisualPlan,
  dt: number,
  reducedMotion: boolean,
): PaladinAscensionVisual | null {
  let current = visual;
  if (plan.active && !current) {
    current = new PaladinAscensionVisual(characterHeight);
    parent.add(current.group);
  }
  current?.update(plan, dt, reducedMotion);
  return current;
}
