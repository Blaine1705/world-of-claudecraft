import type * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { DungeonInteriors } from '../src/render/dungeon';

const buildDelveModuleMock = vi.fn();

vi.mock('../src/render/delve_interiors', () => ({
  buildDelveModule: buildDelveModuleMock,
}));

vi.mock('../src/render/interior_kit', () => ({
  ensureDelveInteriorKit: vi.fn(() => Promise.resolve()),
}));

const group = (name: string) => ({ name }) as THREE.Group;

function deferredGroup() {
  let resolve!: (group: THREE.Group) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<THREE.Group>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flushPromises = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('DelveInteriorTracker', () => {
  it('rebuilds a rolled-back module after a stale replacement build rejects', async () => {
    const buildResults = [deferredGroup(), deferredGroup(), deferredGroup()];
    const builds = [...buildResults];
    buildDelveModuleMock.mockImplementation(() => {
      const build = builds.shift();
      if (!build) throw new Error('unexpected delve build');
      return build.promise;
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { DelveInteriorTracker } = await import('../src/render/delve_interior_tracker');
    const retired: THREE.Group[] = [];
    const built = new Set<string>();
    const tracker = new DelveInteriorTracker(
      () => ({}) as DungeonInteriors,
      (stale) => retired.push(stale),
      built,
    );

    tracker.buildAll('run', 0, { x: 10, z: 20 }, ['litany_ring']);
    expect(buildDelveModuleMock).toHaveBeenCalledTimes(1);
    buildResults[0]?.resolve(group('old'));
    await flushPromises();
    expect(built.has('delve:run:0:0')).toBe(true);

    tracker.buildAll('run', 0, { x: 10, z: 20 }, ['litany_sluice']);
    expect(buildDelveModuleMock).toHaveBeenCalledTimes(2);
    expect(retired.map((stale) => stale.name)).toEqual(['old']);
    expect(built.has('delve:run:0:0')).toBe(false);
    buildResults[1]?.reject(new Error('replacement failed'));
    await flushPromises();

    tracker.buildAll('run', 0, { x: 10, z: 20 }, ['litany_ring']);
    expect(buildDelveModuleMock).toHaveBeenCalledTimes(3);
    expect(buildDelveModuleMock.mock.calls[2]?.[1]).toBe('litany_ring');

    warnSpy.mockRestore();
  });
});
