import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  beginChunkGeometry,
  fillChunkIndexRow,
  fillChunkVertexRow,
} from '../src/render/terrain_chunk_build';

function triangleMultisetFingerprint(indices: Uint16Array): string {
  const triangles: string[] = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    triangles.push(`${indices[offset]}:${indices[offset + 1]}:${indices[offset + 2]}`);
  }
  const hash = createHash('sha256');
  for (const triangle of triangles.sort()) hash.update(`${triangle}\n`);
  return hash.digest('hex');
}

function acmr(indices: Uint16Array, cacheSize: number): number {
  const cache: number[] = [];
  let misses = 0;
  for (const index of indices) {
    const cachedAt = cache.indexOf(index);
    if (cachedAt === -1) {
      misses++;
    } else {
      cache.splice(cachedAt, 1);
    }
    cache.unshift(index);
    if (cache.length > cacheSize) cache.pop();
  }
  return misses / (indices.length / 3);
}

describe('terrain vertex pipeline', () => {
  it('uses exact Uint16 indices and tile order without changing any triangle', () => {
    const state = beginChunkGeometry(-30, -30, 60, 1.2, 20061, true, 2.6, false);
    for (let row = 0; row < state.gh; row++) fillChunkVertexRow(state, row);
    for (let row = 0; row < state.gh - 1; row++) fillChunkIndexRow(state, row);

    expect(state.positions.length / 3).toBe(2_809);
    expect(state.indices).toBeInstanceOf(Uint16Array);
    expect(Math.max(...state.indices)).toBeLessThanOrEqual(65_534);

    // Literal minted from the current heightfield's row-major stream (the
    // diagonal split follows vertex heights, so the natural-relief terrain
    // re-minted it). It ignores only triangle submission order, retaining
    // each triangle's winding exactly.
    // Re-minted 2026-08 for the harbor move (d19aa33f76, the New Eastbrook
    // program, docs/design/eastbrook-revamp/site-plan.md): the probe chunk
    // spans the vacated old town ground and the rotated Wolf Run camps,
    // whose re-grades flip diagonal splits. Re-minted once more when the
    // street re-threads and camp spacing fixes rode the same change (roads
    // are height appliers). Computed twice in separate processes on the
    // live tree, identical both times.
    expect(triangleMultisetFingerprint(state.indices)).toBe(
      '2dc5a1066281463530255cb18b8594fb7592e2604ad34caca24406866fa0176d',
    );
    const tiledAcmr = acmr(state.indices, 16);
    expect(tiledAcmr).toBeLessThan(0.7);
  });

  it('accepts the last safe grid and rejects the primitive-restart sentinel', () => {
    const lastSafe = beginChunkGeometry(0, 0, 252, 1, 20061, false, 2.6, false);
    expect(lastSafe.positions.length / 3).toBe(65_025);
    expect(lastSafe.indices).toBeInstanceOf(Uint16Array);

    expect(() => beginChunkGeometry(0, 0, 253, 1, 20061, false, 2.6, false)).toThrow(
      'Uint16 indices require at most 65535',
    );
  });
});
