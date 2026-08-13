import { afterEach, describe, expect, it } from 'vitest';
import { installGpuHitchProbe } from '../scripts/profiler/gpu_hitch_probe.mjs';

const originalGlobals = new Map();

function setGlobal(name, value) {
  if (!originalGlobals.has(name)) originalGlobals.set(name, globalThis[name]);
  globalThis[name] = value;
}

function installFakeBrowser({ visibilityState = 'visible' } = {}) {
  class FakeGL {
    linkProgram() {
      return 'linked';
    }

    getParameter() {
      return 4096;
    }

    getProgramParameter() {
      return true;
    }
  }
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }
  const curtain = {
    classList: { contains: () => false },
  };
  const listeners = new Map();
  const document = {
    visibilityState,
    querySelector: () => curtain,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  };
  setGlobal('window', globalThis);
  setGlobal('document', document);
  setGlobal('WebGL2RenderingContext', FakeGL);
  setGlobal('MutationObserver', FakeMutationObserver);
  return { FakeGL, document, listeners };
}

afterEach(() => {
  for (const [name, value] of originalGlobals) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
  originalGlobals.clear();
  delete globalThis.__wocGpuHitchProbe;
});

describe('gpu hitch browser probe', () => {
  it('records exact links and all three program-query kinds, then restores methods', () => {
    const { FakeGL } = installFakeBrowser();
    const originalLink = FakeGL.prototype.linkProgram;
    const originalQuery = FakeGL.prototype.getProgramParameter;
    installGpuHitchProbe({ profile: 'shader', captureId: 'test' });
    const gl = new FakeGL();
    const program = {};
    gl.linkProgram(program);
    gl.getProgramParameter(program, 0x91b1);
    gl.getProgramParameter(program, 0x8b86);
    gl.getProgramParameter(program, 0x8b89);
    const snapshot = globalThis.__wocGpuHitchProbe.snapshot();
    expect(snapshot.startedAtPerformanceMs).toEqual(expect.any(Number));
    expect(snapshot.links).toHaveLength(1);
    expect(snapshot.links[0]).toMatchObject({ programId: 1, lane: expect.any(String) });
    expect(snapshot.queries.map((query) => query.kind)).toEqual([
      'completion-status',
      'active-uniforms',
      'active-attributes',
    ]);
    globalThis.__wocGpuHitchProbe.stop('test');
    expect(FakeGL.prototype.linkProgram).toBe(originalLink);
    expect(FakeGL.prototype.getProgramParameter).toBe(originalQuery);
  });

  it('does not install upload wrappers in the shader profile', () => {
    const { FakeGL } = installFakeBrowser();
    FakeGL.prototype.texSubImage2D = () => {};
    const original = FakeGL.prototype.texSubImage2D;
    installGpuHitchProbe({ profile: 'shader' });
    expect(FakeGL.prototype.texSubImage2D).toBe(original);
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('is idempotent and preserves an exception from the original query', () => {
    installFakeBrowser();
    class ThrowingGL {
      getParameter() {
        return 4096;
      }

      getProgramParameter() {
        throw new Error('driver query failed');
      }
    }
    setGlobal('WebGL2RenderingContext', ThrowingGL);
    const original = ThrowingGL.prototype.getProgramParameter;
    installGpuHitchProbe({ profile: 'shader' });
    const firstProbe = globalThis.__wocGpuHitchProbe;
    installGpuHitchProbe({ profile: 'full' });
    expect(globalThis.__wocGpuHitchProbe).toBe(firstProbe);
    expect(() => new ThrowingGL().getProgramParameter({}, 0x91b1)).toThrow('driver query failed');
    expect(firstProbe.snapshot().queries[0]).toMatchObject({ kind: 'completion-status' });
    firstProbe.stop('test');
    expect(ThrowingGL.prototype.getProgramParameter).toBe(original);
  });

  it('aggregates upload bytes only in upload-capable profiles', () => {
    const { FakeGL } = installFakeBrowser();
    FakeGL.prototype.texSubImage2D = () => 'uploaded';
    installGpuHitchProbe({ profile: 'upload' });
    const result = new FakeGL().texSubImage2D(0, 0, 0, 2, 2, new Uint8Array(16));
    expect(result).toBe('uploaded');
    expect(globalThis.__wocGpuHitchProbe.snapshot().uploadBuckets).toEqual([
      expect.objectContaining({ count: 1, bytes: 16 }),
    ]);
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('starts visibility evidence at the initial focus handoff but retains later hiding', () => {
    const { document, listeners } = installFakeBrowser();
    installGpuHitchProbe({ profile: 'shader' });
    document.visibilityState = 'hidden';
    listeners.get('visibilitychange')();
    document.visibilityState = 'visible';
    listeners.get('visibilitychange')();
    expect(globalThis.__wocGpuHitchProbe.snapshot().visibilityTransitions).toEqual([
      { atMs: expect.any(Number), state: 'visible' },
    ]);

    document.visibilityState = 'hidden';
    listeners.get('visibilitychange')();
    expect(globalThis.__wocGpuHitchProbe.snapshot().visibilityTransitions.at(-1)).toMatchObject({
      state: 'hidden',
    });
    globalThis.__wocGpuHitchProbe.stop('test');
  });
});
