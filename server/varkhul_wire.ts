// Viewer-scoped Varkhul mechanic snapshot fragment. The broadcast loop supplies
// one prebuilt realm projection; this module filters and serializes it once per
// viewer without growing the GameServer coordinator.

import type { ActiveVarkhulAnvilMeteorWarning } from '../src/sim/varkhul_anvil_meteors';
import type { ActiveVarkhulAssembly } from '../src/sim/varkhul_assembly';
import type {
  ActiveVarkhulCinderFire,
  ActiveVarkhulCinderOrbProjectile,
} from '../src/sim/varkhul_cinder_orbs';
import type { ActiveVarkhulForgestormWarning } from '../src/sim/varkhul_forgestorm';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function inRange(
  point: { x: number; z: number },
  anchor: { x: number; z: number },
  radius: number,
): boolean {
  const dx = point.x - anchor.x;
  const dz = point.z - anchor.z;
  return dx * dx + dz * dz <= radius * radius;
}

export interface VarkhulEncounterWireWorld {
  activeVarkhulForgestormWarnings: readonly ActiveVarkhulForgestormWarning[];
  activeVarkhulCinderFires: readonly ActiveVarkhulCinderFire[];
  activeVarkhulCinderOrbProjectiles: readonly ActiveVarkhulCinderOrbProjectile[];
  activeVarkhulAnvilMeteors: readonly ActiveVarkhulAnvilMeteorWarning[];
  activeVarkhulAssemblies: readonly ActiveVarkhulAssembly[];
}

export function varkhulEncounterWireJson(
  world: VarkhulEncounterWireWorld,
  anchor: { x: number; z: number },
  eventRadius: number,
): string {
  const forgestorm = world.activeVarkhulForgestormWarnings
    .filter((warning) => inRange(warning, anchor, eventRadius))
    .map(
      (warning) =>
        `{"id":${warning.id},"sourceId":${warning.sourceId},"x":${round2(warning.x)},"z":${round2(warning.z)},"r":${round2(warning.radius)},"dur":${round2(warning.duration)},"rem":${round2(warning.remaining)}}`,
    );
  const fires = world.activeVarkhulCinderFires
    .filter((fire) => inRange(fire, anchor, eventRadius))
    .map(
      (fire) =>
        `{"id":${JSON.stringify(fire.id)},"sourceId":${fire.sourceId},"x":${round2(fire.x)},"z":${round2(fire.z)},"r":${round2(fire.radius)}}`,
    );
  const projectiles = world.activeVarkhulCinderOrbProjectiles
    .filter((projectile) => inRange(projectile, anchor, eventRadius))
    .map(
      (projectile) =>
        `{"id":${JSON.stringify(projectile.id)},"sourceId":${projectile.sourceId},"x":${round2(projectile.x)},"z":${round2(projectile.z)},"dx":${round2(projectile.dirX)},"dz":${round2(projectile.dirZ)},"r":${round2(projectile.radius)},"dur":${round2(projectile.duration)},"rem":${round2(projectile.remaining)}}`,
    );
  const meteors = world.activeVarkhulAnvilMeteors
    .filter((meteor) => inRange(meteor, anchor, eventRadius))
    .map(
      (meteor) =>
        `{"id":${JSON.stringify(meteor.id)},"x":${round2(meteor.x)},"z":${round2(meteor.z)},"r":${round2(meteor.radius)},"dur":${round2(meteor.duration)},"rem":${round2(meteor.remaining)},"lead":${round2(meteor.warningLead)}}`,
    );
  const assemblyRows = world.activeVarkhulAssemblies
    .filter((assembly) => inRange({ x: assembly.forgeX, z: assembly.forgeZ }, anchor, eventRadius))
    .map((assembly) => {
      const cores = assembly.cores.map(
        (core) =>
          `{"id":${JSON.stringify(core.id)},"x":${round2(core.x)},"z":${round2(core.z)},"cid":${core.carrierId ?? 'null'},"del":${core.delivered ? 1 : 0}}`,
      );
      const assignments = assembly.assignments.map(
        (assignment) =>
          `{"pid":${assignment.playerId},"sym":${assignment.symbol},"role":${assignment.role === 'hammer' ? 1 : 0},"lock":${assignment.locked ? 1 : 0}}`,
      );
      const pads = assembly.pads.map(
        (pad) =>
          `{"sym":${pad.symbol},"x":${round2(pad.x)},"z":${round2(pad.z)},"r":${round2(pad.radius)},"p":${round2(pad.progress)},"ar":${pad.anvilReady ? 1 : 0},"hr":${pad.hammerReady ? 1 : 0},"ta":${round2(pad.targetAngle)},"aa":${round2(pad.armAngle)},"c":${pad.control === 'counterclockwise' ? 1 : pad.control === 'brake' ? 2 : pad.control === 'clockwise' ? 3 : 0},"al":${pad.aligned ? 1 : 0},"lock":${pad.locked ? 1 : 0}}`,
      );
      return `{"bossId":${assembly.bossId},"phase":${JSON.stringify(assembly.phase)},"fx":${round2(assembly.forgeX)},"fz":${round2(assembly.forgeZ)},"hp":${round2(assembly.forgeHp)},"mhp":${round2(assembly.forgeMaxHp)},"win":${round2(assembly.deliveryWindowRemaining)},"round":${assembly.round},"rounds":${assembly.rounds},"rem":${round2(assembly.remaining)},"cores":[${cores.join(',')}],"assign":[${assignments.join(',')}],"pads":[${pads.join(',')}]}`;
    });
  const forgestormJson =
    forgestorm.length > 0 ? `,"varkhulForgestorm":[${forgestorm.join(',')}]` : '';
  const firesJson = fires.length > 0 ? `,"varkhulCinderFires":[${fires.join(',')}]` : '';
  const projectilesJson =
    projectiles.length > 0 ? `,"varkhulCinderOrbs":[${projectiles.join(',')}]` : '';
  const meteorsJson = meteors.length > 0 ? `,"varkhulAnvilMeteors":[${meteors.join(',')}]` : '';
  const assembliesJson =
    assemblyRows.length > 0 ? `,"varkhulAssemblies":[${assemblyRows.join(',')}]` : '';
  return forgestormJson + firesJson + projectilesJson + meteorsJson + assembliesJson;
}
