import type { ResolvedAbility } from './sim';
import type { Entity } from './types';

export const MAX_DEVOTION = 20;
export const ASCENSION_CHARGES = 5;
export const ASCENSION_DURATION = 25;
export const ASCENSION_DEVOTION_BANK_CAP = 10;
export const DEVOTION_DECAY_DELAY = 10;
export const DEVOTION_DECAY_INTERVAL = 2;
export const BLOCK_DEVOTION_ICD = 6;

export type PaladinSpec = 'holy' | 'protection' | 'retribution';
export type AscensionImpactKind = 'healing' | 'defensive' | 'offensive' | 'area';

const ASCENSION_ABILITIES: Readonly<Record<PaladinSpec, ReadonlySet<string>>> = {
  holy: new Set(['mercy_lance', 'dawns_embrace', 'radiant_chorus']),
  protection: new Set(['vowkeeper_strike', 'bastion_rite', 'sunward_disc', 'guardian_covenant']),
  retribution: new Set(['oathstrike', 'final_edict', 'dawnfall', 'faithforged_guard']),
};

const DEVOTION_GAIN: Readonly<Record<PaladinSpec, Readonly<Record<string, number>>>> = {
  holy: {
    holy_light: 1,
    mercy_lance: 1,
    dawns_embrace: 2,
    radiant_chorus: 2,
  },
  protection: {
    vowkeeper_strike: 1,
    bastion_rite: 1,
    sunward_disc: 2,
  },
  retribution: {
    oathstrike: 1,
    final_edict: 2,
    dawnfall: 2,
  },
};

function state(e: Entity): NonNullable<Entity['paladinDevotion']> | null {
  return e.kind === 'player' && e.templateId === 'paladin' ? (e.paladinDevotion ?? null) : null;
}

export function isDivineAscensionActive(e: Entity): boolean {
  const devotion = state(e);
  return !!devotion && devotion.ascensionCharges > 0 && devotion.ascensionRemaining > 0;
}

export function canActivateDivineAscension(e: Entity): boolean {
  const devotion = state(e);
  return !!devotion && devotion.value >= MAX_DEVOTION && !isDivineAscensionActive(e);
}

export function activateDivineAscension(e: Entity): boolean {
  const devotion = state(e);
  if (!devotion || !canActivateDivineAscension(e)) return false;
  devotion.value = 0;
  devotion.ascensionCharges = ASCENSION_CHARGES;
  devotion.ascensionRemaining = ASCENSION_DURATION;
  devotion.outOfCombatTime = 0;
  devotion.decayProgress = 0;
  return true;
}

export function grantDevotion(e: Entity, amount: number): number {
  const devotion = state(e);
  if (!devotion || !Number.isFinite(amount) || amount <= 0) return 0;
  const cap = isDivineAscensionActive(e) ? ASCENSION_DEVOTION_BANK_CAP : MAX_DEVOTION;
  const before = devotion.value;
  devotion.value = Math.min(cap, devotion.value + Math.floor(amount));
  devotion.outOfCombatTime = 0;
  devotion.decayProgress = 0;
  return devotion.value - before;
}

export function isAscensionEmpoweredAbility(spec: string | null, abilityId: string): boolean {
  if (spec !== 'holy' && spec !== 'protection' && spec !== 'retribution') return false;
  return ASCENSION_ABILITIES[spec].has(abilityId);
}

export function devotionGainForAbility(spec: string | null, abilityId: string): number {
  if (spec !== 'holy' && spec !== 'protection' && spec !== 'retribution') return 0;
  return DEVOTION_GAIN[spec][abilityId] ?? 0;
}

export function ascensionImpactKind(
  abilityId: string,
  targetIsHostile: boolean,
): AscensionImpactKind {
  if (abilityId === 'mercy_lance') return targetIsHostile ? 'offensive' : 'healing';
  if (abilityId === 'dawns_embrace' || abilityId === 'radiant_chorus') return 'healing';
  if (
    abilityId === 'faithforged_guard' ||
    abilityId === 'bastion_rite' ||
    abilityId === 'guardian_covenant'
  ) {
    return 'defensive';
  }
  return abilityId === 'dawnfall' || abilityId === 'final_edict' ? 'area' : 'offensive';
}

function scaleRange(min: number, max: number, mult: number): { min: number; max: number } {
  return { min: Math.round(min * mult), max: Math.round(max * mult) };
}

export function resolveAscensionAbility(
  e: Entity,
  spec: string | null,
  resolved: ResolvedAbility,
): ResolvedAbility {
  const passiveUpgrade =
    (spec === 'holy' && resolved.def.id === 'life_covenant') ||
    (spec === 'protection' && resolved.def.id === 'sacred_challenge');
  if (
    !isDivineAscensionActive(e) ||
    (!isAscensionEmpoweredAbility(spec, resolved.def.id) && !passiveUpgrade)
  ) {
    return resolved;
  }

  const effects = resolved.effects.map((effect) => {
    switch (resolved.def.id) {
      case 'dawns_embrace':
        return effect.type === 'heal'
          ? { ...effect, ...scaleRange(effect.min, effect.max, 1.35) }
          : effect;
      case 'radiant_chorus':
        return effect.type === 'aoeHeal'
          ? { ...effect, ...scaleRange(effect.min, effect.max, 1.2), radius: 40 }
          : effect;
      case 'dawnfall':
        return effect.type === 'aoeDamage'
          ? { ...effect, ...scaleRange(effect.min, effect.max, 1.5), radius: 10 }
          : effect;
      case 'faithforged_guard':
        return effect.type === 'absorb'
          ? { ...effect, amount: Math.round(effect.amount * 1.5) }
          : effect;
      case 'bastion_rite':
        return effect.type === 'selfBuff' ? { ...effect, duration: 10 } : effect;
      case 'sunward_disc':
        if (effect.type === 'directDamage') {
          return { ...effect, ...scaleRange(effect.min, effect.max, 1.3) };
        }
        if (effect.type === 'chainDamage') {
          return {
            ...effect,
            ...scaleRange(effect.min, effect.max, 1.3),
            jumps: 5,
          };
        }
        return effect;
      case 'guardian_covenant':
        return effect.type === 'buffTarget' ? { ...effect, value: 0.3 } : effect;
      default:
        return effect;
    }
  });

  if (resolved.def.id === 'oathstrike') {
    const strike = resolved.effects.find((effect) => effect.type === 'weaponStrike');
    if (strike) {
      effects.push({
        ...strike,
        bonus: Math.round(strike.bonus * 0.6),
        weaponMult: (strike.weaponMult ?? 1) * 0.6,
      });
    }
  } else if (resolved.def.id === 'final_edict') {
    effects.push({ type: 'aoeDamage', min: 55, max: 70, radius: 6, softCap: 5 });
  } else if (resolved.def.id === 'mercy_lance') {
    for (let index = 0; index < effects.length; index++) {
      const effect = effects[index];
      if (effect.type !== 'heal') continue;
      effects[index] = {
        type: 'chainHeal',
        min: effect.min,
        max: effect.max,
        jumps: 1,
        falloff: 0.7,
        radius: 30,
      };
    }
  } else if (resolved.def.id === 'vowkeeper_strike') {
    effects.push({
      type: 'selfBuff',
      kind: 'absorb',
      value: Math.max(1, Math.round(e.maxHp * 0.06)),
      duration: 6,
      auraId: 'vowkeeper_strike_absorb',
    });
  } else if (resolved.def.id === 'life_covenant') {
    effects.push({ type: 'absorb', amount: 120, duration: 6 });
  } else if (resolved.def.id === 'sacred_challenge') {
    effects.push({ type: 'selfBuff', kind: 'buff_dr', value: 0.15, duration: 4 });
  }

  return {
    ...resolved,
    castTime: resolved.def.id === 'dawns_embrace' ? 0 : resolved.castTime,
    effects,
  };
}

export function consumeAscensionCharge(e: Entity, spec: string | null, abilityId: string): boolean {
  const devotion = state(e);
  if (!devotion || !isDivineAscensionActive(e) || !isAscensionEmpoweredAbility(spec, abilityId)) {
    return false;
  }
  devotion.ascensionCharges -= 1;
  if (devotion.ascensionCharges <= 0) {
    devotion.ascensionCharges = 0;
    devotion.ascensionRemaining = 0;
  }
  return true;
}

export function grantDevotionFromBlock(e: Entity): boolean {
  const devotion = state(e);
  if (!devotion || devotion.blockIcdRemaining > 0) return false;
  devotion.blockIcdRemaining = BLOCK_DEVOTION_ICD;
  return grantDevotion(e, 1) > 0;
}

export function updatePaladinDevotion(e: Entity, dt: number): void {
  const devotion = state(e);
  if (!devotion || !Number.isFinite(dt) || dt <= 0) return;

  devotion.blockIcdRemaining = Math.max(0, devotion.blockIcdRemaining - dt);

  if (e.dead) {
    devotion.value = 0;
    devotion.ascensionCharges = 0;
    devotion.ascensionRemaining = 0;
    devotion.outOfCombatTime = 0;
    devotion.decayProgress = 0;
    return;
  }

  if (devotion.ascensionRemaining > 0) {
    devotion.ascensionRemaining = Math.max(0, devotion.ascensionRemaining - dt);
    if (devotion.ascensionRemaining === 0) devotion.ascensionCharges = 0;
  }

  if (e.inCombat) {
    devotion.outOfCombatTime = 0;
    devotion.decayProgress = 0;
    return;
  }

  const previousOutOfCombatTime = devotion.outOfCombatTime;
  devotion.outOfCombatTime += dt;
  if (devotion.outOfCombatTime <= DEVOTION_DECAY_DELAY || devotion.value <= 0) return;
  devotion.decayProgress +=
    Math.max(0, devotion.outOfCombatTime - DEVOTION_DECAY_DELAY) -
    Math.max(0, previousOutOfCombatTime - DEVOTION_DECAY_DELAY);
  while (devotion.decayProgress >= DEVOTION_DECAY_INTERVAL && devotion.value > 0) {
    devotion.decayProgress -= DEVOTION_DECAY_INTERVAL;
    devotion.value -= 1;
  }
}
