import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { RICKSHAW_MATERIAL_CONTRACT } from '../scripts/assets/rickshaw_mount/model.js';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { VISUALS } from '../src/render/characters/manifest';

// Structural contract for the shipped rickshaw_mount.glb, mirroring the tank
// mount's own asset test (tests/terrorspark_groundshaker_asset.test.ts) minus
// the source-fingerprint-in-extras half: this GLB was never exported with
// that stamp (the rickshaw's exporter predates adopting the eastbrook-style
// fingerprint convention), and re-exporting to add it now would risk
// reintroducing bugs into geometry that has already been measured, tuned,
// and live-verified across several passes. What this DOES pin: the exact
// shipped bytes (so any future re-export is a deliberate, reviewed change,
// not a silent drift) and the real structural shape (materials, UVs,
// COLOR_0, wheel nodes, no skin/animation) a change to model.js or the
// exporter could otherwise break without any test noticing.
const REPO_ROOT = path.join(__dirname, '..');
const ASSET_PATH = path.join(REPO_ROOT, 'public/models/mounts/rickshaw_mount.glb');
const EXPECTED_ASSET_SHA256 = '5f539e1f2ad40fe41987201673acc0a2977c5bd0a25deb81dffa023ef285d8cd';
// The four procedural PBR material families this mount ships, plus the
// untextured emissive lantern-glow material (not in RICKSHAW_MATERIAL_CONTRACT:
// it has no surface maps, see model.js's makeMaterials).
const EXPECTED_MATERIAL_NAMES = ['wood', 'bronze', 'leather', 'fabric', 'LanternGlow'];

describe('rickshaw mount asset pipeline', () => {
  it('pins the material contract that drives the surface-map export', () => {
    expect(RICKSHAW_MATERIAL_CONTRACT.map((entry) => entry.name)).toEqual([
      'wood',
      'bronze',
      'leather',
      'fabric',
    ]);
    for (const entry of RICKSHAW_MATERIAL_CONTRACT) {
      expect(entry.roughness).toBeGreaterThan(0);
      expect(entry.roughness).toBeLessThanOrEqual(1);
      expect(entry.metalness).toBeGreaterThanOrEqual(0);
      expect(entry.metalness).toBeLessThanOrEqual(1);
      expect(entry.uvScale).toBeGreaterThan(0);
    }
  });

  it('ships the exact bytes this test pins, changed only by a deliberate re-export', async () => {
    await MeshoptDecoder.ready;
    const bytes = readFileSync(ASSET_PATH);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(sha256).toBe(EXPECTED_ASSET_SHA256);
    expect(MEDIA_ASSETS['models/mounts/rickshaw_mount.glb']).toBe(
      `/media/models/mounts/rickshaw_mount.${sha256.slice(0, 12)}.glb`,
    );
  });

  it('carries the real material/UV/COLOR_0/wheel-node shape the renderer and shading pipeline depend on', async () => {
    await MeshoptDecoder.ready;
    const bytes = readFileSync(ASSET_PATH);
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.readBinary(bytes);
    const root = document.getRoot();

    // No skin or animation: wheel spin and puller gait are both driven
    // procedurally by the renderer (spinMountWheels, the puller's own
    // CharacterVisual), never a baked clip on this GLB itself.
    expect(root.listSkins()).toHaveLength(0);
    expect(root.listAnimations()).toHaveLength(0);
    expect(root.listCameras()).toHaveLength(0);
    expect(root.listScenes()).toHaveLength(1);

    expect(root.listMaterials().map((m) => m.getName())).toEqual(EXPECTED_MATERIAL_NAMES);

    // KHR_texture_basisu (real GPU-resident KTX2/Basis, not the raw webp the
    // exporter emits): the repo-wide invariant every shipped GLB texture
    // follows (tests/glb_texture_compression.test.ts), verified directly
    // here too so a re-export that skips compress_glb_textures.mjs fails
    // this asset's own contract test, not just the tree-wide sweep.
    expect(
      root
        .listExtensionsRequired()
        .map((e) => e.extensionName)
        .sort(),
    ).toEqual([
      'EXT_meshopt_compression',
      'KHR_mesh_quantization',
      'KHR_texture_basisu',
      'KHR_texture_transform',
    ]);

    // Every material but the lantern glow ships a full PBR trio (albedo,
    // normal, ORM), matching RICKSHAW_MATERIAL_CONTRACT's four families.
    const textures = root.listTextures();
    const textureNames = textures.map((t) => t.getName()).sort();
    for (const family of ['wood', 'bronze', 'leather', 'fabric']) {
      expect(textureNames).toContain(`rickshaw_${family}_albedo`);
      expect(textureNames).toContain(`rickshaw_${family}_normal`);
      expect(textureNames).toContain(`rickshaw_${family}_orm`);
    }
    expect(textureNames.filter((n) => n.startsWith('rickshaw_'))).toHaveLength(12);
    for (const texture of textures) {
      expect(texture.getMimeType(), texture.getName()).toBe('image/ktx2');
    }

    // Every mesh primitive carries a vertex-baked COLOR_0 (shadeSurfaceInto's
    // output), the load-bearing convention for every procedural asset in this
    // pipeline: no bespoke photo textures, macro shading rides vertex color.
    let primitiveCount = 0;
    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        primitiveCount++;
        expect(primitive.getAttribute('COLOR_0'), `${mesh.getName()} COLOR_0`).not.toBeNull();
        const material = primitive.getMaterial();
        // The lantern glow primitive has no UVs (untextured emissive); every
        // textured material primitive needs real TEXCOORD_0 for its albedo/
        // normal/ORM maps to land correctly.
        if (material && material.getName() !== 'LanternGlow') {
          expect(
            primitive.getAttribute('TEXCOORD_0'),
            `${mesh.getName()} TEXCOORD_0`,
          ).not.toBeNull();
        }
      }
    }
    expect(primitiveCount).toBeGreaterThan(0);

    // The two wheel nodes spinMountWheels looks up by name at runtime
    // (src/render/rickshaw_mount.ts ROLLING_WHEEL_NODES): if either is
    // renamed or dropped by a model.js change, the wheels silently stop
    // rolling with no test failing anywhere else.
    const nodeNames = root.listNodes().map((n) => n.getName());
    expect(nodeNames).toContain('Wheel_L');
    expect(nodeNames).toContain('Wheel_R');
  });

  // manifest.ts's own comment on both VisualDefs says a stale height silently
  // RESCALES the whole model (prepareVisual's normScale = height /
  // measuredHeight); the rickshaw's own height has already gone stale twice by
  // that comment's own history. Pin both new GLBs' measured bbox height
  // against their manifest.ts height field so a future geometry pass that
  // forgets to update it fails here instead of silently mis-scaling in game.
  it('pins mount_rickshaw_mount.height against the shipped GLB measured bbox', async () => {
    await MeshoptDecoder.ready;
    const bytes = readFileSync(ASSET_PATH);
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.readBinary(bytes);
    const bounds = getBounds(document.getRoot().listScenes()[0]);
    const measuredHeight = bounds.max[1] - bounds.min[1];
    expect(measuredHeight).toBeCloseTo(VISUALS.mount_rickshaw_mount.height, 3);
  });

  it('pins skel_rickshaw_puller.height against the shipped GLB measured bbox', async () => {
    await MeshoptDecoder.ready;
    const pullerPath = path.join(REPO_ROOT, 'public/models/chars/enemies/skeleton_minion_free.glb');
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.readBinary(readFileSync(pullerPath));
    const bounds = getBounds(document.getRoot().listScenes()[0]);
    const measuredHeight = bounds.max[1] - bounds.min[1];
    expect(measuredHeight).toBeCloseTo(VISUALS.skel_rickshaw_puller.height, 3);
  });
});
