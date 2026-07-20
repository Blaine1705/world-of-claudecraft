import { pctValue } from '../entity';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';
import { armorReduction, dist2d, swingMissChance } from '../types';
import { activateHunterMajorWindow, grantHunterFocus } from './hunter_shared';

export const PACK_FEROCITY_AURA_ID = 'pack_ferocity';
export const PACK_FRENZY_AURA_ID = 'pack_frenzy';
export const HOWLING_RAGE_EMPOWER_ID = 'howling_rage_empower';

function removeAura(ctx: SimContext, entity: Entity, id: string): void {
  const index = entity.auras.findIndex((aura) => aura.id === id);
  if (index < 0) return;
  const [aura] = entity.auras.splice(index, 1);
  ctx.emit({ type: 'aura', targetId: entity.id, name: aura.name, gained: false });
}

function petDamageMultiplier(ctx: SimContext, pet: Entity): number {
  let multiplier = 1;
  for (const aura of pet.auras) {
    if (aura.kind === 'pet_damage_pct') multiplier += pctValue(aura.value);
  }
  if (pet.ownerId !== null) {
    const ownerMeta = ctx.players.get(pet.ownerId);
    if (ownerMeta) multiplier *= 1 + ctx.playerMods(ownerMeta).global.petDmgPct;
    const owner = ctx.entities.get(pet.ownerId);
    if (owner?.auras.some((aura) => aura.kind === 'hunter_frenzy')) multiplier *= 1.25;
  }
  return multiplier;
}

function petStrike(
  ctx: SimContext,
  pet: Entity,
  target: Entity,
  min: number,
  max: number,
  abilityName: string,
  canMiss: boolean,
): number {
  if (canMiss && ctx.rng.chance(swingMissChance(pet, target))) {
    ctx.emit({
      type: 'damage',
      sourceId: pet.id,
      targetId: target.id,
      amount: 0,
      crit: false,
      school: 'physical',
      ability: abilityName,
      kind: 'miss',
    });
    ctx.enterCombat(pet, target);
    return 0;
  }
  const crit = ctx.rng.chance(0.05);
  let damage = ctx.rng.range(min, max);
  damage += (ctx.effectiveAttackPower(pet) / 14) * 0.5;
  if (crit) damage *= 2;
  damage *= petDamageMultiplier(ctx, pet);
  damage *= 1 - armorReduction(ctx.effectiveArmor(target), pet.level);
  const dealt = Math.max(1, Math.round(damage));
  ctx.dealDamage(pet, target, dealt, crit, 'physical', abilityName, 'hit', true);
  return dealt;
}

function setFerocity(ctx: SimContext, hunter: Entity, stacks: number, duration: number): void {
  ctx.applyAura(hunter, {
    id: PACK_FEROCITY_AURA_ID,
    name: 'Pack Ferocity',
    kind: 'hunter_ferocity',
    remaining: duration,
    duration,
    value: stacks,
    stacks,
    sourceId: hunter.id,
    school: 'physical',
  });
}

export function packCommandError(
  ctx: SimContext,
  hunter: Entity,
  target: Entity | null,
): string | null {
  if (hunter.auras.some((aura) => aura.kind === 'hunter_frenzy')) {
    return 'Your beast must calm before building Ferocity again.';
  }
  const pet = ctx.petOf(hunter.id);
  if (!pet || pet.dead) return 'You have no living pet.';
  if (!target || target.dead || !ctx.isHostileTo(hunter, target)) return 'You have no target.';
  if (dist2d(pet.pos, target.pos) > 35 || !ctx.hasLineOfSight(pet, target)) {
    return 'Your pet cannot reach that target.';
  }
  return null;
}

export function runPackCommand(
  ctx: SimContext,
  hunter: Entity,
  target: Entity | null,
  effect: {
    min: number;
    max: number;
    focus: number;
    ferocityDuration: number;
  },
  abilityName: string,
): void {
  const pet = ctx.petOf(hunter.id);
  if (!pet || !target || target.dead) return;
  pet.aggroTargetId = target.id;
  pet.inCombat = true;
  if (petStrike(ctx, pet, target, effect.min, effect.max, abilityName, true) <= 0) return;
  grantHunterFocus(ctx, hunter, effect.focus, 'pack_command');
  const current = hunter.auras.find((aura) => aura.id === PACK_FEROCITY_AURA_ID)?.stacks ?? 0;
  setFerocity(ctx, hunter, Math.min(3, current + 1), effect.ferocityDuration);
}

export function applyHowlingRage(ctx: SimContext, hunter: Entity, duration: number): void {
  removeAura(ctx, hunter, PACK_FRENZY_AURA_ID);
  setFerocity(ctx, hunter, 3, duration + 8);
  ctx.applyAura(hunter, {
    id: HOWLING_RAGE_EMPOWER_ID,
    name: 'Howling Rage',
    kind: 'internal_cd',
    remaining: duration + 8,
    duration: duration + 8,
    value: 1.5,
    sourceId: hunter.id,
    school: 'physical',
  });
  activateHunterMajorWindow(ctx, hunter, 90);
}

export function runUnleashBeast(
  ctx: SimContext,
  hunter: Entity,
  target: Entity | null,
  effect: {
    primaryMin: number;
    primaryMax: number;
    clapMin: number;
    clapMax: number;
    radius: number;
    frenzyDuration: number;
  },
  abilityName: string,
): void {
  const pet = ctx.petOf(hunter.id);
  if (!pet || !target || target.dead) return;
  const empowered = hunter.auras.some((aura) => aura.id === HOWLING_RAGE_EMPOWER_ID);
  const multiplier = empowered ? 1.5 : 1;
  petStrike(
    ctx,
    pet,
    target,
    effect.primaryMin * multiplier,
    effect.primaryMax * multiplier,
    abilityName,
    false,
  );
  const targets = ctx
    .hostilesInRadius(pet, pet.pos, effect.radius)
    .filter((enemy) => !enemy.dead && ctx.hasLineOfSight(pet, enemy))
    .sort((a, b) => dist2d(a.pos, pet.pos) - dist2d(b.pos, pet.pos) || a.id - b.id);
  for (const enemy of targets) {
    petStrike(
      ctx,
      pet,
      enemy,
      effect.clapMin * multiplier,
      effect.clapMax * multiplier,
      `${abilityName} Clap`,
      false,
    );
  }
  removeAura(ctx, hunter, PACK_FEROCITY_AURA_ID);
  removeAura(ctx, hunter, HOWLING_RAGE_EMPOWER_ID);
  const duration = effect.frenzyDuration + (empowered ? 4 : 0);
  ctx.applyAura(hunter, {
    id: PACK_FRENZY_AURA_ID,
    name: 'Unleashed Frenzy',
    kind: 'hunter_frenzy',
    remaining: duration,
    duration,
    value: 0.25,
    sourceId: hunter.id,
    school: 'physical',
  });
}

export function packlordPetHasteMultiplier(ctx: SimContext, pet: Entity): number {
  if (pet.ownerId === null) return 1;
  const owner = ctx.entities.get(pet.ownerId);
  return owner?.auras.some((aura) => aura.kind === 'hunter_frenzy') ? 1.35 : 1;
}

export function runFrenzyFellShotCleave(ctx: SimContext, hunter: Entity, primary: Entity): void {
  if (!hunter.auras.some((aura) => aura.kind === 'hunter_frenzy')) return;
  const pet = ctx.petOf(hunter.id);
  if (!pet || pet.dead) return;
  const targets = ctx
    .hostilesInRadius(pet, primary.pos, 5)
    .filter((target) => target.id !== primary.id && !target.dead)
    .sort((a, b) => dist2d(a.pos, primary.pos) - dist2d(b.pos, primary.pos) || a.id - b.id)
    .slice(0, 2);
  for (const target of targets) petStrike(ctx, pet, target, 12, 18, 'Frenzy Cleave', false);
}

export function clearPacklordState(ctx: SimContext, hunter: Entity): void {
  removeAura(ctx, hunter, PACK_FEROCITY_AURA_ID);
  removeAura(ctx, hunter, PACK_FRENZY_AURA_ID);
  removeAura(ctx, hunter, HOWLING_RAGE_EMPOWER_ID);
}
