// The tool-effect slot, end to end: the command that installs one, the read
// surface both worlds serve, and the persistence round trip.
//
// The claim under everything here is that a player who has never slotted an
// effect is byte-identical to one from before the field existed. PlayerMeta
// keeps `toolEffectSlots` ABSENT rather than an empty object, because an empty
// object still serializes into the parity state digest and initialising it
// moved every golden in the suite for a feature no scenario uses. Several arms
// below assert absence specifically, not emptiness.
import { describe, expect, it } from 'vitest';
import { GATHERING_PROFESSION_IDS, TOOL_EFFECTS } from '../src/sim/content/professions';
import { RARITY_DURABILITY_BONUS, startingDurabilityFor } from '../src/sim/professions/tools';
import { type CharacterState, type PlayerMeta, Sim } from '../src/sim/sim';

const makeSim = (seed = 11) => new Sim({ seed, playerClass: 'warrior', autoEquip: false });
const metaOf = (sim: Sim): PlayerMeta => sim.meta(sim.playerId) as PlayerMeta;

/** A sim whose player carries `itemId`, ready to slot. */
function simHolding(itemId: string): Sim {
  const sim = makeSim();
  sim.addItem(itemId, 1);
  return sim;
}

describe('the slot is absent until a player actually slots something', () => {
  it('a fresh character has NO toolEffectSlots field at all, and reads an empty view', () => {
    const sim = makeSim();
    // Absence, not emptiness: `toBeUndefined` and not `toEqual({})`, because the
    // parity digest hashes the player and an empty object still serializes.
    expect(metaOf(sim).toolEffectSlots).toBeUndefined();
    expect(sim.toolEffectSlots).toEqual([]);
  });

  it('a refused slot leaves the field absent rather than creating an empty map', () => {
    // Every deny arm must return BEFORE the lazy `??= {}`, or a player who
    // merely tried something illegal would diverge from one who never tried.
    const sim = makeSim(); // carries no gathering tool at all
    sim.slotToolEffect('mining', 'gatherers_cache');
    expect(metaOf(sim).toolEffectSlots, 'no tool owned').toBeUndefined();

    const withTool = simHolding('copper_mining_pick');
    withTool.slotToolEffect('not_a_profession', 'gatherers_cache');
    expect(metaOf(withTool).toolEffectSlots, 'unknown profession').toBeUndefined();
    withTool.slotToolEffect('mining', 'not_an_effect');
    expect(metaOf(withTool).toolEffectSlots, 'unknown effect').toBeUndefined();
    // And the same sim CAN slot, so the three refusals above are refusals and
    // not a broken fixture.
    withTool.slotToolEffect('mining', 'gatherers_cache');
    expect(metaOf(withTool).toolEffectSlots?.mining).toBeDefined();
  });

  it('refuses a profession the player owns no REAL tool for, bare hands included', () => {
    // The gate reads bestOwnedGatherToolTierOrNone (NO_TOOL_OWNED), never the
    // bare-hands floor, so carrying nothing is not carrying a tier-1 tool.
    const sim = simHolding('copper_mining_pick');
    sim.slotToolEffect('logging', 'gatherers_cache');
    expect(metaOf(sim).toolEffectSlots?.logging).toBeUndefined();
    // A pick is a mining tool: it must not satisfy logging's gate.
    sim.slotToolEffect('mining', 'gatherers_cache');
    expect(metaOf(sim).toolEffectSlots?.mining).toBeDefined();
  });
});

describe('slotting mints charges from the best owned tool rarity', () => {
  it('a common tool mints the catalog base, an epic tool mints three rungs more', () => {
    const common = simHolding('copper_mining_pick'); // tier 1, common
    common.slotToolEffect('mining', 'gatherers_cache');
    expect(common.toolEffectSlots[0].charges).toBe(
      startingDurabilityFor('gatherers_cache', 'common'),
    );

    const epic = simHolding('arcanite_mining_pick'); // tier 5, epic
    epic.slotToolEffect('mining', 'gatherers_cache');
    expect(epic.toolEffectSlots[0].charges).toBe(startingDurabilityFor('gatherers_cache', 'epic'));
    // The two really differ, so the rarity read is not a coincidence.
    expect(epic.toolEffectSlots[0].charges - common.toolEffectSlots[0].charges).toBe(
      RARITY_DURABILITY_BONUS * 3,
    );
  });

  it('reads the BEST owned tool when the player carries several', () => {
    const sim = simHolding('copper_mining_pick');
    sim.addItem('arcanite_mining_pick', 1);
    sim.slotToolEffect('mining', 'gatherers_cache');
    expect(sim.toolEffectSlots[0].charges).toBe(startingDurabilityFor('gatherers_cache', 'epic'));
  });

  it('maxCharges equals the minted charges, so a recharge restores what it was minted with', () => {
    const sim = simHolding('arcanite_mining_pick');
    sim.slotToolEffect('mining', 'artisans_eye');
    const [row] = sim.toolEffectSlots;
    expect(row.maxCharges).toBe(row.charges);
    expect(row.maxCharges).toBe(startingDurabilityFor('artisans_eye', 'epic'));
  });

  it('re-slotting resets to full, and switching effect replaces rather than stacks', () => {
    const sim = simHolding('copper_mining_pick');
    sim.slotToolEffect('mining', 'gatherers_cache');
    const meta = metaOf(sim);
    const slot = meta.toolEffectSlots?.mining;
    expect(slot).toBeDefined();
    if (slot) slot.durability = 1;
    sim.slotToolEffect('mining', 'gatherers_cache');
    expect(sim.toolEffectSlots[0].charges).toBe(sim.toolEffectSlots[0].maxCharges);
    // ONE row per profession, never a growing list.
    sim.slotToolEffect('mining', 'artisans_eye');
    expect(sim.toolEffectSlots).toHaveLength(1);
    expect(sim.toolEffectSlots[0].effectId).toBe('artisans_eye');
  });

  it('honors confirmMode, defaulting to always and rejecting a bogus mode', () => {
    const sim = simHolding('copper_mining_pick');
    sim.slotToolEffect('mining', 'gatherers_cache');
    expect(sim.toolEffectSlots[0].confirmMode).toBe('always');
    sim.slotToolEffect('mining', 'gatherers_cache', 'prompt');
    expect(sim.toolEffectSlots[0].confirmMode).toBe('prompt');
    // A mode outside the union refuses outright rather than silently becoming
    // 'always', so a malformed command cannot quietly downgrade a player's
    // explicit prompt-on-use choice.
    sim.slotToolEffect('mining', 'gatherers_cache', 'sometimes' as never);
    expect(sim.toolEffectSlots[0].confirmMode).toBe('prompt');
  });
});

describe('the read surface is one row per profession, sorted, and identity-free', () => {
  it('projects one row per slotted profession, sorted by profession id', () => {
    const sim = simHolding('copper_mining_pick');
    sim.addItem('rusty_hatchet', 1);
    sim.addItem('herb_pouch', 1);
    // Only the professions the player actually has a tool for can be slotted,
    // so derive rather than assume which ones took.
    for (const professionId of GATHERING_PROFESSION_IDS) {
      sim.slotToolEffect(professionId, 'gatherers_cache');
    }
    const rows = sim.toolEffectSlots;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.professionId)).toEqual([...rows.map((r) => r.professionId)].sort());
  });

  it('never projects craftedBy, so no other player identity reaches the client', () => {
    const sim = simHolding('copper_mining_pick');
    sim.slotToolEffect('mining', 'gatherers_cache');
    // The sim-side slot DOES record it (it decides the recharge discount)...
    expect(metaOf(sim).toolEffectSlots?.mining?.craftedBy).toBeDefined();
    // ...and the projection deliberately drops it.
    expect(Object.keys(sim.toolEffectSlots[0]).sort()).toEqual([
      'charges',
      'confirmMode',
      'effectId',
      'maxCharges',
      'professionId',
    ]);
  });

  it('draws no rng, so a player who slots walks the same stream as one who does not', () => {
    // The whole reason depletion became charge-based: the harvest path is
    // golden-pinned at two draws, and a slot must not add a third anywhere.
    const sim = simHolding('copper_mining_pick');
    // The Rng observer seam, which is the only way to count draws without
    // changing the stream: it never affects the returned value or the state.
    const drawn: number[] = [];
    sim.rng.setObserver((v) => drawn.push(v));
    sim.slotToolEffect('mining', 'gatherers_cache');
    sim.slotToolEffect('mining', 'artisans_eye');
    sim.slotToolEffect('nope', 'gatherers_cache');
    sim.rng.setObserver(null);
    expect(drawn).toEqual([]);
  });
});

describe('persistence: absent stays absent, present round-trips', () => {
  it('omits the key entirely for a player with no slot', () => {
    const sim = makeSim();
    const state = sim.serializeCharacter(sim.playerId);
    expect(state).not.toBeNull();
    // `in` and not a value check: writing `toolEffectSlots: undefined` would
    // still add the key to the JSONB row for every character in the realm.
    expect(state && 'toolEffectSlots' in state).toBe(false);
  });

  it('writes the slot and restores it on load', () => {
    const sim = simHolding('arcanite_mining_pick');
    sim.slotToolEffect('mining', 'artisans_eye', 'prompt');
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    expect(state.toolEffectSlots?.mining?.effectId).toBe('artisans_eye');

    const reloaded = makeSim(12);
    const pid = reloaded.addPlayer('warrior', 'Reload', { state });
    const meta = reloaded.meta(pid) as PlayerMeta;
    expect(meta.toolEffectSlots?.mining).toEqual({
      effectId: 'artisans_eye',
      durability: startingDurabilityFor('artisans_eye', 'epic'),
      maxDurability: startingDurabilityFor('artisans_eye', 'epic'),
      craftedBy: expect.any(String),
      confirmMode: 'prompt',
    });
  });

  it('the saved snapshot is a deep copy, so later harvests cannot rewrite it', () => {
    // depleteEffect mutates durability IN PLACE, so a shallow spread would hand
    // the save layer the very object the sim keeps decrementing.
    const sim = simHolding('copper_mining_pick');
    sim.slotToolEffect('mining', 'gatherers_cache');
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    const savedCharges = state.toolEffectSlots?.mining?.durability;
    const live = metaOf(sim).toolEffectSlots?.mining;
    expect(live).toBeDefined();
    if (live) live.durability -= 5;
    expect(state.toolEffectSlots?.mining?.durability).toBe(savedCharges);
  });

  it('a save from before the field existed loads with the field still absent', () => {
    const sim = makeSim();
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    const reloaded = makeSim(13);
    const pid = reloaded.addPlayer('warrior', 'Old', { state });
    expect((reloaded.meta(pid) as PlayerMeta).toolEffectSlots).toBeUndefined();
  });

  it('drops a row naming content that no longer exists, rather than loading it', () => {
    const sim = makeSim();
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    // `as unknown as` deliberately: 'retired_effect' is NOT a ToolEffectId, and
    // that is the entire point of the fixture. A save written before an effect
    // was retired carries exactly this shape, and the type system cannot see
    // persisted JSONB.
    state.toolEffectSlots = {
      mining: {
        effectId: 'retired_effect',
        durability: 5,
        maxDurability: 5,
        confirmMode: 'always',
      },
    } as unknown as CharacterState['toolEffectSlots'];
    const reloaded = makeSim(14);
    const pid = reloaded.addPlayer('warrior', 'Retired', { state });
    // Nothing usable survived, so the field is absent again rather than {}.
    expect((reloaded.meta(pid) as PlayerMeta).toolEffectSlots).toBeUndefined();
    // The bare TOOL_EFFECTS index is why this matters: an unresolvable id would
    // hand applyEffectBonus an undefined def and throw on the next harvest.
    expect(Object.hasOwn(TOOL_EFFECTS, 'retired_effect')).toBe(false);
  });

  it('clamps a corrupt counter instead of loading a negative or over-full charge', () => {
    const sim = makeSim();
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    state.toolEffectSlots = {
      mining: {
        effectId: 'gatherers_cache',
        durability: -8,
        maxDurability: 30,
        confirmMode: 'always',
      },
      logging: {
        effectId: 'gatherers_cache',
        durability: 999,
        maxDurability: 30,
        confirmMode: 'always',
      },
    } as CharacterState['toolEffectSlots'];
    const reloaded = makeSim(15);
    const pid = reloaded.addPlayer('warrior', 'Corrupt', { state });
    const meta = reloaded.meta(pid) as PlayerMeta;
    expect(meta.toolEffectSlots?.mining?.durability).toBe(0);
    expect(meta.toolEffectSlots?.logging?.durability).toBe(30);
  });
});
