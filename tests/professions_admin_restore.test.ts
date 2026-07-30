// The R35 GM slot restore (restoreToolEffectSlotAction): a server-admin-only
// mint that installs a tool-effect slot WITHOUT consuming a charm. The claims
// under test: the restored slot is byte-identical to what the real charm mint
// would install minus provenance (craftedBy unset), every refusal arm the real
// mint has still refuses (bad profession, bad effect, refused pair, no tool
// owned), a refusal leaves the parity-load-bearing ABSENCE of the
// toolEffectSlots field untouched, and the player-visible success event fires
// so a live client sees the restore land.
import { describe, expect, it } from 'vitest';
import { restoreToolEffectSlotAction } from '../src/sim/professions/tool_effect_actions';
import { startingDurabilityFor } from '../src/sim/professions/tools';
import { type PlayerMeta, Sim } from '../src/sim/sim';

const makeSim = (seed = 11) => new Sim({ seed, playerClass: 'warrior', autoEquip: false });
const metaOf = (sim: Sim): PlayerMeta => sim.meta(sim.playerId) as PlayerMeta;

function toolEffectEvents(sim: Sim): Array<Record<string, unknown>> {
  return sim.tick().filter((ev) => ev.type === 'toolEffectResult') as unknown as Array<
    Record<string, unknown>
  >;
}

describe('restoreToolEffectSlotAction (GM restore, R35)', () => {
  it('mints a full-charge slot with no charm in bags, sized by the owned tool rarity', () => {
    const sim = makeSim();
    sim.addItem('copper_mining_pick', 1); // tier 1, common; NO charm granted
    const result = restoreToolEffectSlotAction(sim.ctx, 'mining', 'gatherers_cache', sim.playerId);
    expect(result).toBe('ok');
    const slot = metaOf(sim).toolEffectSlots?.mining;
    expect(slot).toBeDefined();
    expect(slot?.effectId).toBe('gatherers_cache');
    const full = startingDurabilityFor('gatherers_cache', 'common');
    expect(slot?.durability).toBe(full);
    expect(slot?.maxDurability).toBe(full);
    expect(slot?.confirmMode).toBe('always');
    expect(slot?.craftedBy).toBeUndefined(); // no consumed copy, no provenance
    // The player sees the restore land: the normal slot success event.
    const events = toolEffectEvents(sim);
    expect(events).toContainEqual(
      expect.objectContaining({ action: 'slot', ok: true, professionId: 'mining' }),
    );
  });

  it('sizes charges by the BEST owned tool, like the real mint (epic pick)', () => {
    const sim = makeSim();
    sim.addItem('arcanite_mining_pick', 1); // tier 5, epic
    expect(restoreToolEffectSlotAction(sim.ctx, 'mining', 'gatherers_cache', sim.playerId)).toBe(
      'ok',
    );
    const slot = metaOf(sim).toolEffectSlots?.mining;
    expect(slot?.maxDurability).toBe(startingDurabilityFor('gatherers_cache', 'epic'));
    expect(slot?.maxDurability).toBeGreaterThan(startingDurabilityFor('gatherers_cache', 'common'));
  });

  it('matches the real charm mint field-for-field except provenance', () => {
    // Real mint on sim A (consumes a self-signed charm), restore on sim B
    // (same tool, no charm). Any divergence beyond craftedBy is drift between
    // the two mint paths.
    const real = makeSim();
    real.addItem('copper_mining_pick', 1);
    real.addItemInstance('gatherers_cache', { signer: metaOf(real).name }, real.playerId, 1);
    real.slotToolEffect('mining', 'gatherers_cache');
    const restored = makeSim();
    restored.addItem('copper_mining_pick', 1);
    restoreToolEffectSlotAction(restored.ctx, 'mining', 'gatherers_cache', restored.playerId);
    const realSlot = { ...metaOf(real).toolEffectSlots?.mining };
    const restoredSlot = { ...metaOf(restored).toolEffectSlots?.mining };
    expect(realSlot.craftedBy).toBe(metaOf(real).name);
    realSlot.craftedBy = undefined;
    expect(restoredSlot).toEqual(realSlot);
  });

  it('refuses with no_tool when the character owns no tool for the profession', () => {
    const sim = makeSim(); // bare hands
    expect(restoreToolEffectSlotAction(sim.ctx, 'mining', 'gatherers_cache', sim.playerId)).toBe(
      'no_tool',
    );
    // Absence, not emptiness: a refusal must not materialize the field (the
    // parity digest hashes the player and an empty object still serializes).
    expect(metaOf(sim).toolEffectSlots).toBeUndefined();
    expect(toolEffectEvents(sim)).toHaveLength(0); // a GM refusal never toasts the player
  });

  it('refuses invalid professions, invalid effects, and refused pairs', () => {
    const sim = makeSim();
    sim.addItem('copper_mining_pick', 1);
    expect(restoreToolEffectSlotAction(sim.ctx, 'cooking', 'gatherers_cache', sim.playerId)).toBe(
      'invalid_request',
    );
    expect(restoreToolEffectSlotAction(sim.ctx, 'mining', 'springback', sim.playerId)).toBe(
      'invalid_request',
    );
    expect(metaOf(sim).toolEffectSlots).toBeUndefined();
  });

  it('refuses offline (unresolvable) pids without touching anything', () => {
    const sim = makeSim();
    expect(restoreToolEffectSlotAction(sim.ctx, 'mining', 'gatherers_cache', 424242)).toBe(
      'offline',
    );
  });
});
