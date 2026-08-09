// The shared appearance wire/storage contract (src/world_api/appearance.ts).
//
// The server stores and re-broadcasts an authored look, so it bounds the
// payload without importing the renderer (the architecture invariant bans
// server -> src/render). That split only holds while the shared key set keeps
// up with the renderer's model, which is what the first test pins.

import { describe, expect, it } from 'vitest';
import {
  BEARD_STYLES,
  BLUSH_SHADES,
  BODY_SLIDERS,
  BROW_STYLES,
  DEFAULT_APPEARANCE,
  EAR_STYLES,
  EARRING_MATERIAL_IDS,
  EARRING_STYLES,
  EYE_STYLES,
  FACE_SLIDERS,
  HAIR_STYLES,
  LIP_SHADES,
  MOUTH_STYLES,
  OUTFIT_COLORWAY_IDS,
  SHADOW_SHADES,
} from '../src/render/characters/modular';
import {
  APPEARANCE_BODY_SLIDER_KEYS,
  APPEARANCE_FACE_SLIDER_KEYS,
  APPEARANCE_MAX_WIRE_BYTES,
  APPEARANCE_WIRE_KEYS,
  sameAppearance,
  sanitizeAppearance,
} from '../src/world_api/appearance';

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

  it('pins the slider allowlists against the renderer tables (drift guard)', () => {
    // The nested maps are key-allowlisted for the same reason the top level is:
    // a character row is re-broadcast to everyone in view, so unlisted keys are
    // an attacker-writable text channel. If this fails, a slider was added to
    // the renderer without being added to the wire allowlist, and the server
    // would silently strip it from every save.
    expect([...APPEARANCE_FACE_SLIDER_KEYS].sort()).toEqual([...FACE_SLIDERS].sort());
    expect([...APPEARANCE_BODY_SLIDER_KEYS].sort()).toEqual([...BODY_SLIDERS].sort());
  });
});

describe('sanitizeAppearance bounds', () => {
  it('rejects a non-object outright (the caller answers 400)', () => {
    expect(sanitizeAppearance('nope')).toBeNull();
    expect(sanitizeAppearance(42)).toBeNull();
    expect(sanitizeAppearance([1, 2])).toBeNull();
    expect(sanitizeAppearance(null)).toBeNull();
  });

  it('rejects a slider map that authors no slider', () => {
    // An empty or all-junk map used to sanitize to `{}` and still count as a
    // key the document contributed, so `{"face":{}}` read as a design and spent
    // the one-shot redesign token on a body nobody chose.
    expect(sanitizeAppearance({ face: {} })).toBeNull();
    expect(sanitizeAppearance({ body: { a: 'x' } })).toBeNull();
    expect(sanitizeAppearance({ face: {}, body: {} })).toBeNull();
    // ...but a map with one real slider is a design, and survives whole.
    expect(sanitizeAppearance({ face: { jaw: 0.5, junk: 'x' } })).toEqual({ face: { jaw: 0.5 } });
  });

  it('rejects a document that contributes no known key', () => {
    // An empty look is not a look, and the caller that matters is the one-shot
    // redesign: accepting `{"appearance":{}}` spent a character's single
    // redesign token and stored a body nobody authored.
    expect(sanitizeAppearance({})).toBeNull();
    expect(sanitizeAppearance({ nothing: 'known', evil: 'x' })).toBeNull();
    // ...and a document whose only known key is unusable is equally empty.
    expect(sanitizeAppearance({ hair: 'x'.repeat(200) })).toBeNull();
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

  it('keeps slider maps numeric and drops every unlisted key name', () => {
    const fat = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`s${i}`, 0.5]));
    const out = sanitizeAppearance({
      face: { jaw: 0.5, bogus: 'no' },
      body: { ...fat, chest: 0.25 },
    }) as {
      face: Record<string, number>;
      body: Record<string, number>;
    };
    expect(out.face).toEqual({ jaw: 0.5 });
    // 80 attacker-named keys are gone entirely; only the real slider survives.
    expect(out.body).toEqual({ chest: 0.25 });
  });

  it('never persists an attacker-chosen key name, even a short numeric one', () => {
    // The old bound was count + value type, which let 32 keys of 48 chars ride
    // per map — persisted and re-broadcast to everyone in view, outside every
    // chat filter. Key NAMES are the channel, so they are allowlisted.
    const evil = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`ATTACKER TEXT ${i} ${'x'.repeat(30)}`, 1]),
    );
    expect(sanitizeAppearance({ face: evil })).toBeNull();
    const mixed = sanitizeAppearance({ face: { ...evil, jaw: 1 } }) as {
      face: Record<string, number>;
    };
    expect(Object.keys(mixed.face)).toEqual(['jaw']);
  });

  it('accepts booleans (the lashes toggle) and passes ranges through to the renderer', () => {
    // Out-of-range numbers are deliberately NOT clamped here; normalizeAppearance
    // owns the ranges and every consumer runs it before composing a body.
    const out = sanitizeAppearance({ lashes: true, skinLight: 99 });
    expect(out).toEqual({ lashes: true, skinLight: 99 });
  });
});

describe('appearance value charset', () => {
  // Allowlisting the KEYS was only half the channel. Every string VALUE was any
  // 48 UTF-16 units, 26 of them per document, persisted on a character row and
  // re-broadcast raw to everyone in view: about 1.2 K characters of
  // attacker-chosen text per player, outside every chat filter. Values are style
  // ids, so they are bounded as ids.

  it('takes every id the renderer actually defines (drift guard)', () => {
    // If a future style id needs a character this pattern rejects, this test is
    // where it surfaces, rather than in a player's look silently not saving.
    const everyId = [
      ...HAIR_STYLES,
      ...BEARD_STYLES,
      ...BROW_STYLES,
      ...EARRING_STYLES,
      ...EARRING_MATERIAL_IDS,
      ...EYE_STYLES,
      ...EAR_STYLES,
      ...LIP_SHADES,
      ...BLUSH_SHADES,
      ...SHADOW_SHADES,
      ...MOUTH_STYLES,
      ...OUTFIT_COLORWAY_IDS,
      'male',
      'female',
      // retired ids an old row may still carry (HAIR_LEGACY / BEARD_LEGACY);
      // normalizeAppearance remaps them, but only if they survive the bounds
      'slickback',
      'chinstrap',
      'sideburns',
      'soulpatch',
      'handlebar',
      'bandholz',
    ];
    const rejected = everyId.filter((id) => sanitizeAppearance({ hair: id })?.hair !== id);
    expect(rejected, `style ids the bounds check would drop: ${rejected.join(', ')}`).toEqual([]);
    expect(everyId.length).toBeGreaterThan(140); // it really walked the tables
  });

  it('drops anything that is not a bare identifier', () => {
    // Each of these is a message someone could otherwise park on a character
    // row and have the server hand to every player who walks past them.
    for (const evil of [
      'hello there',
      'buy gold at example com',
      '<script>alert(1)</script>',
      'https://example.com',
      'a\nb',
      'a b',
      '‮evil',
      'crew!',
      'x'.repeat(25),
      '',
    ]) {
      expect(sanitizeAppearance({ hair: evil, gender: 'male' })).toEqual({ gender: 'male' });
    }
  });

  it('applies the charset to EVERY string key, not just the one', () => {
    const evil = 'BUY GOLD';
    const doc: Record<string, unknown> = { gender: 'male' };
    for (const key of APPEARANCE_WIRE_KEYS) {
      if (key === 'face' || key === 'body' || key === 'gender') continue;
      doc[key] = evil;
    }
    expect(sanitizeAppearance(doc)).toEqual({ gender: 'male' });
  });
});

describe('the wire ceiling', () => {
  /** The biggest thing sanitizeAppearance can return: every scalar key carrying
   *  the longest legal value (a 24-character id costs 26 bytes with its quotes,
   *  where the longest JSON number is 24), and both slider maps full of
   *  worst-case doubles. */
  function maximalDocument(): Record<string, unknown> {
    const worstNumber = -Number.MAX_VALUE;
    const doc: Record<string, unknown> = {};
    for (const key of APPEARANCE_WIRE_KEYS) {
      if (key === 'face') {
        doc.face = Object.fromEntries(APPEARANCE_FACE_SLIDER_KEYS.map((k) => [k, worstNumber]));
      } else if (key === 'body') {
        doc.body = Object.fromEntries(APPEARANCE_BODY_SLIDER_KEYS.map((k) => [k, worstNumber]));
      } else {
        doc[key] = 'a'.repeat(24);
      }
    }
    return doc;
  }

  it('is a measured ceiling, not an estimate', () => {
    // The identity-wire reasoning (server/game.ts) sizes this document, and the
    // number has to be true of the WORST case rather than the typical one: it is
    // stored per character and re-broadcast to everyone in view.
    const out = sanitizeAppearance(maximalDocument());
    expect(out).not.toBeNull();
    const bytes = Buffer.byteLength(JSON.stringify(out), 'utf8');
    expect(bytes).toBe(APPEARANCE_MAX_WIRE_BYTES);
  });

  it('cannot be exceeded by an attacker document, at any size or charset', () => {
    // Everything the old bound let through: longer values, multi-byte
    // characters, control characters (six bytes each once escaped), hundreds of
    // extra keys, and fat slider maps.
    for (const fill of ['x'.repeat(4000), '一'.repeat(2000), ''.repeat(2000)]) {
      const doc: Record<string, unknown> = {};
      for (const key of APPEARANCE_WIRE_KEYS) doc[key] = fill;
      for (let i = 0; i < 500; i++) doc[`junk${i}`] = fill;
      doc.face = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`s${i}`, 1e300]));
      doc.body = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [fill + i, 1e300]));
      const out = sanitizeAppearance(doc);
      const bytes = out === null ? 0 : Buffer.byteLength(JSON.stringify(out), 'utf8');
      expect(bytes).toBeLessThanOrEqual(APPEARANCE_MAX_WIRE_BYTES);
    }
  });

  it('leaves a real authored look far under it', () => {
    const bytes = Buffer.byteLength(JSON.stringify(DEFAULT_APPEARANCE), 'utf8');
    expect(bytes).toBeLessThan(700); // the ~0.6 KB the wire reasoning quotes
  });
});

describe('sameAppearance', () => {
  // The resume path holds one look off an entity and one off a fresh row read,
  // so they are never the same object: an identity check elided nothing and
  // every reconnect re-minted the wire string and re-shipped a full identity
  // record to every player in view.
  it('reads two equal documents as equal, however they were built', () => {
    expect(sameAppearance({ ...DEFAULT_APPEARANCE }, { ...DEFAULT_APPEARANCE })).toBe(true);
    expect(sameAppearance(null, null)).toBe(true);
  });

  it('reads a real change as a change', () => {
    expect(sameAppearance({ hair: 'crew' }, { hair: 'mohawk' })).toBe(false);
    expect(sameAppearance({ hair: 'crew' }, null)).toBe(false);
    expect(sameAppearance(null, { hair: 'crew' })).toBe(false);
    expect(sameAppearance({ hair: 'crew' }, { hair: 'crew', beard: 'full' })).toBe(false);
  });
});
