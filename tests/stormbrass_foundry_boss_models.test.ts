// The Prime Draft's and the Voltaic Warden's Blender bodies in game
// (src/render/stormbrass_foundry/prime_draft_model_core.ts, voltaic_model_core.ts,
// prime_draft_gesture_core.ts, prime_draft_tether_core.ts and their rows in
// src/render/characters/foundry_creature_looks.ts): the shipped GLBs carry the
// clips, bones, meshes and compression the looks key on; both draw at the size
// the cores state; every bar's clip lands its beat on the bar's last frame;
// the Warden's twelve plates flip by group through the dials alone (the flip
// clip's own plate turn is dropped), early enough to clear the armour; the
// Draft's moorings, hatch leaves, stance and cable terminal follow the
// mirrored encounter state.
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dialGesture } from '../src/render/characters/bone_dials';
import { isDroppedTrack, keptTrackNames } from '../src/render/characters/clip_track_drops';
import { FOUNDRY_CREATURE_LOOKS } from '../src/render/characters/foundry_creature_looks';
import { meshToggleActions } from '../src/render/characters/gesture_mesh_toggles';
import {
  type GlowPulseSet,
  glowPulseLevel,
  glowPulseTakes,
} from '../src/render/characters/glow_pulse_core';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  DRAFT_HATCH_DIALS,
  FOUNDRY_DRAW,
  FOUNDRY_FX_ANCHORS,
  foundryAnchor,
  VOLTAIC_FLIP_TRACK_DROPS,
  VOLTAIC_PLATE_DIAL_RATE,
  VOLTAIC_PLATES,
  voltaicFlipped,
  voltaicPlateGesture,
} from '../src/render/stormbrass_foundry/foundry_creature_fx_core';
import {
  FOUNDRY_PRIME_DRAFT_LANDMARK_SHOWN,
  planPrimeDraftLandmark,
} from '../src/render/stormbrass_foundry/foundry_kit_plan_core';
import { PRIME_DRAFT_LANDMARK } from '../src/render/stormbrass_foundry/foundry_plan_core';
import {
  DRAFT_GESTURE_REFRESH,
  DRAFT_OVERDRIVE_BEAT,
  type DraftGestureInput,
  DraftGestures,
} from '../src/render/stormbrass_foundry/prime_draft_gesture_core';
import {
  DRAFT_HATCH_OPEN_DIAL,
  DRAFT_HATCH_RATTLE,
  DRAFT_HATCH_SHUT_DIAL,
  DRAFT_MOORINGS_GONE_GESTURE,
  DRAFT_MOORINGS_ON_GESTURE,
  DRAFT_OVERDRIVE_GLOW,
  DRAFT_STANCE_OPEN,
  DRAFT_STANCE_SHUT,
  draftHatchLook,
  draftMooringsShown,
  draftStanceOpen,
  PRIME_DRAFT_CLIP,
  PRIME_DRAFT_CLIP_LEAD,
  PRIME_DRAFT_DRAWN_SCALE,
  PRIME_DRAFT_HATCH_OPEN_RAD,
  PRIME_DRAFT_MODEL,
  PRIME_DRAFT_SIM_SCALE,
  primeDraftLookHeight,
  primeDraftModelScale,
  primeDraftPoint,
} from '../src/render/stormbrass_foundry/prime_draft_model_core';
import {
  DRAFT_TETHER,
  draftCableTerminal,
  draftFeederHead,
} from '../src/render/stormbrass_foundry/prime_draft_tether_core';
import {
  VOLTAIC_CLIP,
  VOLTAIC_DRAWN_SCALE,
  VOLTAIC_MODEL,
  VOLTAIC_PLATE_NAMES,
  VOLTAIC_SIM_SCALE,
  voltaicFlipTurned,
  voltaicLookHeight,
} from '../src/render/stormbrass_foundry/voltaic_model_core';
import { PRIME_DRAFT_SPOT } from '../src/sim/content/stormbrass_foundry_layout';
import { MOBS } from '../src/sim/data';
import {
  DRAFT_ARM_SWEEP,
  DRAFT_AWAKEN,
  DRAFT_OVERLOAD,
  DRAFT_PISTON_FIST,
  DRAFT_TREMOR_STEP,
  DRAFT_TUNING,
  DRAFT_UNBOLT,
  VOLTAIC_FLIP,
  VOLTAIC_STATIC_LASH,
  VOLTAIC_TUNING,
} from '../src/sim/encounters/stormbrass_foundry/ids';
import type { Entity } from '../src/sim/types';

interface GlbJson {
  animations: {
    name: string;
    samplers: { input: number }[];
    channels: { target: { node: number; path: string } }[];
  }[];
  accessors: { min?: number[]; max?: number[] }[];
  materials: { name: string; alphaMode?: string; emissiveTexture?: unknown }[];
  meshes: { name: string }[];
  nodes: { name?: string; mesh?: number }[];
  images?: { mimeType?: string }[];
  extensionsUsed?: string[];
  skins: { joints: number[] }[];
}

function glbJson(url: string): GlbJson {
  const buf = readFileSync(`public/${url}`);
  return JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12))) as GlbJson;
}

function clipSpan(json: GlbJson, name: string): { start: number; end: number } {
  const a = json.animations.find((x) => x.name === name);
  if (!a) return { start: 0, end: 0 };
  return {
    start: Math.min(...a.samplers.map((s) => json.accessors[s.input].min?.[0] ?? 0)),
    end: Math.max(...a.samplers.map((s) => json.accessors[s.input].max?.[0] ?? 0)),
  };
}

/** The node names a clip keys a rotation for. */
function rotationKeyed(json: GlbJson, clip: string): Set<string> {
  const a = json.animations.find((x) => x.name === clip);
  const out = new Set<string>();
  for (const c of a?.channels ?? [])
    if (c.target.path === 'rotation') out.add(json.nodes[c.target.node].name ?? '');
  return out;
}

const key = (templateId: string) => visualKeyFor({ kind: 'mob', templateId } as unknown as Entity);
const MB = 1024 * 1024;

describe('the Voltaic Warden: the shipped body', () => {
  const def = VISUALS.foundry_voltaic_warden;
  const json = glbJson(VOLTAIC_MODEL.url);
  const names = new Set(json.nodes.map((n) => n.name ?? ''));

  it('maps the Warden to its Blender body at its authored size', () => {
    expect(key('voltaic_warden')).toBe('foundry_voltaic_warden');
    expect(def).toBe(FOUNDRY_CREATURE_LOOKS.foundry_voltaic_warden);
    expect(def.url).toBe(VOLTAIC_MODEL.url);
    expect(MOBS.voltaic_warden.scale).toBe(VOLTAIC_SIM_SCALE);
    expect(def.height).toBeCloseTo(voltaicLookHeight(), 9);
    // Drawn 1:1: its sim scale times the def height is the model's own bounds.
    expect(VOLTAIC_DRAWN_SCALE).toBe(1);
    expect(def.height * VOLTAIC_SIM_SCALE).toBeCloseTo(VOLTAIC_MODEL.idleBoundsHeight, 9);
    expect(FOUNDRY_DRAW.voltaic_warden * VOLTAIC_SIM_SCALE).toBeCloseTo(1, 9);
  });

  it('ships meshopt and KTX2, one skinned mesh, its three materials, under budget', () => {
    expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
    expect(json.extensionsUsed).toContain('KHR_texture_basisu');
    expect((json.images ?? []).every((i) => i.mimeType === 'image/ktx2')).toBe(true);
    expect(json.meshes.map((m) => m.name)).toEqual(['VoltaicWarden']);
    expect(json.materials.map((m) => m.name).sort()).toEqual([
      'VoltaicBody',
      'VoltaicGlass',
      'VoltaicGlow',
    ]);
    expect(json.materials.find((m) => m.name === 'VoltaicGlass')?.alphaMode).toBe('BLEND');
    expect(json.materials.find((m) => m.name === 'VoltaicBody')?.emissiveTexture).toBeDefined();
    expect(statSync(`public/${VOLTAIC_MODEL.url}`).size).toBeLessThan(4.5 * MB);
  });

  it('carries every clip the look names, starting on frame 0', () => {
    const c = def.clips;
    for (const clip of [
      c.idle,
      c.walk,
      c.run,
      c.death,
      c.cast,
      ...c.attack,
      ...(c.hit ?? []),
      ...Object.values(c.castByAbility ?? {}),
      ...Object.values(c.attackByAbility ?? {}),
    ]) {
      const span = clipSpan(json, clip ?? '');
      expect(span.end, clip).toBeGreaterThan(0.5);
      expect(span.start, clip).toBe(0);
    }
    // Both bars play their clip at 1x from the bar's start.
    expect(c.castByAbility?.[VOLTAIC_FLIP]).toBe('FlipRattle');
    expect(c.castTimeScaleByAbility?.[VOLTAIC_FLIP]).toBe(1);
    expect(clipSpan(json, 'FlipRattle').end).toBeCloseTo(VOLTAIC_TUNING.flipCast, 1);
    expect(c.castByAbility?.[VOLTAIC_STATIC_LASH]).toBe('StaticLash');
    expect(VOLTAIC_CLIP.lashRelease).toBeCloseTo(VOLTAIC_TUNING.lashCast, 6);
    expect(def.castClipSync).toBe(true);
  });

  it('flips twelve plates by group: chest, shoulder fronts, forearms; back, shoulder backs, upper arms', () => {
    expect(VOLTAIC_PLATES).toHaveLength(12);
    const group = (half: string) =>
      VOLTAIC_PLATE_NAMES.filter(([, h]) => h === half)
        .map(([n]) => n)
        .sort();
    expect(group('front')).toEqual([
      'ChestL',
      'ChestR',
      'ForearmL',
      'ForearmR',
      'ShoulderFrontL',
      'ShoulderFrontR',
    ]);
    expect(group('back')).toEqual([
      'BackL',
      'BackR',
      'ShoulderBackL',
      'ShoulderBackR',
      'UpperArmL',
      'UpperArmR',
    ]);
    // Every plate bone and its mount are in the GLB, and the look dials each.
    for (const [bone] of VOLTAIC_PLATES) {
      expect(names.has(bone), bone).toBe(true);
      expect(names.has(bone.replace('Plate_', 'PlateMount_')), bone).toBe(true);
    }
    expect(def.dials?.map((d) => d.bone).sort()).toEqual(VOLTAIC_PLATES.map(([b]) => b).sort());
    // Half a turn about the plate's own local +Y shows the blue face.
    const split = voltaicPlateGesture('charged', 'grounded');
    for (const d of def.dials ?? []) {
      expect(d.axis).toEqual([0, 1, 0]);
      const half = VOLTAIC_PLATES.find(([b]) => b === d.bone)?.[1];
      expect(d.stops[split], d.bone).toBeCloseTo(half === 'front' ? Math.PI : 0, 9);
      expect(d.stops[voltaicPlateGesture('grounded', 'grounded')]).toBe(0);
      expect(d.stops[voltaicPlateGesture('charged', 'charged')]).toBeCloseTo(Math.PI, 9);
    }
    // One gesture addresses all twelve; a split gesture turns only the front six.
    const defs = def.dials ?? [];
    expect(dialGesture(defs, split)).toHaveLength(12);
    expect(dialGesture(defs, split).filter(([, stop]) => stop === Math.PI)).toHaveLength(6);
  });

  it('lets the dials alone turn the plates through the flip clip', () => {
    // The GLB's FlipRattle turns every plate itself...
    const keyed = rotationKeyed(json, 'FlipRattle');
    for (const [bone] of VOLTAIC_PLATES) expect(keyed.has(bone), bone).toBe(true);
    // ...so the look drops exactly those rotations (never the mounts' push-out).
    expect(def.clipTrackDrops).toEqual({ FlipRattle: VOLTAIC_FLIP_TRACK_DROPS });
    expect([...VOLTAIC_FLIP_TRACK_DROPS].sort()).toEqual(VOLTAIC_PLATES.map(([b]) => b).sort());
    expect(isDroppedTrack('Plate_ChestL.quaternion', VOLTAIC_FLIP_TRACK_DROPS)).toBe(true);
    expect(isDroppedTrack('PlateMount_ChestL.quaternion', VOLTAIC_FLIP_TRACK_DROPS)).toBe(false);
    expect(isDroppedTrack('PlateMount_ChestL.position', VOLTAIC_FLIP_TRACK_DROPS)).toBe(false);
    expect(isDroppedTrack('Plate_ChestL.position', VOLTAIC_FLIP_TRACK_DROPS)).toBe(false);
    expect(
      keptTrackNames(
        ['Chest.quaternion', 'Plate_BackR.quaternion', 'PlateMount_BackR.position'],
        VOLTAIC_FLIP_TRACK_DROPS,
      ),
    ).toEqual(['Chest.quaternion', 'PlateMount_BackR.position']);
    // The turn starts once the mounts have pushed out and is done by the seat:
    // the dial covers 99 percent of its half turn inside that window.
    expect(voltaicFlipTurned(VOLTAIC_CLIP.flipTurnStart - 0.01)).toBe(false);
    expect(voltaicFlipTurned(VOLTAIC_CLIP.flipTurnStart)).toBe(true);
    const window = VOLTAIC_CLIP.flipSeat - VOLTAIC_CLIP.flipTurnStart;
    expect(1 - Math.exp(-VOLTAIC_PLATE_DIAL_RATE * window)).toBeGreaterThan(0.99);
    expect(VOLTAIC_CLIP.flipSeat).toBeLessThan(VOLTAIC_TUNING.flipCast);
    // A flip turns both halves over; split plating stays split.
    expect(voltaicFlipped({ front: 'grounded', back: 'grounded' })).toEqual({
      front: 'charged',
      back: 'charged',
    });
    expect(voltaicFlipped({ front: 'charged', back: 'grounded' })).toEqual({
      front: 'grounded',
      back: 'charged',
    });
  });

  it('anchors its effects on the coil, the crown, the palm and the drone bay', () => {
    for (const bone of ['CoilCore', 'L_Hand', 'R_Hand', 'CrownTop', 'HatchL', 'HatchR', 'Head'])
      expect(names.has(bone), bone).toBe(true);
    const A = FOUNDRY_FX_ANCHORS;
    // The coil sits in the chest, in front; the crown behind and above the helm.
    expect(A.wardenCore.up).toBeCloseTo(VOLTAIC_MODEL.coil.up, 9);
    expect(A.wardenCore.fwd).toBeGreaterThan(1);
    expect(A.wardenCrownTip.up).toBeGreaterThan(VOLTAIC_MODEL.helmTop);
    expect(A.wardenCrownTip.fwd).toBeLessThan(0);
    // Static Lash leaves the RIGHT palm (its right is -side), thrown forward.
    expect(A.wardenHandR.side).toBeLessThan(0);
    expect(A.wardenHandR.fwd).toBeGreaterThan(3);
    // The drones leave both bay doors on its back.
    expect(A.wardenBayL.side).toBe(-A.wardenBayR.side);
    expect(A.wardenBayL.fwd).toBeLessThan(-2);
    // In the world a Warden at its sim scale carries them at model yards.
    const out = { x: 0, y: 0, z: 0 };
    foundryAnchor(
      { x: 100, y: 5, z: 50 },
      0,
      FOUNDRY_DRAW.voltaic_warden * VOLTAIC_SIM_SCALE,
      A.wardenCore,
      out,
    );
    expect(out.y).toBeCloseTo(5 + VOLTAIC_MODEL.coil.up, 6);
    expect(out.z).toBeCloseTo(50 + VOLTAIC_MODEL.coil.forward, 6);
  });

  it('goes dark as it dies: the glow material and the plate faces fade', () => {
    const set = def.glowPulses as GlowPulseSet;
    expect(set.deathFade).toBe(VOLTAIC_CLIP.deathGlowOut);
    expect(glowPulseTakes(set, 'VoltaicGlow', false)).toBe(true);
    expect(glowPulseTakes(set, 'VoltaicBody', true)).toBe(true);
    expect(glowPulseTakes(set, 'VoltaicGlass', false)).toBe(false);
    expect(glowPulseLevel(set, [], -1)).toBe(1);
    expect(glowPulseLevel(set, [], VOLTAIC_CLIP.deathGlowOut)).toBe(0);
  });
});

describe('the Prime Draft: the shipped body', () => {
  const def = VISUALS.foundry_prime_draft;
  const json = glbJson(PRIME_DRAFT_MODEL.url);
  const names = new Set(json.nodes.map((n) => n.name ?? ''));

  it('maps the Prime Draft to its Blender body, the dungeon`s biggest fighter', () => {
    expect(key('prime_draft')).toBe('foundry_prime_draft');
    expect(def).toBe(FOUNDRY_CREATURE_LOOKS.foundry_prime_draft);
    expect(def.url).toBe(PRIME_DRAFT_MODEL.url);
    expect(MOBS.prime_draft.scale).toBe(PRIME_DRAFT_SIM_SCALE);
    expect(def.height).toBeCloseTo(primeDraftLookHeight(), 9);
    const drawn = def.height * PRIME_DRAFT_SIM_SCALE;
    expect(drawn).toBeCloseTo(PRIME_DRAFT_MODEL.idleBoundsHeight * PRIME_DRAFT_DRAWN_SCALE, 9);
    // Between 11 and 12 yd, over the Warden's crown spire.
    expect(drawn).toBeGreaterThan(11);
    expect(drawn).toBeLessThan(12);
    expect(drawn).toBeGreaterThan(VISUALS.foundry_voltaic_warden.height * VOLTAIC_SIM_SCALE);
    expect(primeDraftModelScale(PRIME_DRAFT_SIM_SCALE)).toBe(PRIME_DRAFT_DRAWN_SCALE);
    expect(FOUNDRY_DRAW.prime_draft * PRIME_DRAFT_SIM_SCALE).toBeCloseTo(
      PRIME_DRAFT_DRAWN_SCALE,
      9,
    );
  });

  it('ships the light build: meshopt, KTX2, the body and its moorings mesh, under budget', () => {
    expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
    expect((json.images ?? []).every((i) => i.mimeType === 'image/ktx2')).toBe(true);
    expect(json.meshes.map((m) => m.name).sort()).toEqual(['PrimeDraft', 'PrimeDraftMoorings']);
    expect(json.materials.map((m) => m.name).sort()).toEqual(['PrimeDraftBody', 'PrimeDraftGlow']);
    expect(json.skins[0].joints).toHaveLength(90);
    // The Great Saurian's budget (the full 2048 normal build is 6.9 MB).
    expect(statSync(`public/${PRIME_DRAFT_MODEL.url}`).size).toBeLessThan(4.5 * MB);
  });

  it('maps all thirteen clips to the encounter', () => {
    const c = def.clips;
    const open = def.phaseClips?.[DRAFT_STANCE_OPEN];
    const shut = def.phaseClips?.[DRAFT_STANCE_SHUT];
    const used = new Set<string>([
      c.idle,
      c.walk,
      c.run,
      c.death,
      ...c.attack,
      ...(c.hit ?? []),
      ...Object.values(c.castByAbility ?? {}),
      ...Object.values(c.attackByAbility ?? {}),
      open?.clips.idle ?? '',
      open?.enter ?? '',
      shut?.enter ?? '',
    ]);
    expect([...used].sort()).toEqual(
      [
        'Death',
        'Hatch_Close',
        'Hatch_Held',
        'Hatch_Open',
        'Hit',
        'Idle',
        'Overload',
        'Piston_Sweep',
        'Slam',
        'Tremor_Step',
        'Unbolt',
        'Wake',
        'Walk',
      ].sort(),
    );
    expect(json.animations.map((a) => a.name).sort()).toEqual([...used].sort());
    // Every shipped clip starts one authoring frame late: the beats carry it.
    for (const a of json.animations)
      expect(clipSpan(json, a.name).start, a.name).toBeCloseTo(PRIME_DRAFT_CLIP_LEAD, 3);
    expect(c.castByAbility).toEqual({
      [DRAFT_AWAKEN]: 'Wake',
      [DRAFT_ARM_SWEEP]: 'Piston_Sweep',
      [DRAFT_TREMOR_STEP]: 'Tremor_Step',
      [DRAFT_UNBOLT]: 'Unbolt',
    });
    expect(c.attackByAbility).toEqual({
      [DRAFT_PISTON_FIST]: 'Slam',
      [DRAFT_OVERLOAD]: 'Overload',
    });
    // The shut stance IS the default map: its gesture does nothing on a shut body.
    expect(shut?.clips).toBe(c);
    expect(open?.clips.castByAbility).toBe(c.castByAbility);
    expect(def.castClipSync).toBe(true);
  });

  it('lands every beat on the last frame of its bar', () => {
    const c = def.clips;
    const T = DRAFT_TUNING;
    const cast = (id: string) => c.castTimeScaleByAbility?.[id] ?? 0;
    // The flex peaks as the 3 s Awakening ends, the claw crosses the cone as
    // the 1.5 s Arm Sweep ends, the foot stomps as the 1.5 s Tremor Step ends,
    // the last bolts shear as the 2.5 s Unbolt ends.
    expect(T.awakenCast * cast(DRAFT_AWAKEN)).toBeCloseTo(PRIME_DRAFT_CLIP.wakeFlex, 9);
    expect(T.sweepCast * cast(DRAFT_ARM_SWEEP)).toBeCloseTo(PRIME_DRAFT_CLIP.sweepCross, 9);
    expect(T.tremorCast * cast(DRAFT_TREMOR_STEP)).toBeCloseTo(PRIME_DRAFT_CLIP.tremorStomp, 9);
    expect(T.unboltCast * cast(DRAFT_UNBOLT)).toBeCloseTo(PRIME_DRAFT_CLIP.unboltShearR, 9);
    // The brass fist meets the floor as the 2 s Piston Fist warning ends.
    const fist = c.attackTimeScaleByAbility?.[DRAFT_PISTON_FIST] ?? 0;
    expect(T.fistWarning * fist).toBeCloseTo(PRIME_DRAFT_CLIP.slamHit, 9);
    // The Overload seizure fills the whole stun.
    const seize = c.attackTimeScaleByAbility?.[DRAFT_OVERLOAD] ?? 0;
    expect(T.overloadStun * seize).toBeCloseTo(PRIME_DRAFT_CLIP.overloadLength, 9);
    // Every rate stays near 1x except the stretched seizure.
    for (const id of [DRAFT_AWAKEN, DRAFT_ARM_SWEEP, DRAFT_TREMOR_STEP, DRAFT_UNBOLT]) {
      expect(cast(id), id).toBeGreaterThan(0.98);
      expect(cast(id), id).toBeLessThan(1.06);
    }
    for (const clip of ['Wake', 'Piston_Sweep', 'Tremor_Step', 'Unbolt'])
      expect(c.castPlayOut).toContain(clip);
    // The beats sit inside their clips.
    expect(PRIME_DRAFT_CLIP.slamHit).toBeLessThan(clipSpan(json, 'Slam').end);
    expect(PRIME_DRAFT_CLIP.unboltLength).toBeCloseTo(clipSpan(json, 'Unbolt').end, 2);
    expect(PRIME_DRAFT_CLIP.overloadLength).toBeCloseTo(clipSpan(json, 'Overload').end, 2);
  });

  it('hides the moorings mesh once it has torn free, and only then', () => {
    expect(names.has('PrimeDraftMoorings')).toBe(true);
    const toggles = def.meshToggles ?? [];
    expect(toggles).toHaveLength(1);
    expect(toggles[0].nodes).toEqual(['PrimeDraftMoorings']);
    expect(meshToggleActions(toggles, DRAFT_MOORINGS_GONE_GESTURE)).toEqual([[0, 'hide']]);
    expect(meshToggleActions(toggles, DRAFT_MOORINGS_ON_GESTURE)).toEqual([[0, 'show']]);
    const base = { dead: false, bolted: false, inFight: true, sinceUnboltBar: null };
    // Asleep in its gantry, and bolted in the fight: moored.
    expect(draftMooringsShown({ ...base, inFight: false })).toBe(true);
    expect(draftMooringsShown({ ...base, bolted: true })).toBe(true);
    // Through the Unbolt clip (the bar AND its play-out) the mesh stays, so the
    // bolts fly and the cables rip out on screen; then it is gone.
    expect(draftMooringsShown({ ...base, sinceUnboltBar: DRAFT_TUNING.unboltCast + 0.2 })).toBe(
      true,
    );
    expect(draftMooringsShown({ ...base, sinceUnboltBar: PRIME_DRAFT_CLIP.unboltLength })).toBe(
      false,
    );
    // A view met unbolted mid-fight never saw the bar: gone at once.
    expect(draftMooringsShown(base)).toBe(false);
    // A reset (out of the fight) moors it again; a corpse never wears them.
    expect(draftMooringsShown({ ...base, inFight: false, sinceUnboltBar: 99 })).toBe(true);
    expect(draftMooringsShown({ ...base, dead: true, inFight: false })).toBe(false);
    expect(PRIME_DRAFT_CLIP.unboltLength).toBeGreaterThan(DRAFT_TUNING.unboltCast);
  });

  it('swings the hatch leaves on dials the hatch clips do not fight', () => {
    expect(def.dials).toBe(DRAFT_HATCH_DIALS);
    const [left, right] = DRAFT_HATCH_DIALS;
    expect([left.bone, right.bone]).toEqual(['HatchL', 'HatchR']);
    for (const bone of ['HatchL', 'HatchR', 'CoreArc', 'EyeGlow', 'Anchor_Core', 'Anchor_Hatch'])
      expect(names.has(bone), bone).toBe(true);
    // 105 degrees on the hinge, the two leaves opposite ways.
    expect(left.stops[DRAFT_HATCH_OPEN_DIAL]).toBeCloseTo(PRIME_DRAFT_HATCH_OPEN_RAD, 9);
    expect(right.stops[DRAFT_HATCH_OPEN_DIAL]).toBeCloseTo(-PRIME_DRAFT_HATCH_OPEN_RAD, 9);
    expect(left.stops[DRAFT_HATCH_SHUT_DIAL]).toBe(0);
    expect(PRIME_DRAFT_HATCH_OPEN_RAD).toBeCloseTo((105 * Math.PI) / 180, 9);
    expect(left.rattle?.gesture).toBe(DRAFT_HATCH_RATTLE);
    expect(left.rattle?.seconds).toBe(DRAFT_TUNING.hatchWarning);
    // The clips that swing the leaves themselves lose that rotation (Death keeps it).
    const drops = def.clipTrackDrops ?? {};
    expect(Object.keys(drops).sort()).toEqual(
      ['Hatch_Close', 'Hatch_Held', 'Hatch_Open', 'Overload'].sort(),
    );
    for (const clip of Object.keys(drops)) {
      expect(drops[clip]).toEqual(['HatchL', 'HatchR']);
      expect(rotationKeyed(json, clip).has('HatchL'), clip).toBe(true);
    }
    expect(rotationKeyed(json, 'Death').has('HatchL')).toBe(true);
  });

  it('reads the hatch off the Core Hatch ring and the Overload', () => {
    expect(draftHatchLook('closed', false, false)).toBe('shut');
    expect(draftHatchLook('warn', false, false)).toBe('warn');
    expect(draftHatchLook('open', false, false)).toBe('open');
    expect(draftHatchLook(null, false, false)).toBe('shut');
    // Stunned by a slotted cell its chest stays open whatever the ring says.
    expect(draftHatchLook('closed', true, false)).toBe('open');
    expect(draftHatchLook('open', false, true)).toBe('shut');
    // The open stance (entry Hatch_Open: a second of shudder, then the swing)
    // starts that long before the warning ends, so the swing lands on the open.
    const W = DRAFT_TUNING.hatchWarning;
    expect(draftStanceOpen('warn', 0, W)).toBe(false);
    expect(draftStanceOpen('warn', W - PRIME_DRAFT_CLIP.hatchSwing - 0.05, W)).toBe(false);
    expect(draftStanceOpen('warn', W - PRIME_DRAFT_CLIP.hatchSwing, W)).toBe(true);
    expect(draftStanceOpen('open', 0, W)).toBe(true);
    expect(draftStanceOpen('shut', 99, W)).toBe(false);
  });

  it('lets its lightning die out: the glow material fades with the eye', () => {
    const set = def.glowPulses as GlowPulseSet;
    expect(set.materials).toEqual(['PrimeDraftGlow']);
    expect(glowPulseTakes(set, 'PrimeDraftGlow', false)).toBe(true);
    expect(glowPulseTakes(set, 'PrimeDraftBody', false)).toBe(false);
    expect(set.deathFade).toBe(PRIME_DRAFT_CLIP.deathEyeOut);
    const idle = set.pulses.map(() => -1);
    expect(glowPulseLevel(set, idle, -1)).toBe(1);
    expect(glowPulseLevel(set, idle, PRIME_DRAFT_CLIP.deathEyeOut / 2)).toBeCloseTo(0.25, 6);
    expect(glowPulseLevel(set, idle, PRIME_DRAFT_CLIP.deathEyeOut)).toBe(0);
    // It flares on the Overload's discharge and beats while it overdrives.
    expect(set.pulses.map((p) => p.gesture)).toEqual([DRAFT_OVERLOAD, DRAFT_OVERDRIVE_GLOW]);
    expect(glowPulseLevel(set, [0.3, -1], -1)).toBeGreaterThan(2);
    expect(glowPulseLevel(set, [-1, 0.3], -1)).toBeGreaterThan(1.5);
  });
});

describe('the Prime Draft: its gestures off mirrored state', () => {
  const quiet: DraftGestureInput = {
    dead: false,
    bolted: false,
    inFight: false,
    unbolting: false,
    ring: null,
    overloaded: false,
    overdrive: false,
  };
  const W = DRAFT_TUNING.hatchWarning;

  function run(steps: [number, Partial<DraftGestureInput>][]): { at: number; g: string }[] {
    const g = new DraftGestures();
    const sent: { at: number; g: string }[] = [];
    for (const [at, s] of steps) g.step({ ...quiet, ...s }, at, W, (x) => sent.push({ at, g: x }));
    return sent;
  }

  it('moors it asleep, keeps the moorings through the Unbolt clip, then drops them', () => {
    const fight = { bolted: true, inFight: true, ring: 'closed' as const };
    const sent = run([
      [0, {}],
      [1, fight],
      [10, { ...fight, unbolting: true }],
      // The bar ended (Bolted dropped) but the clip still throws the bolts.
      [10 + DRAFT_TUNING.unboltCast + 0.1, { inFight: true, ring: 'closed' }],
      [10 + PRIME_DRAFT_CLIP.unboltLength + 0.05, { inFight: true, ring: 'closed' }],
    ]);
    const moorings = sent.filter((x) => x.g.includes('moorings'));
    expect(moorings[0]).toEqual({ at: 0, g: DRAFT_MOORINGS_ON_GESTURE });
    expect(moorings.filter((x) => x.g === DRAFT_MOORINGS_GONE_GESTURE).map((x) => x.at)).toEqual([
      10 + PRIME_DRAFT_CLIP.unboltLength + 0.05,
    ]);
  });

  it('re-sends the state so a late-built view catches up, and moors it again on a reset', () => {
    const g = new DraftGestures();
    const sent: string[] = [];
    const send = (x: string) => sent.push(x);
    g.step({ ...quiet, inFight: true, ring: 'closed' }, 0, W, send);
    expect(sent).toContain(DRAFT_MOORINGS_GONE_GESTURE);
    expect(g.moored).toBe(false);
    sent.length = 0;
    g.step({ ...quiet, inFight: true, ring: 'closed' }, 0.5, W, send);
    expect(sent).toEqual([]);
    g.step({ ...quiet, inFight: true, ring: 'closed' }, DRAFT_GESTURE_REFRESH + 0.6, W, send);
    expect(sent).toEqual([DRAFT_MOORINGS_GONE_GESTURE, DRAFT_HATCH_SHUT_DIAL]);
    sent.length = 0;
    g.step(quiet, 10, W, send);
    expect(sent).toContain(DRAFT_MOORINGS_ON_GESTURE);
    expect(g.moored).toBe(true);
  });

  it('shudders, opens and shuts the hatch with the ring, the stance a beat ahead', () => {
    const fight = { bolted: true, inFight: true };
    const lead = W - PRIME_DRAFT_CLIP.hatchSwing;
    const sent = run([
      [0, { ...fight, ring: 'closed' }],
      [5, { ...fight, ring: 'warn' }],
      [5 + lead - 0.1, { ...fight, ring: 'warn' }],
      [5 + lead + 0.05, { ...fight, ring: 'warn' }],
      [5 + W, { ...fight, ring: 'open' }],
      [5 + W + DRAFT_TUNING.hatchOpenFor, { ...fight, ring: 'closed' }],
    ]).filter((x) => !x.g.includes('moorings'));
    const at = (g: string) => sent.filter((x) => x.g === g).map((x) => x.at);
    // A shut body met shut is sent no stance (it already stands shut).
    expect(at(DRAFT_STANCE_SHUT)).toEqual([5 + W + DRAFT_TUNING.hatchOpenFor]);
    expect(at(DRAFT_HATCH_RATTLE)).toEqual([5]);
    expect(at(DRAFT_STANCE_OPEN)).toEqual([5 + lead + 0.05]);
    expect(at(DRAFT_HATCH_OPEN_DIAL)).toEqual([5 + W]);
    expect(at(DRAFT_HATCH_SHUT_DIAL)).toContain(5 + W + DRAFT_TUNING.hatchOpenFor);
  });

  it('holds its chest open through the Overload and beats while it overdrives', () => {
    const fight = { inFight: true, ring: 'closed' as const };
    const sent = run([
      [0, fight],
      [1, { ...fight, overloaded: true }],
      [2, { ...fight, overloaded: true, overdrive: true }],
      [2.5, { ...fight, overloaded: true, overdrive: true }],
      [2 + DRAFT_OVERDRIVE_BEAT, { ...fight, overdrive: true }],
    ]);
    const at = (g: string) => sent.filter((x) => x.g === g).map((x) => x.at);
    expect(at(DRAFT_HATCH_OPEN_DIAL)).toEqual([1]);
    expect(at(DRAFT_STANCE_OPEN)).toEqual([1]);
    expect(at(DRAFT_OVERDRIVE_GLOW)).toEqual([2, 2 + DRAFT_OVERDRIVE_BEAT]);
    expect(at(DRAFT_STANCE_SHUT)).toEqual([2 + DRAFT_OVERDRIVE_BEAT]);
  });

  it('sends a corpse nothing but its moorings off', () => {
    const sent = run([[0, { dead: true, ring: 'open', overdrive: true }]]);
    expect(sent.map((x) => x.g)).toEqual([DRAFT_MOORINGS_GONE_GESTURE]);
  });
});

describe('the Prime Draft: its cable terminal and its landmark', () => {
  it('hangs the terminal on the cable ends, wherever the bolted Draft has crawled', () => {
    const k = primeDraftModelScale(PRIME_DRAFT_SIM_SCALE);
    const e = PRIME_DRAFT_MODEL.cableEnd;
    // The delivery's 7.4 yd behind and 7.4 yd up, at the drawn scale.
    expect(e.up).toBe(7.4);
    expect(e.forward).toBe(-7.4);
    const out = { x: 0, y: 0, z: 0 };
    // Facing south (as it stands in its scaffold): behind it is north, +z.
    draftCableTerminal({ x: 10, y: 25, z: 213 }, Math.PI, PRIME_DRAFT_SIM_SCALE, out);
    expect(out.x).toBeCloseTo(10, 6);
    expect(out.y).toBeCloseTo(25 + 7.4 * k, 6);
    expect(out.z).toBeCloseTo(213 + 7.4 * k, 6);
    // Crawled five yards south-east and turned: the terminal follows the body.
    draftCableTerminal({ x: 14, y: 25, z: 210 }, Math.PI / 2, PRIME_DRAFT_SIM_SCALE, out);
    expect(out.x).toBeCloseTo(14 - 7.4 * k, 6);
    expect(out.z).toBeCloseTo(210, 6);
    // The two bushings sit on the two cable ends.
    expect(DRAFT_TETHER.bushingX).toBeCloseTo(e.x * k, 9);
    expect(DRAFT_TETHER.boxHalf.x).toBeGreaterThan(DRAFT_TETHER.bushingX);
    const end = { x: 0, y: 0, z: 0 };
    primeDraftPoint({ x: 10, y: 25, z: 213 }, Math.PI, PRIME_DRAFT_SIM_SCALE, e, end);
    expect(Math.abs(end.x - 10)).toBeCloseTo(DRAFT_TETHER.bushingX, 6);
  });

  it('ties the feeder to the gantry scaffold behind its spot, over every head', () => {
    const head = { x: 0, y: 0, z: 0 };
    draftFeederHead({ x: PRIME_DRAFT_SPOT.x, y: 25, z: PRIME_DRAFT_SPOT.z }, head);
    // On the scaffold's front face (the scaffold stands at z 228, 1.5 deep).
    expect(head.z).toBeCloseTo(226.5, 6);
    expect(head.y - 25).toBeGreaterThan(25);
    // The terminal at rest hangs in front of the scaffold and under its head.
    const box = { x: 0, y: 0, z: 0 };
    draftCableTerminal(
      { x: PRIME_DRAFT_SPOT.x, y: 25, z: PRIME_DRAFT_SPOT.z },
      Math.PI,
      PRIME_DRAFT_SIM_SCALE,
      box,
    );
    expect(box.z).toBeLessThan(head.z);
    expect(box.y).toBeLessThan(head.y);
    // Well over a player's head (4.5 yd of head room).
    expect(box.y - 25 - DRAFT_TETHER.boxHalf.y).toBeGreaterThan(6);
  });

  it('keeps ONE Prime Draft: the kit colossus is off, its cradle stays', () => {
    expect(FOUNDRY_PRIME_DRAFT_LANDMARK_SHOWN).toBe(false);
    const cradle = planPrimeDraftLandmark(PRIME_DRAFT_LANDMARK);
    expect(cradle.some((p) => p.piece === 'Kit_ModelFrame')).toBe(false);
    expect(cradle.filter((p) => p.piece === 'Kit_DraftScaffoldTower')).toHaveLength(2);
    expect(cradle.filter((p) => p.piece === 'Kit_Pier')).toHaveLength(1);
    expect(cradle.filter((p) => p.piece === 'Kit_Scaffold')).toHaveLength(4);
  });
});
