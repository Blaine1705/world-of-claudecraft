// The professions load rig's pure helpers (scripts/lib/prof_load_util.mjs),
// unit-tested here per the scripts/CLAUDE.md module-first rule.
import { describe, expect, it } from 'vitest';
import { gapStats, sampleStats } from '../scripts/lib/bench_gate.mjs';
import {
  aggregateObservers,
  boundedEnvInt,
  findFishingSpots,
  ipFor,
  lettersOf,
  mulberry32,
  type ObserverSample,
  sanitizeBaseUrl,
} from '../scripts/lib/prof_load_util.mjs';

describe('boundedEnvInt', () => {
  it('clamps into range, falls back on non-numeric, floors decimals like parseInt', () => {
    expect(boundedEnvInt('40', 7, 1, 100)).toBe(40);
    expect(boundedEnvInt('0', 7, 1, 100)).toBe(1);
    expect(boundedEnvInt('999', 7, 1, 100)).toBe(100);
    expect(boundedEnvInt(undefined, 7, 1, 100)).toBe(7);
    expect(boundedEnvInt('abc', 7, 1, 100)).toBe(7);
    expect(boundedEnvInt('12.9', 7, 1, 100)).toBe(12);
  });
});

describe('mulberry32', () => {
  it('is deterministic per seed and distinct across seeds', () => {
    const a1 = mulberry32(0xbeef);
    const a2 = mulberry32(0xbeef);
    const b = mulberry32(0xbee0);
    const seqA1 = [a1(), a1(), a1()];
    const seqA2 = [a2(), a2(), a2()];
    const seqB = [b(), b(), b()];
    expect(seqA1).toEqual(seqA2);
    expect(seqA1).not.toEqual(seqB);
    for (const v of seqA1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('lettersOf and ipFor', () => {
  it('lettersOf is letters-only and distinct across a fleet-sized range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1200; i++) {
      const s = lettersOf(i);
      expect(s).toMatch(/^[a-z]+$/);
      seen.add(s);
    }
    expect(seen.size).toBe(1200);
  });

  it('ipFor stays inside the RFC 1918 10/8 range and never collides across a fleet', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 1201; i++) {
      const ip = ipFor(i);
      expect(ip).toMatch(/^10\.77\.\d{1,3}\.\d{1,3}$/);
      seen.add(ip);
    }
    expect(seen.size).toBe(1201);
  });
});

describe('sanitizeBaseUrl', () => {
  it('strips credentials and trailing slashes, and never throws on junk', () => {
    expect(sanitizeBaseUrl('http://user:secret@127.0.0.1:8799/')).toBe('http://127.0.0.1:8799');
    expect(sanitizeBaseUrl('http://127.0.0.1:8799')).toBe('http://127.0.0.1:8799');
    expect(sanitizeBaseUrl('not a url')).toBe('invalid-url');
    expect(sanitizeBaseUrl('http://u:p@h/x')).not.toContain('secret');
  });
});

describe('findFishingSpots', () => {
  // A synthetic 2-node sim surface: water everywhere except a dry disc around
  // each node, so the spiral must step OUT from the anchor before a cast
  // lands, and the very first anchor cell (dry, water ahead) qualifies.
  const sim = {
    GATHER_NODES: [{ pos: { x: 0, z: 0 } }, { pos: { x: 500, z: 500 } }],
    WORLD_SEED: 1,
    groundHeight: (x: number, z: number, _seed: number) => {
      const nearOrigin = Math.hypot(x, z) < 30 || Math.hypot(x - 500, z - 500) < 30;
      return nearOrigin ? 10 : -10; // dry near nodes, deep water elsewhere
    },
    waterLevelAt: () => 0,
    firstFishableSampleAhead: (x: number, z: number, facing: number, _seed: number) => {
      // fishable when the 24-yard ray tip leaves the dry disc
      const sx = x + Math.sin(facing) * 24;
      const sz = z + Math.cos(facing) * 24;
      const dry = Math.hypot(sx, sz) < 30 || Math.hypot(sx - 500, sz - 500) < 30;
      return dry ? null : { x: sx, z: sz, water: 0 };
    },
    zoneAt: (x: number) => ({ id: x < 250 ? 'west' : 'east' }),
  };

  it('finds dry-footed spots with water ahead, capped at the requested count', () => {
    const spots = findFishingSpots(sim, 6);
    expect(spots.length).toBe(6);
    for (const s of spots) {
      // standing dry
      expect(sim.groundHeight(s.x, s.z, 1)).toBeGreaterThanOrEqual(0);
      // the recorded facing genuinely fishes from there
      expect(sim.firstFishableSampleAhead(s.x, s.z, s.facing, 1)).not.toBeNull();
      expect(['west', 'east']).toContain(s.zoneId);
    }
  });

  it('never stands a bot in the water even when demand outruns the dry shoreline', () => {
    // The dry discs supply at most two rings of candidates per node; asking
    // for MORE than that forces the spiral into open water, where every cell
    // is trivially fishable, so this arm is what actually kills a dropped
    // swimming check (the first mutation round found the cap-6 arm filled
    // entirely from dry cells and never exercised a wet candidate).
    const spots = findFishingSpots(sim, 40);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.length).toBeLessThan(40); // the dry shoreline genuinely ran out
    for (const s of spots) {
      expect(sim.groundHeight(s.x, s.z, 1)).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns an empty list when no water exists, instead of spinning', () => {
    const drySim = { ...sim, firstFishableSampleAhead: () => null };
    expect(findFishingSpots(drySim, 4)).toEqual([]);
  });
});

describe('aggregateObservers', () => {
  const observer = (over: Partial<ObserverSample> = {}): ObserverSample => ({
    role: 'gather',
    snapSizes: [100, 200, 300],
    snapTimes: [0, 50, 100, 150],
    snapCount: 3,
    ncdCount: 1,
    ncdBytes: 40,
    tslotCount: 0,
    tslotBytes: 0,
    ...over,
  });

  it('reduces per role: sizes pool, ratios divide, absent roles stay absent', () => {
    const out = aggregateObservers([observer(), observer({ snapSizes: [400], snapCount: 1 })], {
      gapStats,
      sampleStats,
    });
    expect(out.fish).toBeUndefined();
    const g = out.gather;
    if (!g) throw new Error('gather aggregate missing');
    expect(g.observers).toBe(2);
    expect(g.snapshots).toBe(4);
    expect(g.snapBytes.count).toBe(4);
    expect(g.snapBytes.max).toBe(400);
    expect(g.ncd.presenceRatio).toBe(0.5); // 2 of 4 snapshots carried ncd
    expect(g.ncd.bytesPerSnapshot).toBe(20); // 80 bytes over 4 snapshots
    expect(g.ncd.bytesWhenPresent).toBe(40);
  });

  it('the gap median mirrors the pct floor convention on an even observer count', () => {
    // Two observers with p95 gaps 50 and 100: floor(2/2) = index 1, the
    // UPPER median (100), exactly what pct(sorted, 50) reads for n = 2.
    const out = aggregateObservers(
      [observer({ snapTimes: [0, 50, 100, 150] }), observer({ snapTimes: [0, 100, 200, 300] })],
      { gapStats, sampleStats },
    );
    expect(out.gather?.gapP95Median).toBe(100);
    expect(out.gather?.gapMaxWorst).toBe(100);
  });
});
