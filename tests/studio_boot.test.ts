import { beforeEach, describe, expect, it } from 'vitest';
import { boutSizeFromUrl, resolveStudioEntry } from '../src/game/studio_boot';
import { DEEPGLASS_DEFAULT_PER_SIDE } from '../src/sim/deepglass/match';
import type { WorldContent } from '../src/sim/types';

const arena = { presentationMode: 'deepglass' } as WorldContent;

function installStorage(): Map<string, string> {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  return map;
}

describe('boutSizeFromUrl', () => {
  it('books nothing outside the arena or without a ?bout', () => {
    expect(boutSizeFromUrl(undefined, '?bout=3')).toBeNull();
    expect(
      boutSizeFromUrl({ presentationMode: 'overworld' } as unknown as WorldContent, '?bout=3'),
    ).toBeNull();
    expect(boutSizeFromUrl(arena, '?map=deepglass')).toBeNull();
  });

  it('clamps the booking to the roster and defaults a junk value', () => {
    expect(boutSizeFromUrl(arena, '?bout=3')).toBe(3);
    expect(boutSizeFromUrl(arena, '?bout=0')).toBe(1);
    expect(boutSizeFromUrl(arena, '?bout=99')).toBe(5);
    expect(boutSizeFromUrl(arena, '?bout=abc')).toBe(DEEPGLASS_DEFAULT_PER_SIDE);
  });
});

describe('resolveStudioEntry', () => {
  beforeEach(() => {
    installStorage();
  });

  it('is null on the normal flow: no ?map slug and no portal handoff', () => {
    expect(resolveStudioEntry(new URLSearchParams(''), false)).toBeNull();
    expect(resolveStudioEntry(new URLSearchParams('?ref=abc'), false)).toBeNull();
  });

  it('falls through for an unknown slug and yields to an editor playtest', () => {
    expect(resolveStudioEntry(new URLSearchParams('?map=no_such_map'), false)).toBeNull();
    expect(resolveStudioEntry(new URLSearchParams('?map=deepglass'), true)).toBeNull();
  });

  it('resolves the arena slug to an entry', () => {
    expect(resolveStudioEntry(new URLSearchParams('?map=deepglass'), false)).not.toBeNull();
  });
});
