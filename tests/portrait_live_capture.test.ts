// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The live getters must never block the calling frame: on a cache miss they
// answer null and kick the ASYNC capture (the prewarm twin), then fire the
// update listeners so the chips and the painter hydrate. The offscreen WebGL
// rig is faked here; everything else (the lane, the prewarm order, the encode)
// is the real module.
//
// Every queued encode is TAGGED with the visual that was on the rig when its
// frame was drawn (render and the toBlob snapshot are one synchronous window,
// so the pairing is exact), and each case settles the captures it started.
// Nothing here may depend on how many turns a capture takes to reach its
// encode, or on which case queued first.
const rig = vi.hoisted(() => ({
  builds: [] as string[],
  renders: 0,
  drawn: '',
  encodes: [] as Array<{ tag: string; cb: (blob: Blob | null) => void }>,
  syncDataUrl: 'data:image/png;base64,SYNCCAPTURE',
}));

/** What jsdom's FileReader makes of the fake toBlob payload below. */
const ASYNC_URL = 'data:image/png;base64,cG5n';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    debug = { checkShaderErrors: true };
    shadowMap = { enabled: true };
    domElement: HTMLCanvasElement;
    constructor(params: { canvas: HTMLCanvasElement }) {
      this.domElement = params.canvas;
      // The async twin snapshots through toBlob; the composed path still uses
      // the synchronous toDataURL.
      this.domElement.toBlob = ((cb: (blob: Blob | null) => void) => {
        rig.encodes.push({ tag: rig.drawn, cb });
      }) as HTMLCanvasElement['toBlob'];
      this.domElement.toDataURL = () => rig.syncDataUrl;
    }
    setPixelRatio() {}
    setSize() {}
    initTexture() {}
    compileAsync() {
      return Promise.resolve();
    }
    render(scene: { traverse(cb: (o: { userData: Record<string, unknown> }) => void): void }) {
      rig.renders++;
      rig.drawn = '';
      scene.traverse((o) => {
        if (typeof o.userData.tag === 'string') rig.drawn = o.userData.tag;
      });
    }
    forceContextLoss() {}
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

vi.mock('../src/render/assets/preload', () => ({
  assetsReady: () => Promise.resolve(),
  registerPreload: vi.fn(),
  registerDeferredPreload: vi.fn((start: () => unknown) => start()),
}));
vi.mock('../src/render/characters/assets', () => ({
  ensureSkinTexture: () => null,
}));
vi.mock('../src/render/characters/modular', () => ({
  modularSignature: () => 'sig',
}));
vi.mock('../src/render/texture_prewarm', () => ({
  collectPrewarmTextures: () => undefined,
  uploadTexturesInSlices: () => Promise.resolve(),
  yieldToMainThread: () => Promise.resolve(),
}));
vi.mock('../src/render/characters/visual', async () => {
  const THREE = await import('three');
  return {
    CharacterVisual: class {
      root = new THREE.Object3D();
      constructor(visualKey: string, _color: number, skin = 0) {
        rig.builds.push(visualKey);
        this.root.userData.tag = `${visualKey}:${skin}`;
      }
      update() {}
      dispose() {}
    },
  };
});

import type { ModularLook } from '../src/render/characters/modular';
import {
  modularPortraitDataUrl,
  onPortraitUpdate,
  playerPortraitDataUrl,
  portraitsReady,
  visualPortraitDataUrl,
} from '../src/render/characters/portrait';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Hand the capture drawn from `tag` its PNG (or fail its encode). Waits for
 *  that capture to reach its encode, so no case depends on how many turns the
 *  build/upload/compile chain took. */
async function settleCapture(tag: string, ok = true): Promise<void> {
  await vi.waitFor(() => expect(rig.encodes.some((e) => e.tag === tag)).toBe(true));
  const index = rig.encodes.findIndex((e) => e.tag === tag);
  const [entry] = rig.encodes.splice(index, 1);
  entry.cb(ok ? new Blob(['png'], { type: 'image/png' }) : null);
}

describe('live portrait capture', () => {
  beforeEach(async () => {
    await vi.waitFor(() => expect(portraitsReady()).toBe(true));
    // Each case settles what it started, so a leftover here would mean one
    // case could settle another's capture: fail loudly instead.
    expect(rig.encodes).toEqual([]);
    rig.builds.length = 0;
    rig.renders = 0;
  });

  it('answers null on a miss and kicks ONE async capture for a crowd of the same class', async () => {
    for (let i = 0; i < 20; i++) expect(playerPortraitDataUrl('mage')).toBeNull();
    await vi.waitFor(() => expect(rig.encodes).toHaveLength(1));

    expect(rig.builds).toEqual(['player_mage']);
    expect(rig.renders).toBe(1);
    // A further ask while that capture is still in flight adds no capture: the
    // duplicate would build synchronously inside the next microtask turn.
    expect(playerPortraitDataUrl('mage')).toBeNull();
    await flush();
    expect(rig.builds).toEqual(['player_mage']);

    await settleCapture('player_mage:0');
    await vi.waitFor(() => expect(playerPortraitDataUrl('mage')).toBe(ASYNC_URL));
  });

  it('fills the cache, fires the update listeners, and then answers synchronously', async () => {
    const updated = vi.fn();
    onPortraitUpdate(updated);
    expect(playerPortraitDataUrl('rogue')).toBeNull();

    await settleCapture('player_rogue:0');
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith('player_rogue', 0));

    expect(playerPortraitDataUrl('rogue')).toBe(ASYNC_URL);
    // The cache hit captures nothing more.
    await flush();
    expect(rig.builds).toEqual(['player_rogue']);
  });

  it('keys the capture, so another skin or framing is its own miss', async () => {
    expect(visualPortraitDataUrl('player_mech', 2)).toBeNull();
    expect(visualPortraitDataUrl('player_mech', 2, 'body')).toBeNull();
    expect(visualPortraitDataUrl('player_mech', 3)).toBeNull();
    await vi.waitFor(() => expect(rig.encodes).toHaveLength(3));

    expect(rig.builds).toEqual(['player_mech', 'player_mech', 'player_mech']);
    await settleCapture('player_mech:2');
    await settleCapture('player_mech:2');
    await settleCapture('player_mech:3');
    await vi.waitFor(() => {
      expect(visualPortraitDataUrl('player_mech', 2)).toBe(ASYNC_URL);
      expect(visualPortraitDataUrl('player_mech', 2, 'body')).toBe(ASYNC_URL);
      expect(visualPortraitDataUrl('player_mech', 3)).toBe(ASYNC_URL);
    });
  });

  it('caches nothing and notifies nobody on a failed encode, and the next ask retries', async () => {
    const updated = vi.fn();
    onPortraitUpdate(updated);
    expect(playerPortraitDataUrl('druid')).toBeNull();

    await settleCapture('player_druid:0', false);
    // The in-flight entry clearing IS the sync point: the next ask captures again.
    await vi.waitFor(() => {
      expect(playerPortraitDataUrl('druid')).toBeNull();
      expect(rig.builds).toEqual(['player_druid', 'player_druid']);
    });
    expect(updated).not.toHaveBeenCalled();

    await settleCapture('player_druid:0');
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith('player_druid', 0));
    expect(playerPortraitDataUrl('druid')).toBe(ASYNC_URL);
  });

  it('leaves the composed path on its synchronous capture', async () => {
    const look = { app: {}, worn: {} } as unknown as ModularLook;
    expect(modularPortraitDataUrl('player_warrior_modular', look)).toBe(rig.syncDataUrl);
    expect(rig.builds).toEqual(['player_warrior_modular']);
    expect(rig.encodes).toEqual([]);
  });
});
