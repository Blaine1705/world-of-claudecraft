// The material_taxonomy module must self-bootstrap when it is the FIRST
// src/sim module an entry evaluates: MATERIAL_ITEM_IDS derives at module
// evaluation by reading the merged ITEMS table, so this file deliberately
// imports NOTHING from src/sim except the module itself (vitest aside), making
// the module the entry point of the whole data.ts closure. Every other suite
// that touches the taxonomy imports data.ts first, so only this file proves
// the derive survives being reached before the tables' own importers.
// IMPORT ORDER IS THE TEST: do not add any other src/sim import to this file.
import { describe, expect, it } from 'vitest';
import { isMaterialItem, MATERIAL_ITEM_IDS } from '../src/sim/material_taxonomy';

describe('material_taxonomy as the first-evaluated sim module', () => {
  it('derives the full set with no import of data.ts ahead of it', () => {
    expect(MATERIAL_ITEM_IDS.size).toBe(45);
    expect(MATERIAL_ITEM_IDS.has('iron_ore')).toBe(true);
    expect(MATERIAL_ITEM_IDS.has('arcanite_bar')).toBe(true);
    expect(isMaterialItem({ id: 'iron_ore' } as never)).toBe(true);
  });
});
