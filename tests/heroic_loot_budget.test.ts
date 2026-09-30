import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { HEROIC_BOSS_LOOT } from '../src/sim/content/heroic_loot';
import { ITEMS, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { itemLevel, itemSourceLevel } from '../src/sim/item_level';
import { rollLoot } from '../src/sim/loot/loot_roll';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';

// Release baseline: every existing acquisition remains and item definitions and
// levels stay byte-equivalent after canonical serialization. This catches an
// accidental stat buff from moving generated variants into HEROIC_BOSS_LOOT.
// The nine gearDigest values below were re-minted for the stamina baseline
// model (item_budget.ts, "The stamina baseline model"): every changed def
// either gained its free stamina baseline (a caster identity) or had its
// Strength/Agility trimmed onto its line with stamina added, and every heroic
// variant recomputes through the same model at merge time
// (heroic_variants.ts, makeHeroicVariant), so its digest moves even where the
// base item's literal did not. normalDigest is untouched because the loot
// table shape and chances did not change. Receipt for every def behind the
// re-minted digests: the codemod's before/after list
// (scripts/stamina_baseline_codemod.ts, run with --dry) and the generated
// variants that follow their bases; the one boss whose digest did not move
// (choirmother_selthe) is the one whose gear def did not change.
// The trinket slot then added one trinket (content/trinkets.ts) to four
// final bosses' equipment partitions: morthen (bastion_sigil), vael
// (stormjar), ysolei (menders_hourglass) and wildheart_high_priest
// (paired_talons). Those four gearIds gained the trinket and their digests were
// re-minted; the digest over their PRE-trinket ids was verified unchanged, so no
// existing def moved.
const BASELINE = {
  // Re-minted for the Hollow Crypt rework (docs/design/dungeon-rework/hollow_crypt.md
  // 8.1 and 8.2): every boss now carries its own table. Four shipped heroic epics
  // moved off Morthen (Cryptplate Helm to Sexton Marrow, the Bonechill Striders and
  // Cord to Rimeweb, the Shadowpulse Handwraps to Cantor Ilvane), none left the
  // game; their item defs are unchanged, only the boss that pays them moved.
  sexton_marrow: {
    gearIds: [
      'cryptplate_helm',
      'heroic_sextons_spadehaft',
      'oiled_boots',
      'quilted_trousers',
      'sextons_burial_spade',
    ],
    normalDigest: '11d8282deb5224aadac6530505d43e0fdec9185eaad8d2f1a01e090237c86e58',
    gearDigest: 'd43b2dd0dc70e836e057eac12d9261cb2a9b128cce285bb5a257103531e1292e',
  },
  rimeweb: {
    gearIds: ['bonechill_cord', 'bonechill_striders', 'heroic_rimeweb_fang', 'rimesilk_hood'],
    normalDigest: 'b60373d913e7a9fa3895b4655692c488558e777b581d3f93b6e804eafe64fc52',
    gearDigest: '69f6da008eb9031d0708899be8f19596782d7da573638760f70e58a9b51acfd9',
  },
  cantor_ilvane: {
    gearIds: ['choirward_leggings', 'heroic_cantors_hymnal', 'shadowpulse_handwraps'],
    normalDigest: 'af27a1c32fb9337349abd0d1cf4ac2ef6f1b30533e6130811196b54d648a0df9',
    gearDigest: '2d4840b388cabfa2ee56aed3f873e07d473df2d9fab5d3598c6f1e25e6f584b9',
  },
  morthen: {
    gearIds: [
      'bastion_sigil',
      'cryptbone_greaves',
      'cryptbone_helm',
      'cryptbone_pauldrons',
      'greyjaw_hide_boots',
      'lunarward_cinch',
      'morthens_cryptforged_hauberk',
      'shadowpulse_slippers',
    ],
    normalDigest: '719dd461e2a992ad6684cf3e8c3e6307603013c7ff34f017bbf54299c0c1912e',
    gearDigest: '9cfa6a2e95c3d3f03b50edb557843f495ed739336e12e1486bcac7a37dfb18e8',
  },
  // Re-minted for the Sunken Bastion rework (docs/design/dungeon-rework/
  // sunken_bastion.md 8.1 and 8.2): Olen's normal table gains the Longsword row
  // and folds the Fenmist Robe into its guaranteed group; the new Gaoler Ossick
  // carries his own table. Three shipped heroic epics moved off Vael (the
  // Tideguard Faceguard and Fogforged Pauldrons to Olen, the Sash of the Sunken
  // Court to Ossick) and Olen's heroic uncommons stay on Vael's partition, so
  // none left the game; their item defs are unchanged, only the payer moved.
  knight_commander_olen: {
    gearIds: [
      'drowned_commanders_breastplate',
      'heroic_eelscale_leggings',
      'heroic_knight_commanders_longsword',
      'heroic_tideguard_greaves',
      'heroic_tideguard_sabatons',
      'mistforged_pauldrons',
      'tideguard_faceguard',
    ],
    normalDigest: 'f4a817a203a48100e5894c239006310be2a16dd6511de26b2d6bd745b4b5f7cf',
    gearDigest: 'aa8117eb9473f2fcf78ff3fde25dff6604ec031e2bc112003f12d866e6aa3b40',
  },
  gaoler_ossick: {
    gearIds: [
      'gaolers_iron_key',
      'gaolyard_striders',
      'heroic_gaolyard_cudgel',
      'sash_of_the_sunken_court',
    ],
    normalDigest: '658479d6bc60321d48873be81744e5be8d3f37f76d4842bf92b9032959840cb0',
    gearDigest: '15e439856b2accb50c45b0d5c217695d3cdbfef47aecc4c4398bd51736a6a2cb',
  },
  vael_the_mistcaller: {
    gearIds: [
      'dreamroot_boots',
      'eelskin_tunic',
      'fenmist_robe',
      'heroic_drowned_prayer_leggings',
      'heroic_drowned_prayer_sandals',
      'heroic_eelscale_treads',
      'heroic_tidescale_vest',
      'marshstrider_boots',
      'mistcallers_fang',
      'mistveil_cord',
      'mistveil_grips',
      'stormjar',
      'sunken_court_mantle',
      'tidebound_spaulders',
      'trollhide_leggings',
    ],
    normalDigest: '213a53c89b1da7a01abf0c4ea3849f9390368a6163a358f3fdad2f2007f0bcb1',
    gearDigest: '7a9d9d364d3d682f2db571c3f92be9c471a53fbb431c90661df5d453cb706005',
  },
  // Re-minted for the Drowned Temple rework (docs/design/dungeon-rework/
  // drowned_temple.md section 8): Selthe's normal table gains a guaranteed
  // archetype group and the Chorus Conch row, the new Tideglass Colossus carries
  // his own table, and each gains one new heroic epic. Four shipped heroic
  // pieces moved off Ysolei (the Choirmother's Casque to Selthe; the Lunar
  // Choir Leggings, Tidewoven Trousers and Tideworn Warboots to the Colossus),
  // none left the game; their item defs are unchanged, only the payer moved.
  choirmother_selthe: {
    gearIds: [
      'choirmothers_casque',
      'heroic_chorus_conch',
      'heroic_selthes_seastriders',
      'pale_chorus_vestment',
    ],
    normalDigest: 'd066bb76897cf312a782b522b93c47288d103d8f2231b56dac73a320792d5440',
    gearDigest: '95f7eb3b6ffbd3f938e941ba06c370a680d553eb6cb8fb7acb7d53e69ec7215c',
  },
  tideglass_colossus: {
    gearIds: [
      'heroic_tideglass_shiv',
      'lunar_choir_leggings',
      'tideglass_warmaul',
      'tideworn_warboots',
      'tidewoven_trousers',
    ],
    normalDigest: 'abd555f798b5eab58bbbebde04facc190a50e300c695d48796b02141bf80bc1d',
    gearDigest: '83069ff7c58946418b39a6738a41358e5f3401ae4d5cfa84b38d3fb7606dda00',
  },
  ysolei: {
    gearIds: [
      'choir_blessed_spaulders',
      'heroic_moonshroud_breastplate',
      'heroic_moonshroud_robe',
      'heroic_moonshroud_tunic',
      'heroic_ysols_pearl_greaves',
      'lunar_tide_greatstaff',
      'menders_hourglass',
      'stormbark_mantle',
    ],
    normalDigest: 'aa4c9a380d095266e6cd74de3869ac1652f4a896af53c6bdd4cf406fa35ee01c',
    gearDigest: '0706bc5d99ae991d9db6e7b1aeb32b0415f147bff9ee2ed267e2d7c95a87747c',
  },
  korgath_the_bound: {
    gearIds: [
      'boneplate_vest',
      'heroic_boundstone_helm',
      'heroic_gravewyrm_mantle',
      'heroic_gravewyrm_sabatons',
      'heroic_korgaths_chainwraps',
      'heroic_shadowmeld_tunic',
      'heroic_staff_of_velkhar',
      'heroic_wyrmcult_grand_robe',
      'heroic_wyrmcult_soulsteps',
      'heroic_wyrmshadow_treads',
      'nightwalk_jerkin',
      'revenant_silk_robe',
      'zealotsbane_blade',
    ],
    normalDigest: '48c75a437f0d7672490273450f6a49fbc974378155beefd3184a71cea13c2521',
    gearDigest: '3b2983de5d71e532d19a604a4cbdbf843d264f7ac974d8b44562892cba824dc7',
  },
  grand_necromancer_velkhar: {
    gearIds: [
      'boneplate_vest',
      'emberwood_staff',
      'heroic_boneguard_breastplate',
      'heroic_deathlord_legguards',
      'heroic_gravewyrm_stalkers_treads',
      'heroic_necromancers_soulsteps',
      'heroic_shadowmeld_tunic',
      'heroic_staff_of_velkhar',
      'heroic_wyrmshadow_legguards',
      'nightwalk_jerkin',
      'revenant_silk_robe',
    ],
    normalDigest: 'e9b35e13c5de33a5bf786cdba760f19b6b769a4bf712de6ee2ff0698ed1fcb09',
    gearDigest: '19d839abf88e5d2efdbd0230589c511e709e2ec65cd13c9da3df67a2207bbda5',
  },
  korzul_the_gravewyrm: {
    gearIds: [
      'boneplate_vest',
      'cultist_flayer',
      'gravescale_girdle',
      'gravewyrm_claws',
      'gravewyrm_cleaver',
      'heroic_boundstone_girdle',
      'heroic_deathlord_warplate',
      'heroic_deathlords_dread_visage',
      'heroic_fang_of_korzul',
      'heroic_gravewyrm_bone_quiver',
      'heroic_gravewyrm_gauntlets',
      'heroic_grovewardens_grips',
      'heroic_necromancers_soulspire_mantle',
      'heroic_necromancers_starshroud',
      'heroic_nightfangs_greatstaff',
      'heroic_staff_of_the_gravewyrm',
      'heroic_verdant_walkers',
      'heroic_wildgrowth_leggings',
      'heroic_wyrmfang_greatblade',
      'heroic_wyrmshadow_harness',
      'heroic_wyrmshadow_talongrips',
      'nightwalk_jerkin',
      'revenant_silk_robe',
      'sanctum_prowlers_grips',
      'shroud_of_the_gravewyrm',
      'wildsoul_maul',
      'wyrmchoir_handwraps',
    ],
    normalDigest: '0ac50f2ff6acdc808e5c24f721c84b337eade18ea81d2463f77bdd437599946a',
    gearDigest: '483612e11a843da003d682b74a7934bc686b57107e8a39dc779285efdb198c6a',
  },
  wildheart_high_priest: {
    gearIds: [
      'basin_stalkers_tunic',
      'bloodmane_war_legguards',
      'bloodmane_warleggings',
      'greatfang_of_the_basin',
      'heroic_wildheart_fangknife',
      'heroic_wildheart_hexwood_staff',
      'heroic_wildheart_tuskblade',
      'paired_talons',
      'sunbone_oracles_crown',
      'sunbone_ritual_hauberk',
      'sunbone_ritual_sarong',
      'verdant_heart_vestment',
      'vineclaw_stalking_breeches',
    ],
    normalDigest: 'dc4c6a27f87b5cd5ab11237b791de5a2707e2b55329f7c1aada4a4fb9cfe34f8',
    gearDigest: '62b6f9de2378727e1e5e2c42d127d08705f32fcd284410b4326e7ec950931da8',
  },
} as const;

function digest(value: unknown): string {
  const stable = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(stable)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.entries(input)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, item]) => [key, stable(item)]),
          )
        : input;
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

describe('heroic five-player equipment budget', () => {
  it('keeps migrated bags independent at their original per-kill chances', () => {
    for (const [bossId, itemId, chance, sourceLevel] of [
      ['morthen', 'gravewoven_bag', 0.2, 10],
      ['vael_the_mistcaller', 'mistcallers_duffel', 0.1, 13],
      ['grand_necromancer_velkhar', 'necromancers_reagent_satchel', 0.2, 20],
    ] as const) {
      const entry = HEROIC_BOSS_LOOT[bossId].find((row) => row.itemId === itemId);
      expect(entry).toEqual({ itemId, chance, preserveSourceTier: true });
      expect(itemSourceLevel(itemId)).toBe(sourceLevel);
      expect(itemLevel(ITEMS[itemId])).toBeUndefined();
      expect(MOBS[bossId].loot.find((row) => row.itemId === itemId)?.normalOnly).toBe(true);
    }
  });

  let sim: Sim;
  beforeAll(() => {
    sim = new Sim({ seed: 1234, playerClass: 'warrior' });
  });

  for (const [bossId, baseline] of Object.entries(BASELINE)) {
    it(bossId + ' gives exactly one equipment item through the real loot roller', () => {
      const template = MOBS[bossId];
      const meta = sim.ctx.players.get(sim.player.id)!;
      sim.ctx.instances.push({
        id: -1,
        dungeonId: 'hollow_crypt',
        partyKey: 'budget-test',
        difficulty: 'heroic',
        mobIds: [-1],
      } as unknown as (typeof sim.ctx.instances)[number]);
      sim.rng = new Rng(4321);
      try {
        for (let kill = 0; kill < 300; kill++) {
          const mob = createMob(-1, template, template.minLevel, { x: 0, y: 0, z: 0 });
          rollLoot(sim.ctx, mob, meta);
          const gear = (mob.loot?.items ?? []).filter(
            (entry) => ITEMS[entry.itemId]?.slot && ITEMS[entry.itemId]?.kind !== 'bag',
          );
          expect(gear, 'kill ' + kill).toHaveLength(1);
        }
      } finally {
        sim.ctx.instances.pop();
      }
    });

    it(bossId + ' can award every equipment entry through its partition', () => {
      const template = MOBS[bossId];
      const meta = sim.ctx.players.get(sim.player.id)!;
      const entries = HEROIC_BOSS_LOOT[bossId].filter(
        (entry) => entry.itemId && ITEMS[entry.itemId]?.slot && ITEMS[entry.itemId]?.kind !== 'bag',
      );
      const draw = vi.spyOn(sim.rng, 'next');
      sim.ctx.instances.push({
        id: -1,
        dungeonId: 'hollow_crypt',
        partyKey: 'budget-test',
        difficulty: 'heroic',
        mobIds: [-1],
      } as unknown as (typeof sim.ctx.instances)[number]);
      let cumulative = 0;
      try {
        for (const entry of entries) {
          draw.mockReturnValue(cumulative + entry.chance / 2);
          cumulative += entry.chance;
          const mob = createMob(-1, template, template.minLevel, { x: 0, y: 0, z: 0 });
          rollLoot(sim.ctx, mob, meta);
          expect(
            mob.loot?.items.some((drop) => drop.itemId === entry.itemId),
            entry.itemId,
          ).toBe(true);
        }
        expect(cumulative).toBe(1);
      } finally {
        draw.mockRestore();
        sim.ctx.instances.pop();
      }
    });

    it(bossId + ' retains every heroic acquisition and its existing item stats', () => {
      const gearEntries = (HEROIC_BOSS_LOOT[bossId] ?? []).filter(
        (entry) => entry.itemId && ITEMS[entry.itemId]?.slot && ITEMS[entry.itemId]?.kind !== 'bag',
      );
      expect([...new Set(gearEntries.map((entry) => entry.itemId!))].sort()).toEqual(
        baseline.gearIds,
      );
      const definitions = Object.fromEntries(
        baseline.gearIds.map((id) => [id, { def: ITEMS[id], level: itemLevel(ITEMS[id]) }]),
      );
      expect(digest(definitions)).toBe(baseline.gearDigest);
    });

    it(bossId + ' preserves the complete Normal loot table and probabilities', () => {
      const normalLoot = MOBS[bossId].loot.map(({ normalOnly: _normalOnly, ...entry }) => entry);
      expect(digest(normalLoot)).toBe(baseline.normalDigest);
    });
  }
});
