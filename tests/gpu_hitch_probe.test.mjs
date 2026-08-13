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

  it('records the value each program query returned', () => {
    installFakeBrowser();
    const returns = new Map([
      [0x91b1, true],
      [0x8b86, 137],
      [0x8b89, 12],
    ]);
    class ValueGL {
      getParameter() {
        return 4096;
      }

      getProgramParameter(_program, pname) {
        return returns.get(pname);
      }
    }
    setGlobal('WebGL2RenderingContext', ValueGL);
    installGpuHitchProbe({ profile: 'shader' });
    const gl = new ValueGL();
    const program = {};
    gl.getProgramParameter(program, 0x91b1);
    gl.getProgramParameter(program, 0x8b86);
    gl.getProgramParameter(program, 0x8b89);
    const queries = globalThis.__wocGpuHitchProbe.snapshot().queries;
    expect(queries.map((query) => [query.kind, query.value])).toEqual([
      ['completion-status', true],
      ['active-uniforms', 137],
      ['active-attributes', 12],
    ]);
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('reports a not-ready completion status as false rather than dropping the value', () => {
    installFakeBrowser();
    class PendingGL {
      getParameter() {
        return 4096;
      }

      getProgramParameter() {
        return false;
      }
    }
    setGlobal('WebGL2RenderingContext', PendingGL);
    installGpuHitchProbe({ profile: 'shader' });
    new PendingGL().getProgramParameter({}, 0x91b1);
    expect(globalThis.__wocGpuHitchProbe.snapshot().queries[0]).toMatchObject({
      kind: 'completion-status',
      value: false,
    });
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('attributes a linked program to its three identity and never serializes the cache key', async () => {
    const { FakeGL } = installFakeBrowser();
    const glProgram = { handle: 'gl-program' };
    const cacheKey = `custom-hook-source-${'x'.repeat(200)}`;
    setGlobal('__game', {
      renderer: {
        webgl: {
          info: {
            programs: [
              {
                program: glProgram,
                id: 7,
                type: 'MeshStandardMaterial',
                name: 'armor_dye',
                cacheKey,
              },
            ],
          },
        },
      },
    });
    installGpuHitchProbe({ profile: 'shader' });
    new FakeGL().linkProgram(glProgram);
    await Promise.resolve();
    const programs = globalThis.__wocGpuHitchProbe.snapshot().programs;
    expect(programs).toEqual([
      {
        programId: 1,
        threeId: 7,
        materialType: 'MeshStandardMaterial',
        materialName: 'armor_dye',
        cacheKeyHash: expect.stringMatching(/^[0-9a-f]{8}$/),
        cacheKeyLength: cacheKey.length,
        variantDiff: null,
        resolvedAtMs: expect.any(Number),
      },
    ]);
    expect(JSON.stringify(programs)).not.toContain('custom-hook-source');
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('reports only the differing cache-key segment, never the key or the hook source', async () => {
    const { FakeGL } = installFakeBrowser();
    const gl = new FakeGL();
    const hook = `function onBeforeCompile(s){s.vertexShader='SECRET,WITH,COMMAS';}`;
    const first = { handle: 'variant-a' };
    const second = { handle: 'variant-b' };
    const programs = [];
    setGlobal('__game', { renderer: { webgl: { info: { programs } } } });
    installGpuHitchProbe({ profile: 'shader' });

    programs.push({
      program: first,
      id: 1,
      type: 'MeshStandardMaterial',
      name: 'streetlamp',
      cacheKey: `physical,highp,srgb,4,0,2,srgb,${hook}`,
    });
    gl.linkProgram(first);
    await Promise.resolve();
    programs.push({
      program: second,
      id: 2,
      type: 'MeshStandardMaterial',
      name: 'streetlamp',
      cacheKey: `physical,highp,srgb,5,0,2,srgb,${hook}`,
    });
    gl.linkProgram(second);
    await Promise.resolve();

    const snapshot = globalThis.__wocGpuHitchProbe.snapshot();
    expect(snapshot.programs[0].variantDiff).toBeNull();
    expect(snapshot.programs[1].variantDiff).toEqual({
      segmentIndex: 3,
      segmentsBefore: 10,
      segmentsAfter: 10,
      before: '4',
      after: '5',
    });
    const serialized = JSON.stringify(snapshot.programs);
    expect(serialized).not.toContain('SECRET');
    expect(serialized).not.toContain('onBeforeCompile');
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('replaces an unsafe differing segment with a bounded stand-in', async () => {
    const { FakeGL } = installFakeBrowser();
    const gl = new FakeGL();
    const first = { handle: 'a' };
    const second = { handle: 'b' };
    const programs = [];
    setGlobal('__game', { renderer: { webgl: { info: { programs } } } });
    installGpuHitchProbe({ profile: 'shader' });
    programs.push({ program: first, id: 1, type: 'ShaderMaterial', name: '', cacheKey: 'a;b;c' });
    gl.linkProgram(first);
    await Promise.resolve();
    programs.push({
      program: second,
      id: 2,
      type: 'ShaderMaterial',
      name: '',
      cacheKey: `a;${'Q'.repeat(90)};c`,
    });
    gl.linkProgram(second);
    await Promise.resolve();
    const diff = globalThis.__wocGpuHitchProbe.snapshot().programs[1].variantDiff;
    expect(diff.after).toMatch(/^#[0-9a-f]{8}:\d+$/);
    expect(diff.after.length).toBeLessThanOrEqual(40);
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('drops an unresolvable program instead of retrying without bound', async () => {
    const { FakeGL } = installFakeBrowser();
    setGlobal('__game', { renderer: { webgl: { info: { programs: [] } } } });
    installGpuHitchProbe({ profile: 'shader' });
    const gl = new FakeGL();
    gl.linkProgram({});
    for (let pass = 0; pass < 8; pass++) await Promise.resolve();
    expect(globalThis.__wocGpuHitchProbe.snapshot().programs).toEqual([]);
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('resolves programs linked long before the renderer became reachable', async () => {
    // The regression the headless smoke caught: main.ts assembles window.__game
    // around the reveal, so every program linked under the curtain saw an
    // unreachable renderer. Spending an attempt on those passes dropped 548 of
    // 600 programs before the renderer ever existed.
    const { FakeGL } = installFakeBrowser();
    installGpuHitchProbe({ profile: 'shader' });
    const gl = new FakeGL();
    const early = { handle: 'linked-under-the-curtain' };
    gl.linkProgram(early);
    for (let pass = 0; pass < 10; pass++) await Promise.resolve();
    expect(globalThis.__wocGpuHitchProbe.snapshot().programs).toEqual([]);

    setGlobal('__game', {
      renderer: {
        webgl: {
          info: {
            programs: [
              { program: early, id: 1, type: 'MeshStandardMaterial', name: '', cacheKey: 'key' },
            ],
          },
        },
      },
    });
    gl.linkProgram({ handle: 'a-later-link' });
    await Promise.resolve();
    expect(globalThis.__wocGpuHitchProbe.snapshot().programs).toMatchObject([
      { programId: 1, threeId: 1, materialType: 'MeshStandardMaterial' },
    ]);
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('attaches the renderer hook without waiting for another link', async () => {
    const { FakeGL } = installFakeBrowser();
    const gl = new FakeGL();
    installGpuHitchProbe({ profile: 'shader' });
    gl.linkProgram({});
    const renderBufferDirect = () => {};
    const webgl = { info: { programs: [] }, renderBufferDirect };
    setGlobal('__game', { renderer: { webgl } });
    // No further link: the snapshot flush is what must notice the renderer.
    globalThis.__wocGpuHitchProbe.snapshot();
    expect(webgl.renderBufferDirect).not.toBe(renderBufferDirect);
    globalThis.__wocGpuHitchProbe.stop('test');
    expect(webgl.renderBufferDirect).toBe(renderBufferDirect);
  });

  it('censuses the container a rootIndex indexes, not the last scene drawn', () => {
    // The headless smoke returned an empty census while recording rootIndex 232:
    // the post chain draws its own quad scenes, so the LAST drawn scene is
    // routinely not the world scene, and an index into one array reported
    // against another names the wrong subsystem.
    const { FakeGL } = installFakeBrowser();
    const gl = new FakeGL();
    const worldChild = { type: 'Group', name: 'props', children: [], visible: true };
    const drawn = { type: 'Mesh', parent: worldChild };
    const world = { children: [{ type: 'Group', name: '', children: [] }, worldChild] };
    worldChild.parent = world;
    worldChild.children.push(drawn);
    const webgl = {
      info: { programs: [] },
      renderBufferDirect() {
        gl.linkProgram({});
      },
    };
    setGlobal('__game', { renderer: { webgl } });
    installGpuHitchProbe({ profile: 'shader' });
    gl.linkProgram({});
    webgl.renderBufferDirect(null, world, null, { type: 'MeshStandardMaterial' }, drawn, null);
    // A post-chain quad scene drawn last, carrying no scene-root children.
    webgl.renderBufferDirect(null, { isScene: true }, null, { type: 'ShaderMaterial' }, null, null);

    const snapshot = globalThis.__wocGpuHitchProbe.snapshot();
    expect(snapshot.links[1].draw).toMatchObject({ rootIndex: 1, rootCount: 2 });
    expect(snapshot.sceneRoots).toEqual([
      { index: 0, type: 'Group', name: '', children: 0, visible: false },
      { index: 1, type: 'Group', name: 'props', children: 1, visible: true },
    ]);
    globalThis.__wocGpuHitchProbe.stop('test');
  });

  it('stamps the draw context on a link, marks the shadow pass, and restores the hook', () => {
    const { FakeGL } = installFakeBrowser();
    const gl = new FakeGL();
    const sceneChild = { type: 'Group', name: 'props', children: [{}, {}], visible: true };
    const drawn = { type: 'SkinnedMesh', isSkinnedMesh: true, castShadow: true, parent: null };
    sceneChild.children.push(drawn);
    const scene = { children: [{ type: 'Group', name: '', children: [] }, sceneChild] };
    drawn.parent = sceneChild;
    sceneChild.parent = scene;
    const linkInsideDraw = { handle: 'inside' };
    const renderBufferDirect = () => {
      gl.linkProgram(linkInsideDraw);
    };
    const webgl = { info: { programs: [] }, renderBufferDirect };
    setGlobal('__game', { renderer: { webgl } });
    installGpuHitchProbe({ profile: 'shader' });
    // The first link is what attaches the hook; the renderer is built after
    // the probe installs, so nothing before this point can be stamped.
    gl.linkProgram({ handle: 'before-hook' });
    expect(webgl.renderBufferDirect).not.toBe(renderBufferDirect);

    webgl.renderBufferDirect(
      null,
      scene,
      null,
      { type: 'MeshStandardMaterial', name: 'bark' },
      drawn,
      null,
    );
    webgl.renderBufferDirect(
      null,
      null,
      null,
      { type: 'MeshDepthMaterial', name: '' },
      drawn,
      null,
    );

    const snapshot = globalThis.__wocGpuHitchProbe.snapshot();
    expect(snapshot.links[0].draw).toBeNull();
    expect(snapshot.links[1].draw).toMatchObject({
      materialType: 'MeshStandardMaterial',
      materialName: 'bark',
      objectType: 'SkinnedMesh',
      skinned: true,
      castShadow: true,
      shadowPass: false,
      rootIndex: 1,
      rootCount: 2,
      depth: 2,
    });
    expect(snapshot.links[2].draw).toMatchObject({
      materialType: 'MeshDepthMaterial',
      shadowPass: true,
    });
    expect(snapshot.sceneRoots).toEqual([
      { index: 0, type: 'Group', name: '', children: 0, visible: false },
      { index: 1, type: 'Group', name: 'props', children: 3, visible: true },
    ]);
    globalThis.__wocGpuHitchProbe.stop('test');
    expect(webgl.renderBufferDirect).toBe(renderBufferDirect);
  });

  it('rejects a free-form material name instead of copying it into the artifact', () => {
    const { FakeGL } = installFakeBrowser();
    const gl = new FakeGL();
    const webgl = {
      info: { programs: [] },
      renderBufferDirect() {
        gl.linkProgram({});
      },
    };
    setGlobal('__game', { renderer: { webgl } });
    installGpuHitchProbe({ profile: 'shader' });
    gl.linkProgram({});
    webgl.renderBufferDirect(
      null,
      { children: [] },
      null,
      { type: 'MeshBasicMaterial', name: 'player <Ruby> said "hi"' },
      { type: 'Mesh' },
      null,
    );
    expect(globalThis.__wocGpuHitchProbe.snapshot().links[1].draw).toMatchObject({
      materialType: 'MeshBasicMaterial',
      materialName: '',
    });
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
