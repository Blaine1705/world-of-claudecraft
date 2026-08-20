import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PORTRAIT_READBACK_LIVENESS_BACKSTOP_MS,
  type PortraitSnapshotRenderer,
  PortraitSnapshotTarget,
} from '../src/render/characters/portrait_snapshot';

// The PNG encode is the one DOM-touching step (jsdom has no 2D canvas backend),
// so it is stubbed; what this file pins is the PATH the adapter picks and the
// order it does GL work in, which is what the fix turns on.
vi.mock('../src/render/characters/portrait_png_encode', () => ({
  encodeCanvasPng: vi.fn(() => Promise.resolve('data:image/png;base64,sync')),
  encodeRgbaPngDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,async')),
}));

import {
  encodeCanvasPng,
  encodeRgbaPngDataUrl,
} from '../src/render/characters/portrait_png_encode';

const SIZE = 4;

interface Harness {
  renderer: PortraitSnapshotRenderer;
  calls: string[];
  /** Fill the readback buffer the way readPixels would (bottom-up). */
  readback: {
    resolve(): void;
    /** Fulfil the way three does when the target has no framebuffer yet: no
     *  throw, no write, and `undefined` as the value. */
    resolveEmpty(): void;
    reject(): void;
    buffer: Uint8Array | null;
  };
}

function harness(
  opts: {
    withAsync?: boolean;
    contextLost?: boolean;
    throwOnRead?: boolean;
    outputColorSpace?: string;
  } = {},
): Harness {
  const calls: string[] = [];
  const readback: Harness['readback'] = {
    resolve: () => {},
    resolveEmpty: () => {},
    reject: () => {},
    buffer: null,
  };
  let current: THREE.WebGLRenderTarget | null = null;
  const renderer: PortraitSnapshotRenderer = {
    domElement: { id: 'portrait-canvas' } as unknown as HTMLCanvasElement,
    outputColorSpace: opts.outputColorSpace ?? THREE.SRGBColorSpace,
    getContext: () => ({ isContextLost: () => opts.contextLost === true }),
    getRenderTarget: () => current,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: (target) => {
      calls.push(target ? 'bind-target' : 'unbind-target');
      current = target;
    },
  };
  if (opts.withAsync !== false) {
    renderer.readRenderTargetPixelsAsync = (_t, _x, _y, _w, _h, buffer) => {
      calls.push('read-async');
      if (opts.throwOnRead) throw new Error('no fence');
      readback.buffer = buffer;
      return new Promise<unknown>((resolve, reject) => {
        readback.resolve = () => resolve(buffer);
        readback.resolveEmpty = () => resolve(undefined);
        readback.reject = () => reject(new Error('readback failed'));
      });
    };
  }
  return { renderer, calls, readback };
}

describe('PortraitSnapshotTarget', () => {
  beforeEach(() => {
    vi.mocked(encodeCanvasPng).mockClear();
    vi.mocked(encodeRgbaPngDataUrl).mockClear();
  });

  it('renders into a target, unbinds, and reads back behind the fence', async () => {
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const draw = vi.fn(() => {
      h.calls.push('draw');
    });
    const pending = snapshot.capture(h.renderer, draw);
    // The draw MUST already have happened: runPortraitPrewarm disposes the
    // subject as soon as it holds this promise.
    expect(draw).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(['bind-target', 'draw', 'unbind-target', 'read-async']);
    expect(h.renderer.getRenderTarget()).toBeNull();
    expect(h.readback.buffer?.length).toBe(SIZE * SIZE * 4);

    h.readback.resolve();
    await expect(pending).resolves.toBe('data:image/png;base64,async');
    expect(encodeRgbaPngDataUrl).toHaveBeenCalledTimes(1);
    expect(encodeCanvasPng).not.toHaveBeenCalled();
    const [bytes, width, height] = vi.mocked(encodeRgbaPngDataUrl).mock.calls[0];
    expect(bytes).toBeInstanceOf(Uint8ClampedArray);
    expect(width).toBe(SIZE);
    expect(height).toBe(SIZE);
  });

  // The colorSpace assignment is what selects the sRGB internal format
  // (SRGB8_ALPHA8), which is what makes the GPU encode linear to sRGB as the
  // framebuffer is written. Drop it and every portrait comes back dark.
  it('gives the target the renderer output colour space, so the GPU encodes on write', async () => {
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    let bound: THREE.WebGLRenderTarget | null = null;
    const spy = h.renderer.setRenderTarget.bind(h.renderer);
    h.renderer.setRenderTarget = (target, face, mip) => {
      if (target) bound = target;
      spy(target, face, mip);
    };
    void snapshot.capture(h.renderer, () => {});
    const target = bound as THREE.WebGLRenderTarget | null;
    expect(target).not.toBeNull();
    expect(target?.samples).toBeGreaterThan(0);
    expect(target?.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(target?.texture.generateMipmaps).toBe(false);
    expect(target?.width).toBe(SIZE);
  });

  it('reads that colour space off the renderer rather than hardcoding it', async () => {
    const h = harness({ outputColorSpace: THREE.LinearSRGBColorSpace });
    const snapshot = new PortraitSnapshotTarget(SIZE);
    let bound: THREE.WebGLRenderTarget | null = null;
    const spy = h.renderer.setRenderTarget.bind(h.renderer);
    h.renderer.setRenderTarget = (target, face, mip) => {
      if (target) bound = target;
      spy(target, face, mip);
    };
    void snapshot.capture(h.renderer, () => {});
    expect((bound as THREE.WebGLRenderTarget | null)?.texture.colorSpace).toBe(
      THREE.LinearSRGBColorSpace,
    );
  });

  it('reuses one target and one readback buffer across captures', async () => {
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    void snapshot.capture(h.renderer, () => {});
    const first = h.readback.buffer;
    h.readback.resolve();
    void snapshot.capture(h.renderer, () => {});
    expect(h.readback.buffer).toBe(first);
  });

  it('falls back to the synchronous canvas path when there is no async readback', async () => {
    const h = harness({ withAsync: false });
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const draw = vi.fn();
    await expect(snapshot.capture(h.renderer, draw)).resolves.toBe('data:image/png;base64,sync');
    expect(draw).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual([]);
    expect(encodeCanvasPng).toHaveBeenCalledWith(h.renderer.domElement);
  });

  it('falls back on a lost context rather than dropping the portrait', async () => {
    const h = harness({ contextLost: true });
    const snapshot = new PortraitSnapshotTarget(SIZE);
    await expect(snapshot.capture(h.renderer, () => {})).resolves.toBe(
      'data:image/png;base64,sync',
    );
    expect(encodeCanvasPng).toHaveBeenCalledTimes(1);
  });

  it('re-draws through the fallback when issuing the readback throws', async () => {
    const h = harness({ throwOnRead: true });
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const draw = vi.fn();
    await expect(snapshot.capture(h.renderer, draw)).resolves.toBe('data:image/png;base64,sync');
    // Drawn twice: once into the target, once into the restored framebuffer.
    expect(draw).toHaveBeenCalledTimes(2);
    expect(h.renderer.getRenderTarget()).toBeNull();
  });

  it('latches after a rejected readback so the next capture goes synchronous', async () => {
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const first = snapshot.capture(h.renderer, () => {});
    h.readback.reject();
    await expect(first).resolves.toBeNull();

    h.calls.length = 0;
    await expect(snapshot.capture(h.renderer, () => {})).resolves.toBe(
      'data:image/png;base64,sync',
    );
    expect(h.calls).toEqual([]);
  });

  it('latches when the encode cannot produce a data URL', async () => {
    vi.mocked(encodeRgbaPngDataUrl).mockResolvedValueOnce(null);
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const first = snapshot.capture(h.renderer, () => {});
    h.readback.resolve();
    await expect(first).resolves.toBeNull();

    await expect(snapshot.capture(h.renderer, () => {})).resolves.toBe(
      'data:image/png;base64,sync',
    );
  });

  // three's probeAsync re-polls TIMEOUT_EXPIRED forever with no cancellation,
  // so a fence that never signals leaves a promise that never settles. The
  // serialised preview lane advances on this promise and a released tail holds
  // a queue slot until it settles, so a wedge here is not a lost portrait, it
  // is a stopped lane and a halved tail budget.
  describe('a readback that never settles', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('settles anyway once the liveness backstop expires, with null', async () => {
      const h = harness();
      const snapshot = new PortraitSnapshotTarget(SIZE);
      const wedged = snapshot.capture(h.renderer, () => {});
      let settled: string | null | 'pending' = 'pending';
      void wedged.then((url) => {
        settled = url;
      });
      await vi.advanceTimersByTimeAsync(PORTRAIT_READBACK_LIVENESS_BACKSTOP_MS - 1);
      expect(settled).toBe('pending');

      await vi.advanceTimersByTimeAsync(2);
      expect(settled).toBeNull();
      await expect(wedged).resolves.toBeNull();
      expect(encodeRgbaPngDataUrl).not.toHaveBeenCalled();
    });

    it('latches, so the next capture takes the synchronous path', async () => {
      const h = harness();
      const snapshot = new PortraitSnapshotTarget(SIZE);
      const wedged = snapshot.capture(h.renderer, () => {});
      await vi.advanceTimersByTimeAsync(PORTRAIT_READBACK_LIVENESS_BACKSTOP_MS + 1);
      await expect(wedged).resolves.toBeNull();

      h.calls.length = 0;
      await expect(snapshot.capture(h.renderer, () => {})).resolves.toBe(
        'data:image/png;base64,sync',
      );
      expect(h.calls).toEqual([]);
      expect(encodeCanvasPng).toHaveBeenCalledTimes(1);
    });

    it('leaves no armed backstop behind once a readback lands', async () => {
      const h = harness();
      const snapshot = new PortraitSnapshotTarget(SIZE);
      const pending = snapshot.capture(h.renderer, () => {});
      h.readback.resolve();
      await expect(pending).resolves.toBe('data:image/png;base64,async');
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('does not commit or write buffers when a readback lands after dispose', async () => {
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const pending = snapshot.capture(h.renderer, () => {});
    const stale = h.readback.resolve;
    snapshot.dispose();

    // The rebuilt rig's own capture owns the fresh buffers; the pre-rebuild
    // frame must not be flipped into them, and must not encode a URL to commit.
    const rebuilt = snapshot.capture(h.renderer, () => {});
    expect(() => stale()).not.toThrow();
    await expect(pending).resolves.toBeNull();
    expect(encodeRgbaPngDataUrl).not.toHaveBeenCalled();

    h.readback.resolve();
    await expect(rebuilt).resolves.toBe('data:image/png;base64,async');
    expect(encodeRgbaPngDataUrl).toHaveBeenCalledTimes(1);
  });

  it('treats a readback that fulfils without writing the buffer as a failure', async () => {
    // three's readRenderTargetPixelsAsync returns undefined, without throwing
    // and without writing a byte, when the target has no __webglFramebuffer
    // yet. `pixels` is reused across captures, so encoding on that fulfilment
    // would cache the PREVIOUS portrait's face under this key.
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const empty = snapshot.capture(h.renderer, () => {});
    h.readback.resolveEmpty();
    await expect(empty).resolves.toBeNull();
    expect(encodeRgbaPngDataUrl).not.toHaveBeenCalled();

    // ...and it latches, like every other async failure.
    h.calls.length = 0;
    await expect(snapshot.capture(h.renderer, () => {})).resolves.toBe(
      'data:image/png;base64,sync',
    );
    expect(h.calls).toEqual([]);
  });

  it('sends a second concurrent capture down the synchronous path', async () => {
    // The lane above dedupes per cache KEY only, so a live composed capture can
    // overlap a paced class prewarm; the two would otherwise share `pixels` and
    // the flipped buffer.
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const first = snapshot.capture(h.renderer, () => {});
    expect(h.calls).toEqual(['bind-target', 'unbind-target', 'read-async']);

    h.calls.length = 0;
    await expect(snapshot.capture(h.renderer, () => {})).resolves.toBe(
      'data:image/png;base64,sync',
    );
    expect(h.calls).toEqual([]);
    expect(encodeCanvasPng).toHaveBeenCalledTimes(1);

    h.readback.resolve();
    await expect(first).resolves.toBe('data:image/png;base64,async');
    expect(encodeRgbaPngDataUrl).toHaveBeenCalledTimes(1);

    // The claim is released with the flip, so the next capture is async again.
    h.calls.length = 0;
    void snapshot.capture(h.renderer, () => {});
    expect(h.calls).toEqual(['bind-target', 'unbind-target', 'read-async']);
  });

  it('hands the readback bytes to the encode with no software colour transfer', async () => {
    // The render target is SRGB8_ALPHA8 (see the colour-space pin above), so the
    // GPU already encoded these bytes as it wrote them. Re-encoding in software
    // would turn an opaque 128 into 188 and wash every portrait out.
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const pending = snapshot.capture(h.renderer, () => {});
    h.readback.buffer?.fill(128);
    for (let at = 3; at < (h.readback.buffer?.length ?? 0); at += 4) {
      if (h.readback.buffer) h.readback.buffer[at] = 255;
    }
    h.readback.resolve();
    await expect(pending).resolves.toBe('data:image/png;base64,async');

    const encoded = vi.mocked(encodeRgbaPngDataUrl).mock.calls[0][0];
    expect(encoded[0]).toBe(128);
    expect(encoded[3]).toBe(255);
  });

  it('gives a rebuilt context a fresh chance at the async path', async () => {
    const h = harness();
    const snapshot = new PortraitSnapshotTarget(SIZE);
    const first = snapshot.capture(h.renderer, () => {});
    h.readback.reject();
    await expect(first).resolves.toBeNull();

    snapshot.dispose();
    h.calls.length = 0;
    void snapshot.capture(h.renderer, () => {});
    expect(h.calls).toEqual(['bind-target', 'unbind-target', 'read-async']);
  });
});
