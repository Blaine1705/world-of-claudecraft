import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { uploadDataTextureInChunks } from '../src/render/texture_upload';

describe('chunked DataTexture upload', () => {
  it('uploads complete rows in bounded batches and yields before each batch', async () => {
    const texture = new THREE.DataTexture(new Uint16Array(8 * 5 * 4), 8, 5);
    const calls: { start: number; count: number }[][] = [];
    const target = {
      initTexture: (candidate: THREE.Texture) => {
        calls.push(candidate.updateRanges.map((range) => ({ ...range })));
        candidate.clearUpdateRanges();
      },
    };
    const beforeChunk = vi.fn(async () => undefined);
    const chunks = await uploadDataTextureInChunks(target, texture, {
      // Each row is 8 * RGBA * uint16 = 64 bytes, so this selects two rows.
      maxChunkBytes: 128,
      beforeChunk,
    });

    expect(chunks).toBe(3);
    expect(beforeChunk).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([
      [
        { start: 0, count: 32 },
        { start: 32, count: 32 },
      ],
      [
        { start: 64, count: 32 },
        { start: 96, count: 32 },
      ],
      [{ start: 128, count: 32 }],
    ]);
  });

  it('falls back to one normal upload for non-data textures', async () => {
    const initTexture = vi.fn();
    const beforeChunk = vi.fn(async () => undefined);
    const chunks = await uploadDataTextureInChunks({ initTexture }, new THREE.Texture(), {
      beforeChunk,
    });
    expect(chunks).toBe(1);
    expect(beforeChunk).toHaveBeenCalledOnce();
    expect(initTexture).toHaveBeenCalledOnce();
  });
});
