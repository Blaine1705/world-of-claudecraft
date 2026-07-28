// The blob-wide professions round-trip sweep: every professions field on
// CharacterState survives serialize-load-serialize either byte-faithfully or
// through its DOCUMENTED load normalizer, and the whole blob is a fixed point.
//
// This widens the per-field fixed-point contract
// tests/professions_tool_effect_slot.test.ts pins for toolEffectSlots (and
// tests/professions_quest_cadence.test.ts for questCadence) to the full
// professions surface: those suites keep the per-field policy arms (refused
// rows, elapsed windows); here each field is one column of the sweep. The
// per-field heal/clamp behaviors keep their own targeted suites too
// (node_persist, tier_mail); this file pins the two cap clamps directly
// because they are the mechanism behind the "rollback erases newer fields"
// caveat in docs/design/professions-tuning-packet.md.
//
// ADDING A PROFESSIONS FIELD TO CharacterState? Add it to
// PROFESSIONS_BLOB_FIELDS below with a fixture value, or the presence pin
// fails. The whole-blob fixed point (layer 2) will catch a non-idempotent
// load/save even for a field this list has not learned about yet.
import { describe, expect, it } from 'vitest';
import { GATHER_NODES } from '../src/sim/content/gather_nodes';
import { PRE_TRAINING_RECIPE_IDS } from '../src/sim/professions/training';
import { type CharacterState, type PlayerMeta, Sim } from '../src/sim/sim';

const makeSim = (seed = 21) => new Sim({ seed, playerClass: 'warrior', autoEquip: false });

// Every professions-owned key on CharacterState, pinned as a literal list so a
// rename fails the presence pin instead of silently leaving the sweep.
const PROFESSIONS_BLOB_FIELDS = [
  'professions',
  'gatheringProficiency',
  'toolEffectSlots',
  'nodeHarvestCooldowns',
  'craftSkills',
  'knownRecipes',
  'recipesGrandfathered',
  'masteryResetApplied',
  'proficiencyDisplayHealApplied',
  'townFocus',
  'archetype',
  'questCadence',
  'tierMailSent',
  'profTierTutorialSent',
  'guildLetterSent',
] as const;

const NODE = GATHER_NODES.find((n) => n.type === 'herb' && n.zoneId === 'eastbrook_vale');
if (!NODE) throw new Error('no eastbrook herb node in content');

/** A player exercising every professions field with a non-default value, so
 *  the sweep's equalities compare real content and never undefined against
 *  undefined. Direct meta writes, the established fixture idiom of the
 *  per-field suites; the producer paths have their own tests. (A const arrow
 *  rather than a hoisted declaration so the NODE narrowing above applies.) */
const populatedSim = (): Sim => {
  const sim = makeSim();
  const meta = sim.players.get(sim.playerId) as PlayerMeta;
  // Fractional proficiency on purpose: gather gains move in 0.25 steps, so a
  // serializer that rounded would pass an integer fixture.
  meta.gatheringProficiency = { mining: 42.25, logging: 0, herbalism: 7, fishing: 150 };
  meta.toolEffectSlots = {
    logging: {
      effectId: 'gatherers_cache',
      durability: 7,
      maxDurability: 30,
      confirmMode: 'always',
    },
  };
  meta.nodeHarvestReadyAt[NODE.id] = sim.time + 30;
  meta.craftSkills.weaponcrafting = 55.5;
  meta.craftSkills.cooking = 10;
  // One real pre-training id plus one retired/synthetic id: knownRecipes is
  // DOCUMENTED filter-free on load (the grandfathered model), so both must
  // survive byte-faithfully; if load-time validation is ever added, this arm
  // is the one that should go red and force the contract update.
  meta.knownRecipes.add(PRE_TRAINING_RECIPE_IDS[0]);
  meta.knownRecipes.add('retired_recipe_id');
  meta.townFocus = { hide: 3, fang: 2 };
  meta.archetype = {
    activeArchetype: 'weaponcrafting',
    pairedMajor: 'armorcrafting',
    hobbyCraft: 'leatherworking',
    attunedPairs: ['weaponcrafting+armorcrafting'],
    switchCount: 1,
    amendsProgress: 2,
  };
  meta.questCadence.set('q_prof_work_order_smith', 600); // live: far under the 36000-tick window
  // Majors only: the tier-mail prune (load and transition) keeps exactly the
  // active pair's crafts, so a non-major entry here would not round-trip BY
  // DESIGN (pinned in tests/professions_tier_mail.test.ts, not re-pinned here).
  meta.tierMailSent.set('weaponcrafting', 2);
  meta.tierMailSent.set('armorcrafting', 1);
  meta.profTierTutorialSent = true;
  meta.guildLetterSent = true;
  return sim;
};

describe('the professions blob round-trip sweep', () => {
  it('every professions field is exercised, survives one load, and the blob is a fixed point', () => {
    const sim = populatedSim();
    const s1 = sim.serializeCharacter(sim.playerId) as CharacterState;

    // Presence pin: the fixture really exercised every listed field (a field
    // rename or a dropped serializer arm fails here, not vacuously below).
    for (const field of PROFESSIONS_BLOB_FIELDS) {
      expect(s1[field], `${field} missing from the populated save`).toBeDefined();
    }
    // Spot pins on load-bearing values so the sweep is not only structural.
    expect(s1.gatheringProficiency).toEqual({
      mining: 42.25,
      logging: 0,
      herbalism: 7,
      fishing: 150,
    });
    expect(s1.professions).toEqual(s1.gatheringProficiency); // legacy dual-write
    expect(s1.nodeHarvestCooldowns).toEqual({ [NODE.id]: 30 });
    expect(s1.tierMailSent).toEqual({ weaponcrafting: 2, armorcrafting: 1 });
    expect(s1.questCadence).toEqual({ q_prof_work_order_smith: 600 });
    expect(s1.masteryResetApplied).toBe(true); // literal true by design
    expect(s1.proficiencyDisplayHealApplied).toBe(true); // literal true by design

    // One load: every professions field comes back byte-faithful (all fixture
    // values sit inside their normalizers' accepted ranges, so the documented
    // normalizers are pass-throughs here; the clamp arm below is where they
    // move a value).
    const second = makeSim(22);
    const pid2 = second.addPlayer('warrior', 'Sweep', { state: s1 });
    const s2 = second.serializeCharacter(pid2) as CharacterState;
    for (const field of PROFESSIONS_BLOB_FIELDS) {
      expect(s2[field], `${field} drifted across one save/load cycle`).toEqual(s1[field]);
    }

    // Layer 2, the whole-blob fixed point: a second load changes NOTHING
    // anywhere in the blob, professions or not. One-time load transforms
    // (grandfather unions, deed retro grants, position migration) are allowed
    // to fire on the FIRST load; s2 is the settled state and must be exact.
    const third = makeSim(23);
    const pid3 = third.addPlayer('warrior', 'Sweep2', { state: s2 });
    const s3 = third.serializeCharacter(pid3) as CharacterState;
    expect(s3).toEqual(s2);
  });

  it('over-cap values clamp DOWN through the documented load normalizers and persist clamped', () => {
    // The exact mechanism the shared "rollback erases newer fields" caveat
    // records: normalizeGatheringProficiency and normalizeCraftSkills clamp a
    // loaded value to the binary's own cap, and the next save keeps the
    // clamped value. Pinned to the literal shipped caps.
    const sim = populatedSim();
    const s1 = sim.serializeCharacter(sim.playerId) as CharacterState;
    s1.gatheringProficiency = { mining: 250, logging: 0, herbalism: 7, fishing: 999 };
    s1.professions = { ...s1.gatheringProficiency };
    s1.craftSkills = { ...s1.craftSkills, weaponcrafting: 999 };

    const reloaded = makeSim(24);
    const pid = reloaded.addPlayer('warrior', 'Clamped', { state: s1 });
    const meta = reloaded.players.get(pid) as PlayerMeta;
    expect(meta.gatheringProficiency.mining).toBe(100); // gathering cap
    expect(meta.gatheringProficiency.fishing).toBe(200); // fishing cap
    expect(meta.craftSkills.weaponcrafting).toBe(125); // craft ring cap

    const resaved = reloaded.serializeCharacter(pid) as CharacterState;
    expect(resaved.gatheringProficiency).toEqual({
      mining: 100,
      logging: 0,
      herbalism: 7,
      fishing: 200,
    });
    expect(resaved.craftSkills?.weaponcrafting).toBe(125);
  });
});
