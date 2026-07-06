// ---------------------------------------------------------------------------
// Warrior choice-row talent content (the Pandaria-style system in
// talent_rows.ts). Six tiers at levels 5/8/11/14/17/20, pick one of three.
// Pure data; English text is the content source, localized at the client.
//
// PHASING: an option whose mechanic the engine cannot express yet carries
// `effect: {}` and a PHASE 3 marker; it folds to nothing if picked (there is no
// player-facing picker until the UI phase, so nothing half-built is reachable).
// tests/talent_rows.test.ts pins exactly which options are LIVE, so a marker
// cannot be forgotten silently. The design source of truth (numbers approved by
// the owner) is the bilingual calculator mockup + docs/design/
// warrior-talents-build-plan.md.
// ---------------------------------------------------------------------------

import type { RowTree } from './talent_rows';

export const WARRIOR_ROWS: RowTree = [
  {
    // Tier 1 (level 5): mobility.
    level: 5,
    options: [
      {
        id: 'war_row_double_charge',
        name: 'Double Charge',
        description: 'Your Charge stores 2 uses, so you can charge twice in a row.',
        effect: {}, // PHASE 3: ability-charge system (build plan T1a)
      },
      {
        id: 'war_row_pursuit',
        name: 'Pursuit',
        description: 'Each enemy you kill grants 30% movement speed for 6 sec.',
        effect: {}, // PHASE 3: on-kill hook (build plan T1b)
      },
      {
        id: 'war_row_crushing_charge',
        name: 'Crushing Charge',
        description: 'Your Charge also roots the target for 4 sec and slows it by 50% for 15 sec.',
        // LIVE: rides the existing addEffects path onto the base Charge.
        effect: {
          ability: [
            {
              ability: 'charge',
              addEffects: [
                { type: 'root', duration: 4 },
                { type: 'slow', mult: 0.5, duration: 15 },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    // Tier 2 (level 8): survival.
    level: 8,
    options: [
      {
        id: 'war_row_second_wind',
        name: 'Second Wind',
        description: 'Below 35% health, you regenerate 3% of your health per second.',
        effect: {}, // PHASE 3: in-combat conditional regen (build plan T2a)
      },
      {
        id: 'war_row_die_by_the_sword',
        name: 'Die by the Sword',
        description:
          'Defensive cooldown: reduces damage taken by 10%, doubled to 20% while below 30% health.',
        effect: {}, // PHASE 3: granted ability + damage-taken arm (build plan T2b)
      },
      {
        id: 'war_row_victory_rush',
        name: 'Victory Rush',
        description: 'A strike that heals you, ready after a kill.',
        effect: {}, // PHASE 3: kill proc window + self-heal strike (build plan T2c)
      },
    ],
  },
  {
    // Tier 3 (level 11): control.
    level: 11,
    options: [
      {
        id: 'war_row_piercing_howl',
        name: 'Piercing Howl',
        description: 'A shout that slows enemies within 15 yards by 50% for 15 sec.',
        effect: {}, // PHASE 3: aoeSlow effect + granted ability (build plan T3a)
      },
      {
        id: 'war_row_storm_bolt',
        name: 'Storm Bolt',
        description: 'Hurl your weapon to stun a target.',
        effect: {}, // PHASE 3: granted ability (pure data + ability i18n batch, T3b)
      },
      {
        id: 'war_row_lingering_dread',
        name: 'Lingering Dread',
        description: 'Your feared enemies must take far more damage before the fear breaks.',
        effect: {}, // PHASE 3: fear break-threshold mechanic (build plan T3c)
      },
    ],
  },
  {
    // Tier 4 (level 14): resource.
    level: 14,
    options: [
      {
        id: 'war_row_anger_management',
        name: 'Anger Management',
        description: 'Your auto-attacks generate 25% more rage and your abilities 15% more.',
        // LIVE: the rage-generation globals folded by the shared engine.
        effect: { global: { autoRagePct: 0.25, abilityRagePct: 0.15 } },
      },
      {
        id: 'war_row_blood_offering',
        name: 'Blood Offering',
        description: 'Sacrifice 5% of your maximum health to instantly gain 30 rage.',
        effect: {}, // PHASE 3: granted ability (bloodrage twin + ability i18n, T4b)
      },
      {
        id: 'war_row_battle_rhythm',
        name: 'Battle Rhythm',
        description:
          'Every third ability you use generates 20% more rage and deals 5% more damage.',
        effect: {}, // PHASE 3: rolling cast counter (build plan T4c)
      },
    ],
  },
  {
    // Tier 5 (level 17): offensive cooldown.
    level: 17,
    options: [
      {
        id: 'war_row_recklessness',
        name: 'Recklessness',
        description:
          'Enrage: increase all your rage generation by 50% and gain 20% additional critical strike chance for 12 sec.',
        effect: {}, // PHASE 3: granted ability wearing buff_crit + a rage-gen aura (T5a)
      },
      {
        id: 'war_row_avatar',
        name: 'Avatar',
        description:
          'Transform into a colossus for 20 sec, breaking all control on you and increasing your damage dealt by 20%.',
        effect: {}, // PHASE 3: control-break + transform (build plan T5b)
      },
      {
        id: 'war_row_bloodbath',
        name: 'Bloodbath',
        description:
          'Each enemy you kill grants 5% critical strike and 5% damage dealt for 8 sec, stacking up to 25%.',
        effect: {}, // PHASE 3: on-kill stacking buff (build plan T5c)
      },
    ],
  },
  {
    // Tier 6 (level 20): capstone.
    level: 20,
    options: [
      {
        id: 'war_row_colossal_might',
        name: 'Colossal Might',
        description: 'Rage you spend reduces the cooldown of your major offensive abilities.',
        effect: {}, // PHASE 3: cooldown reduction on rage spend (build plan T6a)
      },
      {
        id: 'war_row_bladestorm',
        name: 'Bladestorm',
        description: 'Become a whirling storm of steel, striking everything around you.',
        effect: {}, // PHASE 3: caster-centered channel (build plan T6b)
      },
      {
        id: 'war_row_sanguine_aura',
        name: 'Sanguine Aura',
        description:
          'Imbue your weapon with the blood of your foes. You and your melee allies gain 10% attack speed and 10% damage for 20 sec.',
        effect: {}, // PHASE 3: party-scoped melee-filtered buff (build plan T6c)
      },
    ],
  },
];
