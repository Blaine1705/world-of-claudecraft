// Phase 16 item 4: the character-blob growth bound
// (docs/design/professions-tuning-packet-review.md). Builds the WORST-CASE
// professions blob (every field at its plausible ceiling: all live nodes on
// cooldown, every recipe known, every craft and gathering skill capped, all
// three slottable tool-effect slots filled with maximum-length crafter names,
// every archetype pair attuned and hobby-quested, full town focus, every
// cadence window live), settles it to a fixed point through the REAL
// serialize-load-serialize path, and asserts a byte ceiling plus the per-field
// entry caps that make the growth model linear-in-content rather than
// unbounded-per-player.
//
// The bound protects the save path: at 1,000 online the server writes every
// blob whole every 30 s (no dirty tracking), so professions bytes multiply
// straight into autosave write volume. The two content-scaled fields grow at
// roughly 26 bytes per authored node (nodeHarvestCooldowns) and 29 bytes per
// recipe (knownRecipes): a complete new zone (18 nodes) costs about 470 bytes
// of worst case, a starter zone (6) about 155. When authored content pushes
// the settled ceiling past the bound, re-mint it HERE with the measured value
// and record the move (the tests/professions_node_persist.test.ts 2048->4096
// precedent), rather than loosening it ahead of need.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GATHER_NODES } from '../src/sim/content/gather_nodes';
import {
  CRAFT_RING,
  GATHERING_PROFESSIONS,
  HARVEST_COMPONENT_ITEMS,
} from '../src/sim/content/professions';
import { ALL_RECIPES, ITEMS, QUESTS } from '../src/sim/data';
import {
  ARCHETYPE_PAIR_TARGETS,
  craftsForPairTarget,
  hobbyCandidatesForPair,
} from '../src/sim/professions/archetype';
import { NODE_HARVEST_TABLE } from '../src/sim/professions/gathering';
import { MAX_CRAFTED_BY_LENGTH } from '../src/sim/professions/tools';
import { MAX_KNOWN_RECIPE_ID_LENGTH } from '../src/sim/professions/training';
import { type CharacterState, type PlayerMeta, Sim } from '../src/sim/sim';
import { EQUIP_SLOTS } from '../src/sim/types';

const makeSim = (seed = 31) => new Sim({ seed, playerClass: 'warrior', autoEquip: false });

// The professions-owned key list, mirrored from the roundtrip sweep. The
// scrape test below pins the two lists together so neither can silently
// learn a field the other misses.
const PROFESSIONS_BLOB_FIELDS = [
  'professions',
  'gatheringProficiency',
  'toolEffectSlots',
  'nodeHarvestCooldowns',
  'craftSkills',
  'knownRecipes',
  'equipmentInstance',
  'recipesGrandfathered',
  'masteryResetApplied',
  'proficiencyDisplayHealApplied',
  'townFocus',
  'archetype',
  'questCadence',
  'tierMailSent',
  'questedHobbies',
  'profTierTutorialSent',
  'guildLetterSent',
] as const;

// The settled ceiling measured 8,469 bytes when this bound was re-minted
// (2026-07-30, after the review round grew the fixture honest: every equip
// slot instanced and signed, every cadence window live; this content: 120
// nodes, 79 recipes, 10 ring crafts, 4 gathering professions, 12 equip
// slots, 9 cadence quests). The pinned ceiling leaves about 1,250 bytes of
// headroom, roughly two and a half complete zones of node growth, before it
// needs re-minting.
const PROFESSIONS_BYTE_CEILING = 9728;

function ceilingSim(): Sim {
  const sim = makeSim();
  const meta = sim.players.get(sim.playerId) as PlayerMeta;
  // Every gathering skill at its own cap (fishing's is higher by design).
  meta.gatheringProficiency = Object.fromEntries(
    Object.values(GATHERING_PROFESSIONS).map((p) => [p.id, p.maxSkill]),
  ) as PlayerMeta['gatheringProficiency'];
  for (const craft of CRAFT_RING) meta.craftSkills[craft.id] = craft.maxSkill;
  for (const recipe of ALL_RECIPES) meta.knownRecipes.add(recipe.id);
  for (const node of GATHER_NODES) {
    meta.nodeHarvestReadyAt[node.id] = sim.time + NODE_HARVEST_TABLE[node.type].respawnSeconds;
  }
  // The three slottable slots (fishing is policy-refused), each carrying the
  // longest crafter name a legal mint can stamp and the wordier confirm mode.
  const longName = 'A'.repeat(MAX_CRAFTED_BY_LENGTH);
  meta.toolEffectSlots = {
    mining: {
      effectId: 'gatherers_cache',
      durability: 30,
      maxDurability: 30,
      craftedBy: longName,
      confirmMode: 'prompt',
    },
    logging: {
      effectId: 'artisans_eye',
      durability: 30,
      maxDurability: 30,
      craftedBy: longName,
      confirmMode: 'prompt',
    },
    herbalism: {
      effectId: 'gatherers_cache',
      durability: 30,
      maxDurability: 30,
      craftedBy: longName,
      confirmMode: 'prompt',
    },
  };
  // EVERY equip slot carries a crafted, signed, enchanted, stat-rolled
  // instance: the professions-endgame worst case the phase 16 review found
  // missing from the first mint (one light slot understated the ceiling by
  // over 2 KB). Slot-appropriateness is irrelevant to the serializer; the
  // LOAD arm only requires the slot to be equipped for the instance to
  // survive the settle.
  const instanceItemId = Object.keys(ITEMS)[0];
  for (const slot of EQUIP_SLOTS) {
    meta.equipment[slot] = instanceItemId;
    meta.equipmentInstance[slot] = {
      enchant: 'enchant_weapon_might',
      rolled: { stats: { str: 2, agi: 2, sta: 2 } },
      signer: longName,
    };
  }
  // Every repeatable cadence window live (the first mint never set the field,
  // and the `field in state` measurement filter silently forgave it).
  const cadenceQuests = Object.values(QUESTS).filter((q) => q.repeatCadenceTicks);
  if (cadenceQuests.length < 7) throw new Error('cadence quest set shrank; re-check the fixture');
  for (const q of cadenceQuests) meta.questCadence.set(q.id, 600);
  // Full focus budget spread across every component family.
  const components = Object.keys(HARVEST_COMPONENT_ITEMS);
  meta.townFocus = Object.fromEntries(
    components.map((c, i) => [c, i < 4 ? 2 : 1]),
  ) as PlayerMeta['townFocus'];
  const firstPair = craftsForPairTarget(ARCHETYPE_PAIR_TARGETS[0]);
  if (!firstPair) throw new Error('no first archetype pair');
  meta.archetype = {
    activeArchetype: firstPair[0],
    pairedMajor: firstPair[1],
    hobbyCraft: hobbyCandidatesForPair(firstPair[0], firstPair[1])[0],
    attunedPairs: [...ARCHETYPE_PAIR_TARGETS],
    switchCount: 9,
    amendsProgress: 3,
  };
  for (const target of ARCHETYPE_PAIR_TARGETS) {
    const pair = craftsForPairTarget(target);
    if (!pair) throw new Error(`unresolvable pair target ${target}`);
    const hobby = hobbyCandidatesForPair(pair[0], pair[1])[0];
    if (!hobby) throw new Error(`no hobby candidate for ${target}`);
    meta.questedHobbies.set(target, hobby);
  }
  meta.tierMailSent.set(firstPair[0], 2);
  meta.tierMailSent.set(firstPair[1], 2);
  meta.profTierTutorialSent = true;
  meta.guildLetterSent = true;
  return sim;
}

function professionsBytes(state: CharacterState): number {
  const subset = Object.fromEntries(
    PROFESSIONS_BLOB_FIELDS.filter((field) => field in state).map((field) => [field, state[field]]),
  );
  return JSON.stringify(subset).length;
}

describe('the professions blob growth bound (phase 16)', () => {
  it('the field list mirrors the roundtrip sweep exactly, scraped from its source', () => {
    // Two files carry the professions field list (the roundtrip sweep and
    // this bound); this scrape makes drift impossible in either direction.
    // Anchored at the declaration and closed at the first `] as const`, so
    // surrounding prose cannot leak into the capture.
    const source = readFileSync(
      new URL('./professions_blob_roundtrip.test.ts', import.meta.url),
      'utf8',
    );
    const anchor = source.indexOf('const PROFESSIONS_BLOB_FIELDS = [');
    expect(anchor).toBeGreaterThan(-1);
    const block = source.slice(anchor, source.indexOf('] as const', anchor));
    const scraped = [...block.matchAll(/'([a-zA-Z][a-zA-Z0-9_]*)'/g)].map((m) => m[1]).sort();
    expect(scraped).toEqual([...PROFESSIONS_BLOB_FIELDS].sort());
  });

  it('the settled ceiling honors the byte bound and every entry cap', () => {
    const sim = ceilingSim();
    const s1 = sim.serializeCharacter(sim.playerId) as CharacterState;
    // Settle through one real load (normalizers, one-shot transforms), then
    // prove the result is a fixed point so the measurement is of a REAL
    // steady state, not a pre-normalization inflation.
    const second = makeSim(32);
    const pid2 = second.addPlayer('warrior', 'Ceiling', { state: s1 });
    const s2 = second.serializeCharacter(pid2) as CharacterState;
    const third = makeSim(33);
    const pid3 = third.addPlayer('warrior', 'CeilingB', { state: s2 });
    const s3 = third.serializeCharacter(pid3) as CharacterState;
    expect(s3).toEqual(s2);
    expect(Object.keys(s3).sort()).toEqual(Object.keys(s2).sort());

    // The fixture really reached every field: an unpopulated field would be
    // silently skipped by the measurement's `field in state` filter (the
    // phase 16 review found questCadence lost exactly this way).
    for (const field of PROFESSIONS_BLOB_FIELDS) {
      expect(s2[field], `${field} missing from the settled ceiling`).toBeDefined();
    }

    // Entry caps: the two content-scaled fields sit exactly at content size,
    // the per-player fields at their structural caps. These are what keep
    // the blob linear in CONTENT rather than unbounded per player.
    expect(Object.keys(s2.nodeHarvestCooldowns ?? {})).toHaveLength(GATHER_NODES.length);
    expect(s2.knownRecipes ?? []).toHaveLength(new Set(ALL_RECIPES.map((r) => r.id)).size);
    expect(Object.keys(s2.toolEffectSlots ?? {})).toHaveLength(3);
    expect(Object.keys(s2.questedHobbies ?? {})).toHaveLength(ARCHETYPE_PAIR_TARGETS.length);
    expect((s2.archetype?.attunedPairs ?? []).length).toBeLessThanOrEqual(
      ARCHETYPE_PAIR_TARGETS.length,
    );
    expect(Object.keys(s2.townFocus ?? {})).toHaveLength(
      Object.keys(HARVEST_COMPONENT_ITEMS).length,
    );
    expect(Object.keys(s2.craftSkills ?? {})).toHaveLength(CRAFT_RING.length);
    expect(Object.keys(s2.gatheringProficiency ?? {})).toHaveLength(
      Object.keys(GATHERING_PROFESSIONS).length,
    );
    expect(Object.keys(s2.questCadence ?? {})).toHaveLength(
      Object.values(QUESTS).filter((q) => q.repeatCadenceTicks).length,
    );
    expect(Object.keys(s2.equipmentInstance ?? {})).toHaveLength(EQUIP_SLOTS.length);

    // The byte bound itself, on the settled state.
    const bytes = professionsBytes(s2);
    expect(bytes).toBeGreaterThan(8192); // the fixture is genuinely a ceiling, not a near-empty blob
    expect(bytes).toBeLessThanOrEqual(PROFESSIONS_BYTE_CEILING);
  });

  it('oversized junk drops on load, alone: bogus recipe ids and a corrupt signer', () => {
    // The write side is deliberately load-bounded (the node_persist doctrine:
    // both anti-tamper arms live on the LOAD side), so the junk serializes
    // once and the next load is where the bound bites.
    const sim = ceilingSim();
    const meta = sim.players.get(sim.playerId) as PlayerMeta;
    meta.knownRecipes.add('x'.repeat(500));
    const s1 = sim.serializeCharacter(sim.playerId) as CharacterState;
    expect(s1.knownRecipes?.some((id) => id.length > MAX_KNOWN_RECIPE_ID_LENGTH)).toBe(true);
    const corruptSlot = EQUIP_SLOTS[0];
    const keptSlot = EQUIP_SLOTS[1];
    const corrupt = s1.equipmentInstance?.[corruptSlot];
    if (!corrupt) throw new Error('ceiling fixture lost its first equip instance');
    corrupt.signer = 'S'.repeat(MAX_CRAFTED_BY_LENGTH + 1);
    const second = makeSim(34);
    const pid2 = second.addPlayer('warrior', 'Junk', { state: s1 });
    const s2 = second.serializeCharacter(pid2) as CharacterState;
    // The bogus id dropped, every legal id (retired shapes included) survived.
    expect(s2.knownRecipes?.every((id) => id.length <= MAX_KNOWN_RECIPE_ID_LENGTH)).toBe(true);
    expect(s2.knownRecipes).toHaveLength((s1.knownRecipes?.length ?? 0) - 1);
    // The corrupt signer dropped ALONE: its slot's instance survives, and a
    // legal maximum-length signer on another slot is untouched.
    expect(s2.equipmentInstance?.[corruptSlot]?.signer).toBeUndefined();
    expect(s2.equipmentInstance?.[corruptSlot]?.enchant).toBe('enchant_weapon_might');
    expect(s2.equipmentInstance?.[keptSlot]?.signer).toBe('A'.repeat(MAX_CRAFTED_BY_LENGTH));
  });
});
