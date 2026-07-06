// ---------------------------------------------------------------------------
// Warrior talent content - the vertical-slice class. Three Spec trees (Arms /
// Fury dps, Protection tank). Pure data; the engine in talents.ts validates,
// precomputes, and serializes it. Node/spec display names here are content
// (rendered directly, like ability/quest names); only UI chrome strings route
// through i18n.
//
// Ability ids referenced by `grant`/`ability` mods that aren't in the warrior's
// base kit (mortal_strike, bloodthirst, shield_slam, whirlwind, berserker_rage)
// are added to ABILITIES in classes.ts; abilitiesKnownAt resolves them at runtime.
// ---------------------------------------------------------------------------

import type { ClassTalents, SpecDef } from './talents';

const SPECS: SpecDef[] = [
  {
    id: 'arms', class: 'warrior', name: 'Battlecraft', role: 'dps', icon: 'x',
    description: 'A master of arms who turns discipline and technique into his greatest strength. Every blow is calculated to break the enemy defense, exploit their weak points, and set up a devastating finisher. His combat is precise, methodical, and lethal, rewarding those who master the rhythm of battle.',
    signature: 'mortal_strike',
    mastery: { name: 'Sharpened Blades', description: 'Increases your melee ability damage by 15% and the damage of your critical strikes by 25%.', effect: { global: { meleeDmgPct: 0.15, critDmgPct: 0.25 } } },
  },
  {
    id: 'fury', class: 'warrior', name: 'Bloodrush', role: 'dps', icon: 'x',
    description: 'A berserker who fights with a weapon in each hand and lets rage drive his every move. The longer he fights, the greater his Enrage, unleashing a relentless storm of attacks that gives his enemies no respite. A frenzied, savage, aggressive style where the offensive never stops.',
    signature: 'bloodthirst',
    mastery: { name: 'Bloodletter', description: 'Increases your critical strike chance by 10% and your melee ability damage by 10%.', effect: { stats: { crit: 0.10 }, global: { meleeDmgPct: 0.10 } } },
  },
  {
    id: 'prot', class: 'warrior', name: 'Ironguard', role: 'tank', icon: 'O',
    description: 'The guardian who leads the front line with shield raised and unbreakable will. He withstands the assault of countless foes, protects his allies, and controls the battlefield with authority. He turns every blocked blow into a chance to answer with force.',
    signature: 'shield_slam',
    mastery: { name: 'Recompense', description: 'Increases all threat you generate by 50% and your armor by 20%.', effect: { global: { threatPct: 0.50 }, stats: { armorPct: 0.20 } } },
  },
];

export const WARRIOR_TALENTS: ClassTalents = {
  class: 'warrior',
  specs: SPECS,
};
