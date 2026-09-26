// Hidden encounter-visual compile at first interior attach. runBackgroundPrewarm
// links programs on idle GPU slots; the built visuals are kept alive without
// dispose because three drops a program when its last material is disposed.
import * as THREE from 'three';
import { GPU_WORK_PRIORITY } from './background_gpu_queue';
import { idleSlot, runIdleQueue } from './idle_queue';
import { buildIgnivarEncounterPrewarmVisual } from './ignivar_encounter';
import { buildIgnivarForgeJudgmentPrewarmVisual } from './ignivar_forge_judgment';
import { buildIgnivarRotatingRaysPrewarmVisual } from './ignivar_rotating_rays';
import {
  encounterPrewarmDisabled,
  encounterPrewarmForInterior,
  type InteriorEncounterPrewarmSpec,
} from './interior_encounter_prewarm';
import type { InteriorEncounterPrewarmHost } from './interior_encounter_prewarm_host';
import { collectObjectTextures } from './material_texture_slots';
import {
  buildVarkhulForgePortalPrewarmVisual,
  type VarkhulForgePortalPrewarmVisual,
} from './necromancy_army_portal_fx';
import { buildNythraxisGravePrewarmVisual } from './nythraxis_grave_flame_visual';
import { runBackgroundPrewarm } from './prewarm_pass';
import { setRenderCategory } from './renderer_diagnostics';
import { buildVarkhulAssemblyPrewarmVisual } from './varkhul_assembly_visual';
import { buildVarkhulEncounterPrewarmVisual } from './varkhul_encounter';
import { buildVarkhulForgeBeamPrewarmVisual } from './varkhul_forge_beam_visual';
import { buildVarkhulInterceptBeamPrewarmVisual } from './varkhul_intercept_beam_visual';
import { buildVarkhulWorldfirePrewarmVisual } from './varkhul_worldfire_visual';

const startedByHost = new WeakMap<object, Set<string>>();
const varkhulKeepAliveByHost = new WeakMap<object, THREE.Group[]>();
const varkhulPortalKeepAliveByHost = new WeakMap<object, VarkhulForgePortalPrewarmVisual[]>();
const IDLE_MS = 250;
const TEXTURE_BATCH = 2;

export function startInteriorEncounterPrewarm(interior: string, host: object): void {
  if (encounterPrewarmDisabled(typeof location === 'undefined' ? '' : location.search)) return;
  const typed = host as InteriorEncounterPrewarmHost;
  const spec = encounterPrewarmForInterior(interior);
  if (!spec || typed.shutdownStarted) return;
  // Held as a const so the failure arm below can close over it.
  const started = startedByHost.get(host) ?? new Set<string>();
  startedByHost.set(host, started);
  if (!started.has(interior)) {
    started.add(interior);
    // Handled the moment it exists: the background GPU queue REJECTS every
    // pending unit when the renderer shuts down (logout, graphics rebuild), and
    // a rejection sitting un-awaited across that window is reported as an
    // unhandledrejection, which is the client's fatal overlay.
    // Forget the interior again on failure: the key is claimed BEFORE the work,
    // so a rejected pass (a shutdown mid-flight, a compile that threw) would
    // otherwise leave the catalog cold for the session and link it at first draw.
    void runInteriorEncounterPrewarm(spec, typed).catch(() => {
      started.delete(interior);
    });
  }
}

async function runInteriorEncounterPrewarm(
  spec: InteriorEncounterPrewarmSpec,
  host: InteriorEncounterPrewarmHost,
): Promise<void> {
  if (host.shutdownStarted) return;
  const group = new THREE.Group();
  group.name = 'interior-encounter-prewarm';
  placeHiddenPrewarmGroup(host, group);
  const varkhulKeepAlive: THREE.Group[] = [];
  const varkhulPortalKeepAlive: VarkhulForgePortalPrewarmVisual[] = [];

  // Each visual is a few ms of pure CPU. Built in one loop they all land on
  // the frame that attaches the interior (measured: a >150ms stall at arena
  // entry), so the build drains across idle slots exactly like the compile
  // below.
  const units: Array<() => void> = [
    ...(spec.varkhulVisuals
      ? [
          () => {
            const encounter = buildVarkhulEncounterPrewarmVisual();
            const forgeBeams = buildVarkhulForgeBeamPrewarmVisual();
            const interceptBeam = buildVarkhulInterceptBeamPrewarmVisual();
            const forgePortals = buildVarkhulForgePortalPrewarmVisual();
            const worldfire = buildVarkhulWorldfirePrewarmVisual();
            encounter.position.set(-12, 0, 0);
            forgeBeams.position.set(12, 0, 0);
            interceptBeam.position.set(0, 0, 12);
            forgePortals.root.position.set(0, 0, 12);
            worldfire.position.set(0, 0, -12);
            group.add(encounter, forgeBeams, interceptBeam, forgePortals.root, worldfire);
            varkhulKeepAlive.push(
              encounter,
              forgeBeams,
              interceptBeam,
              forgePortals.root,
              worldfire,
            );
            varkhulPortalKeepAlive.push(forgePortals);
          },
          // Its own idle unit: the Assembly stages ten full rune stations, so
          // sharing the unit above would concatenate both builds into one task.
          () => {
            const assembly = buildVarkhulAssemblyPrewarmVisual();
            assembly.position.set(-36, 0, 0);
            group.add(assembly);
            varkhulKeepAlive.push(assembly);
          },
        ]
      : []),
    // Ignivar's own mechanic visuals share the interior with Varkhul's but are
    // otherwise built lazily during per-frame encounter sync, after the view
    // compile-gate enumeration: first onset would link their programs (the
    // Judgment charred-ground and fire-beam shaders included) in a live frame.
    ...(spec.ignivarVisuals
      ? [
          () => {
            const encounter = buildIgnivarEncounterPrewarmVisual();
            encounter.position.set(24, 0, 0);
            group.add(encounter);
            varkhulKeepAlive.push(encounter);
          },
          // Its own idle unit: four full fire-beam lanes plus flame blades.
          () => {
            const rays = buildIgnivarRotatingRaysPrewarmVisual();
            rays.position.set(36, 0, 0);
            group.add(rays);
            varkhulKeepAlive.push(rays);
          },
          // Its own idle unit: the heaviest per-entity build in the encounter
          // (three shelters, three warnings, three cue beams, the arena fire).
          () => {
            const judgment = buildIgnivarForgeJudgmentPrewarmVisual();
            judgment.position.set(0, 0, 36);
            group.add(judgment);
            varkhulKeepAlive.push(judgment);
          },
        ]
      : []),
    // Nythraxis's eruption, flame patches, Gravefire strip, and Binding Sigil:
    // actionable floor visuals built lazily by per-frame encounter sync, so
    // their first appearance must not link programs inside live combat.
    ...(spec.nythraxisGraveVisuals
      ? [
          () => {
            const grave = buildNythraxisGravePrewarmVisual();
            grave.position.set(-24, 0, 0);
            group.add(grave);
            varkhulKeepAlive.push(grave);
          },
        ]
      : []),
  ];
  await runIdleQueue(units, (unit) => unit(), {
    batchSize: 1,
    timeoutMs: IDLE_MS,
    cancelled: () => host.shutdownStarted,
  });

  if (host.shutdownStarted || group.children.length === 0) return;

  try {
    await compileEncounterPrewarmGroup(host, group);
  } finally {
    const heldVarkhul = varkhulKeepAliveByHost.get(host) ?? [];
    heldVarkhul.push(...varkhulKeepAlive);
    varkhulKeepAliveByHost.set(host, heldVarkhul);
    for (const visual of varkhulKeepAlive) {
      visual.removeFromParent();
      visual.visible = false;
    }
    const heldPortals = varkhulPortalKeepAliveByHost.get(host) ?? [];
    heldPortals.push(...varkhulPortalKeepAlive);
    varkhulPortalKeepAliveByHost.set(host, heldPortals);
  }
}

// A bounded prewarm render draws only what the camera can see, and a dungeon
// interior sits far from the world origin: a group left at 0,0,0 is culled, so
// the pass would link each program without ever paying its first DRAW. The zone
// prewarm plants its group in front of the player for the same reason.
function placeHiddenPrewarmGroup(host: InteriorEncounterPrewarmHost, group: THREE.Group): void {
  const pos = host.sim.player.pos;
  group.position.set(pos.x, pos.y, pos.z - 24);
  setRenderCategory(group, 'prewarm');
  group.visible = false;
}

async function compileEncounterPrewarmGroup(
  host: InteriorEncounterPrewarmHost,
  group: THREE.Group,
): Promise<void> {
  host.scene.add(group);
  try {
    await runBackgroundPrewarm([group], {
      supportsAsyncCompile: host.asyncCompileSupported,
      idleSlot: () => idleSlot(IDLE_MS, { maxTimeoutDeferrals: 2 }),
      compileChild: async (child) => {
        const childRoot = child as THREE.Object3D;
        await host.backgroundGpuWork.run(
          () => host.compilePrewarmColorPrograms(childRoot, true),
          GPU_WORK_PRIORITY.VISIBLE_PREWARM,
          `encounter-prewarm-color:${childRoot.name || childRoot.type}`,
        );
        await host.backgroundGpuWork.run(
          () => host.compileShadowPrograms(childRoot),
          GPU_WORK_PRIORITY.VISIBLE_PREWARM,
          `encounter-prewarm-shadow:${childRoot.name || childRoot.type}`,
        );
      },
      prepareChildAssets: (child) => {
        for (const texture of collectObjectTextures(child as THREE.Object3D, false)) {
          host.webgl.initTexture(texture);
        }
      },
      warmChildUnits: (groupLike, child) => {
        const childRoot = child as THREE.Object3D;
        const units: { label: string; run: () => void }[] = [];
        const textures = [...collectObjectTextures(childRoot, false)];
        for (let i = 0; i < textures.length; i += TEXTURE_BATCH) {
          const batch = textures.slice(i, i + TEXTURE_BATCH);
          units.push({
            label: 'encounter-prewarm-tex',
            run: () => {
              for (const texture of batch) host.webgl.initTexture(texture);
            },
          });
        }
        units.push({
          label: `encounter-prewarm-render:${childRoot.name || childRoot.type}`,
          run: () => host.renderBoundedPrewarmRoot(groupLike as THREE.Group, childRoot),
        });
        return units;
      },
      renderWarmPass: () => {},
      runUpload: (work, label) =>
        host.backgroundGpuWork.run(
          work,
          GPU_WORK_PRIORITY.VISIBLE_PREWARM,
          label ?? 'encounter-prewarm-upload',
        ),
    });
  } finally {
    group.removeFromParent();
  }
}
