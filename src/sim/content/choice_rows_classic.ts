import type { ClassChoiceRows } from './talent_rows';

const rogueBuilderAbilityIds = [
  'sinister_strike',
  'backstab',
  'gouge',
  'ambush',
  'garrote',
  'cheap_shot',
  'hemorrhage',
  'ghostly_strike',
];

const rogueFinisherAbilityIds = [
  'eviscerate',
  'rupture',
  'kidney_shot',
  'slice_and_dice',
  'expose_armor',
];

const priestManaHealingAbilityIds = [
  'lesser_heal',
  'renew',
  'heal',
  'flash_heal',
  'holy_nova',
  'prayer_of_healing',
];

const warlockDamagingFireSpellAbilityIds = [
  'immolate',
  'searing_pain',
  'rain_of_fire',
  'chaos_bolt',
  'conflagrate',
];

const warlockDamagingShadowSpellAbilityIds = [
  'shadow_bolt',
  'corruption',
  'curse_of_agony',
  'drain_life',
  'shadowburn',
  'siphon_life',
  'death_coil',
];

const warlockDamagingFireOrShadowSpellAbilityIds = [
  ...warlockDamagingFireSpellAbilityIds,
  ...warlockDamagingShadowSpellAbilityIds,
];

export const MAGE_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'mobility',
      options: [
        {
          id: 'mag_r5_ice_floes',
          name: 'Ice Floes',
          description:
            'Grants Ice Floes: your next two spells with a cast time can be cast while moving.',
          icon: 'ice_floes',
          effect: { grant: { ability: 'ice_floes' } },
        },
        {
          id: 'mag_r5_double_blink',
          name: 'Double Blink',
          description: 'Flickerstep stores 2 charges, but each recharges 30% more slowly.',
          icon: 'double_blink',
          effect: { ability: [{ ability: 'blink', bonusCharges: 1, cooldownPct: 0.3 }] },
        },
        {
          id: 'mag_r5_blink_cast',
          name: 'Blink While Casting',
          description: 'You can use Flickerstep in the middle of a cast without interrupting it.',
          icon: 'blink_while_casting',
          effect: { global: { blinkCast: 1 } },
        },
      ],
    },
    {
      level: 8,
      theme: 'survival',
      options: [
        {
          id: 'mag_r8_warded',
          name: 'Warded',
          description:
            'While your personal barrier is up you take 15% less damage, and it heals its bearer for 10% of your maximum health when it breaks after absorbing.',
          icon: 'warded',
          effect: {
            global: { barrierDrPct: 0.15 },
            // Percentage scaling keeps the break heal proportional while the
            // personal barriers grow through their leveling ranks.
            // 'personal_barrier' is the SLOT sentinel: Frostveil for Frost,
            // Blazing Barrier for Fire, or Temporal Barrier for Chronomancy.
            // Source scaling prevents an allied tank's HP pool from amplifying it.
            proc: {
              id: 'mag_warded',
              name: 'Warded',
              trigger: { on: 'shieldConsumed', ability: 'personal_barrier' },
              responses: [{ kind: 'heal', amountPctSourceMaxHp: 0.1 }],
            },
          },
        },
        {
          id: 'mag_r8_temporal_rift',
          name: 'Shifting Ward',
          description: 'Casting your personal barrier breaks roots affecting you.',
          icon: 'temporal_rift',
          effect: {
            ability: [
              { ability: 'ice_barrier', addEffects: [{ type: 'breakRoots' }] },
              { ability: 'blazing_barrier', addEffects: [{ type: 'breakRoots' }] },
            ],
          },
        },
        {
          id: 'mag_r8_greater_invis',
          name: 'Greater Invisibility',
          description:
            'Grants Greater Invisibility: vanish for 20 sec, removing 2 damage-over-time effects and taking 90% less damage while invisible and shortly after.',
          icon: 'greater_invisibility',
          effect: { grant: { ability: 'greater_invisibility' } },
        },
      ],
    },
    {
      level: 11,
      theme: 'control',
      options: [
        {
          id: 'mag_r11_rings_of_frost',
          name: 'Ring of Frost',
          description:
            'Grants Ring of Frost: its perimeter persists for 10 sec and freezes enemies that cross it for 4 sec.',
          icon: 'rings_of_frost',
          effect: { grant: { ability: 'rings_of_frost' } },
        },
        {
          id: 'mag_r11_snap_polymorph',
          name: 'Snap Bewitch',
          description: 'Bewitch becomes instant, on a 20 sec cooldown.',
          icon: 'snap_polymorph',
          effect: { ability: [{ ability: 'polymorph', castPct: -1, cooldownFlat: 20 }] },
        },
        {
          id: 'mag_r11_twin_nova',
          name: 'Twin Icebind',
          description: 'Icebind stores 2 charges that recharge independently.',
          icon: 'twin_frost_nova',
          effect: { ability: [{ ability: 'frost_nova', bonusCharges: 1 }] },
        },
      ],
    },
    {
      level: 14,
      theme: 'amplify',
      options: [
        {
          id: 'mag_r14_power_echo',
          name: 'Power Echo',
          description:
            'Grants Power Echo: your next direct spell repeats at 50% power on the same target.',
          icon: 'power_echo',
          effect: { grant: { ability: 'power_echo' } },
        },
        {
          id: 'mag_r14_overload',
          name: 'Overload',
          description:
            'Grants Overload: your next spell is amplified by 40% but costs 50% more mana.',
          icon: 'overload',
          effect: { grant: { ability: 'overload' } },
        },
        {
          id: 'mag_r14_presence_of_mind',
          name: 'Racing Mind',
          description: 'Grants Racing Mind: your next spell with a cast time is cast instantly.',
          icon: 'presence_of_mind',
          effect: { grant: { ability: 'presence_of_mind' } },
        },
      ],
    },
    {
      level: 17,
      theme: 'cooldown',
      options: [
        {
          id: 'mag_r17_convergence',
          name: 'Elemental Convergence',
          description:
            'Alternating a Fire and a Frost spell opens an 8 sec surge of power, once per 30 sec.',
          icon: 'elemental_convergence',
          effect: { global: { convergence: 1 } },
        },
        {
          id: 'mag_r17_cold_snap',
          name: "Winter's Recall",
          description:
            "Grants Winter's Recall: instantly finishes the cooldown of Flickerstep, Frostveil and Greater Invisibility.",
          icon: 'cold_snap',
          effect: { grant: { ability: 'cold_snap' } },
        },
        {
          id: 'mag_r17_mass_barrier',
          name: 'Mass Barrier',
          description: 'Grants Mass Barrier: shield you and all allies within 30 yd.',
          icon: 'mass_barrier',
          effect: { grant: { ability: 'mass_barrier' } },
        },
      ],
    },
    {
      level: 20,
      theme: 'capstone',
      options: [
        {
          id: 'mag_r20_rune_of_power',
          name: 'Rune of Power',
          description:
            'Grants Rune of Power: inscribe a rune; allies standing near it deal 10% more damage.',
          icon: 'rune_of_power',
          effect: { grant: { ability: 'rune_of_power' } },
        },
        {
          id: 'mag_r20_overflowing_power',
          name: 'Overflowing Power',
          description:
            'Spending mana shaves the cooldown of your defensives: 2 sec per tenth of your maximum mana spent, up to 10 sec every 30 sec.',
          icon: 'overflowing_power',
          effect: { global: { manaDefCdrPer10: 2 } },
        },
        {
          id: 'mag_r20_evocation',
          name: 'Aetherwell',
          description:
            'Grants Aetherwell: channel to restore mana, building spell power the longer you channel.',
          icon: 'evocation',
          effect: { grant: { ability: 'evocation' } },
        },
      ],
    },
  ],
};

export const PALADIN_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'holy_tempo',
      decision: 'Verdict-fed mana vs mobile Mending Light vs Verdict-Rite resets',
      options: [
        {
          id: 'pal_r5_crusaders_zeal',
          name: 'Oath Returned',
          description: 'Verdict restores 25 mana when cast.',
          icon: 'judgement',
          effect: {
            proc: {
              id: 'pal_oath_returned',
              name: 'Oath Returned',
              trigger: { on: 'castNth', n: 1, abilities: ['judgement'] },
              responses: [{ kind: 'resource', amount: 25, resourceType: 'mana' }],
            },
          },
        },
        {
          id: 'pal_r5_blessed_momentum',
          name: "Pilgrim's Light",
          description: 'Mending Light is castable while moving.',
          icon: 'holy_light',
          effect: { ability: [{ ability: 'holy_light', castWhileMoving: true }] },
        },
        {
          id: 'pal_r5_vengeful_exorcism',
          name: 'Ashen Sentence',
          description:
            'Rite of Expulsion deals 25% more damage, costs 25% less, and Verdict resets its cooldown.',
          icon: 'exorcism',
          effect: {
            ability: [{ ability: 'exorcism', dmgPct: 0.25, costPct: -0.25 }],
            proc: {
              id: 'pal_vengeful_exorcism',
              name: 'Vengeful Exorcism',
              trigger: { on: 'castNth', n: 1, abilities: ['judgement'] },
              responses: [{ kind: 'cooldownRefund', ability: 'exorcism', seconds: 'reset' }],
            },
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'justice',
      decision: 'ally dispel vs banked stuns vs Holy Ground lockdown',
      options: [
        {
          id: 'pal_r8_cleansing_verdict',
          name: 'Cleansing Verdict',
          description:
            'Grants Cleansing Verdict: purge a harmful magic effect off an ally and heal them.',
          icon: 'cleansing_verdict',
          effect: { grant: { ability: 'cleansing_verdict' } },
        },
        {
          id: 'pal_r8_fist_of_justice',
          name: 'Twin Gavels',
          description: 'Sundering Gavel stores 2 uses.',
          icon: 'hammer_of_justice',
          effect: { ability: [{ ability: 'hammer_of_justice', bonusCharges: 1 }] },
        },
        {
          id: 'pal_r8_consecrated_ground',
          name: 'Hallowed Snare',
          description: 'Holy Ground also roots enemies within 8 yd for 2 sec.',
          icon: 'consecration',
          effect: {
            ability: [
              {
                ability: 'consecration',
                addEffects: [{ type: 'aoeRoot', duration: 2, radius: 8, min: 0, max: 0 }],
              },
            ],
          },
        },
      ],
    },
    {
      level: 11,
      theme: 'devotion',
      decision: 'healing cadence vs shield-to-emergency reset vs critical-heal wards',
      options: [
        {
          id: 'pal_r11_divine_wisdom',
          name: 'Third Benediction',
          description:
            'Every 3rd Mending Light or Lightmend makes your next Mending Light within 10 sec instant.',
          icon: 'flash_of_light',
          effect: {
            proc: {
              id: 'pal_divine_wisdom',
              name: 'Third Benediction',
              trigger: { on: 'castNth', n: 3, abilities: ['holy_light', 'flash_of_light'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['holy_light'],
                  duration: 10,
                },
              ],
            },
          },
        },
        {
          id: 'pal_r11_guardians_favor',
          name: 'Mercy from Ruin',
          description:
            "When Ward of Faith is fully consumed, it shaves 120 sec off Last Rite's cooldown.",
          icon: 'divine_protection',
          effect: {
            proc: {
              id: 'pal_guardians_favor',
              name: 'Mercy from Ruin',
              trigger: { on: 'shieldConsumed', ability: 'divine_protection' },
              responses: [{ kind: 'cooldownRefund', ability: 'lay_on_hands', seconds: 120 }],
            },
          },
        },
        {
          id: 'pal_r11_greater_blessing',
          name: 'Afterglow Aegis',
          description:
            'Critical heals from Mending Light, Lightmend, and Last Rite also ward the target, absorbing 60 damage for 10 sec.',
          icon: 'blessing_of_might',
          effect: {
            proc: {
              id: 'pal_greater_blessing',
              name: 'Greater Blessing',
              trigger: {
                on: 'spellCrit',
                abilities: ['holy_light', 'flash_of_light', 'lay_on_hands'],
              },
              responses: [{ kind: 'absorb', amount: 60, duration: 10, name: 'Greater Blessing' }],
            },
          },
        },
      ],
    },
    {
      level: 14,
      theme: 'reckoning',
      decision: 'faster Verdicts vs area holy burst vs Oathbrand-fed Verdict tempo',
      options: [
        {
          // Balance pass (maintainer sheet): banked double Verdicts are out.
          // The classic Improved Judgement shape instead.
          id: 'pal_r14_swift_verdicts',
          name: 'Swift Verdicts',
          description: "Verdict's cooldown is reduced by 20%.",
          icon: 'judgement',
          effect: { ability: [{ ability: 'judgement', cooldownPct: -0.2 }] },
        },
        {
          id: 'pal_r14_holy_wrath',
          name: "Saint's Ire",
          description: "Grants Saint's Ire.",
          icon: 'holy_wrath',
          effect: { grant: { ability: 'holy_wrath' } },
        },
        {
          id: 'pal_r14_righteous_cause',
          name: 'Oathwheel',
          description:
            'Landed melee attacks while your Oathbrand is active shave 0.5 sec off the cooldown of Verdict.',
          icon: 'seal_of_righteousness',
          effect: {
            proc: {
              id: 'pal_righteous_cause',
              name: 'Righteous Cause',
              trigger: { on: 'meleeSwingWhile', auraKind: 'imbue' },
              responses: [{ kind: 'cooldownRefund', ability: 'judgement', seconds: 0.5 }],
            },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'sanctuary',
      decision: 'personal bulwark vs ally emergency ward vs cheat death',
      options: [
        {
          id: 'pal_r17_divine_shield',
          name: 'Lightward',
          description: 'Grants Lightward.',
          icon: 'divine_shield',
          effect: { grant: { ability: 'divine_shield' } },
        },
        {
          id: 'pal_r17_sacred_ward',
          name: "Rite's Afterglow",
          description:
            'Last Rite also wraps its target in a sacred ward absorbing 360 damage for 10 sec.',
          icon: 'devotion_aura',
          effect: {
            ability: [
              {
                ability: 'lay_on_hands',
                addEffects: [{ type: 'absorb', amount: 360, duration: 10 }],
              },
            ],
          },
        },
        {
          id: 'pal_r17_ardent_defender',
          name: 'Deathless Ardor',
          description:
            'A blow that would kill you leaves you at 1 health instead. Once every 180 sec.',
          icon: 'divine_protection',
          effect: { global: { cheatDeathIcd: 180 } },
        },
      ],
    },
    {
      level: 20,
      theme: 'holy_arsenal',
      decision: 'self empowerment vs ranged execute vs silencing shield ricochet',
      options: [
        {
          id: 'pal_r20_avenging_wrath',
          name: 'Wrathwing',
          description: 'Grants Wrathwing.',
          icon: 'avenging_wrath',
          effect: { grant: { ability: 'avenging_wrath' } },
        },
        {
          id: 'pal_r20_hammer_of_wrath',
          name: 'Tolling Hammer',
          description: 'Grants Tolling Hammer.',
          icon: 'hammer_of_wrath',
          effect: { grant: { ability: 'hammer_of_wrath' } },
        },
        {
          id: 'pal_r20_aura_mastery',
          name: 'Dawnward Ricochet',
          description: 'Grants Dawnward Ricochet.',
          icon: 'holy_shield',
          effect: { grant: { ability: 'aura_surge' } },
        },
      ],
    },
  ],
};

export const HUNTER_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'mobility',
      decision: 'active escape vs long travel vs rotational movement',
      options: [
        {
          id: 'hun_r5_tactical_retreat',
          name: 'Tactical Retreat',
          description: 'Trailbreak stores 2 uses and removes roots and movement slows when used.',
          icon: 'trailbreak',
          effect: { ability: [{ ability: 'trailbreak', bonusCharges: 1 }] },
        },
        {
          id: 'hun_r5_enduring_courser',
          name: 'Enduring Courser',
          description:
            "Courser's Guise grants 60% movement speed for 3 sec when activated. 20 sec internal cooldown.",
          icon: 'aspect_of_the_cheetah',
          effect: {
            ability: [{ ability: 'aspect_of_the_cheetah' }],
            runtime: { movementSpeedPct: 0.6, duration: 3, internalCooldown: 20 },
          },
        },
        {
          id: 'hun_r5_predators_pace',
          name: "Predator's Pace",
          description:
            'A successful Focus generator grants 20% movement speed for 3 sec. 8 sec internal cooldown.',
          icon: 'measured_shot',
          effect: {
            ability: [{ ability: 'measured_shot' }],
            runtime: { movementSpeedPct: 0.2, duration: 3, internalCooldown: 8 },
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'defense',
      decision: 'precise mitigation vs recovery vs passive smoothing',
      options: [
        {
          id: 'hun_r8_receding_shell',
          name: 'Receding Shell',
          description:
            'Recast Shellskin to end it early and refund 50% of its unused duration, up to 45 sec.',
          icon: 'shellskin',
          effect: {
            ability: [{ ability: 'shellskin' }],
            runtime: { cooldownRefundPct: 0.5, cooldownRefundCap: 45 },
          },
        },
        {
          id: 'hun_r8_shared_recovery',
          name: 'Shared Recovery',
          description:
            'Wildheart also heals your pet for 30% and grants both of you 20% damage reduction for 4 sec.',
          icon: 'wildheart',
          effect: {
            ability: [{ ability: 'wildheart' }],
            runtime: { petHealPct: 0.3, damageReductionPct: 0.2, duration: 4 },
          },
        },
        {
          id: 'hun_r8_beastguard',
          name: 'Beastguard',
          description:
            'Redirect 15% of damage to a living pet without reducing it below 20% health. Without one, take 8% less damage below 50% health.',
          icon: 'concussive_shot',
          effect: {
            global: { petDmgSharePct: 0.15 },
            runtime: {
              petHealthFloorPct: 0.2,
              fallbackDamageReductionPct: 0.08,
              healthThresholdPct: 0.5,
            },
          },
        },
      ],
    },
    {
      level: 11,
      theme: 'control',
      decision: 'interrupt coverage vs trap control vs pursuit control',
      options: [
        {
          id: 'hun_r11_double_hush',
          name: 'Double Hush',
          description: 'Hushing Shot stores 2 uses, each with a 24 sec recharge.',
          icon: 'counter_shot',
          effect: {
            ability: [{ ability: 'counter_shot', bonusCharges: 1, cooldownFlat: 4 }],
          },
        },
        {
          id: 'hun_r11_binding_payload',
          name: 'Binding Payload',
          description:
            'Frostjaw Trap roots every enemy in its trigger area for 3 sec, then slows them by 40% for 4 sec.',
          icon: 'frostjaw_trap',
          effect: {
            ability: [{ ability: 'frostjaw_trap' }],
            runtime: { rootDuration: 3, slowPct: 0.4, slowDuration: 4 },
          },
        },
        {
          id: 'hun_r11_crippling_pursuit',
          name: 'Crippling Pursuit',
          description:
            'Rattling Shot or Fettering Slash roots an already slowed target for 2 sec. 12 sec per-target cooldown.',
          icon: 'concussive_shot',
          effect: {
            ability: [{ ability: 'concussive_shot' }],
            runtime: { rootDuration: 2, perTargetCooldown: 12 },
          },
        },
      ],
    },
    {
      level: 14,
      theme: 'focus_engine',
      decision: 'resource rhythm vs trap linkage vs timed guises',
      options: [
        {
          id: 'hun_r14_efficient_rhythm',
          name: 'Efficient Rhythm',
          description:
            'After spending 75 Focus, your next Focus generator grants 20 additional Focus.',
          icon: 'measured_shot',
          effect: {
            ability: [{ ability: 'measured_shot' }],
            runtime: { focusSpendThreshold: 75, focusBonus: 20 },
          },
        },
        {
          id: 'hun_r14_trapcraft',
          name: 'Trapcraft',
          description:
            "Frostjaw Trap's cooldown is reduced by 20%. Triggering it restores 20 Focus and reduces Trailbreak's cooldown by 5 sec.",
          icon: 'frostjaw_trap',
          effect: { ability: [{ ability: 'frostjaw_trap', cooldownPct: -0.2 }] },
        },
        {
          id: 'hun_r14_guise_mastery',
          name: 'Guise Mastery',
          description:
            "For 6 sec, Harrier's Guise increases Focus generation by 50%, Marten's Guise reduces direct damage by 25%, and Courser's Guise grants 50% movement speed, or 60% with Enduring Courser. 20 sec shared cooldown.",
          icon: 'aspect_of_the_hawk',
          effect: {
            ability: [{ ability: 'aspect_of_the_hawk' }],
            runtime: {
              duration: 6,
              focusGenerationPct: 0.5,
              damageReductionPct: 0.25,
              movementSpeedPct: 0.5,
              enduringMovementSpeedPct: 0.6,
              internalCooldown: 20,
            },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'major_window',
      decision: 'personal burst vs pressure defense vs party rally',
      options: [
        {
          id: 'hun_r17_apex_instinct',
          name: 'Apex Instinct',
          description:
            'Your specialization cooldown grants 40 Focus. Its next 3 Focus spenders cost 50% less and deal 20% more damage. Charges persist for the cooldown window plus 4 sec.',
          icon: 'bestial_wrath',
          effect: {
            ability: [{ ability: 'arcane_shot' }],
            runtime: {
              focusGain: 40,
              charges: 3,
              costReductionPct: 0.5,
              primaryDamagePct: 0.2,
              durationBuffer: 4,
            },
          },
        },
        {
          id: 'hun_r17_shell_and_fang',
          name: 'Shell and Fang',
          description:
            'Shellskin allows attacks and pet commands, but its damage reduction is reduced to 40%.',
          icon: 'shellskin',
          effect: {
            ability: [{ ability: 'shellskin' }],
            runtime: { damageReductionPct: 0.4 },
          },
        },
        {
          id: 'hun_r17_pack_rally',
          name: 'Pack Rally',
          description:
            "Courser's Guise can trigger Pack Rally, granting nearby allies 30% movement and 10% attack and cast speed for 10 sec. 90 sec cooldown.",
          icon: 'aspect_of_the_wild',
          effect: {
            ability: [{ ability: 'aspect_of_the_cheetah' }],
            runtime: {
              movementSpeedPct: 0.3,
              hastePct: 0.1,
              duration: 10,
              internalCooldown: 90,
            },
          },
        },
      ],
    },
    {
      level: 20,
      theme: 'focus_capstone',
      decision: 'personal cleave vs trap echoes vs pet echoes',
      options: [
        {
          id: 'hun_r20_overdraw',
          name: 'Overdraw',
          description:
            'Every 3rd Focus spender deals 35% more primary damage and cleaves 50% of that damage to 2 nearby enemies.',
          icon: 'arcane_shot',
          effect: {
            ability: [{ ability: 'arcane_shot' }],
            runtime: { everyNth: 3, primaryDamagePct: 0.35, cleavePct: 0.5, targetCap: 2 },
          },
        },
        {
          id: 'hun_r20_chain_reaction',
          name: 'Chain Reaction',
          description:
            'Frostjaw Trap marks enemies within 4 yards for 8 sec. Your next 3 Focus spenders echo 40% damage between marked enemies.',
          icon: 'frostjaw_trap',
          effect: {
            ability: [{ ability: 'frostjaw_trap' }],
            runtime: { radius: 4, markDuration: 8, charges: 3, echoPct: 0.4 },
          },
        },
        {
          id: 'hun_r20_fang_chorus',
          name: 'Fang Chorus',
          description:
            'Each Focus spender commands a 50%-strength pet echo. Every 3rd echo becomes a 4 yd clap.',
          icon: 'tame_beast',
          effect: {
            ability: [{ ability: 'arcane_shot' }],
            runtime: { echoPct: 0.5, everyNth: 3, radius: 4 },
          },
        },
      ],
    },
  ],
};

export const ROGUE_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'opening_rotation',
      decision: 'Wicked Slash cadence vs Craven Thrust weave vs opener energy',
      options: [
        {
          id: 'rog_r5_relentless_strikes',
          name: 'Ceaseless Cuts',
          description: 'Every 3rd Wicked Slash restores 30 energy.',
          icon: 'sinister_strike',
          effect: {
            proc: {
              id: 'rog_ceaseless_cuts',
              name: 'Ceaseless Cuts',
              trigger: { on: 'castNth', n: 3, abilities: ['sinister_strike'] },
              responses: [{ kind: 'resource', amount: 30, resourceType: 'energy' }],
            },
          },
        },
        {
          id: 'rog_r5_improved_backstab',
          name: "Knife's Dividend",
          description: 'Craven Thrust makes your next Dirt Nap within 6 sec cost 50% less energy.',
          icon: 'backstab',
          effect: {
            proc: {
              id: 'rog_improved_backstab',
              name: "Knife's Dividend",
              trigger: { on: 'castNth', n: 1, abilities: ['backstab'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: ['eviscerate'],
                  duration: 6,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
        {
          id: 'rog_r5_opportunist',
          name: 'Dusk Dividend',
          description: "Using Lurker's Strike or Throat Wire restores 20 energy.",
          icon: 'ambush',
          effect: {
            proc: {
              id: 'rog_dusk_dividend',
              name: 'Dusk Dividend',
              trigger: { on: 'castNth', n: 1, abilities: ['ambush', 'garrote'] },
              responses: [{ kind: 'resource', amount: 20, resourceType: 'energy' }],
            },
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'control',
      decision: 'evasive smoke vs Eye Jab follow-up vs Low Blow energy refund',
      options: [
        {
          id: 'rog_r8_smoke_screen',
          name: 'Smoke Screen',
          description: 'Grants Smoke Screen: a cloud that raises your dodge by 30% for 8 sec.',
          icon: 'smoke_screen',
          effect: { grant: { ability: 'smoke_screen' } },
        },
        {
          id: 'rog_r8_improved_gouge',
          name: 'Blindside Opening',
          description: 'Eye Jab makes your next Craven Thrust within 6 sec free.',
          icon: 'gouge',
          effect: {
            proc: {
              id: 'rog_blindside_opening',
              name: 'Blindside Opening',
              trigger: { on: 'castNth', n: 1, abilities: ['gouge'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_free',
                  abilities: ['backstab'],
                  duration: 6,
                },
              ],
            },
          },
        },
        {
          id: 'rog_r8_improved_kidney_shot',
          name: 'Paid in Pain',
          description: 'Low Blow restores 15 energy when used.',
          icon: 'kidney_shot',
          effect: {
            proc: {
              id: 'rog_improved_low_blow',
              name: 'Paid in Pain',
              trigger: { on: 'castNth', n: 1, abilities: ['kidney_shot'] },
              responses: [{ kind: 'resource', amount: 15 }],
            },
          },
        },
      ],
    },
    {
      level: 11,
      theme: 'cooldown_tempo',
      decision: 'full cooldown reset vs stored escape charges vs builder-fed free tempo',
      options: [
        {
          id: 'rog_r11_preparation',
          name: 'Contingency',
          description: 'Grants Contingency.',
          icon: 'preparation',
          effect: { grant: { ability: 'preparation' } },
        },
        {
          id: 'rog_r11_endurance',
          name: 'Second Exit',
          description: 'Swift Heels and Ghostfoot each store 2 uses.',
          icon: 'sprint',
          effect: {
            ability: [
              { ability: 'sprint', bonusCharges: 1 },
              { ability: 'evasion', bonusCharges: 1 },
            ],
          },
        },
        {
          id: 'rog_r11_improved_slice_and_dice',
          name: 'Borrowed Tempo',
          description: 'Every 3rd builder makes your next Cutthroat Tempo within 8 sec free.',
          icon: 'slice_and_dice',
          effect: {
            proc: {
              id: 'rog_improved_cutthroat_tempo',
              name: 'Borrowed Tempo',
              trigger: {
                on: 'castNth',
                n: 3,
                abilities: rogueBuilderAbilityIds,
              },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_free',
                  abilities: ['slice_and_dice'],
                  duration: 8,
                },
              ],
            },
          },
        },
      ],
    },
    {
      level: 14,
      theme: 'combo_engine',
      decision: 'two-finisher builder discount vs evasive strike vs poison-fed energy',
      options: [
        {
          id: 'rog_r14_seal_fate',
          name: 'Final Notice',
          description:
            'Each Dirt Nap or Bleed Out makes your next builder within 8 sec cost 50% less energy.',
          icon: 'eviscerate',
          effect: {
            proc: {
              id: 'rog_final_notice',
              name: 'Final Notice',
              trigger: { on: 'castNth', n: 1, abilities: ['eviscerate', 'rupture'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: rogueBuilderAbilityIds,
                  duration: 8,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
        {
          id: 'rog_r14_ghostly_strike',
          name: 'Wraith Strike',
          description: 'Grants Wraith Strike.',
          icon: 'ghostly_strike',
          effect: { grant: { ability: 'ghostly_strike' } },
        },
        {
          // Balance pass: was a flat 5 energy on EVERY poisoned auto (a
          // permanent ~40% passive energy-regen boost on dual-wield swing
          // rates). Now the Combat Potency shape: chance-based.
          id: 'rog_r14_deadly_brew',
          name: 'Venom Dividend',
          description:
            'Landed melee auto-attacks with an active poison have a 20% chance to restore 10 energy.',
          icon: 'deadly_poison',
          effect: {
            proc: {
              id: 'rog_deadly_brew',
              name: 'Venom Dividend',
              trigger: { on: 'meleeSwingWhile', auraKind: 'imbue', chance: 0.2 },
              responses: [{ kind: 'resource', amount: 10 }],
            },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'survival_escape',
      decision: 'spell defense vs Ghostfoot burst energy vs lethal-hit insurance',
      options: [
        {
          id: 'rog_r17_cloak_of_shadows',
          name: 'Shadecloak',
          description: 'Grants Shadecloak.',
          icon: 'cloak_of_shadows',
          effect: { grant: { ability: 'cloak_of_shadows' } },
        },
        {
          id: 'rog_r17_improved_evasion',
          name: 'Ghostfoot Gambit',
          description:
            'Ghostfoot restores 30 energy and makes your next builder within 8 sec cost 50% less energy.',
          icon: 'evasion',
          effect: {
            proc: {
              id: 'rog_improved_evasion',
              name: 'Ghostfoot Gambit',
              trigger: { on: 'castNth', n: 1, abilities: ['evasion'] },
              responses: [
                { kind: 'resource', amount: 30 },
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: rogueBuilderAbilityIds,
                  duration: 8,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
        {
          id: 'rog_r17_cheat_death',
          name: 'Borrowed Breath',
          description:
            'A blow that would kill you leaves you at 1 health instead. Once every 120 sec.',
          icon: 'vanish',
          effect: { global: { cheatDeathIcd: 120 } },
        },
      ],
    },
    {
      level: 20,
      theme: 'capstone_execution',
      decision: 'target teleport vs finisher-fed haste cooldown vs opener-fed finisher discount',
      options: [
        {
          id: 'rog_r20_shadowstep',
          name: 'Shadeslip',
          description: 'Grants Shadeslip.',
          icon: 'shadowstep',
          effect: { grant: { ability: 'shadowstep' } },
        },
        {
          id: 'rog_r20_adrenaline_junkie',
          name: 'Redline Habit',
          description: "Each finisher reduces Quickened Blood's cooldown by 6 sec.",
          icon: 'adrenaline_rush',
          effect: {
            proc: {
              id: 'rog_adrenaline_junkie',
              name: 'Redline Habit',
              trigger: { on: 'castNth', n: 1, abilities: rogueFinisherAbilityIds },
              responses: [{ kind: 'cooldownRefund', ability: 'adrenaline_rush', seconds: 6 }],
            },
          },
        },
        {
          id: 'rog_r20_master_assassin',
          name: 'First Cut, Last Word',
          description: 'Each opener makes your next finisher within 6 sec cost 50% less energy.',
          icon: 'ambush',
          effect: {
            proc: {
              id: 'rog_master_assassin',
              name: 'First Cut, Last Word',
              trigger: { on: 'castNth', n: 1, abilities: ['ambush', 'garrote', 'cheap_shot'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: rogueFinisherAbilityIds,
                  duration: 6,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
      ],
    },
  ],
};

export const PRIEST_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'faith',
      decision: 'Scouring Hymn cadence vs prayer-cadence ward vs Dirge-gated Mindfracture damage',
      options: [
        {
          id: 'pri_r5_improved_renew',
          name: 'Warding Refrain',
          description:
            'Every 3rd Whispered Prayer hardens its target into a ward absorbing 40 damage for 10 sec.',
          icon: 'lesser_heal',
          effect: {
            proc: {
              id: 'pri_lingering_ward',
              name: 'Warding Refrain',
              trigger: { on: 'castNth', n: 3, abilities: ['lesser_heal'] },
              responses: [{ kind: 'absorb', amount: 40, duration: 10, name: 'Warding Refrain' }],
            },
          },
        },
        {
          id: 'pri_r5_searing_light',
          name: 'Third Verse',
          description:
            'Every 3rd Scouring Hymn makes your next mana-cost healing spell within 8 sec free.',
          icon: 'smite',
          effect: {
            proc: {
              id: 'pri_searing_light',
              name: 'Third Verse',
              trigger: { on: 'castNth', n: 3, abilities: ['smite'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_free',
                  abilities: priestManaHealingAbilityIds,
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'pri_r5_twisted_faith',
          name: 'Dirgebound Thought',
          description:
            'Mindfracture deals 25% more damage to targets afflicted by your Dirge of Decay.',
          icon: 'shadow_word_pain',
          effect: {
            ability: [
              {
                ability: 'mind_blast',
                dmgPctVsDotted: 0.25,
                dmgPctVsDottedAbility: 'shadow_word_pain',
              },
            ],
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'intercession',
      decision: 'single-target silence vs area fear vs consumed-shield heal',
      options: [
        {
          id: 'pri_r8_improved_shield',
          name: 'Shattered Psalm',
          description:
            'When your Psalm of Warding is fully consumed, it bursts, healing its owner for 45.',
          icon: 'power_word_shield',
          effect: {
            proc: {
              id: 'pri_shield_burst',
              name: 'Shattered Psalm',
              trigger: { on: 'shieldConsumed', ability: 'power_word_shield' },
              responses: [{ kind: 'heal', amount: 45 }],
            },
          },
        },
        {
          id: 'pri_r8_silence',
          name: 'Hushword',
          description: 'Grants Hushword.',
          icon: 'silence',
          effect: { grant: { ability: 'silence' } },
        },
        {
          id: 'pri_r8_psychic_scream',
          name: 'Terror Canticle',
          description: 'Grants Terror Canticle.',
          icon: 'psychic_scream',
          effect: { grant: { ability: 'psychic_scream' } },
        },
      ],
    },
    {
      level: 11,
      theme: 'discipline',
      decision: 'on-demand free cast vs healing-cadence discount vs Mindfracture leech',
      options: [
        {
          id: 'pri_r11_inner_focus',
          name: 'Stilled Mind',
          description: 'Grants Stilled Mind.',
          icon: 'inner_focus',
          effect: { grant: { ability: 'inner_focus' } },
        },
        {
          id: 'pri_r11_meditation',
          name: 'Measured Mercy',
          description:
            'Every 3rd mana-cost healing spell makes your next mana-cost healing spell within 10 sec cost 50% less.',
          icon: 'lesser_heal',
          effect: {
            proc: {
              id: 'pri_nocturns',
              name: 'Measured Mercy',
              trigger: {
                on: 'castNth',
                n: 3,
                abilities: priestManaHealingAbilityIds,
              },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: priestManaHealingAbilityIds,
                  duration: 10,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
        {
          id: 'pri_r11_vampiric_embrace',
          name: 'Gloam Siphon',
          description:
            'Mindfracture also afflicts the target for 30 damage over 3 sec, ticking every 1 sec and healing you for 100% of it.',
          icon: 'mind_blast',
          effect: {
            ability: [
              {
                ability: 'mind_blast',
                addEffects: [{ type: 'dot', total: 30, duration: 3, interval: 1, leechPct: 1 }],
              },
            ],
          },
        },
      ],
    },
    {
      level: 14,
      theme: 'investment',
      decision: 'banked Mindfractures vs emergency heal echo vs extended decay',
      options: [
        {
          id: 'pri_r14_mind_melt',
          name: 'Twin Fracture',
          description: 'Mindfracture stores 2 uses.',
          icon: 'mind_blast',
          effect: { ability: [{ ability: 'mind_blast', bonusCharges: 1 }] },
        },
        {
          id: 'pri_r14_greater_heal',
          name: 'Mercy Deferred',
          description:
            'Solemn Prayer leaves an echo for 10 sec: if the target falls below 35% health, they are instantly healed for 60.',
          icon: 'heal',
          effect: {
            proc: {
              id: 'pri_heal_echo',
              name: 'Mercy Deferred',
              trigger: { on: 'castNth', n: 1, abilities: ['heal'] },
              responses: [
                { kind: 'echo', belowFrac: 0.35, window: 10, heal: 60, name: 'Mercy Deferred' },
              ],
            },
          },
        },
        {
          id: 'pri_r14_pain_and_suffering',
          name: 'Endless Dirge',
          description:
            'Each Litany of Woe tick extends your Dirge of Decay on the target by 1 sec, up to 6 added sec.',
          icon: 'mind_flay',
          effect: {
            ability: [
              {
                ability: 'mind_flay',
                addEffects: [
                  { type: 'extendDot', dot: 'shadow_word_pain', seconds: 1, maxBonus: 6 },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'resilience',
      decision: 'instant self-heal vs stronger party fortitude vs reactive ward',
      options: [
        {
          id: 'pri_r17_desperate_prayer',
          name: 'Last Prayer',
          description: 'Grants Last Prayer.',
          icon: 'desperate_prayer',
          effect: { grant: { ability: 'desperate_prayer' } },
        },
        {
          id: 'pri_r17_improved_fortitude',
          name: 'Resolve Unbroken',
          description:
            'Litany of Resolve effect increased by 50%, granting your party 7.5% Stamina instead of 5%.',
          icon: 'power_word_fortitude',
          effect: { ability: [{ ability: 'power_word_fortitude', buffPct: 0.5 }] },
        },
        {
          id: 'pri_r17_inner_fire',
          name: 'Wounded Halo',
          description:
            'Taking a hit for at least 15% of your maximum health kindles a ward absorbing 15% of your maximum health for 10 sec. 20 sec internal cooldown.',
          icon: 'power_word_shield',
          effect: {
            proc: {
              id: 'pri_inner_fire',
              name: 'Wounded Halo',
              trigger: { on: 'bigHitTaken', hpFrac: 0.15, icd: 20 },
              responses: [
                { kind: 'absorb', amountPctMaxHp: 0.15, duration: 10, name: 'Wounded Halo' },
              ],
            },
          },
        },
      ],
    },
    {
      level: 20,
      theme: 'prayer',
      decision: 'party healing vs area shadow damage vs critical-heal wards',
      options: [
        {
          id: 'pri_r20_prayer_of_healing',
          name: 'Choirmend',
          description: 'Grants Choirmend.',
          icon: 'prayer_of_healing',
          effect: { grant: { ability: 'prayer_of_healing' } },
        },
        {
          id: 'pri_r20_mind_sear',
          name: 'Thoughtburn',
          description: 'Grants Thoughtburn.',
          icon: 'mind_sear',
          effect: { grant: { ability: 'mind_sear' } },
        },
        {
          id: 'pri_r20_blessed_recovery',
          name: 'Halo Aftershock',
          description:
            'Critical heals from Whispered Prayer, Solemn Prayer, Urgent Prayer, Sunburst Canticle, and Choirmend also ward the target, absorbing 50 damage for 10 sec.',
          icon: 'flash_heal',
          effect: {
            proc: {
              id: 'pri_blessed_recovery',
              name: 'Halo Aftershock',
              trigger: {
                on: 'spellCrit',
                abilities: ['lesser_heal', 'heal', 'flash_heal', 'holy_nova', 'prayer_of_healing'],
              },
              responses: [{ kind: 'absorb', amount: 50, duration: 10, name: 'Halo Aftershock' }],
            },
          },
        },
      ],
    },
  ],
};

export const SHAMAN_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'elements',
      decision: 'Arc Bolt-fed free jolt vs reflected-hit instant bolt vs imbued sustain',
      options: [
        {
          id: 'sha_r5_concussion',
          name: 'Fault Line',
          description:
            'Every 3rd Arc Bolt makes your next Earthen Jolt, Cinder Jolt, or Rime Jolt within 8 sec free.',
          icon: 'lightning_bolt',
          effect: {
            proc: {
              id: 'sha_fault_line',
              name: 'Fault Line',
              trigger: { on: 'castNth', n: 3, abilities: ['lightning_bolt'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_free',
                  abilities: ['earth_shock', 'flame_shock', 'frost_shock'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'sha_r5_improved_lightning_shield',
          name: 'Rebounding Current',
          description:
            'When your Thunder Ward reflects a strike, your next Arc Bolt within 8 sec is instant.',
          icon: 'lightning_shield',
          effect: {
            proc: {
              id: 'sha_ward_surge',
              name: 'Rebounding Current',
              trigger: { on: 'thornsReflect', ability: 'lightning_shield' },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['lightning_bolt'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'sha_r5_imbue_mastery',
          name: 'Imbued Lifeblood',
          description: 'Each landed melee auto-attack with an active weapon imbue heals you for 8.',
          icon: 'rockbiter_weapon',
          effect: {
            proc: {
              id: 'sha_imbued_lifeblood',
              name: 'Imbued Lifeblood',
              trigger: { on: 'meleeSwingWhile', auraKind: 'imbue' },
              responses: [{ kind: 'heal', amount: 8 }],
            },
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'jolts',
      decision: 'interrupting Earthen Jolt vs rooting Rime Jolt vs Jolt-fed mana',
      options: [
        {
          id: 'sha_r8_improved_earth_shock',
          name: 'Fault Rebuke',
          description: 'Earthen Jolt also interrupts spellcasting for a 2 sec school lockout.',
          icon: 'earth_shock',
          effect: {
            ability: [{ ability: 'earth_shock', addEffects: [{ type: 'interrupt', lockout: 2 }] }],
          },
        },
        {
          id: 'sha_r8_frost_bind',
          name: 'Rime Lock',
          description: 'Rime Jolt also roots the target for 2 sec.',
          icon: 'frost_shock',
          effect: {
            ability: [{ ability: 'frost_shock', addEffects: [{ type: 'root', duration: 2 }] }],
          },
        },
        {
          id: 'sha_r8_shock_efficiency',
          name: 'Returning Current',
          description: 'Every 3rd Jolt restores 30 mana.',
          icon: 'earth_shock',
          effect: {
            proc: {
              id: 'sha_returning_current',
              name: 'Returning Current',
              trigger: {
                on: 'castNth',
                n: 3,
                abilities: ['earth_shock', 'flame_shock', 'frost_shock'],
              },
              responses: [{ kind: 'resource', amount: 30, resourceType: 'mana' }],
            },
          },
        },
      ],
    },
    {
      level: 11,
      theme: 'attunement',
      decision: 'heal-crit tempo vs bolt-crit tempo vs healing-over-time spring',
      options: [
        {
          id: 'sha_r11_ancestral_guidance',
          name: 'Guiding Spirits',
          description:
            'When your Mending Waters critically heals, your next Mending Waters within 10 sec is instant.',
          icon: 'healing_wave',
          effect: {
            proc: {
              id: 'sha_guiding_spirits',
              name: 'Guiding Spirits',
              trigger: { on: 'spellCrit', abilities: ['healing_wave'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['healing_wave'],
                  duration: 10,
                },
              ],
            },
          },
        },
        {
          id: 'sha_r11_elemental_attunement',
          name: 'Sky Echo',
          description: 'Arc Bolt critical strikes make your next Arc Bolt within 8 sec instant.',
          icon: 'lightning_bolt',
          effect: {
            proc: {
              id: 'sha_elemental_attunement',
              name: 'Sky Echo',
              school: 'nature',
              trigger: { on: 'spellCrit', abilities: ['lightning_bolt'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['lightning_bolt'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'sha_r11_healing_stream',
          name: 'Springwell',
          description: 'Grants Springwell.',
          icon: 'healing_stream',
          effect: { grant: { ability: 'healing_stream' } },
        },
      ],
    },
    {
      level: 14,
      theme: 'storm',
      decision: 'area lightning vs DoT detonation vs imbued-melee Jolt cooldowns',
      options: [
        {
          id: 'sha_r14_chain_lightning',
          name: 'Skybranch',
          description: 'Grants Skybranch.',
          icon: 'chain_lightning',
          effect: { grant: { ability: 'chain_lightning' } },
        },
        {
          id: 'sha_r14_improved_flame_shock',
          name: 'Cinder Rupture',
          description:
            'Earthen Jolt detonates your Cinder Jolt on the target, dealing its remaining damage instantly.',
          icon: 'flame_shock',
          effect: {
            ability: [
              { ability: 'earth_shock', addEffects: [{ type: 'consumeDot', dot: 'flame_shock' }] },
            ],
          },
        },
        {
          id: 'sha_r14_weapon_fury',
          name: 'Imbued Tempo',
          description:
            'Landed melee auto-attacks with an imbued weapon shave 0.5 sec off your Jolt cooldowns.',
          icon: 'stormstrike',
          effect: {
            proc: {
              id: 'sha_weapon_fury',
              name: 'Imbued Tempo',
              trigger: { on: 'meleeSwingWhile', auraKind: 'imbue' },
              responses: [
                { kind: 'cooldownRefund', ability: 'earth_shock', seconds: 0.5 },
                { kind: 'cooldownRefund', ability: 'flame_shock', seconds: 0.5 },
                { kind: 'cooldownRefund', ability: 'frost_shock', seconds: 0.5 },
              ],
            },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'warding',
      decision: 'ground root vs instant travel form vs reactive absorb',
      options: [
        {
          id: 'sha_r17_earthbind',
          name: 'Gripping Earth',
          description: 'Grants Gripping Earth.',
          icon: 'earthbind',
          effect: { grant: { ability: 'earthbind' } },
        },
        {
          id: 'sha_r17_improved_ghost_wolf',
          name: 'Wolfstep',
          description: 'Shadewolf becomes instant.',
          icon: 'ghost_wolf',
          effect: { ability: [{ ability: 'ghost_wolf', castPct: -1 }] },
        },
        {
          // Phase-2 defensive pass: the copy-paste shield becomes the shaman
          // flavor: the ancestors knit the wound shut on the spot.
          id: 'sha_r17_elemental_warding',
          name: 'Ancestral Mending',
          description:
            'Taking a hit for at least 15% of your maximum health instantly heals you for 12% of your maximum health. 20 sec internal cooldown.',
          icon: 'lightning_shield',
          effect: {
            proc: {
              id: 'sha_elemental_warding',
              name: 'Ancestral Mending',
              trigger: { on: 'bigHitTaken', hpFrac: 0.15, icd: 20 },
              responses: [{ kind: 'heal', amountPctMaxHp: 0.12 }],
            },
          },
        },
      ],
    },
    {
      level: 20,
      theme: 'ascendance',
      decision: 'party haste vs crit-fed Jolt burst vs emergency healing echoes',
      options: [
        {
          id: 'sha_r20_bloodlust',
          name: 'Storm Chorus',
          description: 'Grants Storm Chorus.',
          icon: 'bloodlust',
          effect: { grant: { ability: 'bloodlust' } },
        },
        {
          id: 'sha_r20_elemental_fury',
          name: 'Storm Recall',
          description:
            "Arc Bolt critical strikes finish Earthen Jolt's cooldown and make your next Earthen Jolt within 8 sec free.",
          icon: 'lightning_bolt',
          effect: {
            proc: {
              id: 'sha_storm_recall',
              name: 'Storm Recall',
              school: 'nature',
              trigger: { on: 'spellCrit', abilities: ['lightning_bolt'] },
              responses: [
                { kind: 'cooldownRefund', ability: 'earth_shock', seconds: 'reset' },
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_free',
                  abilities: ['earth_shock'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'sha_r20_tidal_waves',
          name: 'Undertow Promise',
          description:
            'Every 3rd Mending Waters leaves an echo for 10 sec: if the target falls below 35% health, the echo heals them for 80.',
          icon: 'healing_wave',
          effect: {
            proc: {
              id: 'sha_undertow_promise',
              name: 'Undertow Promise',
              trigger: { on: 'castNth', n: 3, abilities: ['healing_wave'] },
              responses: [
                { kind: 'echo', belowFrac: 0.35, window: 10, heal: 80, name: 'Undertow Promise' },
              ],
            },
          },
        },
      ],
    },
  ],
};

export const WARLOCK_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'malefic_cadence',
      decision: 'Gloom-to-Blackrot cadence vs Blackrot control vs stronger Burning Pact',
      options: [
        {
          id: 'wlk_r5_bane',
          name: 'Grave Rhythm',
          description: 'Every 3rd Gloom Bolt makes your next Blackrot within 8 sec instant.',
          icon: 'shadow_bolt',
          effect: {
            proc: {
              id: 'wlk_grave_rhythm',
              name: 'Grave Rhythm',
              trigger: { on: 'castNth', n: 3, abilities: ['shadow_bolt'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['corruption'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'wlk_r5_improved_corruption',
          name: 'Blacktide',
          description: 'Blackrot also slows its target by 30% for 6 sec.',
          icon: 'corruption',
          effect: {
            ability: [
              { ability: 'corruption', addEffects: [{ type: 'slow', mult: 0.7, duration: 6 }] },
            ],
          },
        },
        {
          // Balance pass: was Pact Reversal, one of FOUR instant-Gloom-Bolt
          // relays. Now the fire lane's flat damage talent (Improved Immolate
          // shape).
          id: 'wlk_r5_improved_immolate',
          name: 'Pact Deepened',
          description: 'Burning Pact deals 20% more damage.',
          icon: 'immolate',
          effect: { ability: [{ ability: 'immolate', dmgPct: 0.2 }] },
        },
      ],
    },
    {
      level: 8,
      theme: 'control',
      decision: 'magic devour vs area fear vs sustained slow',
      options: [
        {
          id: 'wlk_r8_voidfeast',
          name: 'Voidfeast',
          description: 'Grants Voidfeast: devour a magic effect and heal yourself.',
          icon: 'voidfeast',
          effect: { grant: { ability: 'voidfeast' } },
        },
        {
          id: 'wlk_r8_howl_of_terror',
          name: 'Dread Chorus',
          description: 'Grants Dread Chorus.',
          icon: 'howl_of_terror',
          effect: { grant: { ability: 'howl_of_terror' } },
        },
        {
          id: 'wlk_r8_curse_of_exhaustion',
          name: 'Leaden Hex',
          description: 'Grants Leaden Hex.',
          icon: 'curse_of_exhaustion',
          effect: { grant: { ability: 'curse_of_exhaustion' } },
        },
      ],
    },
    {
      level: 11,
      theme: 'dark_sustenance',
      decision: 'richer Hard Bargain vs mobile Consume vs reactive ward',
      options: [
        {
          // Balance pass: was an every-tap instant-bolt relay (a free, no
          // cooldown trigger made every Gloom Bolt in the game instant). Now
          // the classic Improved Life Tap.
          id: 'wlk_r11_improved_life_tap',
          name: 'Blood Credit',
          description: 'Hard Bargain grants 20% more mana.',
          icon: 'life_tap',
          effect: { ability: [{ ability: 'life_tap', buffPct: 0.2 }] },
        },
        {
          id: 'wlk_r11_fel_concentration',
          name: 'Walking Hunger',
          description: 'Consume is channelable while moving.',
          icon: 'drain_life',
          effect: { ability: [{ ability: 'drain_life', castWhileMoving: true }] },
        },
        {
          // Phase-2 defensive pass: the copy-paste shield becomes a demonic
          // safety net: the pact pays out only if the beating continues.
          id: 'wlk_r11_demon_armor',
          name: 'Fiendward',
          description:
            'Taking a hit for at least 15% of your maximum health binds your demon to you for 10 sec: if you fall below 35% health, it heals you for 15% of your maximum health. 20 sec internal cooldown.',
          icon: 'demon_skin',
          effect: {
            proc: {
              id: 'wlk_demon_armor',
              name: 'Fiendward',
              trigger: { on: 'bigHitTaken', hpFrac: 0.15, icd: 20 },
              responses: [
                {
                  kind: 'echo',
                  belowFrac: 0.35,
                  window: 10,
                  healPctMaxHp: 0.15,
                  name: 'Fiendward',
                },
              ],
            },
          },
        },
      ],
    },
    {
      level: 14,
      theme: 'school_weaving',
      decision: 'DoT-fed bolt damage vs harder Sear vs fire-fed shadow discount',
      options: [
        {
          id: 'wlk_r14_amplify_curse',
          name: 'Deepened Hex',
          description: 'Gloom Bolt deals 20% more damage to targets afflicted by your DoTs.',
          icon: 'curse_of_agony',
          effect: { ability: [{ ability: 'shadow_bolt', dmgPctVsDotted: 0.2 }] },
        },
        {
          // Balance pass: was Ashen Relay (bolt-fed instant Burning Pact).
          // Now a Sear lane talent for the school-weaving row.
          id: 'wlk_r14_ruin',
          name: 'Ashen Focus',
          description: 'Sear deals 25% more damage and costs 25% less.',
          icon: 'shadowburn',
          effect: { ability: [{ ability: 'searing_pain', dmgPct: 0.25, costPct: -0.25 }] },
        },
        {
          id: 'wlk_r14_shadow_mastery',
          name: 'Shadow Credit',
          description:
            'Each damaging Fire spell makes your next damaging Shadow spell within 8 sec cost 50% less.',
          icon: 'shadow_bolt',
          effect: {
            proc: {
              id: 'wlk_umbral_mastery',
              name: 'Shadow Credit',
              trigger: { on: 'castNth', n: 1, abilities: warlockDamagingFireSpellAbilityIds },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: warlockDamagingShadowSpellAbilityIds,
                  duration: 8,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'under_pressure',
      decision: 'instant horror vs snap Harrow vs reactive self-heal',
      options: [
        {
          id: 'wlk_r17_death_coil',
          name: 'Morrowlash',
          description: 'Grants Morrowlash.',
          icon: 'death_coil',
          effect: { grant: { ability: 'death_coil' } },
        },
        {
          // Balance pass: was Cruel Awakening (every Harrow armed an instant
          // bolt: fear, bolt breaks it, re-fear, forever). New talent in the
          // slot on the Snap Bewitch precedent: instant cast, real cooldown.
          id: 'wlk_r17_improved_fear',
          name: 'Snapdread',
          description: 'Harrow becomes instant but gains a 16 sec cooldown.',
          icon: 'fear',
          effect: { ability: [{ ability: 'fear', castPct: -1, cooldownFlat: 16 }] },
        },
        {
          // Phase-2 defensive pass: the second warlock panic response becomes
          // proactive leech sustain instead (Consume heals 100% of damage, so
          // the damage boost is the healing boost).
          id: 'wlk_r17_demonic_resilience',
          name: 'Deep Hunger',
          description: 'Consume deals 50% more damage.',
          icon: 'demon_skin',
          effect: { ability: [{ ability: 'drain_life', dmgPct: 0.5 }] },
        },
      ],
    },
    {
      level: 20,
      theme: 'final_pact',
      decision: 'direct chaos burst vs damaging-cast ward vs curse-fed instant bolt',
      options: [
        {
          id: 'wlk_r20_chaos_bolt',
          name: 'Ruinbolt',
          description: 'Grants Ruinbolt.',
          icon: 'chaos_bolt',
          effect: { grant: { ability: 'chaos_bolt' } },
        },
        {
          id: 'wlk_r20_grimoire_of_haste',
          name: 'Hellglass Ward',
          description:
            'Every 3rd damaging Fire or Shadow spell raises a demonic ward absorbing 90 damage for 10 sec.',
          icon: 'summon_felhound',
          effect: {
            proc: {
              id: 'wlk_grimoire_of_carnage',
              name: 'Hellglass Ward',
              trigger: {
                on: 'castNth',
                n: 3,
                abilities: warlockDamagingFireOrShadowSpellAbilityIds,
              },
              responses: [{ kind: 'absorb', amount: 90, duration: 10, name: 'Hellglass Ward' }],
            },
          },
        },
        {
          // Balance pass: Hexstorm survives as the warlock's ONE instant-bolt
          // proc, now behind an internal cooldown.
          id: 'wlk_r20_curse_mastery',
          name: 'Hexstorm',
          description:
            'Every 3rd Blackrot or Hex of Anguish makes your next Gloom Bolt within 8 sec instant, at most once every 10 sec.',
          icon: 'curse_of_agony',
          effect: {
            proc: {
              id: 'wlk_curse_mastery',
              name: 'Hexstorm',
              trigger: {
                on: 'castNth',
                n: 3,
                abilities: ['corruption', 'curse_of_agony'],
                icd: 10,
              },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['shadow_bolt'],
                  duration: 8,
                },
              ],
            },
          },
        },
      ],
    },
  ],
};

export const DRUID_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'opening_cycles',
      decision: 'Wildbolt spell cycle vs Wolf Form opener vs Wildbloom healing payoff',
      options: [
        {
          id: 'dru_r5_improved_wrath',
          name: 'Moonkindle',
          description: 'Every 3rd Wildbolt makes your next Lunar Tempest within 8 sec free.',
          icon: 'wrath',
          effect: {
            proc: {
              id: 'dru_improved_wildbolt',
              name: 'Moonkindle',
              trigger: { on: 'castNth', n: 3, abilities: ['wrath'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_free',
                  abilities: ['moonfire'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'dru_r5_ferocity',
          name: 'Redmaw',
          description:
            'Shifting into Wolf Form makes your next Rendclaw or Flense within 8 sec cost 50% less.',
          icon: 'claw',
          effect: {
            proc: {
              id: 'dru_redmaw',
              name: 'Redmaw',
              trigger: { on: 'castNth', n: 1, abilities: ['cat_form'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: ['claw', 'rake'],
                  duration: 8,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
        {
          id: 'dru_r5_natures_bounty',
          name: "Bloom's End",
          description:
            'When Wildbloom runs its full duration, your next Wildmend within 8 sec is instant.',
          icon: 'rejuvenation',
          effect: {
            proc: {
              id: 'dru_natures_bounty',
              name: "Bloom's End",
              trigger: { on: 'hotExpired', ability: 'rejuvenation' },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['healing_touch'],
                  duration: 8,
                },
              ],
            },
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'disruption',
      decision: 'area knockback vs root-to-spell setup vs Concuss rage and reset',
      options: [
        {
          id: 'dru_r8_typhoon',
          name: 'Typhoon',
          description: 'Grants Typhoon: knock back and daze all enemies within 8 yd.',
          icon: 'typhoon',
          effect: { grant: { ability: 'typhoon' } },
        },
        {
          // Balance pass: the root has no cooldown, so the instant Wildbolt
          // now sits behind an internal cooldown instead of chaining forever.
          id: 'dru_r8_improved_roots',
          name: 'Briar Ambush',
          description:
            'Gripping Roots makes your next Wildbolt within 8 sec instant, at most once every 15 sec.',
          icon: 'entangling_roots',
          effect: {
            proc: {
              id: 'dru_briar_ambush',
              name: 'Briar Ambush',
              trigger: { on: 'castNth', n: 1, abilities: ['entangling_roots'], icd: 15 },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['wrath'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'dru_r8_brutal_bash',
          name: 'Bruin Rebound',
          description:
            'Concuss restores 15 rage, refunding its 10 rage cost plus 5 additional rage, and removes 20 sec from its cooldown.',
          icon: 'bash',
          effect: {
            proc: {
              id: 'dru_brutal_bash',
              name: 'Bruin Rebound',
              trigger: { on: 'castNth', n: 1, abilities: ['bash'] },
              responses: [
                { kind: 'resource', amount: 15, resourceType: 'rage' },
                { kind: 'cooldownRefund', ability: 'bash', seconds: 20 },
              ],
            },
          },
        },
      ],
    },
    {
      level: 11,
      theme: 'renewal',
      decision: 'cross-form resource waves vs shapeshift attack discount vs healing cadence ward',
      options: [
        {
          id: 'dru_r11_innervate',
          name: 'Lifesap',
          description:
            'Grants Lifesap: living sap restores your current resource in waves, in any form.',
          icon: 'innervate',
          effect: { grant: { ability: 'innervate' } },
        },
        {
          id: 'dru_r11_furor',
          name: 'Formrush',
          description: 'Shapeshifting makes your next form attack within 8 sec cost 50% less.',
          icon: 'bear_form',
          effect: {
            proc: {
              id: 'dru_wildsurge',
              name: 'Formrush',
              trigger: {
                on: 'castNth',
                n: 1,
                abilities: ['bear_form', 'cat_form', 'travel_form'],
              },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: ['maul', 'swipe', 'claw', 'rake', 'ferocious_bite', 'rip'],
                  duration: 8,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
        {
          id: 'dru_r11_improved_mark',
          name: 'Grove Covenant',
          description: 'Every 3rd Wildmend shields its target, absorbing 90 damage for 10 sec.',
          icon: 'mark_of_the_wild',
          effect: {
            proc: {
              id: 'dru_grove_covenant',
              name: 'Grove Covenant',
              trigger: { on: 'castNth', n: 3, abilities: ['healing_touch'] },
              responses: [{ kind: 'absorb', amount: 90, duration: 10, name: 'Grove Covenant' }],
            },
          },
        },
      ],
    },
    {
      level: 14,
      theme: 'payoff_loops',
      decision: 'feral finisher cycle vs lunar instant cast vs emergency heal echo',
      options: [
        {
          id: 'dru_r14_savage_fury',
          name: 'Redtooth Rhythm',
          description:
            'Each Gorebite or Bloodrift makes your next Rendclaw or Flense within 8 sec cost 50% less.',
          icon: 'ferocious_bite',
          effect: {
            proc: {
              id: 'dru_savage_fury',
              name: 'Redtooth Rhythm',
              trigger: { on: 'castNth', n: 1, abilities: ['ferocious_bite', 'rip'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: ['claw', 'rake'],
                  duration: 8,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
        {
          // Balance pass: was n:1 off a no-cooldown instant, which made every
          // Skyfall in the game instant forever. Now every 3rd, behind an icd.
          id: 'dru_r14_moonfury',
          name: 'Moonspite',
          description:
            'Every 3rd Lunar Tempest makes your next Skyfall within 8 sec instant, at most once every 15 sec.',
          icon: 'moonfire',
          effect: {
            proc: {
              id: 'dru_moonspite',
              name: 'Moonspite',
              trigger: { on: 'castNth', n: 3, abilities: ['moonfire'], icd: 15 },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['starfire'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'dru_r14_empowered_touch',
          name: 'Mercy Seed',
          description:
            'Wildmend leaves a stored heal of 60 that triggers if the target falls below 35% health within 8 sec.',
          icon: 'healing_touch',
          effect: {
            proc: {
              id: 'dru_empowered_touch',
              name: 'Mercy Seed',
              trigger: { on: 'castNth', n: 1, abilities: ['healing_touch'] },
              responses: [
                { kind: 'echo', belowFrac: 0.35, window: 8, heal: 60, name: 'Mercy Seed' },
              ],
            },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'survival',
      decision: 'Oakhide-fed instant spell vs active bear healing vs hit-fed rage shield',
      options: [
        {
          id: 'dru_r17_improved_barkskin',
          name: 'Oaken Reflex',
          description:
            'Oakhide makes your next Wildbolt, Skyfall, Wildmend, or Second Bloom within 8 sec instant.',
          icon: 'barkskin',
          effect: {
            proc: {
              id: 'dru_improved_barkskin',
              name: 'Oaken Reflex',
              trigger: { on: 'castNth', n: 1, abilities: ['barkskin'] },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_instant',
                  abilities: ['wrath', 'starfire', 'healing_touch', 'regrowth'],
                  duration: 8,
                },
              ],
            },
          },
        },
        {
          id: 'dru_r17_frenzied_regeneration',
          name: 'Savage Mending',
          description: 'Grants Savage Mending.',
          icon: 'frenzied_regeneration',
          effect: { grant: { ability: 'frenzied_regeneration' } },
        },
        {
          // Phase-2 defensive pass: the rage kick stays (the least-lazy of the
          // old seven); the absorb scales with max health now.
          id: 'dru_r17_survival_of_the_fittest',
          name: 'Ironhide Reflex',
          description:
            'Taking a hit for at least 20% of your maximum health shields you, absorbing 15% of your maximum health for 6 sec. While in Bruin Form, it also restores 20 rage. 20 sec internal cooldown.',
          icon: 'bear_form',
          effect: {
            proc: {
              id: 'dru_survival_of_the_fittest',
              name: 'Ironhide Reflex',
              trigger: { on: 'bigHitTaken', hpFrac: 0.2, icd: 20 },
              responses: [
                { kind: 'resource', amount: 20, resourceType: 'rage' },
                { kind: 'absorb', amountPctMaxHp: 0.15, duration: 6, name: 'Ironhide Reflex' },
              ],
            },
          },
        },
      ],
    },
    {
      level: 20,
      theme: 'apex_harmony',
      decision: 'moonwing party crit vs feral burst vs party healing channel',
      options: [
        {
          // Balance pass round two (maintainer): Storm Refrain still read as a
          // dud, so the capstone is the party buff instead: Moonwing druids
          // radiate spell crit (combat/natures_fury.ts pulses it; the form
          // requirement is the whole point).
          id: 'dru_r20_improved_hurricane',
          name: "Nature's Fury",
          description:
            'While in Moonwing Form, you and your party members within 30 yd gain 3% spell critical strike chance.',
          icon: 'hurricane',
          effect: { global: { moonwingPartyCritPct: 0.03 } },
        },
        {
          id: 'dru_r20_berserk',
          name: 'Red Haze',
          description: 'Grants Red Haze.',
          icon: 'berserk',
          effect: { grant: { ability: 'berserk' } },
        },
        {
          id: 'dru_r20_tranquility',
          name: 'Gladesong',
          description: 'Grants Gladesong.',
          icon: 'tranquility',
          effect: { grant: { ability: 'tranquility' } },
        },
      ],
    },
  ],
};
