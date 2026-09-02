import { describe, expect, it } from 'vitest';
import { decodeActiveWorldBossIds } from '../src/net/world_boss_snapshot_wire';

describe('world-boss snapshot decoder', () => {
  it('accepts only string ids and deduplicates them', () => {
    expect([...decodeActiveWorldBossIds(['boss_a', 7, 'boss_a', null, 'boss_b'])]).toEqual([
      'boss_a',
      'boss_b',
    ]);
  });

  it('fails closed for a malformed wire value', () => {
    expect([...decodeActiveWorldBossIds({ boss_a: true })]).toEqual([]);
    expect([...decodeActiveWorldBossIds(null)]).toEqual([]);
  });
});
