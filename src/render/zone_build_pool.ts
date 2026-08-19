// Main-thread half of off-thread zone building: a small worker pool that hands
// out terrain-chunk and water-fill jobs and returns raw typed arrays.
//
// ONE pool for the whole client, shared by terrain.ts and water.ts. Both build
// the same zone at the same moment, so a second pool would only bid against
// this one for the same cores. Hence the lazy singleton below rather than a
// pool per view.
//
// Deliberately FALLIBLE and optional. zoneBuildPool() returns null wherever
// module workers are unavailable (Node under Vitest, an old WebView, a blocked
// CSP), and every caller keeps its existing main-thread path for exactly that
// case. Off-thread generation is a latency optimisation, never a requirement:
// the results are identical either way, which
// tests/terrain_chunk_geometry.test.ts and tests/zone_build_worker.test.ts pin.
//
// Sizing: this work is pure arithmetic, so it scales with cores, but the main
// thread still has to upload the results, and starving it helps nobody. Hence
// a small cap rather than hardwareConcurrency.

import { isBuiltinWorldActive } from '../sim/data';
import type { ChunkGeometryArrays } from './terrain_chunk_build';
import type {
  TerrainChunkRequest,
  WaterFillArrays,
  WaterFillRequest,
  ZoneBuildRequest,
  ZoneBuildResponse,
} from './zone_build_worker';

const MAX_WORKERS = 3;

export interface ZoneBuildPool {
  /** Resolves with the chunk's arrays, or null if the worker failed and the
   *  caller should build it on the main thread instead. */
  buildChunk(job: Omit<TerrainChunkRequest, 'id' | 'kind'>): Promise<ChunkGeometryArrays | null>;
  /** Resolves with the sheet's shore attributes, or null if the worker failed
   *  and the caller should bake them on the main thread instead. The coordinate
   *  arrays are TRANSFERRED, so the caller must hand over arrays it built for
   *  this job and not read them afterwards. */
  fillWater(job: Omit<WaterFillRequest, 'id' | 'kind'>): Promise<WaterFillArrays | null>;
  /** How many jobs can be in flight before a submission starts queueing. */
  readonly size: number;
  dispose(): void;
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

function spawn(): Worker | null {
  try {
    return new Worker(new URL('./zone_build_worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

export function createZoneBuildPool(): ZoneBuildPool | null {
  if (typeof Worker === 'undefined') return null;
  const first = spawn();
  if (!first) return null;

  const hardware =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 2;
  // Leave the main thread a core: it still uploads every result.
  const target = Math.max(1, Math.min(MAX_WORKERS, hardware - 1));
  const workers: PoolWorker[] = [{ worker: first, busy: false }];
  for (let i = 1; i < target; i++) {
    const worker = spawn();
    if (worker) workers.push({ worker, busy: false });
  }

  const pending = new Map<number, (response: ZoneBuildResponse) => void>();
  const waiting: (() => void)[] = [];
  let nextId = 1;
  let disposed = false;

  for (const entry of workers) {
    entry.worker.onmessage = (event: MessageEvent<ZoneBuildResponse>) => {
      const resolve = pending.get(event.data.id);
      pending.delete(event.data.id);
      entry.busy = false;
      resolve?.(event.data);
      waiting.shift()?.();
    };
    entry.worker.onerror = () => {
      // A worker-level error has no job id, so fail every job it could have
      // been running rather than leaking the promises.
      entry.busy = false;
      for (const [id, resolve] of [...pending]) {
        pending.delete(id);
        resolve({ id, ok: false, error: 'zone build worker error' });
      }
      waiting.shift()?.();
    };
  }

  const claim = async (): Promise<PoolWorker | null> => {
    for (;;) {
      if (disposed) return null;
      const free = workers.find((entry) => !entry.busy);
      if (free) {
        free.busy = true;
        return free;
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
  };

  const submit = async (
    job: Omit<TerrainChunkRequest, 'id'> | Omit<WaterFillRequest, 'id'>,
    transfer?: Transferable[],
  ): Promise<ZoneBuildResponse | null> => {
    const entry = await claim();
    if (!entry) return null;
    const id = nextId++;
    return await new Promise<ZoneBuildResponse>((resolve) => {
      pending.set(id, resolve);
      entry.worker.postMessage({ ...job, id } as ZoneBuildRequest, transfer ?? []);
    });
  };

  return {
    size: workers.length,
    async buildChunk(job): Promise<ChunkGeometryArrays | null> {
      const response = await submit({ ...job, kind: 'chunk' });
      if (!response?.ok || response.kind !== 'chunk') return null;
      return {
        positions: response.positions,
        normals: response.normals,
        colors: response.colors,
        uvs: response.uvs,
        splats: response.splats,
        extras: response.extras,
        indices: response.indices,
      };
    },
    async fillWater(job): Promise<WaterFillArrays | null> {
      const response = await submit({ ...job, kind: 'water-fill' }, [job.x.buffer, job.z.buffer]);
      if (!response?.ok || response.kind !== 'water-fill') return null;
      return { shoreDepth: response.shoreDepth, shoreSlope: response.shoreSlope };
    },
    dispose(): void {
      disposed = true;
      for (const entry of workers) entry.worker.terminate();
      // Release anything still parked on claim(), so a disposed view's build
      // loop unwinds instead of hanging on a promise nothing will settle.
      while (waiting.length > 0) waiting.shift()?.();
      for (const [id, resolve] of [...pending]) {
        pending.delete(id);
        resolve({ id, ok: false, error: 'pool disposed' });
      }
    },
  };
}

let shared: ZoneBuildPool | null | undefined;

/** The one pool, spawned on first use. Null where module workers are
 *  unavailable, and the null is remembered so a workerless host does not retry
 *  the spawn per chunk. */
export function zoneBuildPool(): ZoneBuildPool | null {
  // A custom world (editor play-test) lives in THIS thread's module state; a
  // worker samples its own copy of the content, which is always the built-in
  // world, so it would bake the wrong ground and shorelines. Fall back to the
  // main-thread paths while one is active (the spawned pool is kept for the
  // return to the built-in world).
  if (!isBuiltinWorldActive()) return null;
  if (shared === undefined) shared = createZoneBuildPool();
  return shared;
}

/** Tears the pool down (the terrain view's cancelStreaming, i.e. a renderer
 *  teardown or a graphics rebuild) and forgets it, so the next zone build
 *  spawns a fresh one instead of finding a permanently disposed pool. */
export function disposeZoneBuildPool(): void {
  shared?.dispose();
  shared = undefined;
}
