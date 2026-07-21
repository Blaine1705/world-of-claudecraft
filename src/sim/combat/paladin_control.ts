import type { SimContext } from '../sim_context';
import { addThreat } from '../threat';
import type { Entity } from '../types';
import { relocateSwept } from './heroic_leap';
import { isVeilboundMarchActive } from './paladin_veilbound_state';

export function pullPaladinTarget(
  ctx: SimContext,
  source: Entity,
  target: Entity,
  stopDistance: number,
  slowMult: number,
  slowDuration: number,
  abilityId: string,
  abilityName: string,
): void {
  const dx = target.pos.x - source.pos.x;
  const dz = target.pos.z - source.pos.z;
  const distance = Math.hypot(dx, dz);
  if (distance > stopDistance && distance > 1e-6 && !isVeilboundMarchActive(target)) {
    relocateSwept(ctx, target, {
      x: source.pos.x + (dx / distance) * stopDistance,
      y: target.pos.y,
      z: source.pos.z + (dz / distance) * stopDistance,
    });
    ctx.grid.update(target);
    if (target.kind === 'player') ctx.playerGrid.update(target);
  }
  ctx.applyAura(target, {
    id: `${abilityId}_slow`,
    name: abilityName,
    kind: 'slow',
    remaining: slowDuration,
    duration: slowDuration,
    value: slowMult,
    sourceId: source.id,
    school: 'holy',
  });
  ctx.enterCombat(source, target);
}

export function pullPaladinTargets(
  ctx: SimContext,
  source: Entity,
  primary: Entity,
  maxTargets: number,
  searchRadius: number,
  stopDistance: number,
  slowMult: number,
  slowDuration: number,
  abilityId: string,
  abilityName: string,
): void {
  const targets = [primary];
  if (maxTargets > 1) {
    const candidates = ctx
      .hostilesInRadius(source, source.pos, searchRadius)
      .filter(
        (candidate) =>
          candidate.id !== primary.id && !candidate.dead && ctx.hasLineOfSight(source, candidate),
      )
      .sort((a, b) => {
        const adx = a.pos.x - source.pos.x;
        const adz = a.pos.z - source.pos.z;
        const bdx = b.pos.x - source.pos.x;
        const bdz = b.pos.z - source.pos.z;
        return adx * adx + adz * adz - (bdx * bdx + bdz * bdz) || a.id - b.id;
      });
    targets.push(...candidates.slice(0, maxTargets - 1));
  }
  for (const target of targets) {
    pullPaladinTarget(
      ctx,
      source,
      target,
      stopDistance,
      slowMult,
      slowDuration,
      abilityId,
      abilityName,
    );
  }
}

export function pulsePaladinThreat(
  ctx: SimContext,
  source: Entity,
  amount: number,
  radius: number,
): void {
  const modified = amount * ctx.threatMod(source, 'holy');
  for (const target of ctx.hostilesInRadius(source, source.pos, radius)) {
    if (!ctx.hasLineOfSight(source, target)) continue;
    addThreat(target, source.id, modified);
    ctx.enterCombat(source, target);
  }
}
