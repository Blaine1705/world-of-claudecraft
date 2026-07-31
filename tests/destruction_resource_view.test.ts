import { describe, expect, it } from 'vitest';
import { destructionRuinPips } from '../src/ui/hud/warlock/destruction_resource_view';

describe('destruction resource view', () => {
  it('shows a clamped five-pip Ruin meter only for committed Destruction', () => {
    const auras = [{ kind: 'destruction_ruin', stacks: 3 }];
    expect(destructionRuinPips('destruction', auras)).toBe(3);
    expect(destructionRuinPips('affliction', auras)).toBe(0);
    expect(destructionRuinPips('destruction', [{ kind: 'destruction_ruin', stacks: 99 }])).toBe(5);
    expect(destructionRuinPips('destruction', [])).toBe(0);
  });
});
