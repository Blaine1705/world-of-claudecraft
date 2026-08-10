import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TARGET_URL = 'models/weapons/winterbite.glb';

afterEach(() => {
  vi.doUnmock('../src/render/assets/loader');
  vi.resetModules();
});

describe('streamed character asset readiness', () => {
  it('notifies subscribers once when a cold weapon-skin model becomes resident', async () => {
    vi.resetModules();
    let resolveTarget: ((gltf: { scene: THREE.Group; animations: never[] }) => void) | undefined;
    const targetLoad = new Promise<{ scene: THREE.Group; animations: never[] }>((resolve) => {
      resolveTarget = resolve;
    });
    const stubGltf = () => ({ scene: new THREE.Group(), animations: [] as never[] });
    vi.doMock('../src/render/assets/loader', () => ({
      loadGltf: vi.fn((url: string) =>
        url === TARGET_URL ? targetLoad : Promise.resolve(stubGltf()),
      ),
      loadHdr: vi.fn(() => new Promise(() => undefined)),
      loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
      loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
      releaseGltf: vi.fn(),
    }));

    const assets = await import('../src/render/characters/assets');
    const readyUrls: string[] = [];
    const unsubscribe = assets.onCharacterAssetReady((url) => readyUrls.push(url));

    assets.ensureCharacterUrl(TARGET_URL);
    expect(readyUrls).not.toContain(TARGET_URL);
    resolveTarget?.(stubGltf());
    await vi.waitFor(() => expect(readyUrls.filter((url) => url === TARGET_URL)).toHaveLength(1));

    // A resident re-request neither fetches nor emits again.
    assets.ensureCharacterUrl(TARGET_URL);
    await Promise.resolve();
    expect(readyUrls.filter((url) => url === TARGET_URL)).toHaveLength(1);
    unsubscribe();
  });
});
