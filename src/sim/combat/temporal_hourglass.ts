import type { SimContext } from '../sim_context';
import { type AbilityEffect, DT, type Entity, type Vec3 } from '../types';

export const TEMPORAL_HOURGLASS_ID = 'temporal_hourglass';

type HourglassEffect = Extract<AbilityEffect, { type: 'temporalHourglass' }>;

function distanceSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function nearestToAim(candidates: Entity[], aim: Vec3): Entity | null {
  candidates.sort((a, b) => distanceSq(a.pos, aim) - distanceSq(b.pos, aim) || a.id - b.id);
  return candidates[0] ?? null;
}

export function isProtectiveTemporalHourglass(entity: Entity): boolean {
  return entity.auras.some((aura) => aura.id === TEMPORAL_HOURGLASS_ID && aura.kind === 'stasis');
}

export function temporalHourglassCooldownDelta(entity: Entity, abilityId: string): number {
  if (abilityId === TEMPORAL_HOURGLASS_ID || !isProtectiveTemporalHourglass(entity)) return DT;
  const aura = entity.auras.find(
    (candidate) => candidate.id === TEMPORAL_HOURGLASS_ID && candidate.kind === 'stasis',
  );
  return DT * (aura?.value ?? 1);
}

export function tickTemporalHourglassHealing(
  ctx: SimContext,
  target: Entity,
  aura: import('../types').Aura,
): void {
  const ticks = aura.temporalHealTicksRemaining ?? 0;
  const remaining = aura.temporalHealRemaining ?? 0;
  if (ticks <= 0 || remaining <= 0) return;

  const planned = Math.ceil(remaining / ticks);
  aura.temporalHealRemaining = Math.max(0, remaining - planned);
  aura.temporalHealTicksRemaining = ticks - 1;
  const healed = Math.min(planned, target.maxHp - target.hp);
  if (healed <= 0) return;

  target.hp += healed;
  ctx.emit({
    type: 'heal2',
    sourceId: aura.sourceId,
    targetId: target.id,
    amount: healed,
    crit: false,
    ability: aura.name,
  });
  const source = ctx.entities.get(aura.sourceId);
  if (source) ctx.healingThreat(source, target, healed);
}

function applyProtectiveStasis(
  ctx: SimContext,
  caster: Entity,
  target: Entity,
  effect: HourglassEffect,
  abilityName: string,
): void {
  if (target.castingAbility) ctx.cancelCast(target);
  target.autoAttack = false;
  ctx.applyAura(target, {
    id: TEMPORAL_HOURGLASS_ID,
    name: abilityName,
    kind: 'stasis',
    remaining: effect.duration,
    duration: effect.duration,
    value: effect.cooldownRate,
    tickInterval: 1,
    tickTimer: 1,
    sourceId: caster.id,
    school: 'arcane',
    temporalHealRemaining: Math.round(target.maxHp * effect.healMaxHpPct),
    temporalHealTicksRemaining: Math.round(effect.duration),
  });
}

export function applyTemporalHourglass(
  ctx: SimContext,
  caster: Entity,
  aim: Vec3,
  effect: HourglassEffect,
  abilityName: string,
): void {
  if (distanceSq(caster.pos, aim) <= effect.selfRadius * effect.selfRadius) {
    applyProtectiveStasis(ctx, caster, caster, effect, abilityName);
    return;
  }

  const party = ctx.partyOf(caster.id);
  if (party) {
    const allies = party.members
      .map((id) => ctx.entities.get(id))
      .filter(
        (candidate): candidate is Entity =>
          candidate !== undefined &&
          candidate.id !== caster.id &&
          candidate.kind === 'player' &&
          !candidate.dead &&
          candidate.hp > 0 &&
          distanceSq(candidate.pos, aim) <= effect.captureRadius * effect.captureRadius &&
          ctx.hasLineOfSight(caster, candidate),
      );
    const ally = nearestToAim(allies, aim);
    if (ally) {
      applyProtectiveStasis(ctx, caster, ally, effect, abilityName);
      return;
    }
  }

  const hostile = nearestToAim(
    ctx
      .hostilesInRadius(caster, aim, effect.captureRadius)
      .filter(
        (candidate) => !candidate.dead && candidate.hp > 0 && ctx.hasLineOfSight(caster, candidate),
      ),
    aim,
  );
  if (!hostile) return;

  ctx.applyAura(hostile, {
    id: TEMPORAL_HOURGLASS_ID,
    name: abilityName,
    kind: 'incapacitate',
    remaining: effect.duration,
    duration: effect.duration,
    value: 0,
    sourceId: caster.id,
    school: 'arcane',
    breaksOnDamage: true,
  });
  if (hostile.auras.some((aura) => aura.id === TEMPORAL_HOURGLASS_ID)) {
    ctx.enterCombat(caster, hostile);
  }
}
