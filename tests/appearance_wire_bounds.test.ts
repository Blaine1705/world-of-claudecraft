// The shared appearance wire/storage contract (src/world_api/appearance.ts).
//
// The server stores and re-broadcasts an authored look, so it bounds the
// payload without importing the renderer (the architecture invariant bans
// server -> src/render). That split only holds while the shared key set keeps
// up with the renderer's model, which is what the first test pins.

import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../src/render/characters/modular';
import { APPEARANCE_WIRE_KEYS, sanitizeAppearance } from '../src/world_api/appearance';

describe('appearance wire key set', () => {
  it('covers every field of the renderer model (drift guard)', () => {
    // If this fails, a field was added to ModularAppearance without being
    // added to APPEARANCE_WIRE_KEYS, so the server would silently drop it on
    // every save and the look would not survive a relog.
    const missing = Object.keys(DEFAULT_APPEARANCE).filter(
      (key) => !APPEARANCE_WIRE_KEYS.includes(key),
    );
    expect(
      missing,
      `appearance fields missing from the wire key set: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('carries no key the renderer model does not define', () => {
    const known = new Set(Object.keys(DEFAULT_APPEARANCE));
    expect(APPEARANCE_WIRE_KEYS.filter((key) => !known.has(key))).toEqual([]);
  });

  it('round-trips a real authored look unchanged', () => {
    expect(sanitizeAppearance(DEFAULT_APPEARANCE)).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('sanitizeAppearance bounds', () => {
  it('rejects a non-object outright (the caller answers 400)', () => {
    expect(sanitizeAppearance('nope')).toBeNull();
    expect(sanitizeAppearance(42)).toBeNull();
    expect(sanitizeAppearance([1, 2])).toBeNull();
    expect(sanitizeAppearance(null)).toBeNull();
  });

  it('drops unknown keys so a character row cannot carry attacker text', () => {
    const out = sanitizeAppearance({ gender: 'female', evil: 'x'.repeat(10), nested: { a: 1 } });
    expect(out).toEqual({ gender: 'female' });
  });

  it('drops oversized strings and non-finite numbers', () => {
    const out = sanitizeAppearance({
      hair: 'x'.repeat(200),
      skinHue: Number.POSITIVE_INFINITY,
      hairHue: Number.NaN,
      outfit: 'crimson',
    });
    expect(out).toEqual({ outfit: 'crimson' });
  });

  it('keeps slider maps numeric and bounded', () => {
    const fat = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`s${i}`, 0.5]));
    const out = sanitizeAppearance({ face: { jaw: 0.5, bogus: 'no' }, body: fat }) as {
      face: Record<string, number>;
      body: Record<string, number>;
    };
    expect(out.face).toEqual({ jaw: 0.5 });
    expect(Object.keys(out.body).length).toBe(32);
  });

  it('accepts booleans (the lashes toggle) and passes ranges through to the renderer', () => {
    // Out-of-range numbers are deliberately NOT clamped here; normalizeAppearance
    // owns the ranges and every consumer runs it before composing a body.
    const out = sanitizeAppearance({ lashes: true, skinLight: 99 });
    expect(out).toEqual({ lashes: true, skinLight: 99 });
  });
});
