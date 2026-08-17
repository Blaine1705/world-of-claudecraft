// Pins the authored NPC look roster (src/render/characters/npc_looks.ts):
// coverage (EVERY NpcDef id resolves to a composed look), validity (every
// authored value survives normalizeAppearance byte-identical, so a typo'd
// style id cannot silently clamp to the default face), distinctness (no two
// NPCs share an appearance), and the manifest contract (every prop set has
// its derived npc_modular_<id> VisualDef, every def resolvable).

import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import { ARMOR_SETS, ARMOR_SLOTS, normalizeAppearance } from '../src/render/characters/modular';
import {
  NPC_LOOKS,
  NPC_PROP_SET_IDS,
  npcLookFor,
  npcModularKeyFor,
} from '../src/render/characters/npc_looks';
import { NPCS } from '../src/sim/data';

describe('npc looks roster', () => {
  it('covers every NpcDef id (every world NPC composes)', () => {
    const missing = Object.keys(NPCS).filter((id) => npcLookFor(id) === null);
    expect(missing).toEqual([]);
  });

  it('covers the NPC-bodied quest actors and the dev vendor', () => {
    for (const id of [
      'ptr_dev_vendor',
      'fisher_bram',
      'apprentice_wren',
      'castaway_navigator',
      'gravedigger_mosley',
    ]) {
      expect(npcLookFor(id), id).not.toBeNull();
    }
  });

  it('recurring characters share one look across their hub ids', () => {
    expect(npcLookFor('brother_aldric_fen')).toBe(npcLookFor('brother_aldric'));
    expect(npcLookFor('brother_aldric_highwatch')).toBe(npcLookFor('brother_aldric'));
    expect(npcLookFor('brother_aldric_raid')).toBe(npcLookFor('brother_aldric'));
    expect(npcLookFor('scout_maren_highwatch')).toBe(npcLookFor('scout_maren'));
    expect(npcLookFor('brother_halven_marsh')).toBe(npcLookFor('brother_halven'));
  });

  it('resolves to a stable object identity (caches key off it)', () => {
    for (const id of Object.keys(NPCS)) {
      expect(npcLookFor(id)).toBe(npcLookFor(id));
    }
  });

  it('every authored appearance value survives normalization unchanged', () => {
    for (const [id, def] of Object.entries(NPC_LOOKS)) {
      const normalized = normalizeAppearance(def.app) as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(def.app)) {
        expect(normalized[key], `${id}.${key}`).toEqual(value);
      }
    }
  });

  it('no two NPCs share an authored appearance', () => {
    const seen = new Map<string, string>();
    for (const [id, def] of Object.entries(NPC_LOOKS)) {
      const sig = JSON.stringify(normalizeAppearance(def.app));
      const prior = seen.get(sig);
      expect(prior, `${id} duplicates ${prior}`).toBeUndefined();
      seen.set(sig, id);
    }
  });

  it('worn loadouts reference only real slots and sets', () => {
    for (const [id, def] of Object.entries(NPC_LOOKS)) {
      for (const [slot, set] of Object.entries(def.worn)) {
        expect(ARMOR_SLOTS, `${id} slot ${slot}`).toContain(slot);
        if (set !== null && set !== undefined) {
          expect(ARMOR_SETS, `${id} ${slot}=${set}`).toContain(set);
        }
      }
    }
  });

  it('every prop set derives a modular VisualDef, and every NPC resolves one', () => {
    for (const propSet of NPC_PROP_SET_IDS) {
      const def = VISUALS[`npc_modular_${propSet}`];
      expect(def, propSet).toBeDefined();
      expect(def.modular, propSet).toBe(true);
    }
    for (const id of [...Object.keys(NPCS), ...Object.keys(NPC_LOOKS)]) {
      const key = npcModularKeyFor(id);
      expect(VISUALS[key], `${id} -> ${key}`).toBeDefined();
    }
    const unknownPropSets = Object.entries(NPC_LOOKS)
      .filter(([, def]) => !NPC_PROP_SET_IDS.includes(def.props))
      .map(([id]) => id);
    expect(unknownPropSets).toEqual([]);
  });
});
