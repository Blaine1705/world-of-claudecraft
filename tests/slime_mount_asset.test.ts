import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { describe, expect, it } from 'vitest';

// Structural contract for the slime mount (docs/design/slime-mount). The render
// side looks the saddle bone up by name (the rider's seat), so a re-export that
// renames it breaks the mount with nothing else failing. The byte pin makes any
// re-export a deliberate, reviewed change.
const ASSET_PATH = path.join(__dirname, '..', 'public/models/mounts/slime.glb');
const EXPECTED_ASSET_SHA256 = 'c2c06924c37c69ad07df8311dab438716909c965f679b37de9c3c516499a16cd';
const CLIP_SECONDS = { Idle: 6, Walk: 1, Run: 0.9, Jump: 0.8 };

async function readAsset() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).read(ASSET_PATH);
}

describe('slime mount asset', () => {
  it('ships the exact bytes this test pins, changed only by a deliberate re-export', () => {
    const hash = createHash('sha256').update(readFileSync(ASSET_PATH)).digest('hex');
    expect(hash).toBe(EXPECTED_ASSET_SHA256);
  });

  it('carries the four gait clips at their authored lengths', async () => {
    const root = (await readAsset()).getRoot();
    const lengths = Object.fromEntries(
      root
        .listAnimations()
        .map((a) => [
          a.getName(),
          Math.max(...a.listSamplers().map((s) => s.getInput()?.getMax([])[0] ?? 0)),
        ]),
    );
    expect(Object.keys(lengths).sort()).toEqual(Object.keys(CLIP_SECONDS).sort());
    for (const [clip, seconds] of Object.entries(CLIP_SECONDS)) {
      expect(lengths[clip]).toBeCloseTo(seconds, 3);
    }
  });

  it('rigs the saddle on its own bone, moved by every clip, so a rider can sit on it', async () => {
    const root = (await readAsset()).getRoot();
    const joints = [
      ...new Set(root.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName()))),
    ].sort();
    const bubbles = Array.from({ length: 7 }, (_, i) => `bubble_${String(i).padStart(2, '0')}`);
    expect(joints).toEqual(
      ['base', ...bubbles, 'mid', 'move', 'root', 'saddle', 'squash', 'top'].sort(),
    );
    const saddle = root.listNodes().find((n) => n.getName() === 'saddle');
    expect(saddle?.getParentNode()?.getName()).toBe('move');
    for (const anim of root.listAnimations()) {
      const targets = anim.listChannels().map((c) => c.getTargetNode()?.getName());
      expect(targets).toContain('saddle');
    }
  });

  it('draws the jelly translucent, single-sided, with the tack double-sided under it', () =>
    readAsset().then((doc) => {
      const mats = Object.fromEntries(
        doc
          .getRoot()
          .listMaterials()
          .map((m) => [m.getName(), m]),
      );
      expect(mats.slime?.getAlphaMode()).toBe('BLEND');
      expect(mats.slime?.getAlpha()).toBeCloseTo(0.7, 2);
      expect(mats.slime?.getDoubleSided()).toBe(false);
      expect(mats.tack?.getAlphaMode()).toBe('OPAQUE');
      expect(mats.tack?.getDoubleSided()).toBe(true);
      expect(mats.bubble?.getAlphaMode()).toBe('OPAQUE');
    }));

  it('keeps every texture KTX2 and stands 6.61 units tall at rest, on the ground', async () => {
    const doc = await readAsset();
    const root = doc.getRoot();
    expect(root.listTextures().map((t) => t.getMimeType())).toEqual(
      root.listTextures().map(() => 'image/ktx2'),
    );
    const { min, max } = getBounds(root.listScenes()[0]);
    expect(min[1]).toBeCloseTo(0, 2);
    expect(max[1] - min[1]).toBeCloseTo(6.607, 2);
  });
});
