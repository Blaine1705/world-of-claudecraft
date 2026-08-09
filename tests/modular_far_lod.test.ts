// The composed far LOD: the two walks that have to be ONE list, and the budget
// that spreads the mint.
//
// A composed body's far mesh is baked once per PART SET and shared, while the
// COLOURS are per character: the bake hands back geometry groups, and each
// character resolves group N against its own captured `userData.farMaterials[N]`.
// So the whole thing rests on one property that nothing in the renderer can
// check at runtime: the walk that captures the materials and the walk that
// builds the groups must produce the same list, in the same order.
//
// That property broke the first time in the most ordinary way. The capture ran
// before attachAllProps and the bake ran after, so the bake saw a held weapon
// the capture had not. It is not a tail-append either: the character GLB stores
// its bone root LAST (Rig_Medium's 248th child), and mergeSkinnedParts appends
// the merged body AFTER that, so a prop hanging off handslot.r is traversed
// BETWEEN the unmerged parts and the merged buckets. Every merged group, the
// armour and the cloth, the bulk of the silhouette, drew the material of the
// slot before it, and the tail fell through the padding to the untextured white
// fallback. Silently: the padding is what turns a length mismatch into a
// mis-colouring rather than a crash.
//
// The fix is composedFarMeshes dropping held props from both walks, which is
// also the only thing that COULD work: the bake composes its throwaway with no
// weapon ids, so its temp wears the class default while the characters
// resolving against it wear whatever they equipped. These tests fabricate a
// tree of the real shape and pin the two walks against each other.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  composedFarMeshes,
  farSourceMaterials,
  takeFarBakeBudget,
} from '../src/render/characters/assets';

function src(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}

/** The body of a named function, for the statement-order pins below. */
function fnBody(file: string, signature: string): string {
  const text = src(file);
  const start = text.indexOf(signature);
  expect(start, `${signature} not found in ${file}`).toBeGreaterThan(-1);
  const end = text.indexOf('\n}', start);
  return text.slice(start, end);
}

function mesh(name: string): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: `mat_${name}` }));
  m.name = name;
  return m;
}

/** A prop the way attachProp builds one: every mesh tagged `weaponMesh`, added
 *  under a bone rather than at the root. */
function prop(name: string): THREE.Object3D {
  const payload = new THREE.Group();
  payload.name = `${name}_payload`;
  const m = mesh(name);
  m.userData.weaponMesh = true;
  payload.add(m);
  return payload;
}

/**
 * A composed root shaped like the real one: unmerged parts first (the buckets
 * mergeSkinnedParts refuses because they carry morph targets), then the bone
 * root, then the merged body appended after it by `canon.parent?.add(merged)`.
 *
 * `props` hang off the handslot bone, which is where the ordering hazard lives:
 * mid-traversal, not at the end.
 */
function composedRoot(props: string[]): THREE.Object3D {
  const root = new THREE.Group();
  root.add(mesh('head'));
  root.add(mesh('eyes'));
  const boneRoot = new THREE.Bone();
  boneRoot.name = 'Rig_Medium_root';
  const handslot = new THREE.Bone();
  handslot.name = 'handslot.r';
  boneRoot.add(handslot);
  root.add(boneRoot);
  for (const name of props) handslot.add(prop(name));
  root.add(mesh('plate_bodymerged'));
  root.add(mesh('cloth_bodymerged'));
  return root;
}

const names = (list: THREE.Mesh[]) => list.map((m) => m.name);

describe('composedFarMeshes', () => {
  it('drops held props, so a prop attached mid-traversal cannot shift the groups', () => {
    // The reviewer's probe, as an assertion. A raw traversal puts the sword
    // between the unmerged parts and the merged body; the composed filter does
    // not see it at all.
    const raw: string[] = [];
    composedRoot(['sword']).traverse((o) => {
      if ((o as THREE.Mesh).isMesh) raw.push(o.name);
    });
    expect(raw).toEqual(['head', 'eyes', 'sword', 'plate_bodymerged', 'cloth_bodymerged']);

    expect(names(composedFarMeshes(composedRoot(['sword'])))).toEqual([
      'head',
      'eyes',
      'plate_bodymerged',
      'cloth_bodymerged',
    ]);
  });

  it('gives the SAME list whatever the character is holding', () => {
    // The property the whole far LOD rests on, stated directly. The bake's
    // throwaway is composed with no weapon ids (class default, one mesh) while
    // the character resolving against it carries its own equipment (here a
    // mainhand and an offhand). Any filter that counted props would hand these
    // two different lists, and the difference is not at the end.
    const bakeTemp = composedFarMeshes(composedRoot(['class_default_sword']));
    const character = composedFarMeshes(composedRoot(['greataxe', 'shield']));
    expect(names(character)).toEqual(names(bakeTemp));
    expect(character).toHaveLength(bakeTemp.length);
  });

  it('resolves each merged group to its OWN material', () => {
    // The failure this closes was not an exception, it was every merged group
    // wearing the material of the slot before it. Walk both sides the way the
    // renderer does and check the pairing by name.
    const character = composedRoot(['greataxe', 'shield']);
    const captured = composedFarMeshes(character).map(
      (m) => (m.material as THREE.Material & { name: string }).name,
    );
    const groups = names(composedFarMeshes(composedRoot(['class_default_sword'])));
    expect(captured).toEqual(groups.map((n) => `mat_${n}`));
  });

  it('still drops face decals, hidden chains and geometry-less meshes', () => {
    const root = composedRoot([]);
    const decal = mesh('stubble_decal');
    decal.userData.faceDecal = true;
    root.add(decal);

    const hiddenParent = new THREE.Group();
    hiddenParent.visible = false;
    hiddenParent.add(mesh('hidden_cape'));
    root.add(hiddenParent);

    const empty = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    empty.name = 'no_position';
    root.add(empty);

    expect(names(composedFarMeshes(root))).toEqual([
      'head',
      'eyes',
      'plate_bodymerged',
      'cloth_bodymerged',
    ]);
  });
});

describe('farSourceMaterials', () => {
  it('reads the captured slots back in bake-group order', () => {
    const root = composedRoot(['sword']);
    root.userData.farMaterials = composedFarMeshes(root).map((m) => m.material);
    const out = farSourceMaterials(root, 4);
    expect(out.map((m) => (m as THREE.Material & { name: string }).name)).toEqual([
      'mat_head',
      'mat_eyes',
      'mat_plate_bodymerged',
      'mat_cloth_bodymerged',
    ]);
  });

  it('pads rather than leaving a group without a material', () => {
    const root = composedRoot([]);
    root.userData.farMaterials = [new THREE.MeshStandardMaterial({ name: 'only' })];
    const out = farSourceMaterials(root, 3);
    expect(out).toHaveLength(3);
    for (const m of out) expect(m).toBeInstanceOf(THREE.Material);
    // ...and the pad is one shared fallback instance, not three
    expect(out[2]).toBe(out[1]);
  });
});

describe('takeFarBakeBudget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('admits one bake per window and refuses the rest', () => {
    // The gate exists because setFar drives the bake on the crossing EDGE: a
    // camera riding away from a capital flips every composed peer to far in one
    // frame, and each genuinely new part set is a full compose plus a mixer step
    // plus a static rebake. Without it that is one frame paying for all of them.
    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(1_000_000);
    expect(takeFarBakeBudget()).toBe(true);
    expect(takeFarBakeBudget()).toBe(false); // same instant: the slot is taken
    now.mockReturnValue(1_000_029);
    expect(takeFarBakeBudget()).toBe(false); // still inside the window
    now.mockReturnValue(1_000_030);
    expect(takeFarBakeBudget()).toBe(true); // window elapsed: a new slot
    expect(takeFarBakeBudget()).toBe(false); // ...and immediately taken again
  });

  it('keeps the window short enough for a crowd to drain in about a second', () => {
    // A 20-look crowd must not take 20 seconds to stop being articulated. Pin
    // the ceiling rather than the constant: the number can move, the property
    // that a crowd drains inside a second cannot.
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(2_000_000);
    expect(takeFarBakeBudget()).toBe(true);
    let elapsed = 0;
    while (elapsed < 1000) {
      elapsed++;
      now.mockReturnValue(2_000_000 + elapsed);
      if (takeFarBakeBudget()) break;
    }
    expect(elapsed).toBeLessThanOrEqual(50); // 20 looks x 50ms = one second
  });
});

describe('far-LOD wiring (source pins)', () => {
  // These four are statement order and call-site identity in code that needs a
  // GPU and a parsed GLB to run. Each one reverts to a green suite without a
  // pin, and each one is silent in the wrong direction: a mis-colouring, a
  // frame spike, a character stuck articulated, or a leaked ref.

  it('captures the far materials AFTER attachAllProps, so both walks see one tree', () => {
    const body = fnBody('src/render/characters/assets.ts', 'export function assembleModular(');
    const attach = body.indexOf('attachAllProps(');
    const capture = body.indexOf('root.userData.farMaterials =');
    expect(attach).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(-1);
    expect(attach).toBeLessThan(capture);
    // ...and off the composed filter, never the raw one
    expect(body).toContain('composedFarMeshes(root)');
  });

  it('bakes the composed LOD off composedFarMeshes and the fixed rig off farBakeMeshes', () => {
    // Two different filters on purpose: the fixed-rig bake reads its materials
    // back out of the same walk, so it is self-consistent and keeps the weapon;
    // the composed bake is shared per part set, which cannot represent one.
    const composed = fnBody('src/render/characters/assets.ts', 'export function modularFarBake(');
    expect(composed).toContain('bakeStaticPose(norm, composedFarMeshes(temp))');
    const fixed = fnBody('src/render/characters/assets.ts', 'export function prepareVisual(');
    expect(fixed).toContain('bakeStaticPose(norm, farBakeMeshes(temp))');
  });

  it('peeks before spending the budget, and goes pending when refused', () => {
    // A part set someone already baked must never compete for the frame slot:
    // a crowd sharing a haircut would otherwise drain one character per window
    // for no work at all. And a refusal has to be remembered, or the character
    // stays articulated for as long as it stays far.
    const body = fnBody('src/render/characters/visual.ts', 'private attemptComposedFar()');
    const peek = body.indexOf('peekModularFarBake(');
    const budget = body.indexOf('takeFarBakeBudget()');
    expect(peek).toBeGreaterThan(-1);
    expect(budget).toBeGreaterThan(peek);
    expect(body).toContain('this.farBakePending = true');
  });

  it('answers the peek from the cache without minting a variant', () => {
    // The cheap arm has to STAY cheap. A peek that composed to answer would be
    // exactly the cost it exists to avoid, once per far crossing per peer, and
    // it would mint an entry (and a ref) for a look nobody is wearing.
    const body = fnBody('src/render/characters/assets.ts', 'export function peekModularFarBake(');
    expect(body).toContain('modularVariantCache.get(');
    expect(body).toContain('entry?.far');
    expect(body).not.toContain('modularVariant(');
    expect(body).not.toContain('assembleModular(');
  });

  it('retries a pending bake from the per-frame update', () => {
    const body = fnBody('src/render/characters/visual.ts', '  update(dt: number');
    expect(body).toContain('this.farBakePending && this.far && !this.farBakeTried');
    expect(body).toContain('this.attemptComposedFar()');
  });

  it('releases the retained variant when construction throws', () => {
    // assembleModular retains the part set as its LAST act, so a visual that
    // throws anywhere after that (a missing clip, an atlas, a click proxy) owns
    // a ref nothing will ever release: the entry becomes permanently
    // unevictable, which is the precise failure the cache cap exists to prevent.
    const text = src('src/render/characters/visual.ts');
    const ctor = text.indexOf('    } catch (err) {');
    expect(ctor).toBeGreaterThan(-1);
    expect(text.slice(ctor, ctor + 120)).toContain('releaseModularVariant(this.model)');
  });
});
