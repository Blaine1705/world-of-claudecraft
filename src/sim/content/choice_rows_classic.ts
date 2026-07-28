import type { ClassChoiceRows } from './talent_rows';

const rogueBuilderAbilityIds = [
  'sinister_strike',
  'body_blow', // Wicked Slash transformed inside the Redline window
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

const priestManaSpellAbilityIds = [
  'smite',
  'lesser_heal',
  'power_word_fortitude',
  'shadow_word_pain',
  'power_word_shield',
  'renew',
  'mind_blast',
  'heal',
  'mind_flay',
  'flash_heal',
  'scouring_mercy',
  'prayer_of_healing',
  'holy_nova',
  'seraphic_vigil',
  'summon_tithefiend',
  'silence',
  'psychic_scream',
  'veilstep',
  'power_infusion',
  'martyrs_aegis',
  'choir_of_deliverance',
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
            'A successful Pack Command, Measured Shot, or Gutting Strike grants 20% movement speed for 3 sec. 8 sec internal cooldown.',
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
            'After spending 75 Focus, your next Pack Command, Measured Shot, or Gutting Strike grants 20 additional Focus.',
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
            'Howling Rage, Cold Focus, or Bloodtrail Assault restores 40 Focus. Your next 3 Focus spenders cost 50% less and deal 20% more damage. These uses expire 4 sec after the triggering cooldown ends.',
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
            "Courser's Guise can trigger Pack Rally. You, your companion, and group or raid allies within 30 yards gain 30% movement speed and 10% attack, casting, and channeling speed for 10 sec. 90 sec cooldown.",
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
            'Every 3rd Fell Shot, Long Draw, or Woundrend deals 35% more damage to its target and 50% of that damage to up to 2 enemies within 5 yards.',
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
      theme: 'movement',
      decision: 'teleport strike vs kill momentum vs rotational speed',
      options: [
        {
          id: 'rog_r5_shadeslip',
          name: 'Shadeslip',
          description: 'Grants Shadeslip.',
          icon: 'shadowstep',
          effect: { grant: { ability: 'shadowstep' } },
        },
        {
          id: 'rog_r5_killers_pace',
          name: "Killer's Pace",
          description: 'Killing blows grant 40% movement speed for 6 sec.',
          icon: 'sprint',
          effect: { global: { onKillSpeedPct: 0.4 } },
        },
        {
          id: 'rog_r5_slipstream',
          name: 'Quickstep',
          description:
            'Landing Wicked Slash or Craven Thrust grants 20% movement speed for 2 sec. Once every 8 sec.',
          icon: 'sinister_strike',
          effect: {
            proc: {
              id: 'rog_slipstream',
              name: 'Quickstep',
              trigger: { on: 'castNth', n: 1, abilities: ['sinister_strike', 'backstab'], icd: 8 },
              responses: [
                {
                  kind: 'aura',
                  auraKind: 'buff_speed',
                  value: 1.2,
                  duration: 2,
                  name: 'Quickstep',
                },
              ],
            },
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'defense',
      decision: 'lethal insurance vs hardened Ghostfoot vs active cloud',
      options: [
        {
          id: 'rog_r8_borrowed_breath',
          name: 'Borrowed Breath',
          description:
            'A blow that would kill you leaves you at 1 health instead. Once every 120 sec.',
          icon: 'vanish',
          effect: { global: { cheatDeathIcd: 120 } },
        },
        {
          id: 'rog_r8_ghostfoot_ward',
          name: 'Ghostfoot Ward',
          description: 'Ghostfoot also reduces all damage you take by 30% while it is active.',
          icon: 'evasion',
          effect: {
            ability: [
              {
                ability: 'evasion',
                addEffects: [{ type: 'selfBuff', kind: 'shield_wall', value: 0.3, duration: 15 }],
              },
            ],
          },
        },
        {
          id: 'rog_r8_smoke_screen',
          name: 'Smoke Screen',
          description: 'Grants Smoke Screen: a cloud that raises your dodge by 30% for 8 sec.',
          icon: 'smoke_screen',
          effect: { grant: { ability: 'smoke_screen' } },
        },
      ],
    },
    {
      level: 11,
      theme: 'control',
      decision: 'stun payoff vs free utility CC vs mid-fight stun access',
      options: [
        {
          id: 'rog_r11_marked_prey',
          name: 'Marked Prey',
          description:
            'Enemies you stun with Gut Punch or Low Blow take 10% more damage from all attackers for 6 sec.',
          icon: 'kidney_shot',
          effect: {
            ability: [
              {
                ability: 'kidney_shot',
                addEffects: [
                  {
                    type: 'debuffTargetSource',
                    kind: 'vulnerability',
                    value: 0.1,
                    duration: 6,
                    auraId: 'marked_prey',
                    auraName: 'Marked Prey',
                  },
                ],
              },
              {
                ability: 'cheap_shot',
                addEffects: [
                  {
                    type: 'debuffTargetSource',
                    kind: 'vulnerability',
                    value: 0.1,
                    duration: 6,
                    auraId: 'marked_prey',
                    auraName: 'Marked Prey',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'rog_r11_foul_play',
          name: 'Foul Play',
          description:
            'Eye Jab and Sap cost no energy, and your own poisons and bleeds no longer break your Eye Jab.',
          icon: 'gouge',
          effect: {
            ability: [
              { ability: 'gouge', costPct: -1 },
              { ability: 'sap', costPct: -1 },
            ],
            global: { foulPlayGuard: 1 },
          },
        },
        {
          id: 'rog_r11_cheap_trick',
          name: 'Cheap Trick',
          description: 'Gut Punch no longer requires Duskveil.',
          icon: 'cheap_shot',
          effect: {
            ability: [{ ability: 'cheap_shot', ignoreStealthRequirement: true }],
          },
        },
      ],
    },
    {
      level: 14,
      theme: 'kit_management',
      decision: 'stealth economy vs poison economy vs builder rhythm',
      options: [
        {
          id: 'rog_r14_dusk_economy',
          name: 'Dusk Economy',
          description:
            'Abilities cost 50% less energy while in Duskveil or shadow-wreathed by the veil, and for 6 sec after leaving Duskveil.',
          icon: 'stealth',
          effect: { global: { duskEconomyPct: 0.5 } },
        },
        {
          // Balance pass: was a flat 5 energy on EVERY poisoned auto (a
          // permanent ~40% passive energy-regen boost on dual-wield swing
          // rates). Now the Combat Potency shape: chance-based, with an
          // internal cooldown so it cannot scale with attack speed into the
          // universally-best pick (the engines pass measured it paying the
          // fastest swinger most, inverting the row's spec flavors).
          id: 'rog_r14_venom_dividend',
          name: 'Venom Dividend',
          description:
            'Landed melee auto-attacks with an active poison have a 20% chance to restore 10 energy. Once every 2 sec.',
          icon: 'deadly_poison',
          effect: {
            proc: {
              id: 'rog_deadly_brew',
              name: 'Venom Dividend',
              trigger: { on: 'meleeSwingWhile', auraKind: 'imbue', chance: 0.2, icd: 2 },
              responses: [{ kind: 'resource', amount: 10 }],
            },
          },
        },
        {
          id: 'rog_r14_ceaseless_cuts',
          name: 'Ceaseless Cuts',
          // Wicked Slash is Thuggery's builder (Knifework thrusts, Skulduggery
          // ribbons), so this is the combat-flavored pick; tuned so it beats
          // the generic poison economy for the spec that actually slashes.
          // Body Blow counts: it IS Wicked Slash while the Redline window
          // runs, and the window starving itself would kill the sprint.
          description: 'Every 3rd Wicked Slash restores 50 energy.',
          icon: 'sinister_strike',
          effect: {
            proc: {
              id: 'rog_ceaseless_cuts',
              name: 'Ceaseless Cuts',
              trigger: { on: 'castNth', n: 3, abilities: ['sinister_strike', 'body_blow'] },
              responses: [{ kind: 'resource', amount: 50, resourceType: 'energy' }],
            },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'major_window',
      decision: 'personal cleave burst vs defense turned tempo vs party rally',
      options: [
        {
          id: 'rog_r17_flurry_of_knives',
          name: 'Flurry of Knives',
          description:
            'Grants Flurry of Knives: lash every enemy within 6 yd and gain 2 combo points.',
          icon: 'flurry_of_knives',
          effect: { grant: { ability: 'flurry_of_knives' } },
        },
        {
          id: 'rog_r17_ghostfoot_gambit',
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
          id: 'rog_r17_thieves_chorus',
          name: "Thieves' Chorus",
          description:
            "Grants Thieves' Chorus: your party attacks and casts 10% faster for 10 sec.",
          icon: 'thieves_chorus',
          effect: { grant: { ability: 'thieves_chorus' } },
        },
      ],
    },
    {
      level: 20,
      theme: 'capstone',
      decision: 'shadow echo vs marked target vs kill momentum',
      options: [
        {
          id: 'rog_r20_second_shadow',
          name: 'Second Shadow',
          description:
            'Dirt Nap cast at 5 combo points strikes again from the shadows for 75% of its damage.',
          icon: 'backstab',
          effect: { global: { secondShadowPct: 0.75 } },
        },
        {
          id: 'rog_r20_deathmark',
          name: 'Grave Brand',
          description:
            'Your Duskveil openers brand the target for 20 sec. You deal 12% more damage to the branded target.',
          icon: 'garrote',
          effect: {
            ability: [
              {
                ability: 'ambush',
                addEffects: [
                  {
                    type: 'debuffTargetSource',
                    kind: 'vuln_source',
                    value: 0.12,
                    duration: 20,
                    auraId: 'deathmark',
                    auraName: 'Grave Brand',
                  },
                ],
              },
              {
                ability: 'garrote',
                addEffects: [
                  {
                    type: 'debuffTargetSource',
                    kind: 'vuln_source',
                    value: 0.12,
                    duration: 20,
                    auraId: 'deathmark',
                    auraName: 'Grave Brand',
                  },
                ],
              },
              {
                ability: 'cheap_shot',
                addEffects: [
                  {
                    type: 'debuffTargetSource',
                    kind: 'vuln_source',
                    value: 0.12,
                    duration: 20,
                    auraId: 'deathmark',
                    auraName: 'Grave Brand',
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'rog_r20_kill_chain',
          name: 'Kill Chain',
          description: 'Killing blows refresh Smokestep and grant 5 combo points.',
          icon: 'vanish',
          effect: { global: { onKillCombo: 5, onKillVanishReset: 1 } },
        },
      ],
    },
  ],
};

export const PRIEST_CHOICE_ROWS: ClassChoiceRows = {
  rows: [
    {
      level: 5,
      theme: 'movement',
      decision: 'move a protected ally, escape control, or preserve casting while moving',
      options: [
        {
          id: 'pri_r5_improved_renew',
          name: 'Sheltering Step',
          description: 'Psalm of Warding grants its target 40% movement speed for 3 sec.',
          icon: 'power_word_shield',
          effect: {
            intrinsic: { mechanic: 'priest_sheltering_step', metrics: { pct: 0.4, duration: 3 } },
          },
        },
        {
          id: 'pri_r5_searing_light',
          name: 'Veil Unbound',
          description:
            'Veilstep removes roots and slows, then grants 50% movement speed for 3 sec.',
          icon: 'veilstep',
          effect: {
            intrinsic: { mechanic: 'priest_veil_unbound', metrics: { pct: 0.5, duration: 3 } },
          },
        },
        {
          id: 'pri_r5_twisted_faith',
          name: 'Processional Grace',
          description: 'Veilstep allows the Priest to cast while moving for 4 sec.',
          icon: 'veilstep',
          effect: {
            intrinsic: { mechanic: 'priest_processional_grace', metrics: { duration: 4 } },
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'defense',
      decision: 'active self recovery, prepared ally recovery, or reactive protection',
      options: [
        {
          id: 'pri_r17_desperate_prayer',
          name: 'Last Prayer',
          description: 'Learn Last Prayer, which instantly heals you for 30% of maximum health.',
          icon: 'desperate_prayer',
          effect: {
            grant: { ability: 'desperate_prayer' },
            intrinsic: { mechanic: 'priest_last_prayer', metrics: { pct: 0.3 } },
          },
        },
        {
          id: 'pri_r8_improved_shield',
          name: 'Shattered Psalm',
          description:
            'When Psalm of Warding is fully consumed, it heals its target for 12% maximum health.',
          icon: 'power_word_shield',
          effect: {
            proc: {
              id: 'pri_shield_burst',
              name: 'Shattered Psalm',
              trigger: { on: 'shieldConsumed', ability: 'power_word_shield' },
              responses: [{ kind: 'heal', amountPctMaxHp: 0.12 }],
            },
          },
        },
        {
          id: 'pri_r17_inner_fire',
          name: 'Wounded Halo',
          description:
            'A hit for at least 15% maximum health grants a 15% absorb for 10 sec. 20 sec internal cooldown.',
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
      level: 11,
      theme: 'control',
      decision: 'single-target stop, longer area control, or shield-fed pursuit control',
      options: [
        {
          id: 'pri_r8_silence',
          name: 'Hushword',
          description: 'Learn Hushword, which silences one enemy for 4 sec. 30 sec cooldown.',
          icon: 'silence',
          effect: { grant: { ability: 'silence' } },
        },
        {
          id: 'pri_r8_psychic_scream',
          name: 'Lingering Dread',
          description:
            "Reduces Terror Canticle's cooldown by 30%. Feared enemies remain 50% slowed for 4 sec.",
          icon: 'psychic_scream',
          effect: {
            ability: [{ ability: 'psychic_scream', cooldownPct: -0.3 }],
            intrinsic: { mechanic: 'priest_lingering_dread', metrics: { pct: 0.5, duration: 4 } },
          },
        },
        {
          id: 'pri_r11_vampiric_embrace',
          name: 'Binding Psalm',
          description:
            'An enemy that fully consumes Psalm of Warding is rooted for 2 sec, once per enemy every 12 sec.',
          icon: 'power_word_shield',
          effect: {
            intrinsic: { mechanic: 'priest_binding_psalm', metrics: { duration: 2, icd: 12 } },
          },
        },
      ],
    },
    {
      level: 14,
      theme: 'management',
      decision: 'protect one key spell, follow a mana rhythm, or deepen the spec relationship',
      options: [
        {
          id: 'pri_r11_inner_focus',
          name: 'Stilled Mind',
          description: 'Grants Stilled Mind. Your next Priest spell is free and uninterruptible.',
          icon: 'inner_focus',
          effect: { grant: { ability: 'inner_focus' } },
        },
        {
          id: 'pri_r11_meditation',
          name: 'Measured Faith',
          description:
            'Every 3rd Mana-spending Priest spell makes the next Priest spell within 10 sec cost 50% less Mana.',
          icon: 'lesser_heal',
          effect: {
            proc: {
              id: 'pri_measured_faith',
              name: 'Measured Faith',
              trigger: { on: 'castNth', n: 3, abilities: priestManaSpellAbilityIds },
              responses: [
                {
                  kind: 'empowerNext',
                  aura: 'next_cast_cheap',
                  abilities: priestManaSpellAbilityIds,
                  duration: 10,
                  costPct: 0.5,
                },
              ],
            },
          },
        },
        {
          id: 'pri_r14_pain_and_suffering',
          name: 'Living Covenant',
          description:
            'Doctrine damage-healing restores Psalm of Warding by 20% of the healing done, up to its original absorb. Benison turns Choirmend overhealing into a 10 sec absorb capped at 10% maximum health. Each Vespers Effigy echo extends Dirge of Decay by 1 sec, up to 6 sec per target.',
          icon: 'power_word_shield',
          effect: {
            intrinsic: {
              mechanic: 'priest_living_covenant',
              metrics: {
                doctrineShieldPct: 0.2,
                benisonAbsorbDuration: 10,
                benisonAbsorbCapPct: 0.1,
                vespersExtension: 1,
                vespersExtensionCap: 6,
              },
            },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'major prayer',
      decision: 'throughput, planned ally protection, or sustained group recovery',
      options: [
        {
          id: 'pri_r17_anointing',
          name: 'Anointing',
          description:
            'Learn Anointing, which grants one ally 20% more damage, healing, and casting speed for 15 sec. 120 sec cooldown.',
          icon: 'power_infusion',
          effect: { grant: { ability: 'power_infusion' } },
        },
        {
          id: 'pri_r17_martyrs_aegis',
          name: "Martyr's Aegis",
          description:
            "Learn Martyr's Aegis, which reduces one ally's incoming damage by 40% for 8 sec. 120 sec cooldown.",
          icon: 'martyrs_aegis',
          effect: { grant: { ability: 'martyrs_aegis' } },
        },
        {
          id: 'pri_r17_choir_of_deliverance',
          name: 'Choir of Deliverance',
          description:
            'Learn Choir of Deliverance. Channel for 6 sec, healing party members within 30 yards every 2 sec. 180 sec cooldown.',
          icon: 'choir_of_deliverance',
          effect: { grant: { ability: 'choir_of_deliverance' } },
        },
      ],
    },
    {
      level: 20,
      theme: 'capstone',
      decision: 'widen the relationship, repeat its payoff, or manifest its spirit',
      options: [
        {
          id: 'pri_r20_twin_covenant',
          name: 'Twin Covenant',
          description:
            'Doctrine can link 2 allies and converts 70% of Holy damage into healing for each. Benison stores 2 Seraphic Vigil uses and can protect 2 allies. Vespers can bind 2 Effigies; both build the same Gloomtithe bank.',
          icon: 'seraphic_vigil',
          effect: {
            ability: [{ ability: 'seraphic_vigil', bonusCharges: 1 }],
            intrinsic: {
              mechanic: 'priest_twin_covenant',
              metrics: {
                doctrineConversionPct: 0.7,
                linkCap: 2,
                vigilCharges: 2,
                vigilTargetCap: 2,
                effigyCap: 2,
              },
            },
          },
        },
        {
          id: 'pri_r20_second_verse',
          name: 'Second Verse',
          description:
            'After 2 sec, repeat 40% of Scouring Mercy healing from Doctrine, group healing from Benison, or Effigy echo damage from Vespers. The repeat cannot trigger itself.',
          icon: 'smite',
          effect: {
            intrinsic: { mechanic: 'priest_second_verse', metrics: { pct: 0.4, delay: 2 } },
          },
        },
        {
          id: 'pri_r20_incarnate_spirit',
          name: 'Incarnate Spirit',
          description:
            'A fully consumed Psalm of Warding heals its target for 40% of the original absorb. Benison Vigil healing also heals up to 3 party members within 15 yards for 40%. A 5-stack Vespers Tithefiend deals 50% more damage and lasts 50% longer.',
          icon: 'summon_tithefiend',
          effect: {
            intrinsic: {
              mechanic: 'priest_incarnate_spirit',
              metrics: {
                shieldHealPct: 0.4,
                splashTargetCap: 3,
                splashHealPct: 0.4,
                tithefiendStacks: 5,
                tithefiendDamagePct: 0.5,
                tithefiendDurationPct: 0.5,
              },
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
      theme: 'movement',
      decision: 'instant escape vs planned speed burst vs mobile elemental casting',
      options: [
        {
          id: 'sha_r5_concussion',
          name: 'Wolfstep',
          description: 'Shadewolf becomes instant. Entering it removes roots and movement slows.',
          icon: 'ghost_wolf',
          effect: { ability: [{ ability: 'ghost_wolf', castPct: -1 }] },
        },
        {
          id: 'sha_r5_improved_lightning_shield',
          name: 'Gathering Winds',
          description: 'Entering Shadewolf grants 60% movement speed for 3 sec, once every 20 sec.',
          icon: 'ghost_wolf',
          effect: { runtime: { speedPercent: 60, duration: 3, internalCooldown: 20 } },
        },
        {
          id: 'sha_r5_imbue_mastery',
          name: 'Flowing Elements',
          description:
            'After using a Jolt, the next Arc Bolt or Mending Waters started within 8 sec can be cast while moving.',
          icon: 'lightning_bolt',
          effect: { runtime: { window: 8 } },
        },
      ],
    },
    {
      level: 8,
      theme: 'defense',
      decision: 'prepared ally protection vs reactive warding vs automatic burst recovery',
      options: [
        {
          id: 'sha_r8_improved_earth_shock',
          name: 'Stoneward',
          description:
            'Grants Stoneward, a 60 sec ally shield with 6 charges. Damage consumes a charge to heal 5% maximum health, once every 3 sec.',
          icon: 'lightning_shield',
          effect: { grant: { ability: 'stoneward' } },
        },
        {
          id: 'sha_r8_frost_bind',
          name: 'Warded Elements',
          description: 'Thunder Ward retaliation grants 10% damage reduction for 3 sec.',
          icon: 'lightning_shield',
          effect: { runtime: { damageReductionPercent: 10, duration: 3 } },
        },
        {
          id: 'sha_r8_shock_efficiency',
          name: 'Ancestral Mending',
          description:
            'Taking a hit for at least 15% of your maximum health heals you for 12% of maximum health. 20 sec internal cooldown.',
          icon: 'healing_wave',
          effect: {
            proc: {
              id: 'sha_ancestral_mending',
              name: 'Ancestral Mending',
              trigger: { on: 'bigHitTaken', hpFrac: 0.15, icd: 20 },
              responses: [{ kind: 'heal', amountPctMaxHp: 0.12 }],
            },
          },
        },
      ],
    },
    {
      level: 11,
      theme: 'control',
      decision: 'interrupt vs single-target root vs target-centered group control',
      options: [
        {
          id: 'sha_r11_ancestral_guidance',
          name: 'Fault Rebuke',
          description: 'Earthen Jolt interrupts spellcasting for a 4 sec school lockout.',
          icon: 'earth_shock',
          effect: {
            ability: [{ ability: 'earth_shock', addEffects: [{ type: 'interrupt', lockout: 4 }] }],
          },
        },
        {
          id: 'sha_r11_elemental_attunement',
          name: 'Rime Lock',
          description: 'Rime Jolt roots the target for 2 sec.',
          icon: 'frost_shock',
          effect: {
            ability: [{ ability: 'frost_shock', addEffects: [{ type: 'root', duration: 2 }] }],
          },
        },
        {
          id: 'sha_r11_healing_stream',
          name: 'Gripping Earth',
          description:
            'Grants a target-centered Groundsnare that roots enemies within 4 yd for 2 sec, then slows them by 40% for 6 sec. 30 sec cooldown.',
          icon: 'earthbind',
          effect: { grant: { ability: 'earthbind' }, runtime: { slowPercent: 40 } },
        },
      ],
    },
    {
      level: 14,
      theme: 'kit_management',
      decision: 'predictable mana efficiency vs stronger imbues vs ward sustain',
      options: [
        {
          id: 'sha_r14_chain_lightning',
          name: 'Flow State',
          description:
            'After spending 120 Mana, your next Shaman action that costs Mana costs 40 less. The ready state has no short expiry.',
          icon: 'healing_wave',
          effect: { runtime: { manaThreshold: 120, costReduction: 40 } },
        },
        {
          id: 'sha_r14_improved_flame_shock',
          name: 'Imbue Mastery',
          description:
            'Pyrebrand grants 1 extra Thunder charge every 3rd Arc Bolt. Galeheart echoes deal 25% more damage, Stonebound gains 5% damage reduction, and Lifespring deposits 20% more Mending Current.',
          icon: 'rockbiter_weapon',
          effect: {
            runtime: {
              extraCharge: 1,
              everyNthBolt: 3,
              galeheartPercent: 25,
              stoneboundPercent: 5,
              lifespringPercent: 20,
            },
          },
        },
        {
          id: 'sha_r14_weapon_fury',
          name: 'Ward Cycle',
          description:
            'A successful Arc Bolt, Ancestral Strike, or Mending Waters restores 1 Thunder Ward charge and 10 Mana, once every 6 sec.',
          icon: 'lightning_shield',
          effect: { runtime: { wardCharges: 1, mana: 10, internalCooldown: 6 } },
        },
      ],
    },
    {
      level: 17,
      theme: 'power_spike',
      decision: 'throughput cooldown vs extended mobile casting vs major ward defense',
      options: [
        {
          id: 'sha_r17_earthbind',
          name: 'Primal Exaltation',
          description:
            'For 12 sec, Thundercall Arc Bolt and Skybranch cast 50% faster, while Arc Bolt grants 2 Thunder; Warspirit triggers its cadence every 2 weapon hits; Spiritmend adds 50% more healing to Mending Current. 120 sec cooldown.',
          icon: 'elemental_mastery',
          effect: { grant: { ability: 'primal_exaltation' } },
        },
        {
          id: 'sha_r17_improved_ghost_wolf',
          name: 'Wayfarer Grace',
          description:
            'When ready, exiting Shadewolf allows casting while moving for 8 sec. 90 sec internal cooldown.',
          icon: 'ghost_wolf',
          effect: { runtime: { duration: 8, internalCooldown: 90 } },
        },
        {
          id: 'sha_r17_elemental_warding',
          name: 'Ancestral Bulwark',
          description:
            'Activating Thunder Ward grants 40% damage reduction for 6 sec. 120 sec internal cooldown.',
          icon: 'lightning_shield',
          effect: {
            runtime: { damageReductionPercent: 40, duration: 6, internalCooldown: 120 },
          },
        },
      ],
    },
    {
      level: 20,
      theme: 'capstone',
      decision: 'shorter rebuild vs delayed payoff echo vs weapon-defined payoff',
      options: [
        {
          id: 'sha_r20_bloodlust',
          name: 'Deep Reservoir',
          description:
            'After Earthen Jolt or Faultwake consumes all Thunder, retain 2 Thunder. After a spell consumes Stormcast, retain 1 Warspirit Cadence step. After Cascading Mend consumes Mending Current, restore 25% of the amount consumed.',
          icon: 'lightning_bolt',
          effect: { runtime: { thunderCharges: 2, cadenceSteps: 1, reseedPercent: 25 } },
        },
        {
          id: 'sha_r20_elemental_fury',
          name: 'Echoing Elements',
          description:
            'After Earthen Jolt or Faultwake consumes all Thunder, repeat 40% of its damage after 1 sec. A spell that consumes Stormcast repeats at 40% strength. Healing from consumed Mending Current repeats at 40% strength after 2 sec. These repeats cannot trigger other effects.',
          icon: 'chain_lightning',
          effect: { runtime: { echoPercent: 40, damageDelay: 1, healingDelay: 2 } },
        },
        {
          id: 'sha_r20_tidal_waves',
          name: 'Living Weapon',
          description:
            "After Earthen Jolt or Faultwake consumes all Thunder, Pyrebrand makes the next Arc Bolt instant. Galeheart's final echo deals 50% damage to up to 2 enemies within 8 yards. A Stonebound spell that consumes Stormcast grants an absorb equal to 8% of your maximum health. With Lifespring active, Tidecall also adds 50% of its full heal to the most injured ally within 10 yards.",
          icon: 'rockbiter_weapon',
          effect: {
            runtime: {
              cleavePercent: 50,
              cleaveTargets: 2,
              absorbPercent: 8,
              allyDepositPercent: 50,
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
              // target: 'self': the triggering casts are hostile, so the ward
              // must land on the warlock, never the enemy hit by the 3rd cast.
              responses: [
                {
                  kind: 'absorb',
                  amount: 90,
                  duration: 10,
                  name: 'Hellglass Ward',
                  target: 'self',
                },
              ],
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
      theme: 'movement',
      decision: 'escape control, sprint after shifting, or cast while moving',
      options: [
        {
          id: 'dru_r5_improved_wrath',
          name: 'Wildshift',
          description: 'Shapeshifting removes breakable roots and slows.',
          icon: 'travel_form',
          effect: { intrinsic: { mechanic: 'druid_wildshift', metrics: {} } },
        },
        {
          id: 'dru_r5_ferocity',
          name: 'Loping Stride',
          description:
            'Shapeshifting grants 60% movement speed for 3 sec, at most once every 20 sec.',
          icon: 'cat_form',
          effect: {
            intrinsic: {
              mechanic: 'druid_loping_stride',
              metrics: { pct: 0.6, duration: 3, icd: 20 },
            },
          },
        },
        {
          id: 'dru_r5_natures_bounty',
          name: 'Skylark',
          description: 'Wildbolt, Skyfall, Wildmend, and Second Bloom are castable while moving.',
          icon: 'wrath',
          effect: {
            ability: [
              { ability: 'wrath', castWhileMoving: true },
              { ability: 'starfire', castWhileMoving: true },
              { ability: 'healing_touch', castWhileMoving: true },
              { ability: 'regrowth', castWhileMoving: true },
            ],
          },
        },
      ],
    },
    {
      level: 8,
      theme: 'defense',
      decision: 'active armor, reactive absorption, or reactive self healing',
      options: [
        {
          id: 'dru_r8_typhoon',
          name: 'Oakhide Reflex',
          description: 'Oakhide gains 50% more armor and its cooldown is reduced by 20 sec.',
          icon: 'barkskin',
          effect: {
            ability: [{ ability: 'barkskin', buffPct: 0.5, cooldownFlat: -20 }],
          },
        },
        {
          id: 'dru_r8_improved_roots',
          name: 'Ironhide Reflex',
          description:
            'Taking a hit for at least 20% of maximum health shields you for 15% of maximum health for 6 sec. 20 sec internal cooldown.',
          icon: 'bear_form',
          effect: {
            proc: {
              id: 'dru_ironhide_reflex',
              name: 'Ironhide Reflex',
              trigger: { on: 'bigHitTaken', hpFrac: 0.2, icd: 20 },
              responses: [
                {
                  kind: 'absorb',
                  amountPctMaxHp: 0.15,
                  duration: 6,
                  name: 'Ironhide Reflex',
                },
              ],
            },
          },
        },
        {
          id: 'dru_r8_brutal_bash',
          name: 'Bear-Blood Mending',
          description:
            'Taking a hit for at least 20% of maximum health heals you for 12% of maximum health. 20 sec internal cooldown.',
          icon: 'healing_touch',
          effect: {
            proc: {
              id: 'dru_bear_blood_mending',
              name: 'Bear-Blood Mending',
              trigger: { on: 'bigHitTaken', hpFrac: 0.2, icd: 20 },
              responses: [{ kind: 'heal', amountPctMaxHp: 0.12, target: 'self' }],
            },
          },
        },
      ],
    },
    {
      level: 11,
      theme: 'control',
      decision: 'area displacement, root ambush, or Concuss economy',
      options: [
        {
          id: 'dru_r11_innervate',
          name: 'Typhoon',
          description: 'Grants Typhoon: knock back and daze all enemies within 8 yd.',
          icon: 'typhoon',
          effect: { grant: { ability: 'typhoon' } },
        },
        {
          id: 'dru_r11_furor',
          name: 'Gripping Ambush',
          description:
            'Gripping Roots makes your next Wildbolt within 8 sec instant, at most once every 15 sec.',
          icon: 'entangling_roots',
          effect: {
            proc: {
              id: 'dru_gripping_ambush',
              name: 'Gripping Ambush',
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
          id: 'dru_r11_improved_mark',
          name: 'Concussive Economy',
          description: 'Concuss restores 15 rage and removes 20 sec from its cooldown.',
          icon: 'bash',
          effect: {
            proc: {
              id: 'dru_concussive_economy',
              name: 'Concussive Economy',
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
      level: 14,
      theme: 'engine_economy',
      decision: 'Moongrove refunds, bleed-fed Old Blood, or wider Overbloom replanting',
      options: [
        {
          id: 'dru_r14_savage_fury',
          name: 'Blooddrunk',
          description: 'Each tick of your Flense and Bloodrift advances Old Blood by one stage.',
          icon: 'rip',
          effect: { intrinsic: { mechanic: 'druid_blooddrunk', metrics: {} } },
        },
        {
          id: 'dru_r14_moonfury',
          name: 'Highmoon Tithe',
          description: 'Moonsurge and Sunwake each restore 15% of your maximum mana.',
          icon: 'moonseed',
          effect: {
            intrinsic: { mechanic: 'druid_highmoon_tithe', metrics: { pct: 0.15 } },
          },
        },
        {
          id: 'dru_r14_empowered_touch',
          name: 'Seedspread',
          description:
            'Overbloom replants a fresh Wildbloom on every ally whose healing it harvested.',
          icon: 'rejuvenation',
          effect: {
            intrinsic: { mechanic: 'druid_seedspread', metrics: {} },
          },
        },
      ],
    },
    {
      level: 17,
      theme: 'major_cooldown',
      decision: 'feral burst, party healing, or resource restoration',
      options: [
        {
          id: 'dru_r17_improved_barkskin',
          name: 'Red Haze',
          description: 'Grants Red Haze.',
          icon: 'berserk',
          effect: { grant: { ability: 'berserk' } },
        },
        {
          id: 'dru_r17_frenzied_regeneration',
          name: 'Gladesong',
          description: 'Grants Gladesong.',
          icon: 'tranquility',
          effect: { grant: { ability: 'tranquility' } },
        },
        {
          id: 'dru_r17_survival_of_the_fittest',
          name: 'Lifesap',
          description:
            'Grants Lifesap: living sap restores your current resource in waves, in any form.',
          icon: 'innervate',
          effect: { grant: { ability: 'innervate' } },
        },
      ],
    },
    {
      level: 20,
      theme: 'engine_capstone',
      decision: 'echo the next cycle, amplify the payoff, or gain resource while banking',
      options: [
        {
          id: 'dru_r20_improved_hurricane',
          name: "Nature's Echo",
          description: 'After an engine payoff, begin its next cycle with one banked stage.',
          icon: 'moonseed',
          effect: { intrinsic: { mechanic: 'druid_natures_echo', metrics: {} } },
        },
        {
          id: 'dru_r20_berserk',
          name: 'Wild Apex',
          description:
            'Moonsurge, Sunwake, Redharvest, Marrowbreak, and Overbloom are 25% stronger.',
          icon: 'primal_reflexes',
          effect: { intrinsic: { mechanic: 'druid_wild_apex', metrics: { pct: 0.25 } } },
        },
        {
          id: 'dru_r20_tranquility',
          name: 'Quickening',
          description:
            'Each engine stage banked restores 2% maximum mana, 5 energy, or 3 rage, matching your current resource.',
          icon: 'innervate',
          effect: {
            intrinsic: {
              mechanic: 'druid_quickening',
              metrics: { manaPct: 0.02, energy: 5, rage: 3 },
            },
          },
        },
      ],
    },
  ],
};
