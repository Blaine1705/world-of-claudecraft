import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function mockEmptyAssetLoads(): void {
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn(() => new Promise(() => {})),
    loadHdr: vi.fn(() => new Promise(() => {})),
    loadTexture: vi.fn(() => new Promise(() => {})),
    releaseGltf: vi.fn(),
  }));
  const texture = (): THREE.DataTexture => {
    const data = new Uint8Array([255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  };
  vi.doMock('../src/render/textures', () => ({
    groundDetailTexture: vi.fn(texture),
    groundSplatMaps: vi.fn(() => ({
      grass: texture(),
      dirt: texture(),
      rock: texture(),
      sand: texture(),
      mud: texture(),
      snow: texture(),
    })),
    macroNoiseTexture: vi.fn(texture),
    skyTexture: vi.fn(texture),
    waterNormalish: vi.fn(texture),
    waterNormalMaps: vi.fn(() => [texture(), texture()]),
  }));
}

// Zone-lazy terrain: buildTerrain() itself builds nothing; each overworld zone
// materializes through ensureZone (driven by the renderer's prepareZoneAt and
// the visible-zone streaming queue). ensureZone yields between build batches
// on setTimeout(0); fake timers drain it deterministically.
describe('progressive terrain build', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds nothing until a zone is ensured, then only that zone streams in', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    const terrain = buildTerrain(20061);
    expect(terrain.group.children).toHaveLength(0);

    const zone = zoneAt(0, 0);
    expect(terrain.isZoneLoaded(zone.id)).toBe(false);
    const task = terrain.ensureZone(zone);
    await vi.runAllTimersAsync();
    await task;

    expect(terrain.group.children.length).toBeGreaterThan(0);
    expect(terrain.isZoneLoaded(zone.id)).toBe(true);
  });

  it('cancelStreaming stops an in-flight zone build from ever completing', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    const terrain = buildTerrain(20061);
    const zone = zoneAt(0, 0);
    const task = terrain.ensureZone(zone);
    // Let at most one yield slice through, then cancel: the loop must bail at
    // its next yield point without marking the zone loaded.
    await vi.advanceTimersByTimeAsync(0);
    const midCount = terrain.group.children.length;
    terrain.cancelStreaming();

    await vi.runAllTimersAsync();
    await task;

    expect(terrain.group.children.length).toBe(midCount);
    expect(terrain.isZoneLoaded(zone.id)).toBe(false);
  });

  it('streamed-in chunks are visible to update()/rebuildRegion() via the same live chunk list', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    const terrain = buildTerrain(20061);
    const task = terrain.ensureZone(zoneAt(0, 0));
    await vi.runAllTimersAsync();
    await task;

    // update() must not throw once zone chunks (added after the initial
    // return) are folded into fog culling.
    expect(() => terrain.update(0, 0, 1000)).not.toThrow();
  });

  it('freezes matrixAutoUpdate on every streamed-in chunk', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    const terrain = buildTerrain(20061);
    const task = terrain.ensureZone(zoneAt(0, 0));
    await vi.runAllTimersAsync();
    await task;

    for (const child of terrain.group.children) {
      expect(child.matrixAutoUpdate).toBe(false);
    }
  });

  it('an idle-paced background build completes and matches the fast build', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    const zone = zoneAt(0, 0);
    const fast = buildTerrain(20061);
    const fastTask = fast.ensureZone(zone);
    await vi.runAllTimersAsync();
    await fastTask;

    // No requestIdleCallback in plain Node, so idleSlot falls back to
    // setTimeout(0); fake timers drain it the same way. The pin is that the
    // idle-paced arm reaches byte-identical/full mesh coverage (zone marked
    // loaded) without stalling or dropping work. Geometry rows are time-sliced
    // now, so it no longer needs extra meshes merely to bound each idle task.
    const idle = buildTerrain(20061);
    const idleTask = idle.ensureZone(zone, undefined, { pace: 'idle' });
    await vi.runAllTimersAsync();
    await idleTask;

    expect(idle.group.children.length).toBe(fast.group.children.length);
    expect(idle.isZoneLoaded(zone.id)).toBe(true);
    fast.cancelStreaming();
    idle.cancelStreaming();
  });

  it('builds the chunks nearest a per-call priority point before farther ones', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    // Anchor away from the zone's row-major origin so the ordering effect is
    // unambiguous: the first built chunks must hug the entry point. The point
    // rides the ensureZone call (a walked crossing's entry), NOT the view's
    // construction point, which deliberately stays unset here.
    const zone = zoneAt(0, 0);
    const point = { x: 0, z: (zone.zMin + zone.zMax) / 2 };
    const terrain = buildTerrain(20061);
    const task = terrain.ensureZone(zone, undefined, { priority: point });

    // Advance a couple of yield slices only, mid-build.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const early = [...terrain.group.children];
    expect(early.length).toBeGreaterThan(0);

    await vi.runAllTimersAsync();
    await task;
    const all = [...terrain.group.children];
    expect(all.length).toBeGreaterThan(early.length);

    const distToPoint = (mesh: THREE.Object3D): number => {
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      return Math.hypot(center.x - point.x, center.z - point.z);
    };
    const earlyClosest = Math.min(...early.map(distToPoint));
    const overallClosest = Math.min(...all.map(distToPoint));
    expect(earlyClosest).toBeCloseTo(overallClosest, 5);
  });
});

// The outdoor fog clamp reads residency per CHUNK through groundResidency(),
// so these pin the terrain side of that seam: what starts pending, and exactly
// when a cell stops being pending.
describe('chunk-level ground residency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const allCells = (grid: { countX: number; countZ: number }): [number, number][] => {
    const out: [number, number][] = [];
    for (let cz = 0; cz < grid.countZ; cz++) {
      for (let cx = 0; cx < grid.countX; cx++) out.push([cx, cz]);
    }
    return out;
  };

  it('starts every buildable cell pending, then settles exactly one zone of them', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    const terrain = buildTerrain(20061);
    const { grid, isPending } = terrain.groundResidency();
    const cells = allCells(grid);
    const pendingCount = (): number => cells.filter(([cx, cz]) => isPending(cx, cz)).length;

    // 792 cells, 96 of them owned by no zone rectangle (the rects do not tile).
    // Those can never be built, so they must never count as pending or the fog
    // would clamp against a hole that never fills.
    expect(cells.length).toBe(792);
    expect(pendingCount()).toBe(696);

    const zone = zoneAt(0, 0);
    const hubCx = Math.floor((zone.hub.x - grid.originX) / grid.size);
    const hubCz = Math.floor((zone.hub.z - grid.originZ) / grid.size);
    expect(isPending(hubCx, hubCz)).toBe(true);

    const before = pendingCount();
    const task = terrain.ensureZone(zone);
    await vi.runAllTimersAsync();
    await task;

    expect(isPending(hubCx, hubCz)).toBe(false);
    // Exactly this zone's cells settled, and nothing outside it.
    expect(before - pendingCount()).toBe(36);
    terrain.cancelStreaming();
  });

  it('clears a cell only once its mesh ATTACHES, never when it is merely claimed', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    const terrain = buildTerrain(20061);
    const { grid, isPending } = terrain.groundResidency();
    const startedPending = allCells(grid).filter(([cx, cz]) => isPending(cx, cz));

    // Idle pace, stopped mid-build: terrain.ts marks a cell in its internal
    // `built` set BEFORE awaiting the geometry, so a residency signal taken
    // from that set would report ground the scene does not have yet and the
    // fog would open over a hole. Residency must follow attachChunk instead.
    const task = terrain.ensureZone(zoneAt(0, 0), undefined, { pace: 'idle' });
    // Stop at the first attached mesh: the zone has 36 cells, so this is
    // unambiguously mid-build. The idle lane awaits a slot before its first
    // geometry, so the clock has to actually move (advancing by 0 is a no-op).
    for (let slice = 0; slice < 500 && terrain.group.children.length === 0; slice++) {
      await vi.advanceTimersByTimeAsync(1);
    }

    const boxes = terrain.group.children.map((mesh) => new THREE.Box3().setFromObject(mesh));
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.length).toBeLessThan(36);
    const cleared = startedPending.filter(([cx, cz]) => !isPending(cx, cz));
    expect(cleared.length).toBeGreaterThan(0);
    for (const [cx, cz] of cleared) {
      const x = grid.originX + (cx + 0.5) * grid.size;
      const z = grid.originZ + (cz + 0.5) * grid.size;
      const covered = boxes.some(
        (box) =>
          x >= box.min.x - 1 && x <= box.max.x + 1 && z >= box.min.z - 1 && z <= box.max.z + 1,
      );
      expect(covered, `cell (${cx}, ${cz}) cleared with no attached mesh over it`).toBe(true);
    }

    terrain.cancelStreaming();
    await vi.runAllTimersAsync();
    await task;
  });
});
