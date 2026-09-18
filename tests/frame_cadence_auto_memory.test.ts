import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  frameCadenceAutoMemoryKey,
  localFrameCadenceAutoMemory,
} from '../src/game/frame_cadence_auto_memory';

describe('automatic frame rate limit memory', () => {
  const store = new Map<string, string>();
  const original = (globalThis as { localStorage?: unknown }).localStorage;

  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  });

  afterEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  });

  it('keys on the preset and the refresh class, so either change forgets the verdict', () => {
    expect(frameCadenceAutoMemoryKey(1, 59.94)).toBe(frameCadenceAutoMemoryKey(1, 60.02));
    expect(frameCadenceAutoMemoryKey(1, 60)).not.toBe(frameCadenceAutoMemoryKey(1, 144));
    expect(frameCadenceAutoMemoryKey(1, 60)).not.toBe(frameCadenceAutoMemoryKey(3, 60));
  });

  it('round-trips a ceiling on the same display, and forgets it on another', () => {
    localFrameCadenceAutoMemory.save(60, 30);
    expect(localFrameCadenceAutoMemory.load(59.9)).toBe(30);
    expect(localFrameCadenceAutoMemory.load(144)).toBeNull();
  });

  it('reads nothing from a missing, corrupt or out-of-vocabulary entry', () => {
    expect(localFrameCadenceAutoMemory.load(60)).toBeNull();
    store.set('woc_frame_cadence_auto', '{not json');
    expect(localFrameCadenceAutoMemory.load(60)).toBeNull();
    // A matching key with a ceiling outside the vocabulary.
    localFrameCadenceAutoMemory.save(60, 30);
    const entry = JSON.parse(store.get('woc_frame_cadence_auto') ?? '{}');
    store.set('woc_frame_cadence_auto', JSON.stringify({ ...entry, ceiling: 45 }));
    expect(localFrameCadenceAutoMemory.load(60)).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    expect(() => localFrameCadenceAutoMemory.save(60, 30)).not.toThrow();
    expect(localFrameCadenceAutoMemory.load(60)).toBeNull();
  });
});
