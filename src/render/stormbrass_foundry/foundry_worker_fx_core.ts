// Pure plan for the Stormbrass Foundry's chained workers' visuals
// (foundry_worker_fx.ts): which bodies wear a chain, how a chain spans from
// its camp's post to a worker's ankle (yaw, pitch, how many links), which camp
// a state object is (so a freed camp's chains can lie where its workers
// stood, whoever walks up later), and the fall of a struck chain. No Three,
// no DOM, no clock: a Vitest imports it directly
// (tests/stormbrass_foundry_workers_render.test.ts).

import {
  FOUNDRY_WORKER_CAMPS,
  FOUNDRY_WORKER_TEMPLATES,
  type FoundryWorkerCamp,
} from '../../sim/content/stormbrass_foundry_workers';

/** The chain's build: one link every `pitch` yards, hung from `postY` on the
 *  post to `ankleY` on the worker; a struck chain lies at `floorY`. */
export const WORKER_CHAIN = {
  /** Yards between link centres along the chain. */
  pitch: 0.19,
  /** The longest chain the geometry holds (a hauler at the far end of its loop). */
  maxLength: 18,
  /** Where the chain leaves the post (its ring), above the floor. */
  postY: 0.55,
  /** The shackle's height on the ankle. */
  ankleY: 0.2,
  /** A struck chain's height over the floor it lies on. */
  floorY: 0.05,
  /** Seconds a struck chain takes to fall. */
  fallSeconds: 0.45,
  /** How far a worker ever stands from its post, with room to spare. */
  reach: 30,
} as const;

/** The most links one chain ever draws. */
export const WORKER_CHAIN_MAX_LINKS = Math.ceil(WORKER_CHAIN.maxLength / WORKER_CHAIN.pitch);

/** A body that wears a chain: a chained miner or hauler, never a freed laborer. */
export function isChainedWorkerTemplate(templateId: string): boolean {
  return (
    templateId === FOUNDRY_WORKER_TEMPLATES.miner || templateId === FOUNDRY_WORKER_TEMPLATES.hauler
  );
}

export interface ChainPose {
  /** Turn about the up axis so the chain's own +Z runs toward the far end. */
  yaw: number;
  /** Tilt about the chain's X axis: positive dips the far end. */
  pitch: number;
  length: number;
  links: number;
}

/** The pose of a chain built along +Z from (ax, ay, az) to (bx, by, bz),
 *  written into `out` (no allocation per frame). */
export function chainPoseInto(
  out: ChainPose,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): ChainPose {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const flat = Math.hypot(dx, dz);
  const length = Math.min(WORKER_CHAIN.maxLength, Math.hypot(flat, dy));
  out.yaw = Math.atan2(dx, dz);
  out.pitch = Math.atan2(-dy, flat);
  out.length = length;
  out.links = Math.max(
    1,
    Math.min(WORKER_CHAIN_MAX_LINKS, Math.round(length / WORKER_CHAIN.pitch)),
  );
  return out;
}

/** The camp whose chain post stands at an instance-local spot, or null. */
export function workerCampAt(localX: number, localZ: number): FoundryWorkerCamp | null {
  for (const camp of FOUNDRY_WORKER_CAMPS) {
    if (Math.hypot(camp.post.x - localX, camp.post.z - localZ) < 2) return camp;
  }
  return null;
}

/** How far a struck chain has fallen, 0 (still hung) to 1 (on the floor),
 *  easing in like a dropped weight. */
export function chainFall(secondsSinceStruck: number): number {
  const t = Math.max(0, Math.min(1, secondsSinceStruck / WORKER_CHAIN.fallSeconds));
  return t * t;
}

/** A hung height eased to the floor by a fall fraction. */
export function fallenHeight(hung: number, fall: number): number {
  return hung + (WORKER_CHAIN.floorY - hung) * fall;
}
