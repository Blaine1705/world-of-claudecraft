// The three-side binding of the piece cut (src/render/compile_gate_pieces.ts):
// which nodes of a gated root form a piece (exactly the material carriers
// three's compile() prepares: mesh, points, line, sprite), keyed on the material
// tuple's identity, and the per-piece work the gate queue runs.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { linkPiecesOf, linkPieceWork } from '../src/render/compile_gate_pieces';

function mesh(material: THREE.Material | THREE.Material[], name = ''): THREE.Mesh {
  const built = new THREE.Mesh(new THREE.BufferGeometry(), material);
  built.name = name;
  return built;
}

describe('linkPiecesOf', () => {
  it('groups the carriers by material identity, in traversal order, every carrier kept', () => {
    const root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial();
    const torso = mesh(skin, 'torso');
    const eyes = mesh(new THREE.MeshBasicMaterial(), 'eyes');
    const legs = mesh(skin, 'legs');
    const attach = new THREE.Group();
    const cape = mesh(new THREE.MeshStandardMaterial(), 'cape');
    attach.add(cape);
    root.add(torso, eyes, legs, attach);
    expect(linkPiecesOf(root)).toEqual([[torso, legs], [eyes], [cape]]);
  });

  it('keys a multi-material mesh on the whole tuple, so it is not the piece of any single member', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    const pair = mesh([a, b], 'pair');
    const pairAgain = mesh([a, b], 'pairAgain');
    const swapped = mesh([b, a], 'swapped');
    const lone = mesh(a, 'lone');
    const root = new THREE.Group();
    root.add(pair, lone, pairAgain, swapped);
    expect(linkPiecesOf(root)).toEqual([[pair, pairAgain], [lone], [swapped]]);
  });

  it('covers every carrier kind three compile() prepares, and skips what it skips', () => {
    // three's compile(): mesh, points, line or sprite with a material; a bare
    // group, a light, a bone, or a mesh whose material slot is empty prepare
    // nothing and belong to no piece.
    const root = new THREE.Group();
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    const empty = mesh(new THREE.MeshBasicMaterial(), 'empty');
    empty.material = null as unknown as THREE.Material;
    root.add(new THREE.PointLight(), new THREE.Bone(), points, line, sprite, empty);
    expect(linkPiecesOf(root)).toEqual([[points], [line], [sprite]]);
  });

  it('gives a lone mesh root one piece of itself, and a carrier-less root none', () => {
    const lone = mesh(new THREE.MeshStandardMaterial(), 'batch');
    expect(linkPiecesOf(lone)).toEqual([[lone]]);
    expect(linkPiecesOf(new THREE.Group())).toEqual([]);
  });
});

describe('linkPieceWork', () => {
  it('runs the colour arm then the shadow arm on each node of the piece, in order, nothing reparented', async () => {
    const skin = new THREE.MeshStandardMaterial();
    const torso = mesh(skin, 'torso');
    const legs = mesh(skin, 'legs');
    const eyes = mesh(new THREE.MeshBasicMaterial(), 'eyes');
    const root = new THREE.Group();
    root.add(torso, eyes, legs);
    const arms: string[] = [];
    const color = vi.fn((node: THREE.Object3D) => {
      arms.push(`color:${node.name}`);
      return Promise.resolve();
    });
    const shadow = vi.fn((node: THREE.Object3D) => {
      arms.push(`shadow:${node.name}`);
      return Promise.resolve();
    });
    const work = linkPieceWork(root, color, shadow);
    expect(work).toHaveLength(2);
    await work[0]();
    expect(arms).toEqual(['color:torso', 'shadow:torso', 'color:legs', 'shadow:legs']);
    await work[1]();
    expect(arms.slice(4)).toEqual(['color:eyes', 'shadow:eyes']);
    for (const node of [torso, legs, eyes]) expect(node.parent).toBe(root);
  });

  it('starts the first colour arm synchronously inside the work call, so the queue books its prologue', () => {
    // The queue's syncMs (and the budget it feeds) stops at the work
    // function's first await: a first arm deferred to a microtask would run
    // outside every unit, unbooked and unpaced, the very cost the cut exists to
    // pace.
    const root = mesh(new THREE.MeshStandardMaterial(), 'batch');
    let started = false;
    const work = linkPieceWork(
      root,
      () => {
        started = true;
        return new Promise(() => {});
      },
      () => Promise.resolve(),
    );
    void work[0]();
    expect(started).toBe(true);
  });

  it('is empty for a root without a material carrier', () => {
    expect(linkPieceWork(new THREE.Group(), vi.fn(), vi.fn())).toEqual([]);
  });
});
