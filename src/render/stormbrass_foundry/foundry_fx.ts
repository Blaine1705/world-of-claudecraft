// The Stormbrass Foundry's encounter visuals (plan: foundry_fx_core.ts):
//  - a floor mark under every cast you dodge or kick, filling as its bar runs:
//    the Brass Sentry's Piston Slam cone and the Gantry Hauler's Steam Blast
//    cone, a kick glyph under a Field Repair or a Steam Screen, a brass glyph
//    under a Deploy Turret;
//  - the encounter objects' circles: a death burst's ring building where a
//    Steam Bruiser or the Hauler fell, and a Scrap Toss plate's landing mark,
//    each filling to its moment.
// Every shape is the shared floor telegraph (../floor_telegraph). Phase 2 adds
// the four bosses' cores here (belts, trail salvo, plating, cells).
//
// Rules (src/render/CLAUDE.md): pooled geometry and materials built once,
// attached through the compile gate, no per-frame allocation in the pools.
// The telegraphs are ACTIONABLE: their footprint draws on every tier; only
// the flashes shed on the low tier. Everything is derived from IWorld entity
// state, so offline and online look the same.

import * as THREE from 'three';
import { resolveUiEffectsProfile } from '../../game/ui_effects_profile';
import type { IWorld } from '../../world_api';
import { type TelegraphFan, TelegraphKit } from '../floor_telegraph';
import { attachSceneGroupGated } from '../gated_scene_attach';
import { GFX } from '../gfx';
import { setRenderCategory } from '../renderer_diagnostics';
import {
  FOUNDRY_OBJECT_SPECS,
  type FoundryTelegraphSpec,
  foundryCastFill,
  foundryTelegraphSpecs,
  foundryTimedFill,
} from './foundry_fx_core';

const CAST_SLOTS = 12;
const OBJECT_SLOTS = 10;
const SCAN_SEC = 0.1;

interface CastSlot extends TelegraphFan {
  casterId: number;
  castId: string;
}

interface ObjectSlot extends TelegraphFan {
  objectId: number;
  since: number;
}

export class FoundryFx {
  readonly readyForEntry: Promise<void>;
  private readonly root = new THREE.Group();
  private readonly specs = foundryTelegraphSpecs();
  private readonly casts: CastSlot[] = [];
  private readonly objects: ObjectSlot[] = [];
  private readonly kit: TelegraphKit;
  private scan = 0;
  private clock = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
    private readonly world?: IWorld,
    compileGate?: (target: THREE.Object3D) => Promise<unknown>,
  ) {
    this.root.name = 'stormbrass-foundry-telegraphs';
    setRenderCategory(this.root, 'ui3d');
    const flashesOn =
      resolveUiEffectsProfile({ presetLabel: GFX.tier, effectsQuality: 1, reduceMotion: false })
        .tier !== 'low';
    this.kit = new TelegraphKit(this.root, flashesOn);
    for (let i = 0; i < CAST_SLOTS; i++)
      this.casts.push({ ...this.kit.fan(18), casterId: -1, castId: '' });
    for (let i = 0; i < OBJECT_SLOTS; i++)
      this.objects.push({ ...this.kit.fan(16), objectId: -1, since: 0 });
    this.readyForEntry = attachSceneGroupGated(scene, this.root, compileGate, () => this.disposed)
      .then(() => {})
      .catch(() => {});
  }

  private spec(castId: string): FoundryTelegraphSpec | undefined {
    return this.specs[castId];
  }

  update(dt: number): void {
    const world = this.world;
    if (!world || this.disposed) return;
    this.clock += dt;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = SCAN_SEC;
      this.scanWorld(world);
    }
    for (const slot of this.casts) {
      if (slot.casterId < 0) continue;
      const caster = world.entities.get(slot.casterId);
      const spec = this.spec(slot.castId);
      if (!caster || caster.dead || caster.castingAbility !== slot.castId || !spec) {
        slot.casterId = -1;
        slot.group.visible = false;
        continue;
      }
      const fill = foundryCastFill(caster.castRemaining, caster.castTotal);
      const yaw = spec.shape === 'sigil' ? this.clock * 1.4 : caster.facing;
      const x = caster.pos.x;
      const z = caster.pos.z;
      this.kit.drapeFan(slot, this.groundY, x, this.groundY(x, z), z, yaw, spec.range);
      this.kit.paintFan(slot, { fill, clock: this.clock, range: spec.range });
    }
    for (const slot of this.objects) {
      if (slot.objectId < 0) continue;
      const obj = world.entities.get(slot.objectId);
      const spec = obj ? FOUNDRY_OBJECT_SPECS[obj.templateId] : undefined;
      if (!obj || !spec) {
        slot.objectId = -1;
        slot.group.visible = false;
        continue;
      }
      const radius = obj.scale;
      const fill = foundryTimedFill(this.clock - slot.since, spec.fillSeconds(radius));
      this.kit.drapeFan(
        slot,
        this.groundY,
        obj.pos.x,
        this.groundY(obj.pos.x, obj.pos.z),
        obj.pos.z,
        0,
        radius,
      );
      this.kit.paintFan(slot, { fill, clock: this.clock, range: radius });
    }
  }

  private scanWorld(world: IWorld): void {
    for (const e of world.entities.values()) {
      if (e.kind === 'player') continue;
      if (e.kind !== 'mob') {
        const objSpec = FOUNDRY_OBJECT_SPECS[e.templateId];
        if (!objSpec) continue;
        if (this.objects.some((o) => o.objectId === e.id)) continue;
        const slot = this.objects.find((o) => o.objectId < 0);
        if (!slot) continue;
        this.kit.layOutFan(slot, 360, { color: objSpec.color, accent: objSpec.accent });
        slot.objectId = e.id;
        slot.since = this.clock;
        slot.group.visible = true;
        continue;
      }
      if (e.dead) continue;
      const castId = e.castingAbility;
      const spec = castId ? this.spec(castId) : undefined;
      if (!castId || !spec) continue;
      if (this.casts.some((t) => t.casterId === e.id)) continue;
      const slot = this.casts.find((t) => t.casterId < 0);
      if (!slot) continue;
      this.kit.layOutFan(slot, spec.arcDeg, {
        color: spec.color,
        accent: spec.accent,
        sigil: spec.shape === 'sigil',
      });
      slot.casterId = e.id;
      slot.castId = castId;
      slot.group.visible = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.kit.dispose();
  }
}
