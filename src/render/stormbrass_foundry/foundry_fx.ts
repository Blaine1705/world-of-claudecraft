// The Stormbrass Foundry's encounter visuals (plan: foundry_fx_core.ts):
//  - a floor mark under every cast you dodge or kick, filling as its bar runs:
//    the Brass Sentry's Piston Slam cone, the Gantry Hauler's Steam Blast cone,
//    a kick glyph under a Field Repair or a Steam Screen, a brass glyph under a
//    Deploy Turret; and the bosses' bars: Tock's lever klaxon, the Voltaic
//    Warden's rattle, the Prime Draft's Arm Sweep, Tremor Step and rivet shower;
//  - the encounter objects' circles, each filling to its moment: a death
//    burst's ring, a Scrap Toss plate, a Rangewarden shell (and heroic
//    shrapnel), a Coil Strike, a Piston Fist; and the things to take or reach:
//    a Storm Cell's glyph and the Core Hatch's ring (dim shut, yellow
//    shuddering, gold open);
//  - the Stamping Press strip, a lane over one belt's last yards;
//  - a glyph under every player a Target Lock marks and under a cell carrier;
//  - the plating ring under the Voltaic Warden and its drones (copper-green
//    Grounded, blue Charged, split front and back on heroic) and the Stored
//    Charge ring filling at the Warden's feet;
//  - the Main Line's belts: their scroll and their klaxon red, written into
//    the shared belt uniforms (foundry_dressing.ts FOUNDRY_BELT_UNIFORMS).
// Every shape is the shared floor telegraph (../floor_telegraph); phase 3
// dresses the bosses' own VFX on top.
//
// Rules (src/render/CLAUDE.md): pooled geometry and materials built once,
// attached through the compile gate, no per-frame allocation in the pools.
// The telegraphs are ACTIONABLE: their footprint draws on every tier; only
// the flashes shed on the low tier. Everything is derived from IWorld entity
// state, so offline and online look the same.

import * as THREE from 'three';
import { resolveUiEffectsProfile } from '../../game/ui_effects_profile';
import { VOLTAIC_STORED } from '../../sim/encounters/stormbrass_foundry/ids';
import type { IWorld } from '../../world_api';
import { type TelegraphFan, TelegraphKit, type TelegraphLane } from '../floor_telegraph';
import { attachSceneGroupGated } from '../gated_scene_attach';
import { GFX } from '../gfx';
import { setRenderCategory } from '../renderer_diagnostics';
import { FOUNDRY_BELT_UNIFORMS } from './foundry_dressing';
import {
  beltLooks,
  FOUNDRY_ACCENTS,
  FOUNDRY_AURA_MARKERS,
  FOUNDRY_MECHANIC_COLORS,
  FOUNDRY_OBJECT_SPECS,
  FOUNDRY_PRESS_STRIP_SPEC,
  type FoundryTelegraphSpec,
  foundryCastFill,
  foundryTelegraphSpecs,
  foundryTimedFill,
  isBeltTemplate,
  platingRings,
  storedChargeFill,
} from './foundry_fx_core';

const CAST_SLOTS = 12;
/** Heroic Walking Barrage leaves up to three trails of shrapnel at once. */
const OBJECT_SLOTS = 32;
const LANE_SLOTS = 2;
const MARKER_SLOTS = 6;
const PLATING_SLOTS = 10;
const SCAN_SEC = 0.1;
const STORED_RADIUS = 4.5;

interface CastSlot extends TelegraphFan {
  casterId: number;
  castId: string;
}

interface ObjectSlot extends TelegraphFan {
  objectId: number;
  templateId: string;
  since: number;
}

interface LaneSlot extends TelegraphLane {
  objectId: number;
  since: number;
}

interface MarkerSlot extends TelegraphFan {
  entityId: number;
  auraId: string;
}

interface PlatingSlot extends TelegraphFan {
  entityId: number;
  /** Which ring (0 the whole ring or the front half, 1 the back half). */
  half: number;
  color: number;
  arc: number;
}

interface AuraBearer {
  id: number;
  dead?: boolean;
  auras?: readonly { id: string; value2?: number }[];
}

export class FoundryFx {
  readonly readyForEntry: Promise<void>;
  private readonly root = new THREE.Group();
  private readonly specs = foundryTelegraphSpecs();
  private readonly casts: CastSlot[] = [];
  private readonly objects: ObjectSlot[] = [];
  private readonly lanes: LaneSlot[] = [];
  private readonly markers: MarkerSlot[] = [];
  private readonly plating: PlatingSlot[] = [];
  private readonly stored: TelegraphFan & { entityId: number };
  private readonly kit: TelegraphKit;
  private readonly beltScratch: { x: number; templateId: string; facing: number; scale: number }[] =
    [];
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
      this.objects.push({ ...this.kit.fan(16), objectId: -1, templateId: '', since: 0 });
    for (let i = 0; i < LANE_SLOTS; i++)
      this.lanes.push({ ...this.kit.lane(17), objectId: -1, since: 0 });
    for (let i = 0; i < MARKER_SLOTS; i++)
      this.markers.push({ ...this.kit.fan(14), entityId: -1, auraId: '' });
    for (let i = 0; i < PLATING_SLOTS; i++)
      this.plating.push({ ...this.kit.fan(12), entityId: -1, half: 0, color: 0, arc: 0 });
    this.stored = { ...this.kit.fan(13), entityId: -1 };
    this.kit.layOutFan(this.stored, 360, {
      color: FOUNDRY_MECHANIC_COLORS.stored,
      accent: FOUNDRY_ACCENTS.lightning,
    });
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
    this.paintCasts(world);
    this.paintObjects(world);
    this.paintLanes(world);
    this.paintMarkers(world);
    this.paintPlating(world);
  }

  private paintCasts(world: IWorld): void {
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
  }

  private paintObjects(world: IWorld): void {
    for (const slot of this.objects) {
      if (slot.objectId < 0) continue;
      const obj = world.entities.get(slot.objectId);
      const spec = obj ? FOUNDRY_OBJECT_SPECS[obj.templateId] : undefined;
      if (!obj || !spec) {
        slot.objectId = -1;
        slot.group.visible = false;
        continue;
      }
      // A state change (the hatch opening, a cell settling) restarts its look.
      if (obj.templateId !== slot.templateId) {
        this.kit.layOutFan(slot, 360, {
          color: spec.color,
          accent: spec.accent,
          sigil: spec.sigil === true,
        });
        slot.templateId = obj.templateId;
        slot.since = this.clock;
      }
      const radius = obj.scale;
      const fill = foundryTimedFill(this.clock - slot.since, spec.fillSeconds(radius));
      const yaw = spec.sigil ? this.clock * 0.9 : 0;
      this.kit.drapeFan(
        slot,
        this.groundY,
        obj.pos.x,
        this.groundY(obj.pos.x, obj.pos.z),
        obj.pos.z,
        yaw,
        radius,
      );
      this.kit.paintFan(slot, { fill, clock: this.clock, range: radius });
    }
  }

  private paintLanes(world: IWorld): void {
    const S = FOUNDRY_PRESS_STRIP_SPEC;
    for (const slot of this.lanes) {
      if (slot.objectId < 0) continue;
      const obj = world.entities.get(slot.objectId);
      if (!obj || obj.templateId !== S.template) {
        slot.objectId = -1;
        slot.group.visible = false;
        continue;
      }
      const length = obj.scale;
      const x = obj.pos.x;
      const z = obj.pos.z - length / 2;
      this.kit.drapeLane(slot, this.groundY, x, this.groundY(x, z), z, 0, length, S.halfWidth, {
        color: S.color,
        accent: S.accent,
      });
      const fill = foundryTimedFill(this.clock - slot.since, S.fillSeconds);
      this.kit.paintLane(slot, { fill, clock: this.clock, range: length });
    }
  }

  private paintMarkers(world: IWorld): void {
    for (const slot of this.markers) {
      if (slot.entityId < 0) continue;
      const e = world.entities.get(slot.entityId);
      const look = FOUNDRY_AURA_MARKERS[slot.auraId];
      if (!e || e.dead || !look || !e.auras?.some((a) => a.id === slot.auraId)) {
        slot.entityId = -1;
        slot.group.visible = false;
        continue;
      }
      const x = e.pos.x;
      const z = e.pos.z;
      const yaw = -this.clock * 1.6;
      this.kit.drapeFan(slot, this.groundY, x, this.groundY(x, z), z, yaw, look.radius);
      this.kit.paintFan(slot, { fill: 1, clock: this.clock, range: look.radius });
    }
  }

  private paintPlating(world: IWorld): void {
    for (const slot of this.plating) {
      if (slot.entityId < 0) continue;
      const e = world.entities.get(slot.entityId);
      const ring = e && !e.dead ? platingRings(e.auras)[slot.half] : undefined;
      if (!e || !ring || ring.color !== slot.color || ring.arcDeg !== slot.arc) {
        // A flip changed the face: free the slot, the next scan lays it anew.
        slot.entityId = -1;
        slot.group.visible = false;
        continue;
      }
      const radius = Math.max(2.2, e.scale * 1.4);
      const x = e.pos.x;
      const z = e.pos.z;
      this.kit.drapeFan(slot, this.groundY, x, this.groundY(x, z), z, e.facing + ring.yaw, radius);
      this.kit.paintFan(slot, { fill: 1, clock: this.clock, range: radius });
    }
    const st = this.stored;
    if (st.entityId < 0) return;
    const warden = world.entities.get(st.entityId);
    const aura = warden?.auras?.find((a) => a.id === VOLTAIC_STORED);
    if (!warden || warden.dead || !aura) {
      st.entityId = -1;
      st.group.visible = false;
      return;
    }
    const x = warden.pos.x;
    const z = warden.pos.z;
    this.kit.drapeFan(st, this.groundY, x, this.groundY(x, z), z, 0, STORED_RADIUS);
    this.kit.paintFan(st, {
      fill: storedChargeFill(aura.stacks, aura.value2),
      clock: this.clock,
      range: STORED_RADIUS,
    });
  }

  private scanWorld(world: IWorld): void {
    this.beltScratch.length = 0;
    for (const e of world.entities.values()) {
      if (e.kind === 'player') {
        this.scanMarkers(e);
        continue;
      }
      if (e.kind !== 'mob') {
        this.scanObject(e);
        continue;
      }
      if (e.dead) continue;
      this.scanPlating(e);
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
    const looks = beltLooks(this.beltScratch);
    looks.forEach((look, i) => {
      const u = FOUNDRY_BELT_UNIFORMS[i];
      if (!u) return;
      u.uDir.value = look.dir;
      u.uAlarm.value = look.alarm;
    });
  }

  private scanObject(e: {
    id: number;
    templateId: string;
    pos: { x: number };
    facing: number;
    scale: number;
  }): void {
    if (isBeltTemplate(e.templateId)) {
      this.beltScratch.push({
        x: e.pos.x,
        templateId: e.templateId,
        facing: e.facing,
        scale: e.scale,
      });
      return;
    }
    if (e.templateId === FOUNDRY_PRESS_STRIP_SPEC.template) {
      if (this.lanes.some((l) => l.objectId === e.id)) return;
      const lane = this.lanes.find((l) => l.objectId < 0);
      if (!lane) return;
      lane.objectId = e.id;
      lane.since = this.clock;
      lane.group.visible = true;
      return;
    }
    const objSpec = FOUNDRY_OBJECT_SPECS[e.templateId];
    if (!objSpec) return;
    if (this.objects.some((o) => o.objectId === e.id)) return;
    const slot = this.objects.find((o) => o.objectId < 0);
    if (!slot) return;
    this.kit.layOutFan(slot, 360, {
      color: objSpec.color,
      accent: objSpec.accent,
      sigil: objSpec.sigil === true,
    });
    slot.objectId = e.id;
    slot.templateId = e.templateId;
    slot.since = this.clock;
    slot.group.visible = true;
  }

  private scanMarkers(e: AuraBearer): void {
    if (e.dead || !e.auras) return;
    for (const a of e.auras) {
      const look = FOUNDRY_AURA_MARKERS[a.id];
      if (!look) continue;
      if (this.markers.some((m) => m.entityId === e.id && m.auraId === a.id)) continue;
      const slot = this.markers.find((m) => m.entityId < 0);
      if (!slot) return;
      this.kit.layOutFan(slot, 360, { color: look.color, accent: look.accent, sigil: true });
      slot.entityId = e.id;
      slot.auraId = a.id;
      slot.group.visible = true;
    }
  }

  private scanPlating(e: AuraBearer): void {
    platingRings(e.auras).forEach((ring, half) => {
      if (this.plating.some((p) => p.entityId === e.id && p.half === half)) return;
      const slot = this.plating.find((p) => p.entityId < 0);
      if (!slot) return;
      this.kit.layOutFan(slot, ring.arcDeg, { color: ring.color });
      slot.entityId = e.id;
      slot.half = half;
      slot.color = ring.color;
      slot.arc = ring.arcDeg;
      slot.group.visible = true;
    });
    if (this.stored.entityId < 0 && e.auras?.some((a) => a.id === VOLTAIC_STORED)) {
      this.stored.entityId = e.id;
      this.stored.group.visible = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.kit.dispose();
  }
}
