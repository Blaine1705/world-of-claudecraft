import type * as THREE from 'three';
import type { PrewarmResumeUnit } from './prewarm_resume';
import { setRenderCategory } from './renderer_diagnostics';

/** What a prewarm slot needs from the renderer. */
export interface VariantPrewarmSlotHost {
  scene: THREE.Object3D;
  compileColorPrograms(group: THREE.Group): Promise<unknown>;
}

/** How one boot-manifest slot builds, links, hides and tears down its artifact.
 *  Only `stage` is required: a slot whose artifact is a THREE object gets the
 *  group behaviour (tag + attach on stage, `visible = false` on hide, detach
 *  on cleanup, compileColorPrograms as its link step) for free, and these
 *  hooks add the artifact-specific half on top of it. */
export interface PrewarmGroupSlotOptions<T> {
  /** Build the artifact (a group, a texture set). Runs at the manifest entry
   *  AND again in the resume lane after a cleanup, so it must be re-runnable. */
  stage: () => T;
  /** The resume lane's link step. Default: compileColorPrograms on a group. */
  link?: (artifact: T) => Promise<unknown>;
  /** Per-piece resume work (one unit per texture). Replaces the link step. */
  units?: (artifact: T) => readonly PrewarmResumeUnit[];
  /** Make the staged artifact undrawable, for artifacts with no group flag. */
  hide?: (artifact: T) => void;
  /** Release the staged artifact. Never dispose: a disposed material releases
   *  the linked program this slot exists to warm. */
  cleanup?: (artifact: T) => void;
}

/** One boot-manifest slot for a hidden prewarm artifact (the camera-ghost fade
 *  twins, the character effect twins, the impact-site clone, the precipitation
 *  materials): the artifact is staged, compiled by the manifest's compile pass,
 *  hidden at entry and released but never disposed at cleanup. The manifest
 *  entry and the resume units share ONE builder, and the artifact lives in this
 *  closure rather than in a manifest-local `let` that cleanup nulls, so a
 *  resume after world entry still reaches it. */
export interface PrewarmGroupSlot<T> {
  readonly stageId: string;
  /** The staged artifact, or null before stage / after cleanup. */
  readonly artifact: T | null;
  /** The staged artifact when it is a scene object, else null. */
  readonly group: THREE.Group | null;
  /** The manifest entry's resumeUnits: stage the artifact HIDDEN, then link
   *  it (or run its per-piece units). A resume runs while the world is live,
   *  so staging visible would let the next frame draw a prewarm artifact and
   *  link its programs synchronously, the burst the boot gate exists to stop. */
  readonly resumeUnits: () => readonly PrewarmResumeUnit[];
  /** The manifest entry's run(): stage the artifact, plus its per-piece units
   *  when it declares them. A group's LINK stays the manifest compile pass's
   *  job (it collects every staged group), which is why staging alone is the
   *  whole entry for the twin slots. */
  readonly run: () => void | Promise<void>;
  readonly detail: () => string;
  /** The (id, group) pair the staged compile groups list reports. */
  staged(): [string, THREE.Group | null];
  hide(): void;
  cleanup(): void;
}

/** A slot over a group of program-variant twins: the two-argument case. */
export type VariantPrewarmSlot = PrewarmGroupSlot<THREE.Group>;

function asGroup(artifact: unknown): THREE.Group | null {
  return (artifact as THREE.Object3D | null)?.isObject3D ? (artifact as THREE.Group) : null;
}

export function createPrewarmGroupSlot<T>(
  host: VariantPrewarmSlotHost,
  stageId: string,
  options: PrewarmGroupSlotOptions<T>,
): PrewarmGroupSlot<T> {
  let artifact: T | null = null;
  const groupNow = (): THREE.Group | null => asGroup(artifact);
  const stage = (): void => {
    artifact = options.stage();
    const group = groupNow();
    if (group) {
      setRenderCategory(group, 'prewarm');
      host.scene.add(group);
    }
  };
  const hide = (): void => {
    const group = groupNow();
    if (group) group.visible = false;
    if (artifact !== null) options.hide?.(artifact);
  };
  // One synchronous unit: no frame can land between the stage and the hide.
  const stageHidden = (): void => {
    stage();
    hide();
  };
  const link = async (): Promise<void> => {
    if (artifact === null) return;
    if (options.link) {
      await options.link(artifact);
      return;
    }
    const group = groupNow();
    if (group) await host.compileColorPrograms(group);
  };
  // The piece list is only knowable once stage() has run, and the resume
  // ledger fixes an entry's unit count when it is scheduled, so the pieces
  // run as ONE bounded unit rather than one unit each.
  const runUnits = async (): Promise<void> => {
    if (artifact === null || !options.units) return;
    for (const unit of options.units(artifact)) await unit.run();
  };
  return {
    stageId,
    get artifact() {
      return artifact;
    },
    get group() {
      return groupNow();
    },
    resumeUnits: () =>
      options.units
        ? [
            { id: `${stageId}:stage`, run: stageHidden },
            { id: `${stageId}:units`, run: runUnits },
          ]
        : [
            { id: `${stageId}:group`, run: stageHidden },
            { id: `${stageId}:compile`, run: link },
          ],
    run: () => {
      stage();
      if (options.units) return runUnits();
    },
    detail: () => `objects=${groupNow()?.children.length ?? 0}`,
    staged: () => [stageId, groupNow()],
    hide,
    cleanup: () => {
      if (artifact === null) return;
      const group = groupNow();
      if (group) host.scene.remove(group);
      options.cleanup?.(artifact);
      artifact = null;
    },
  };
}

/** The two-argument case: a group of program-variant TWINS that the compile
 *  pass links and that are REMOVED but never disposed at cleanup, since the
 *  twins hold the only reference keeping each variant program linked while
 *  the live materials are still in their default state. */
export function createVariantPrewarmSlot(
  host: VariantPrewarmSlotHost,
  stageId: string,
  build: (scene: THREE.Object3D) => THREE.Group,
): VariantPrewarmSlot {
  return createPrewarmGroupSlot(host, stageId, { stage: () => build(host.scene) });
}
