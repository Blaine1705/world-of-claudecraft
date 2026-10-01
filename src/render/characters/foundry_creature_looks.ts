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
// know: Tock's gauge needle.

import {
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
  FRAME_AWAKE_GESTURE,
  FRAME_DORMANT_GESTURE,
  TOCK_GAUGE_DIAL,
  VOLTAIC_PLATES,
  voltaicPlateDial,
} from '../stormbrass_foundry/foundry_creature_fx_core';
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
  // The Voltaic Warden (voltaic_warden.py): a tall plated automaton, a caged
  // tesla coil for a chest, lightning-rod antlers. Its twelve reversible plates
  // turn on dials (copper face or charged face out; front and back halves
  // apart on heroic Split Plating) as its plating aura changes. Near 10 yd at
  // its 2.4.
  foundry_voltaic_warden: {
    url: `${CREATURES}/foundry_voltaic_warden.glb`,
    height: 4.17,
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
      castTimeScaleByAbility: { [VOLTAIC_FLIP]: 1, [VOLTAIC_STATIC_LASH]: 1 },
      castPlayOut: ['StaticLash'],
    },
    attackTimeScale: 1.1,
    dials: VOLTAIC_PLATES.map(([bone, half]) => voltaicPlateDial(bone, half)),
    authoredAtlas: true,
    selfIllumination: 0.08,
    clickRadius: 2.2,
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
