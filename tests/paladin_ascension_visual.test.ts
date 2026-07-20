import { describe, expect, it } from 'vitest';
import { PaladinAscensionVisual } from '../src/render/paladin_ascension_visual';

describe('PaladinAscensionVisual', () => {
  it('keeps all charge symbols visible but freezes their orbit for reduced motion', () => {
    const visual = new PaladinAscensionVisual(1.8);
    const plan = { active: true, charges: 5, lastCharge: false };
    visual.update(plan, 0.5, true);
    const column = visual.group.getObjectByName('paladin-ascension-column');
    if (!column || !('material' in column)) throw new Error('missing Ascension light column');
    const columnMaterial = column.material as {
      color: { getHex(): number };
    };
    const seals = Array.from({ length: 5 }, (_, index) => {
      const seal = visual.group.getObjectByName(`paladin-ascension-seal-${index + 1}`);
      if (!seal) throw new Error(`missing Ascension seal ${index + 1}`);
      return seal;
    });
    const first = seals[0].position.clone();

    visual.update(plan, 0.5, true);
    expect(seals.every((seal) => seal.visible)).toBe(true);
    expect(seals[0].position.equals(first)).toBe(true);
    const normalColor = columnMaterial.color.getHex();

    visual.update(plan, 0.5, false);
    expect(seals[0].position.equals(first)).toBe(false);
    visual.update({ active: true, charges: 1, lastCharge: true }, 0.5, false);
    expect(columnMaterial.color.getHex()).not.toBe(normalColor);
    visual.update({ active: true, charges: 2, lastCharge: false }, 0.5, false);
    expect(seals.map((seal) => seal.visible)).toEqual([true, true, false, false, false]);
    visual.update({ active: false, charges: 0, lastCharge: false }, 0.5, false);
    expect(visual.group.visible).toBe(false);
    visual.dispose();
  });
});
