// The R35 GM slot restore (restoreToolEffectSlotAction): a server-admin-only
// mint that installs a tool-effect slot WITHOUT consuming a charm. The claims
// under test: the restored slot is byte-identical to what the real charm mint
// would install minus provenance (craftedBy unset), every refusal arm the real
// mint has still refuses (bad profession, bad effect, refused pair, no tool
// owned), a refusal leaves the parity-load-bearing ABSENCE of the
// toolEffectSlots field untouched, and the player-visible success event fires
// so a live client sees the restore land.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    expect(full).toBe(20); // the literal, so this file is not a self-comparison
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

  it('refuses invalid professions, invalid effects, and REFUSED PAIRS', () => {
    const sim = makeSim();
    sim.addItem('copper_mining_pick', 1);
    sim.addItem('ironreel_fishing_rod', 1);
    // Not a gathering profession at all.
    expect(restoreToolEffectSlotAction(sim.ctx, 'cooking', 'gatherers_cache', sim.playerId)).toBe(
      'invalid_request',
    );
    // Not a TOOL_EFFECTS key (the display name "Springback Charm" belongs to
    // quickening_charm; a fabricated id must hit the unknown-effect arm).
    expect(restoreToolEffectSlotAction(sim.ctx, 'mining', 'not_an_effect', sim.playerId)).toBe(
      'invalid_request',
    );
    // REFUSED PAIRS, the slotToolEffectRefused policy line itself: both ids
    // are individually valid, so only the pair policy can refuse these. A
    // Springback (quickening_charm) slot is policy-refused everywhere, and
    // fishing (a real gathering profession, rod owned) accepts no effect.
    expect(restoreToolEffectSlotAction(sim.ctx, 'mining', 'quickening_charm', sim.playerId)).toBe(
      'invalid_request',
    );
    expect(restoreToolEffectSlotAction(sim.ctx, 'fishing', 'gatherers_cache', sim.playerId)).toBe(
      'invalid_request',
    );
    expect(metaOf(sim).toolEffectSlots).toBeUndefined();
  });

  it('refuses to OVERWRITE an intact slot (already_slotted preserves the live row)', () => {
    const sim = makeSim();
    sim.addItem('copper_mining_pick', 1);
    sim.addItemInstance('artisans_eye', { signer: metaOf(sim).name }, sim.playerId, 1);
    sim.slotToolEffect('mining', 'artisans_eye', 'prompt');
    const before = { ...metaOf(sim).toolEffectSlots?.mining };
    expect(restoreToolEffectSlotAction(sim.ctx, 'mining', 'gatherers_cache', sim.playerId)).toBe(
      'already_slotted',
    );
    // The live row keeps its provenance, confirm mode, and ceiling untouched.
    expect(metaOf(sim).toolEffectSlots?.mining).toEqual(before);
  });

  it('refuses offline (unresolvable) pids without touching anything', () => {
    const sim = makeSim();
    expect(restoreToolEffectSlotAction(sim.ctx, 'mining', 'gatherers_cache', 424242)).toBe(
      'offline',
    );
    expect(metaOf(sim).toolEffectSlots).toBeUndefined();
    expect(toolEffectEvents(sim)).toHaveLength(0);
  });

  it('is draw-free: a restore between ticks never moves the rng stream', () => {
    // Two sims from one seed; only one takes a restore between ticks. The
    // per-draw observer counts every draw the restore makes (must be zero),
    // and the streams must stay in lockstep across subsequent ticks: any
    // draw inside the restore path desynchronizes every later value.
    const a = makeSim(77);
    const b = makeSim(77);
    for (const sim of [a, b]) {
      sim.addItem('copper_mining_pick', 1);
      sim.tick();
    }
    let draws = 0;
    b.rng.setObserver(() => {
      draws += 1;
    });
    expect(restoreToolEffectSlotAction(b.ctx, 'mining', 'gatherers_cache', b.playerId)).toBe('ok');
    b.rng.setObserver(null);
    expect(draws).toBe(0);
    for (let i = 0; i < 20; i++) {
      a.tick();
      b.tick();
    }
    for (let i = 0; i < 8; i++) expect(b.rng.next()).toBe(a.rng.next());
  });

  it('stays unreachable from every player path: server/game.ts is the only importer', () => {
    // The free-grant incident guard: a future wire command, dev command, or
    // IWorld wiring that imports the restore must fail HERE, loudly. Walks
    // the real source tree (the repo's source-scan guard idiom), not a
    // hardcoded list of suspects.
    const root = fileURLToPath(new URL('..', import.meta.url));
    const importers: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|mts|cts|tsx)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (
            text.includes('restoreToolEffectSlotAction') &&
            !full.endsWith(path.join('professions', 'tool_effect_actions.ts'))
          ) {
            importers.push(path.relative(root, full).split(path.sep).join('/'));
          }
        }
      }
    };
    for (const top of ['src', 'server', 'headless', 'bot']) walk(path.join(root, top));
    expect(importers).toEqual(['server/game.ts']);
  });
});
