// Cosmetic upper-body charge and release for the two temple guardians. The
// shared TempleFx floor lane/ring owns the actionable footprint on every tier.
// All drawables are constructed under that parent's compile gate, collapsed
// until needed. Four reusable slots, no lights, textures or per-frame geometry.
import * as THREE from 'three';
import { MOBS } from '../../sim/data';
import type { Entity, SimEvent } from '../../sim/types';
import type { IWorld } from '../../world_api';
import { applyFloorVfxLayer } from '../floor_vfx_layer';
import {
  GUARDIAN_IMPACT_SECONDS,
  GUARDIAN_VISUAL,
  guardianCharge,
  guardianImpactProgress,
  guardianRippleRadius,
  type TempleGuardianCue,
  templeGuardianCue,
} from './temple_guardian_fx_core';

interface Slot {
  root: THREE.Group;
  spear: THREE.Group;
  ring: THREE.Mesh;
  echo: THREE.Mesh;
  flecks: THREE.Points;
  cyan: THREE.MeshBasicMaterial;
  foam: THREE.MeshBasicMaterial;
  gold: THREE.PointsMaterial;
  caster: number;
  ability: string;
  cue: TempleGuardianCue;
  impactAge: number;
  reach: number;
}

const COLLAPSED = 1e-4;

export class TempleGuardianFx {
  private readonly root = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private gated = false;

  constructor(
    parent: THREE.Group,
    private readonly world: IWorld | undefined,
    private readonly groundY: (x: number, z: number) => number,
    private readonly rich: boolean,
    private readonly calm: () => boolean,
  ) {
    this.root.name = 'temple-guardian-fx';
    parent.add(this.root);
    const shaft = new THREE.BoxGeometry(0.09, 0.09, 2.8);
    const point = new THREE.ConeGeometry(0.18, 0.6, 4);
    point.rotateX(Math.PI / 2);
    const crossbar = new THREE.BoxGeometry(1.3, 0.1, 0.1);
    const ring = new THREE.RingGeometry(0.94, 1, 48);
    ring.rotateX(-Math.PI / 2);
    const flecks = new THREE.BufferGeometry();
    const positions = new Float32Array(24);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * 1.6;
      positions[i * 3 + 1] = 0.3 + (i % 3) * 0.3;
      positions[i * 3 + 2] = Math.sin(angle) * 1.6;
    }
    flecks.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometries.push(shaft, point, crossbar, ring, flecks);
    for (let i = 0; i < 4; i++) {
      const cyan = new THREE.MeshBasicMaterial({
        name: 'templeGuardianCyan',
        color: 0x4edbdf,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const foam = cyan.clone();
      foam.name = 'templeGuardianSeafoam';
      foam.color.setHex(0xc8fff0);
      const gold = new THREE.PointsMaterial({
        name: 'templeGuardianGold',
        color: 0xe3c06a,
        size: 0.12,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.materials.push(cyan, foam, gold);
      const root = new THREE.Group();
      root.name = 'guardian-cue';
      root.scale.setScalar(COLLAPSED);
      this.root.add(root);
      const spear = new THREE.Group();
      spear.name = 'guardian-trident';
      spear.add(new THREE.Mesh(shaft, cyan));
      const bar = new THREE.Mesh(crossbar, cyan);
      bar.position.z = 1;
      spear.add(bar);
      for (const x of [-0.6, 0, 0.6]) {
        const tip = new THREE.Mesh(point, foam);
        tip.position.set(x, 0, x === 0 ? 1.7 : 1.3);
        spear.add(tip);
      }
      const wave = new THREE.Mesh(ring, cyan);
      wave.name = 'guardian-wave';
      const echo = new THREE.Mesh(ring, foam);
      const sparks = new THREE.Points(flecks, gold);
      root.add(spear, wave, echo, sparks);
      // Dressing stays BELOW the actionable lane/radius even where it overlaps.
      applyFloorVfxLayer(root, 'ground');
      this.slots.push({
        root,
        spear,
        ring: wave,
        echo,
        flecks: sparks,
        cyan,
        foam,
        gold,
        caster: -1,
        ability: '',
        cue: 'trident',
        impactAge: -1,
        reach: 0,
      });
    }
  }

  markGated(): void {
    this.gated = true;
  }

  private claim(caster: number, ability: string, cue: TempleGuardianCue): Slot | undefined {
    const slot =
      this.slots.find((s) => s.caster === caster) ?? this.slots.find((s) => s.caster < 0);
    const entity = this.world?.entities.get(caster);
    if (!slot || !entity) return;
    slot.caster = caster;
    slot.ability = ability;
    slot.cue = cue;
    const kit = MOBS[entity.templateId]?.trashKit;
    slot.reach = cue === 'trident' ? (kit?.line?.length ?? 0) : (kit?.nova?.radius ?? 0);
    slot.root.position.set(
      entity.pos.x,
      this.groundY(entity.pos.x, entity.pos.z) + 0.1,
      entity.pos.z,
    );
    slot.root.rotation.y = entity.facing;
    return slot;
  }

  handleEvent(ev: SimEvent): boolean {
    if (ev.type !== 'spellfx' || !ev.ability) return false;
    const source = this.world?.entities.get(ev.sourceId);
    const cue = source ? templeGuardianCue(source.templateId, ev.ability) : null;
    if (!cue) return false;
    const slot = this.claim(ev.sourceId, ev.ability, cue);
    if (!slot) return false;
    slot.impactAge = 0;
    return true;
  }

  /** Piggybacks the parent's existing caster scan, no second world walk. */
  observeCaster(
    e: Pick<Entity, 'id' | 'templateId' | 'dead' | 'castingAbility' | 'castRemaining'>,
  ): void {
    if (e.dead || !e.castingAbility || e.castRemaining <= 0) return;
    const cue = templeGuardianCue(e.templateId, e.castingAbility);
    if (cue) this.claim(e.id, e.castingAbility, cue);
  }

  update(dt: number): void {
    const calm = this.calm();
    let active = false;
    for (const s of this.slots) {
      if (s.caster < 0) continue;
      const source = this.world?.entities.get(s.caster);
      const impact = s.impactAge >= 0;
      if (impact) s.impactAge += dt;
      if (
        (impact && s.impactAge >= GUARDIAN_IMPACT_SECONDS) ||
        (!impact && (!source || source.dead || source.castingAbility !== s.ability))
      ) {
        s.caster = -1;
        s.impactAge = -1;
        s.root.scale.setScalar(COLLAPSED);
        continue;
      }
      active = true;
      s.root.scale.setScalar(1);
      const fill = source ? guardianCharge(source.castRemaining, source.castTotal) : 0;
      const fade = impact ? 1 - guardianImpactProgress(s.impactAge) : 0.3 + fill * 0.55;
      s.cyan.opacity = fade * (calm ? 0.5 : 0.8);
      s.foam.opacity = fade * 0.85;
      s.gold.opacity = fade * 0.6;
      s.flecks.visible = this.rich && !calm;
      s.flecks.rotation.y = calm ? 0 : fill * 0.8;
      s.flecks.position.y = GUARDIAN_VISUAL.chest - 0.8;
      s.spear.visible = s.cue === 'trident';
      s.spear.position.set(
        0,
        GUARDIAN_VISUAL.chest,
        impact && !calm ? s.reach * guardianImpactProgress(s.impactAge) : 1.5,
      );
      s.spear.scale.setScalar(impact ? 1.1 : 0.75 + fill * 0.35);
      const radius = impact
        ? guardianRippleRadius(s.impactAge, s.cue === 'surge' ? s.reach : 2.4, calm)
        : GUARDIAN_VISUAL.chargeRadiusStart + fill * GUARDIAN_VISUAL.chargeRadiusGrowth;
      s.ring.scale.setScalar(radius);
      s.ring.position.y = impact ? 0 : GUARDIAN_VISUAL.chest - GUARDIAN_VISUAL.lowerBandDrop;
      s.echo.scale.setScalar(radius * 0.85);
      s.echo.position.y = impact ? 0.06 : GUARDIAN_VISUAL.chest - GUARDIAN_VISUAL.upperBandDrop;
    }
    this.root.visible = !this.gated || active;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
