// @vitest-environment happy-dom
// The CharacterVisual wiring of the shapeshift form adornments: the renderer
// already forwards the Moonwing (`setMoonkin`) and Gloamveil (`setShadowform`)
// edges every frame, and the visual turns them into rig-parented pieces
// (form_adornments.ts). Pins, on the REAL CharacterVisual over a mocked
// loader (the character_halo.test.ts rig):
//  - each edge mounts and unmounts its set, and dispose() takes it down;
//  - antlers only on a composed body (a fixed druid rig wears its own hood);
//  - the pieces stay out of the body's overlay cycle: a ghost swap, a weapon
//    swap (rebuildCasters re-traverses the model) or the tint itself never
//    mounts an effect clone on them, and they never cast shadows.
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Visual = import('../src/render/characters/visual').CharacterVisual;
let CharacterVisual: typeof import('../src/render/characters/visual').CharacterVisual;

function stubGltf() {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
  body.name = 'body';
  scene.add(body);
  const chest = new THREE.Bone();
  chest.name = 'chest';
  const head = new THREE.Bone();
  head.name = 'head';
  chest.add(head);
  scene.add(chest);
  return { scene, animations: [new THREE.AnimationClip('Idle', 1, [])] };
}

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn(() => Promise.resolve(stubGltf())),
    loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    releaseGltf: vi.fn(),
  }));
  const { charactersReady } = await import('../src/render/characters/assets');
  await charactersReady();
  ({ CharacterVisual } = await import('../src/render/characters/visual'));
});

afterAll(() => {
  vi.doUnmock('../src/render/assets/loader');
  vi.resetModules();
});

function adornments(visual: Visual): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  visual.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && /^(moonwing|gloamveil)_/.test(mesh.name)) out.push(mesh);
  });
  return out;
}

function pieceNames(visual: Visual): string[] {
  return adornments(visual)
    .map((mesh) => mesh.name)
    .sort();
}

describe('CharacterVisual form adornments', () => {
  it('mounts Moonwing on the edge, without antlers on the fixed druid rig', () => {
    const visual = new CharacterVisual('player_druid', 0xffffff, 0);
    expect(pieceNames(visual)).toEqual([]);
    visual.setMoonkin(true);
    expect(pieceNames(visual)).toEqual([
      'moonwing_crescent',
      'moonwing_wing_left_feathers',
      'moonwing_wing_right_feathers',
    ]);
    visual.setMoonkin(false);
    expect(pieceNames(visual)).toEqual([]);
    visual.dispose();
  });

  it('grows the antlers back on a composed body', () => {
    const visual = new CharacterVisual('player_druid', 0xffffff, 0);
    // The constructor keeps `look` only for a modular def, which a stubbed
    // loader cannot assemble; set the field it would hold so the SAME wiring
    // reads a composed body.
    (visual as unknown as { look: unknown }).look = { app: {}, worn: {} };
    visual.setMoonkin(true);
    expect(pieceNames(visual)).toContain('moonwing_antlers');
    expect(pieceNames(visual)).toContain('moonwing_antler_wraps');
    visual.dispose();
  });

  it('mounts the Gloamveil veil on the Shadowform edge and drops it on dispose', () => {
    const visual = new CharacterVisual('player_priest', 0xffffff, 0);
    visual.setShadowform(true);
    expect(pieceNames(visual)).toEqual([
      'gloamveil_eye_left',
      'gloamveil_eye_right',
      'gloamveil_shell',
    ]);
    visual.dispose();
    expect(pieceNames(visual)).toEqual([]);
  });

  it('keeps the pieces on their own materials through every overlay and weapon swap', () => {
    const visual = new CharacterVisual('player_druid', 0xffffff, 0);
    visual.setMoonkin(true);
    const own = new Map(adornments(visual).map((mesh) => [mesh, mesh.material] as const));
    expect(own.size).toBe(3);
    const body = visual.root.getObjectByName('body') as THREE.Mesh;
    const bodyOriginal = body.material;
    const unchanged = (): void => {
      for (const [mesh, material] of own) {
        expect(mesh.material).toBe(material);
        expect(mesh.castShadow).toBe(false);
      }
    };
    // The body DOES take the tint and the ghost overlays: the check below is
    // meaningful only because the swap really ran.
    visual.setGhost(true);
    expect(body.material).not.toBe(bodyOriginal);
    unchanged();
    visual.setGhost(false);
    // A weapon swap re-traverses the model (rebuildCasters) and re-snapshots
    // every mesh it meets; the pieces must not enter that snapshot.
    visual.setShadow(true);
    visual.setWeapon('bogoak_staff');
    unchanged();
    visual.setGhost(true);
    unchanged();
    visual.setGhost(false);
    unchanged();
    visual.dispose();
  });

  it('animates the wings on the per-frame update', () => {
    const visual = new CharacterVisual('player_druid', 0xffffff, 0);
    visual.setMoonkin(true);
    const wing = visual.root.getObjectByName('moonwing_wing_right') as THREE.Object3D;
    const folded = wing.rotation.y;
    const state = {
      moving: false,
      running: false,
      airborne: false,
      casting: false,
      dead: false,
    } as unknown as Parameters<Visual['update']>[1];
    visual.update(1, state, true, false);
    expect(wing.rotation.y).toBeLessThan(folded);
    visual.dispose();
  });
});
