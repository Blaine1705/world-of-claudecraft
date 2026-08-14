// The character design code: every changeable creator feature carries a
// stable named value, and a full look round-trips through the exported code.
import { describe, expect, it } from 'vitest';
import {
  DESIGN_CODE_HEADER,
  DESIGN_FIELDS,
  decodeDesignCode,
  encodeDesignCode,
} from '../src/render/characters/design_code_core';
import {
  DEFAULT_APPEARANCE,
  FACE_SLIDERS,
  type ModularAppearance,
  normalizeAppearance,
  randomizeAppearance,
} from '../src/render/characters/modular';

/** Deterministic LCG so the randomized round trip is reproducible. */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function decodeOk(code: string) {
  const r = decodeDesignCode(code);
  if (!r.ok) throw new Error(`expected ok, got ${r.reason} for: ${code}`);
  return r;
}

describe('design code field registry', () => {
  it('gives every changeable creator feature a stable wire id, pinned', () => {
    // This list IS the format: reordering is safe, renaming or removing an id
    // breaks every code players have saved. New features append new ids.
    expect(DESIGN_FIELDS.map((f) => f.id)).toEqual([
      'body',
      'skin',
      'eyes',
      'eyecol',
      'brows',
      'mouth',
      'ears',
      'lashes',
      'lashcol',
      'face',
      'hair',
      'haircol',
      'beard',
      'outfit',
      'lips',
      'blush',
      'shadow',
      'earrings',
      'jewel',
    ]);
  });

  it('emits every field id in the exported code, values included', () => {
    const code = encodeDesignCode(DEFAULT_APPEARANCE);
    expect(code.startsWith(`${DESIGN_CODE_HEADER}; `)).toBe(true);
    for (const f of DESIGN_FIELDS) {
      expect(code).toMatch(new RegExp(`(^|; )${f.id}=`));
    }
    // spot-check the value side is the human-readable spelling, not an index
    expect(code).toContain('body=male');
    expect(code).toContain('hair=crew');
    expect(code).toContain('skin=27/46/68');
  });
});

describe('design code round trip', () => {
  const expectSameLook = (a: ModularAppearance, b: ModularAppearance) => {
    // styles are exact
    for (const k of [
      'gender',
      'hair',
      'beard',
      'brows',
      'eyeShape',
      'ears',
      'mouth',
      'earrings',
      'earringMaterial',
      'lipstick',
      'blush',
      'eyeshadow',
      'outfit',
      'lashes',
    ] as const) {
      expect(b[k], k).toBe(a[k]);
    }
    // colours survive within the encoder's one-decimal rounding
    for (const k of [
      'skinHue',
      'skinSat',
      'skinLight',
      'hairHue',
      'hairSat',
      'hairLight',
      'eyeHue',
      'eyeSat',
      'eyeLight',
      'lashHue',
      'lashSat',
      'lashLight',
    ] as const) {
      const eps = k.endsWith('Hue') ? 0.05 : 0.0005;
      expect(Math.abs(b[k] - a[k]), k).toBeLessThanOrEqual(eps);
    }
    for (const k of FACE_SLIDERS) {
      expect(Math.abs((b.face[k] ?? 0) - (a.face[k] ?? 0)), `face.${k}`).toBeLessThanOrEqual(0.005);
    }
  };

  it('reproduces the default look exactly', () => {
    const r = decodeOk(encodeDesignCode(DEFAULT_APPEARANCE));
    expectSameLook(normalizeAppearance(DEFAULT_APPEARANCE), r.appearance);
    expect(r.ignored).toEqual([]);
    expect(r.coerced).toEqual([]);
  });

  it('reproduces 25 seeded randomized looks', () => {
    let base = normalizeAppearance(DEFAULT_APPEARANCE);
    const rand = seededRand(0xc0ffee);
    for (let i = 0; i < 25; i++) {
      base = randomizeAppearance({ ...base, gender: i % 2 === 0 ? 'female' : 'male' }, rand);
      const r = decodeOk(encodeDesignCode(base));
      expectSameLook(base, r.appearance);
      expect(r.coerced, `iteration ${i}`).toEqual([]);
    }
  });

  it('round-trips a sculpted face through named slider values', () => {
    const app = normalizeAppearance({
      ...DEFAULT_APPEARANCE,
      face: { ...DEFAULT_APPEARANCE.face, nose: -0.4, jaw: 0.2 },
    });
    const code = encodeDesignCode(app);
    expect(code).toContain('face=nose:-40,jaw:20');
    const r = decodeOk(code);
    expect(r.appearance.face.nose).toBeCloseTo(-0.4, 3);
    expect(r.appearance.face.jaw).toBeCloseTo(0.2, 3);
    expect(r.appearance.face.chin).toBe(0);
  });

  it('never carries body proportions: a code neither exports nor imports them', () => {
    const shaped = normalizeAppearance({
      ...DEFAULT_APPEARANCE,
      body: { ...DEFAULT_APPEARANCE.body, shoulders: 0.5 },
    });
    const code = encodeDesignCode(shaped);
    expect(code).not.toContain('shoulders');
    const r = decodeOk(code);
    // the decoder hands back the neutral body; the CALLER keeps the current one
    expect(r.appearance.body.shoulders).toBe(0);
  });
});

describe('design code import tolerance', () => {
  it('accepts case, stray whitespace, line breaks, and a trailing separator', () => {
    const r = decodeOk('woc1;\n  BODY=Female ;\r\n hair=MOHAWK;');
    expect(r.appearance.gender).toBe('female');
    expect(r.appearance.hair).toBe('mohawk');
  });

  it('fills missing fields from the default look (a short code is a design)', () => {
    const r = decodeOk('WOC1; body=female');
    expect(r.appearance.gender).toBe('female');
    expect(r.appearance.hair).toBe(DEFAULT_APPEARANCE.hair);
    // the female standard applies when the code says nothing about lashes
    expect(r.appearance.lashes).toBe(true);
  });

  it('imports around an unknown field and reports it', () => {
    const r = decodeOk('WOC1; sparkle=9; hair=mohawk');
    expect(r.ignored).toEqual(['sparkle']);
    expect(r.appearance.hair).toBe('mohawk');
  });

  it('imports around an unknown face slider and reports it', () => {
    const r = decodeOk('WOC1; face=nose:20,wings:50');
    expect(r.ignored).toEqual(['face.wings']);
    expect(r.appearance.face.nose).toBeCloseTo(0.2, 3);
  });

  it('falls back and reports coercion for an off-catalog style', () => {
    const r = decodeOk('WOC1; hair=notastyle');
    expect(r.coerced).toEqual(['hair']);
    expect(r.appearance.hair).toBe(DEFAULT_APPEARANCE.hair);
  });

  it('clamps and reports coercion for an out-of-range colour', () => {
    // skin lightness floor is 0.12; 5% is below it
    const r = decodeOk('WOC1; skin=27/46/5');
    expect(r.coerced).toEqual(['skin']);
    expect(r.appearance.skinLight).toBe(0.12);
  });
});

describe('design code failures', () => {
  it.each([
    ['', 'empty'],
    ['   \n ', 'empty'],
    ['definitely not a code', 'header'],
    ['WOC2; body=male', 'version'],
    ['WOC1; body', 'malformed'],
    ['WOC1; skin=1/2', 'malformed'],
    ['WOC1; skin=a/b/c', 'malformed'],
    ['WOC1; lashes=maybe', 'malformed'],
    ['WOC1; face=nose-40', 'malformed'],
  ] as const)('rejects %j with reason %s', (code, reason) => {
    expect(decodeDesignCode(code)).toEqual({ ok: false, reason });
  });

  it('rejects a paste past the length cap before parsing it', () => {
    const r = decodeDesignCode(`WOC1; ${'x'.repeat(9000)}`);
    expect(r).toEqual({ ok: false, reason: 'malformed' });
  });
});
