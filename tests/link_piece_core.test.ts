// The compile gate's piece cut (src/render/link_piece_core.ts): a gated root's
// material carriers grouped by material tuple, in traversal order, so a gate
// submits one queue unit per material group instead of the whole root in one.
// Host-agnostic: plain objects stand in for meshes, and the traversal and the
// tuple key are the test's own.

import { describe, expect, it } from 'vitest';
import {
  enumerateLinkPieces,
  linkPieceLabel,
  materialTupleKey,
} from '../src/render/link_piece_core';

interface FakeNode {
  name: string;
  materials?: string[];
  children?: FakeNode[];
}

/** Depth-first, root first: three's Object3D.traverse order. */
function traverse(root: FakeNode, visit: (node: FakeNode) => void): void {
  visit(root);
  for (const child of root.children ?? []) traverse(child, visit);
}

const materialKey = (node: FakeNode): string | null =>
  node.materials ? materialTupleKey(node.materials) : null;

const names = (pieces: { meshes: FakeNode[] }[]): string[][] =>
  pieces.map((piece) => piece.meshes.map((mesh) => mesh.name));

describe('enumerateLinkPieces', () => {
  it('opens one piece per new material tuple, in traversal order, and joins a repeat to its piece', () => {
    const root: FakeNode = {
      name: 'root',
      children: [
        { name: 'torso', materials: ['skin'] },
        { name: 'eyes', materials: ['eye'] },
        { name: 'legs', materials: ['skin'] },
        { name: 'hair', materials: ['hair'] },
        { name: 'brows', materials: ['hair'] },
      ],
    };
    expect(names(enumerateLinkPieces(root, { traverse, materialKey }))).toEqual([
      ['torso', 'legs'],
      ['eyes'],
      ['hair', 'brows'],
    ]);
  });

  it('keys a multi-material carrier on the whole tuple, slot order included', () => {
    const root: FakeNode = {
      name: 'root',
      children: [
        { name: 'ab', materials: ['a', 'b'] },
        { name: 'ba', materials: ['b', 'a'] },
        { name: 'ab2', materials: ['a', 'b'] },
        { name: 'a', materials: ['a'] },
      ],
    };
    // 'a|b' and 'b|a' draw different groups; a lone 'a' is not the pair
    expect(names(enumerateLinkPieces(root, { traverse, materialKey }))).toEqual([
      ['ab', 'ab2'],
      ['ba'],
      ['a'],
    ]);
  });

  it('skips a node without a material, groups included, and keeps walking below it', () => {
    const root: FakeNode = {
      name: 'root',
      children: [
        {
          name: 'wrap',
          children: [{ name: 'inner', materials: ['m'] }],
        },
        { name: 'bare' },
        { name: 'outer', materials: ['m'] },
      ],
    };
    expect(names(enumerateLinkPieces(root, { traverse, materialKey }))).toEqual([
      ['inner', 'outer'],
    ]);
  });

  it('gives a lone root mesh one piece of itself', () => {
    const mesh: FakeNode = { name: 'batch', materials: ['opaque'] };
    expect(names(enumerateLinkPieces(mesh, { traverse, materialKey }))).toEqual([['batch']]);
  });

  it('gives a root without any carrier no piece at all', () => {
    const root: FakeNode = { name: 'root', children: [{ name: 'bare' }] };
    expect(enumerateLinkPieces(root, { traverse, materialKey })).toEqual([]);
  });
});

describe('piece labels', () => {
  it('appends the piece index after the gate label, so the kind (the label head) is unchanged', () => {
    expect(linkPieceLabel('live-gate:Group', 0)).toBe('live-gate:Group:0');
    expect(linkPieceLabel('reveal-gate:eastbrookTownKit', 12)).toBe(
      'reveal-gate:eastbrookTownKit:12',
    );
    expect(linkPieceLabel('live-gate:Group', 3).split(':')[0]).toBe('live-gate');
  });

  it('joins a tuple id list in order', () => {
    expect(materialTupleKey(['a'])).toBe('a');
    expect(materialTupleKey(['a', 'b'])).not.toBe(materialTupleKey(['b', 'a']));
  });
});
