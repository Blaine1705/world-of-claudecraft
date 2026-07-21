import type { SimContext } from '../sim_context';
import { addThreat } from '../threat';
import type { Entity } from '../types';
import { relocateSwept } from './heroic_leap';

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
  if (distance > stopDistance && distance > 1e-6) {
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
