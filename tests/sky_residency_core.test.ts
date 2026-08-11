import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeSkyResidencyPlan,
  SKY_EVICT_RADIUS,
  SKY_KEEP_RADIUS,
  type SkyResidencyRegion,
} from '../src/render/sky_residency_core';
import { INITIAL_SKY_PREWARM_RADIUS, MAX_OUTDOOR_FOG_FAR } from '../src/render/zone_streaming';

// The per-biome sky HDR stores used to grow for a whole session (a 2k dome
// DataTexture is ~16.8 MB of CPU pixels plus the same on the GPU, times the
// shipped sky keys). This is the policy that bounds them.

type Key = 'vale' | 'marsh' | 'peaks' | 'ember' | 'frost';

const region = (key: Key, minX: number, maxX: number, minZ: number, maxZ: number) =>
  ({ key, minX, maxX, minZ, maxZ }) satisfies SkyResidencyRegion<Key>;

describe('sky residency plan', () => {
  it('anchors its radii to the streaming envelope, with a keep/evict hysteresis band', () => {
    // KEEP is the ceiling of every horizon the background prepare lane can ask
    // for, so eviction can never fight the lane streaming those zones in.
    expect(SKY_KEEP_RADIUS).toBe(MAX_OUTDOOR_FOG_FAR);
    expect(SKY_EVICT_RADIUS).toBe(MAX_OUTDOOR_FOG_FAR + INITIAL_SKY_PREWARM_RADIUS);
    expect(SKY_EVICT_RADIUS).toBeGreaterThan(SKY_KEEP_RADIUS);
  });

  it('ensures a missing biome whose rectangle sits inside the keep radius', () => {
    const plan = computeSkyResidencyPlan<Key>({
      regions: [region('vale', -100, 100, -100, 100), region('marsh', -100, 100, 200, 400)],
      cameraX: 0,
      cameraZ: 0,
      resident: ['vale'],
      pinned: ['vale'],
    });
    expect(plan.ensure).toEqual(['marsh']);
    expect(plan.evict).toEqual([]);
  });

  it('orders the ensure list nearest first', () => {
    const plan = computeSkyResidencyPlan<Key>({
      regions: [
        region('marsh', -100, 100, 600, 700),
        region('peaks', -100, 100, 200, 300),
        region('vale', -100, 100, -100, 100),
      ],
      cameraX: 0,
      cameraZ: 0,
      resident: [],
      pinned: [],
    });
    expect(plan.ensure).toEqual(['vale', 'peaks', 'marsh']);
  });

  it('evicts a resident biome past the evict radius', () => {
    const far = SKY_EVICT_RADIUS + 10;
    const plan = computeSkyResidencyPlan<Key>({
      regions: [region('vale', -100, 100, -100, 100), region('ember', -100, 100, far, far + 100)],
      cameraX: 0,
      cameraZ: 0,
      resident: ['vale', 'ember'],
      pinned: ['vale'],
    });
    expect(plan.evict).toEqual(['ember']);
    expect(plan.ensure).toEqual([]);
  });

  it('holds a resident biome inside the hysteresis band instead of thrashing it', () => {
    const inBand = (SKY_KEEP_RADIUS + SKY_EVICT_RADIUS) / 2;
    const regions = [
      region('vale', -100, 100, -100, 100),
      region('ember', -100, 100, inBand, 9999),
    ];
    const plan = computeSkyResidencyPlan<Key>({
      regions,
      cameraX: 0,
      cameraZ: 0,
      resident: ['vale', 'ember'],
      pinned: [],
    });
    // Past KEEP, so it is not re-ensured; short of EVICT, so it is not dropped.
    expect(plan.evict).toEqual([]);
    expect(plan.ensure).toEqual([]);
    // ...and the same band is a no-op for a biome that is NOT resident.
    const missing = computeSkyResidencyPlan<Key>({
      regions,
      cameraX: 0,
      cameraZ: 0,
      resident: ['vale'],
      pinned: [],
    });
    expect(missing.ensure).toEqual([]);
    expect(missing.evict).toEqual([]);
  });

  it('never evicts a pinned biome, however far the camera has travelled', () => {
    const far = SKY_EVICT_RADIUS * 4;
    const plan = computeSkyResidencyPlan<Key>({
      regions: [region('vale', -100, 100, -100, 100), region('ember', -100, 100, far, far + 100)],
      cameraX: 0,
      cameraZ: far + 40,
      resident: ['vale', 'ember'],
      // The dome's live pair: their textures are bound into shader uniforms.
      pinned: ['vale'],
    });
    expect(plan.evict).toEqual([]);
  });

  it('measures a multi-zone biome by its NEAREST rectangle', () => {
    const far = SKY_EVICT_RADIUS + 200;
    const regions = [
      region('vale', -100, 100, far, far + 100),
      region('vale', -100, 100, -100, 100),
      region('marsh', -100, 100, far, far + 100),
    ];
    const plan = computeSkyResidencyPlan<Key>({
      regions,
      cameraX: 0,
      cameraZ: 0,
      resident: ['vale', 'marsh'],
      pinned: [],
    });
    expect(plan.evict).toEqual(['marsh']);
  });

  it('evicts a resident biome that no region draws any more', () => {
    const plan = computeSkyResidencyPlan<Key>({
      regions: [region('vale', -100, 100, -100, 100)],
      cameraX: 0,
      cameraZ: 0,
      resident: ['vale', 'frost'],
      pinned: [],
    });
    expect(plan.evict).toEqual(['frost']);
    // ...unless it is pinned, which outranks every distance rule.
    const pinnedPlan = computeSkyResidencyPlan<Key>({
      regions: [region('vale', -100, 100, -100, 100)],
      cameraX: 0,
      cameraZ: 0,
      resident: ['vale', 'frost'],
      pinned: ['frost'],
    });
    expect(pinnedPlan.evict).toEqual([]);
  });

  it('restricts the ensure arm to the keys the caller declared ensurable', () => {
    const regions = [region('vale', -100, 100, -100, 100), region('marsh', -100, 100, 200, 400)];
    const open = computeSkyResidencyPlan<Key>({
      regions,
      cameraX: 0,
      cameraZ: 0,
      resident: [],
      pinned: [],
    });
    expect(open.ensure).toEqual(['vale', 'marsh']);
    const restricted = computeSkyResidencyPlan<Key>({
      regions,
      cameraX: 0,
      cameraZ: 0,
      resident: [],
      pinned: [],
      ensurable: ['marsh'],
    });
    expect(restricted.ensure).toEqual(['marsh']);
    // An empty ensurable set is a real restriction, not "unset".
    const none = computeSkyResidencyPlan<Key>({
      regions,
      cameraX: 0,
      cameraZ: 0,
      resident: [],
      pinned: [],
      ensurable: [],
    });
    expect(none.ensure).toEqual([]);
  });

  it('returns empty plans for empty inputs', () => {
    const plan = computeSkyResidencyPlan<Key>({
      regions: [],
      cameraX: 0,
      cameraZ: 0,
      resident: [],
      pinned: [],
    });
    expect(plan).toEqual({ ensure: [], evict: [] });
  });

  it('accepts caller radii and keeps evict at or beyond keep', () => {
    const regions = [region('vale', -100, 100, 300, 400)];
    const kept = computeSkyResidencyPlan<Key>({
      regions,
      cameraX: 0,
      cameraZ: 0,
      resident: [],
      pinned: [],
      keepRadius: 400,
      evictRadius: 500,
    });
    expect(kept.ensure).toEqual(['vale']);
    // A caller-supplied evict radius under keep would let a biome be ensured
    // and evicted by the same plan: it is clamped up to keep instead.
    const clamped = computeSkyResidencyPlan<Key>({
      regions,
      cameraX: 0,
      cameraZ: 0,
      resident: ['vale'],
      pinned: [],
      keepRadius: 400,
      evictRadius: 10,
    });
    expect(clamped.evict).toEqual([]);
  });
});

describe('renderer sky-residency driver', () => {
  const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');

  it('runs the plan on the zone-streaming recheck cadence, not per frame', () => {
    // queueVisibleZonePrepares is the one path that already knows the camera
    // travelled ZONE_STREAM_RECHECK_DISTANCE; the call sits past that guard.
    const start = renderer.indexOf('private queueVisibleZonePrepares(horizon: number): void {');
    expect(start).toBeGreaterThan(0);
    const end = renderer.indexOf('\n  }', start);
    const body = renderer.slice(start, end);
    expect(body).toContain('this.updateSkyResidency(cameraX, cameraZ)');
    expect(body.indexOf('this.updateSkyResidency')).toBeGreaterThan(
      body.indexOf('this.visibleZoneCheckFar = horizon'),
    );
    expect(renderer.match(/this\.updateSkyResidency\(/g)?.length).toBe(1);
  });

  it('pins the bound dome pair and the bound IBL out of the evict arm', () => {
    const start = renderer.indexOf('private updateSkyResidency(');
    const end = renderer.indexOf('\n  }', start);
    const body = renderer.slice(start, end);
    expect(body).toContain('...currentDomeBiomes(),');
    expect(body).toContain('this.envTransition.current,');
    // The pending arm of an in-flight IBL ease is pinned too (review round 1).
    expect(body).toContain('this.envTransition.pending !== null');
    expect(body).toContain('resident: residentSkyBiomes()');
    // Only a prepared zone's sky is this lane's to restore.
    expect(body).toContain('this.preparedZones.has(zoneId)');
    expect(body).toContain('for (const biome of releaseSkyBiomeAssets(plan.evict))');
  });

  it('re-ensures on the idle prewarm discipline without re-preparing the zone', () => {
    const start = renderer.indexOf('private ensureSkyResidency(biome: SkyKey): void {');
    expect(start).toBeGreaterThan(0);
    const end = renderer.indexOf('\n  }\n', start);
    const body = renderer.slice(start, end);
    // Same three steps prepareZoneSky's idle arm takes: chunked idle uploads
    // for both textures with the indivisible PMREM unit on the shared queue.
    expect(body).toContain('await ensureSkyBiomeAssets([biome])');
    expect(body).toContain('if (!this.skyView.skyBiomeAssetsResident(biome)) return;');
    expect(body).toContain('await this.prewarmTextureInIdle(this.skyView.envTexture(biome))');
    expect(body).toContain('await this.prewarmTextureInIdle(this.skyView.domeTexture(biome))');
    expect(body).toContain('await idleSlot(IDLE_PREWARM_TIMEOUT_MS, { maxTimeoutDeferrals: 2 })');
    expect(body).toContain('() => this.ensureEnvironmentBiome(biome)');
    // Never the whole-zone lane, and never a preparedZones write.
    expect(body).not.toContain('prepareZoneAt');
    expect(body).not.toContain('preparedZones');
    // Reentrancy: the fetch memo dedupes the download, this dedupes the warmup.
    expect(body).toContain('this.skyResidencyEnsuring.has(biome)');
    expect(body).toContain('this.skyResidencyEnsuring.add(biome)');
    expect(body).toContain('this.skyResidencyEnsuring.delete(biome)');
  });

  it('restores a prepared zone released sky on the blocking arrival path', () => {
    // prepareZoneAt short-circuits for a prepared zone, so without this the
    // dome would arrive frozen on the previous realm's pair after a teleport
    // back into a realm whose sky had been released.
    const start = renderer.indexOf('  prepareZoneAt(');
    expect(start).toBeGreaterThan(0);
    const guard = renderer.slice(start, renderer.indexOf('const pending =', start));
    expect(guard).toContain('this.preparedZones.has(zoneId)');
    expect(guard).toContain('this.skyView.skyBiomeAssetsResident(biome)');
    expect(guard).toContain(
      "return this.prepareZoneSky(zoneAt(x, z), x, z, opts?.pace === 'idle')",
    );
  });

  it('keeps the single-environment cap on constrained memory intact', () => {
    const start = renderer.indexOf('private evictEnvironmentBiome(biome: SkyKey): void {');
    expect(start).toBeGreaterThan(0);
    const end = renderer.indexOf('\n  }', start);
    const body = renderer.slice(start, end);
    // The constrained profile keeps exactly one env RT for the session and it
    // is always the bound one (resolveEnvironmentPrefilterPlan seeds envBiome
    // from it), so these guards are what stop eviction from re-opening the cap.
    expect(body).toContain('biome === this.envTransition.current ||');
    expect(body).toContain('biome === this.envTransition.pending');
    expect(body).toContain('this.scene.environment === target.texture');
    // Aliased sky urls share one PMREM target across biome keys.
    expect(body).toContain('for (const remaining of this.envRTs.values())');
  });
});
