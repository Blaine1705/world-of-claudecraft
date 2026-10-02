// The Stormbrass Foundry's own creatures (phase 3 of 3,
// docs/design/dungeon-rework/stormbrass_foundry.md): Blender-built machines
// and engineers (scripts/assets/stormbrass_foundry_creatures/), each replacing
// its phase-1 placeholder look under the SAME visual key, so the MOB_KEYS map
// and the sim are untouched. manifest.ts merges these over
// FOUNDRY_PLACEHOLDER_LOOKS.
//
// Sizes: `height` is what the game normalises the measured Idle pose to; the
// template's sim scale multiplies it (a player stands 2.6). Every boss stands
// three to four players tall, the trash well past a player.
//
// Held tools are modelled on the bone that carries them (no weapon bone turns
// against a hand), and the dials (bone_dials.ts) turn the bones a clip cannot
// know: Tock's gauge needle, the Voltaic Warden's plates, the Prime Draft's
// hatch leaves. The Warden and the Draft are their own Blender deliveries
// (scripts/assets/foundry_voltaic_warden, scripts/assets/foundry_prime_draft),
// measured in stormbrass_foundry/voltaic_model_core.ts and
// prime_draft_model_core.ts.

import {
  DRAFT_ARM_SWEEP,
  DRAFT_AWAKEN,
  DRAFT_OVERLOAD,
  DRAFT_PISTON_FIST,
  DRAFT_TREMOR_STEP,
  DRAFT_TUNING,
  DRAFT_UNBOLT,
  HAULER_SCRAP_TOSS,
  HAULER_STEAM_BLAST,
  HAULER_UNLOAD,
  RANGE_DRILL_DRONES,
  RANGE_PROOF_SHOT,
  RANGE_SALVO,
  RANGE_SHRAPNEL,
  RANGE_TARGET_LOCK,
  TOCK_LEVER,
  TOCK_PARTS_DROP,
  TOCK_RIVET_GUN,
  TOCK_STAMPING_PRESS,
  VOLTAIC_COIL_STRIKE,
  VOLTAIC_DISCHARGE,
  VOLTAIC_DRONES,
  VOLTAIC_FLIP,
  VOLTAIC_STATIC_LASH,
} from '../../sim/encounters/stormbrass_foundry/ids';
import {
  FOUNDRY_DEPLOY_TURRET,
  FOUNDRY_FIELD_REPAIR,
  FOUNDRY_PISTON_SLAM,
  FOUNDRY_STEAM_SCREEN,
} from '../../sim/mob/trash_kit/foundry_cast_ids';
import {
  DRAFT_HATCH_DIALS,
  FRAME_AWAKE_GESTURE,
  FRAME_DORMANT_GESTURE,
  TOCK_GAUGE_DIAL,
  VOLTAIC_FLIP_TRACK_DROPS,
  VOLTAIC_PLATES,
  voltaicPlateDial,
} from '../stormbrass_foundry/foundry_creature_fx_core';
import {
  DRAFT_MOORINGS_GONE_GESTURE,
  DRAFT_MOORINGS_ON_GESTURE,
  DRAFT_OVERDRIVE_GLOW,
  DRAFT_STANCE_OPEN,
  DRAFT_STANCE_SHUT,
  PRIME_DRAFT_CLIP,
  PRIME_DRAFT_MODEL,
  PRIME_DRAFT_SIM_SCALE,
  primeDraftBeatRate,
  primeDraftLookHeight,
  primeDraftModelScale,
} from '../stormbrass_foundry/prime_draft_model_core';
import {
  VOLTAIC_CLIP,
  VOLTAIC_MODEL,
  VOLTAIC_SIM_SCALE,
  voltaicLookHeight,
  voltaicModelScale,
} from '../stormbrass_foundry/voltaic_model_core';
import type { ClipMap, VisualDef } from './manifest';

const CREATURES = 'models/creatures';

const FRAME_AWAKE_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  attack: ['Attack'],
  hit: ['Hit'],
  death: 'Death',
};
const FRAME_DORMANT_CLIPS: ClipMap = {
  ...FRAME_AWAKE_CLIPS,
  idle: 'Dormant',
  walk: 'Dormant',
  run: 'Dormant',
  attack: ['Dormant'],
};

/** The Prime Draft's clips with its hatch shut: every bar lands its beat on
 *  the bar's last frame (prime_draft_model_core.ts PRIME_DRAFT_CLIP). */
const DRAFT_SHUT_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Walk',
  // It never runs (the sim walks it at 3 yd/s): the one gait serves both.
  run: 'Walk',
  attack: ['Slam', 'Piston_Sweep'],
  attackByAbility: { [DRAFT_PISTON_FIST]: 'Slam', [DRAFT_OVERLOAD]: 'Overload' },
  attackTimeScaleByAbility: {
    // The fist hits the floor as the 2 s warning ends.
    [DRAFT_PISTON_FIST]: primeDraftBeatRate(PRIME_DRAFT_CLIP.slamHit, DRAFT_TUNING.fistWarning),
    // The seizure runs the whole 6 s stun: the discharge at once, sagged and
    // twitching to the end, its chest open (the hatch dials hold it).
    [DRAFT_OVERLOAD]: primeDraftBeatRate(
      PRIME_DRAFT_CLIP.overloadLength,
      DRAFT_TUNING.overloadStun,
    ),
  },
  hit: ['Hit'],
  death: 'Death',
  cast: 'Idle',
  castByAbility: {
    [DRAFT_AWAKEN]: 'Wake',
    [DRAFT_ARM_SWEEP]: 'Piston_Sweep',
    [DRAFT_TREMOR_STEP]: 'Tremor_Step',
    [DRAFT_UNBOLT]: 'Unbolt',
  },
  castTimeScaleByAbility: {
    [DRAFT_AWAKEN]: primeDraftBeatRate(PRIME_DRAFT_CLIP.wakeFlex, DRAFT_TUNING.awakenCast),
    [DRAFT_ARM_SWEEP]: primeDraftBeatRate(PRIME_DRAFT_CLIP.sweepCross, DRAFT_TUNING.sweepCast),
    [DRAFT_TREMOR_STEP]: primeDraftBeatRate(PRIME_DRAFT_CLIP.tremorStomp, DRAFT_TUNING.tremorCast),
    // The right bolts shear on the bar's last frame; the cables rip out and
    // the bolts fly through the play-out.
    [DRAFT_UNBOLT]: primeDraftBeatRate(PRIME_DRAFT_CLIP.unboltShearR, DRAFT_TUNING.unboltCast),
  },
  castPlayOut: ['Wake', 'Piston_Sweep', 'Tremor_Step', 'Unbolt'],
};
/** With its hatch open: it stands chest out round the empty socket. */
const DRAFT_OPEN_CLIPS: ClipMap = { ...DRAFT_SHUT_CLIPS, idle: 'Hatch_Held' };
/** The hatch leaves (their rotation in the hatch clips is dropped: the dials
 *  own them, foundry_creature_fx_core.ts DRAFT_HATCH_DIALS). */
const DRAFT_HATCH_BONES = ['HatchL', 'HatchR'] as const;

export const FOUNDRY_CREATURE_LOOKS: Record<string, VisualDef> = {
  // Line-Master Ambrel Tock (tock.py): a stout foreman in a steam harness, two
  // mechanical arms (the wrench and the drum-fed riveter), the pressure gauge
  // on his back climbing toward the lever throw. About 8.2 yd at his 1.9.
  foundry_line_master: {
    url: `${CREATURES}/foundry_line_master_tock.glb`,
    height: 4.32,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['WrenchSlam', 'WrenchSweep', 'Haymaker'],
      attackByAbility: { [TOCK_STAMPING_PRESS]: 'PressSignal', [TOCK_PARTS_DROP]: 'PartsCall' },
      attackTimeScaleByAbility: { [TOCK_STAMPING_PRESS]: 1, [TOCK_PARTS_DROP]: 1 },
      hit: ['Hit'],
      death: 'Death',
      cast: 'Cast',
      castByAbility: { [TOCK_LEVER]: 'LeverThrow', [TOCK_RIVET_GUN]: 'RivetGun' },
      castTimeScaleByAbility: { [TOCK_LEVER]: 1, [TOCK_RIVET_GUN]: 1 },
      castPlayOut: ['LeverThrow', 'RivetGun'],
    },
    attackTimeScale: 1.15,
    dials: [TOCK_GAUGE_DIAL],
    authoredAtlas: true,
    selfIllumination: 0.06,
    clickRadius: 2.2,
  },
  // The Rangewarden (rangewarden.py): a squat tracked gun-frame, one great
  // glass eye in its rangefinder head, two stubby recoiling cannons, the flag
  // rack and the drone rack on its back. About 7.9 yd at its 2.2. Every shell
  // of a salvo (and of heroic shrapnel) re-sends its windup: the semaphore
  // keeps whipping through the barrage instead of a cannon swing.
  foundry_rangewarden: {
    url: `${CREATURES}/foundry_rangewarden.glb`,
    height: 3.6,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['CannonBash', 'PointBlank'],
      attackByAbility: {
        [RANGE_TARGET_LOCK]: 'TargetLock',
        [RANGE_SALVO]: 'SignalSalvo',
        [RANGE_SHRAPNEL]: 'SignalSalvo',
        [RANGE_DRILL_DRONES]: 'LaunchDrones',
      },
      attackTimeScaleByAbility: {
        [RANGE_TARGET_LOCK]: 1,
        [RANGE_SALVO]: 1.5,
        [RANGE_SHRAPNEL]: 1.5,
        [RANGE_DRILL_DRONES]: 1,
      },
      hit: ['Hit'],
      death: 'Death',
      cast: 'Cast',
      castByAbility: { [RANGE_PROOF_SHOT]: 'ProofShot' },
      castTimeScaleByAbility: { [RANGE_PROOF_SHOT]: 1 },
      castPlayOut: ['ProofShot'],
    },
    attackTimeScale: 1.1,
    authoredAtlas: true,
    selfIllumination: 0.06,
    clickRadius: 2.4,
  },
  // The Voltaic Warden (scripts/assets/foundry_voltaic_warden, built in
  // Blender; voltaic_model_core.ts): a hunched brass colossus, a glass storm
  // coil for a chest, a tesla crown on its back. Drawn at its authored size,
  // 10.9 yd to the spire's tip at its 2.4 (9.1 to the helm). Its twelve
  // reversible plates turn on dials (copper face or blue face out; the front
  // and back groups apart on heroic Split Plating): the flip clip pushes them
  // out on their mounts and the dial turns them (its own plate rotation is
  // dropped), so the plates always show the face the plating aura names.
  foundry_voltaic_warden: {
    url: VOLTAIC_MODEL.url,
    height: voltaicLookHeight(),
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Backhand', 'HammerFists'],
      attackByAbility: {
        [VOLTAIC_COIL_STRIKE]: 'CallStorm',
        [VOLTAIC_DISCHARGE]: 'Discharge',
        [VOLTAIC_DRONES]: 'LaunchDrones',
      },
      attackTimeScaleByAbility: {
        [VOLTAIC_COIL_STRIKE]: 1,
        [VOLTAIC_DISCHARGE]: 1,
        [VOLTAIC_DRONES]: 1,
      },
      hit: ['Hit'],
      death: 'Death',
      cast: 'Cast',
      castByAbility: { [VOLTAIC_FLIP]: 'FlipRattle', [VOLTAIC_STATIC_LASH]: 'StaticLash' },
      // Both bars play from the bar's start at 1x: the plates seat at 2.90 of
      // the 3 s flip, the lash leaves the palm at 1.00 of its 1 s bar.
      castTimeScaleByAbility: { [VOLTAIC_FLIP]: 1, [VOLTAIC_STATIC_LASH]: 1 },
      castPlayOut: ['StaticLash', 'FlipRattle'],
    },
    castClipSync: true,
    oneShotsHoldAttacks: ['Discharge', 'LaunchDrones', 'CallStorm'],
    walkRef: VOLTAIC_MODEL.walkRef * voltaicModelScale(VOLTAIC_SIM_SCALE),
    runRef: VOLTAIC_MODEL.runRef * voltaicModelScale(VOLTAIC_SIM_SCALE),
    attackTimeScale: 1.1,
    deathTimeScale: 1,
    dials: VOLTAIC_PLATES.map(([bone, half]) => voltaicPlateDial(bone, half)),
    clipTrackDrops: { FlipRattle: VOLTAIC_FLIP_TRACK_DROPS },
    // The coil's arcs, the visor and the blue plate faces go dark as it dies.
    glowPulses: { pulses: [], materials: ['VoltaicGlow'], deathFade: VOLTAIC_CLIP.deathGlowOut },
    authoredAtlas: true,
    clickRadius: 3,
  },
  // The Prime Draft (scripts/assets/foundry_prime_draft, built in Blender;
  // prime_draft_model_core.ts): Varkhul's first masterwork, a hunched brass
  // and iron colossus with no heart, its right arm finished brass, its left
  // the bare frame and claw, an empty socket behind the two-leaf hatch in its
  // chest. Drawn 1.12 times its authored size, 11.5 yd at its 2.6: the last
  // boss is the biggest fighter. Every bar's clip lands its beat on the bar's
  // last frame (the flex, the claw's crossing, the stomp, the bolts shearing)
  // and finishes as a play-out; Piston Fist and Overload are gestures off
  // their spellfx. The hatch leaves are dials on the Core Hatch ring's state
  // (through every clip), the open stance throws its chest out, and the
  // moorings (the gantry cables and floor clamps) are their own mesh, hidden
  // once it has torn free.
  foundry_prime_draft: {
    url: PRIME_DRAFT_MODEL.url,
    height: primeDraftLookHeight(),
    clips: DRAFT_SHUT_CLIPS,
    phaseClips: {
      [DRAFT_STANCE_OPEN]: { clips: DRAFT_OPEN_CLIPS, enter: 'Hatch_Open' },
      [DRAFT_STANCE_SHUT]: { clips: DRAFT_SHUT_CLIPS, enter: 'Hatch_Close' },
    },
    castClipSync: true,
    castPlayOutHoldsAttacks: true,
    oneShotsHoldAttacks: ['Slam', 'Overload'],
    dials: DRAFT_HATCH_DIALS,
    clipTrackDrops: {
      Hatch_Open: DRAFT_HATCH_BONES,
      Hatch_Held: DRAFT_HATCH_BONES,
      Hatch_Close: DRAFT_HATCH_BONES,
      Overload: DRAFT_HATCH_BONES,
    },
    meshToggles: [
      {
        nodes: ['PrimeDraftMoorings'],
        hideNow: DRAFT_MOORINGS_GONE_GESTURE,
        showNow: DRAFT_MOORINGS_ON_GESTURE,
      },
    ],
    // Its lightning (the conduits, the eye, the socket's arcs): it flares on
    // the Overload's discharge and beats while it overdrives, and it dies out
    // with the body, gone as the eye goes dark.
    glowPulses: {
      materials: ['PrimeDraftGlow'],
      pulses: [
        { gesture: DRAFT_OVERLOAD, rise: 0.08, hold: 0.5, fall: 2.4, peak: 2.6 },
        { gesture: DRAFT_OVERDRIVE_GLOW, rise: 0.25, hold: 0.2, fall: 0.9, peak: 1.7 },
      ],
      deathFade: PRIME_DRAFT_CLIP.deathEyeOut,
    },
    walkRef: PRIME_DRAFT_MODEL.walkRef * primeDraftModelScale(PRIME_DRAFT_SIM_SCALE),
    runRef: PRIME_DRAFT_MODEL.walkRef * primeDraftModelScale(PRIME_DRAFT_SIM_SCALE),
    // A plain swing borrows the two strikes at twice their pace (the fist
    // lands at 1.0 s, the claw crosses at 0.77 s).
    attackTimeScale: 2,
    deathTimeScale: 1,
    authoredAtlas: true,
    selfIllumination: 0.05,
    clickRadius: 3.6,
  },
  // The Gantry Hauler (hauler.py): a tracked steam crawler, the boiler, the
  // chimney, the klaxon and beacon, a goggled engineer in its cab, the crane
  // arm and its scrap plate, the tipping bed. About 9 yd at its 2.6.
  foundry_gantry_hauler: {
    url: `${CREATURES}/foundry_gantry_hauler.glb`,
    height: 3.47,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Ram', 'CraneSwipe'],
      attackByAbility: { [HAULER_SCRAP_TOSS]: 'ScrapToss', [HAULER_UNLOAD]: 'Unload' },
      attackTimeScaleByAbility: { [HAULER_SCRAP_TOSS]: 1, [HAULER_UNLOAD]: 1 },
      hit: ['Hit'],
      death: 'Death',
      cast: 'SteamBlast',
      castByAbility: { [HAULER_STEAM_BLAST]: 'SteamBlast' },
      castTimeScaleByAbility: { [HAULER_STEAM_BLAST]: 1 },
      castPlayOut: ['SteamBlast'],
    },
    castPlayOutHoldsAttacks: true,
    authoredAtlas: true,
    selfIllumination: 0.08,
    clickRadius: 2.6,
  },
  // ---- the trash (automaton.py and its four builders) ----------------------------
  // The Brass Sentry: a riveted soldier, its right forearm a piston that fires
  // its ram fist. About 3.9 yd at its 1.45.
  foundry_brass_sentry: {
    url: `${CREATURES}/foundry_brass_sentry.glb`,
    height: 2.69,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Attack', 'Attack2'],
      hit: ['Hit'],
      death: 'Death',
      cast: 'PistonSlam',
      castByAbility: { [FOUNDRY_PISTON_SLAM]: 'PistonSlam' },
      castTimeScaleByAbility: { [FOUNDRY_PISTON_SLAM]: 1 },
      castPlayOut: ['PistonSlam'],
    },
    authoredAtlas: true,
    selfIllumination: 0.08,
  },
  // The Shieldbearer Frame: a wedge of plate behind a riveted tower shield. 5 yd.
  foundry_shieldbearer: {
    url: `${CREATURES}/foundry_shieldbearer_frame.glb`,
    height: 2.86,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Attack', 'Attack2'],
      hit: ['Hit'],
      death: 'Death',
      cast: 'SteamScreen',
      castByAbility: { [FOUNDRY_STEAM_SCREEN]: 'SteamScreen' },
      castTimeScaleByAbility: { [FOUNDRY_STEAM_SCREEN]: 1 },
      castPlayOut: ['SteamScreen'],
    },
    authoredAtlas: true,
    selfIllumination: 0.08,
  },
  // The Steam Bruiser: a boiler on legs with a storm-white firebox. 4.6 yd.
  foundry_steam_bruiser: {
    url: `${CREATURES}/foundry_steam_bruiser.glb`,
    height: 2.875,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Attack', 'Attack2'],
      hit: ['Hit'],
      death: 'Death',
    },
    authoredAtlas: true,
    selfIllumination: 0.08,
  },
  // Tock's Half-Built Frame: an unfinished frame that lands slumped (Dormant)
  // and boots up (BootUp) when its boot aura drops: phaseClips stances sent by
  // foundry_creature_fx.ts.
  foundry_half_built_frame: {
    url: `${CREATURES}/foundry_half_built_frame.glb`,
    height: 2.4,
    clips: FRAME_AWAKE_CLIPS,
    phaseClips: {
      [FRAME_DORMANT_GESTURE]: { clips: FRAME_DORMANT_CLIPS },
      [FRAME_AWAKE_GESTURE]: { clips: FRAME_AWAKE_CLIPS, enter: 'BootUp' },
    },
    authoredAtlas: true,
    selfIllumination: 0.1,
  },
  // ---- the engineers and the small machines (engineer_body.py and friends) --------
  // The Foundry Engineer: goggles, apron, backpack boiler, the big wrench
  // modelled in his fist. About 3 yd at his 1.3.
  foundry_engineer: {
    url: `${CREATURES}/foundry_engineer.glb`,
    height: 2.31,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Attack', 'Attack2'],
      hit: ['Hit'],
      death: 'Death',
      cast: 'FieldRepair',
      castByAbility: { [FOUNDRY_FIELD_REPAIR]: 'FieldRepair' },
      castTimeScaleByAbility: { [FOUNDRY_FIELD_REPAIR]: 1 },
    },
    authoredAtlas: true,
    selfIllumination: 0.05,
  },
  // The Gearwright Apprentice: a young engineer, a folded turret on her back.
  foundry_apprentice: {
    url: `${CREATURES}/foundry_apprentice.glb`,
    height: 2.32,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Attack', 'Attack2'],
      attackByAbility: { [FOUNDRY_DEPLOY_TURRET]: 'DeployTurret' },
      attackTimeScaleByAbility: { [FOUNDRY_DEPLOY_TURRET]: 1 },
      hit: ['Hit'],
      death: 'Death',
      cast: 'DeployTurret',
      castByAbility: { [FOUNDRY_DEPLOY_TURRET]: 'DeployTurret' },
      castTimeScaleByAbility: { [FOUNDRY_DEPLOY_TURRET]: 1 },
      castPlayOut: ['DeployTurret'],
    },
    authoredAtlas: true,
    selfIllumination: 0.05,
  },
  // The Coilspring Hound: a brass hound on coil-spring legs. Head at 2.4 yd.
  foundry_hound: {
    url: `${CREATURES}/foundry_hound.glb`,
    height: 2.08,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      jump: 'Leap',
      fall: 'Leap',
      land: 'Land',
      attack: ['Attack', 'Attack2'],
      hit: ['Hit'],
      death: 'Death',
    },
    authoredAtlas: true,
    selfIllumination: 0.08,
  },
  // The Arc Drone: a hovering brass sphere round a lightning core. Its Death
  // drops it to the floor.
  foundry_arc_drone: {
    url: `${CREATURES}/foundry_arc_drone.glb`,
    height: 1.2,
    hover: 0.93,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Attack'],
      hit: ['Hit'],
      death: 'Death',
    },
    authoredAtlas: true,
    selfIllumination: 0.12,
  },
  // The Tripod Turret: a small brass gun on three legs; it never moves.
  foundry_tripod_turret: {
    url: `${CREATURES}/foundry_tripod_turret.glb`,
    height: 1.73,
    clips: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      attack: ['Attack'],
      hit: ['Hit'],
      death: 'Death',
    },
    authoredAtlas: true,
    selfIllumination: 0.06,
  },
};
