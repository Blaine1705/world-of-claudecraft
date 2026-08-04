import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  WATER_TIME_PERIOD,
  WATER_WAVE_GLSL,
  waveCycles,
  waveLengthYards,
  waveSpeed,
  waveSpeedsIn,
  waveVectorsIn,
} from '../src/render/water_wave_core';

// The water surface is a sum of travelling waves that BOTH shader stages have
// to agree on, evaluated on a clock that wraps every WATER_TIME_PERIOD.
//
// Two invariants make that work, and both are the kind that fail silently:
//
// 1. Every angular speed is a whole number of cycles per the wrap period. Miss
//    it and the whole sea jumps once every ten minutes, which no test that
//    only runs a few frames would ever catch. The literals are hand-typed
//    decimals, so this re-derives the cycle count from each one.
// 2. The field is a function of world position and time ALONE. The moment it
//    reads a vertex attribute or a grid, the zone planes and the horizon apron
//    stop agreeing at their shared rect edge, and because a rectangle edge is
//    straight, the disagreement draws a ruler-straight line across open water.
//    The field lived in the vertex stage and did exactly that: the planes
//    carried the short chop's slope and the apron (whose ~29 x 38 yard cells
//    cannot sample a 12 yard wavelength) carried none, so the sun-glint field
//    cut off along a hard diagonal at low sun. It is now per-pixel, from
//    vWPos.xz, on both sheets.

const waterSource = readFileSync(
  fileURLToPath(new URL('../src/render/water.ts', import.meta.url)),
  'utf8',
);

/** The GLSL text of one tagged shader template literal in water.ts. */
function shaderSource(name: string): string {
  const start = waterSource.indexOf(`const ${name} = /* glsl */ \``);
  expect(start, `${name} not found in water.ts`).toBeGreaterThanOrEqual(0);
  const open = waterSource.indexOf('`', start);
  const close = waterSource.indexOf('`;', open + 1);
  expect(close, `${name} template literal is unterminated`).toBeGreaterThan(open);
  return waterSource.slice(open + 1, close);
}

describe('water wave field: the wrapped clock', () => {
  const speeds = waveSpeedsIn(WATER_WAVE_GLSL);

  it('declares every wave family the two stages evaluate', () => {
    // Vacuity floor: an empty or shrunken parse would green everything below.
    expect(speeds.map((s) => s.name).sort()).toEqual([
      'FOAM_LAP_W',
      'FOAM_LAP_W2',
      'GROUP_W1',
      'GROUP_W2',
      'GROUP_W3',
      'GSWELL_W1',
      'GSWELL_W2',
      'GSWELL_W3',
      'MSWELL_W1',
      'MSWELL_W2',
      'MSWELL_W3',
      'SWELL_W1',
      'SWELL_W2',
      'SWELL_W3',
      'WARP_W1',
      'WARP_W2',
      'WOBBLE_W1',
      'WOBBLE_W2',
    ]);
  });

  it.each(waveSpeedsIn(WATER_WAVE_GLSL))(
    '$name completes a whole number of cycles per wrap period',
    ({ name, value }) => {
      expect(value, name).toBeGreaterThan(0);
      const cycles = waveCycles(value);
      // The literals are rounded to six decimals, which lands each cycle count
      // within a thousandth of the integer; anything looser is a typo.
      expect(Math.abs(cycles - Math.round(cycles)), `${name} = ${value}`).toBeLessThan(0.001);
    },
  );

  it('round-trips a cycle count through the speed it implies', () => {
    expect(waveCycles(waveSpeed(86))).toBeCloseTo(86, 9);
    expect(waveSpeed(86)).toBeCloseTo(0.90059, 6);
    // The one shared clock: the surface only ever sees time modulo this.
    expect(WATER_TIME_PERIOD).toBe(600);
  });
});

describe('water wave field: wavelengths each stage can carry', () => {
  const vectors = new Map(waveVectorsIn(WATER_WAVE_GLSL).map((v) => [v.name, v]));
  const lengthOf = (name: string): number => {
    const wave = vectors.get(name);
    if (!wave) throw new Error(`${name} is not declared in WATER_WAVE_GLSL`);
    return waveLengthYards(wave.kx, wave.kz);
  };

  it('keeps the chop short enough to read as running water', () => {
    for (const name of ['SWELL_K1', 'SWELL_K2', 'SWELL_K3']) {
      expect(lengthOf(name), name).toBeGreaterThan(10);
      expect(lengthOf(name), name).toBeLessThan(25);
    }
  });

  it('puts the mid waves in the band between the chop and the groundswell', () => {
    for (const name of ['MSWELL_K1', 'MSWELL_K2', 'MSWELL_K3']) {
      expect(lengthOf(name), name).toBeGreaterThan(35);
      expect(lengthOf(name), name).toBeLessThan(90);
    }
  });

  it('keeps the groundswell long enough for the apron grid to displace it', () => {
    // The apron is the coarsest grid that DISPLACES a wave: about 29 x 38 yard
    // cells, so a roller under a few samples per cycle along the coarse axis
    // goes faceted and amplitude-starved out there. The mid waves dodge this
    // entirely by never being displaced, which is the whole reason they are
    // allowed to be short.
    const apronCoarseCellYards = 38;
    for (const name of ['GSWELL_K1', 'GSWELL_K2', 'GSWELL_K3']) {
      expect(lengthOf(name), name).toBeGreaterThan(apronCoarseCellYards * 3.5);
      expect(lengthOf(name), name).toBeLessThan(220);
    }
    // The second is deliberately the longest: it is the one the module's
    // comment sizes against ~4.5 z-samples per cycle.
    expect(lengthOf('GSWELL_K2')).toBeGreaterThan(apronCoarseCellYards * 4.5);
    expect(lengthOf('GSWELL_K2')).toBeGreaterThan(lengthOf('GSWELL_K1'));
    expect(lengthOf('GSWELL_K2')).toBeGreaterThan(lengthOf('GSWELL_K3'));
  });

  it('spreads the group envelope over hundreds of yards', () => {
    for (const name of ['GROUP_K1', 'GROUP_K2', 'GROUP_K3']) {
      expect(lengthOf(name), name).toBeGreaterThan(150);
    }
  });
});

describe('water wave field: the meander warp', () => {
  const vectors = new Map(waveVectorsIn(WATER_WAVE_GLSL).map((v) => [v.name, v]));
  const lengthOf = (name: string): number => {
    const wave = vectors.get(name);
    if (!wave) throw new Error(`${name} is not declared in WATER_WAVE_GLSL`);
    return waveLengthYards(wave.kx, wave.kz);
  };
  /** The brace-free body of one GLSL helper function in the shared field. */
  const glslFunction = (name: string): string => {
    const match = WATER_WAVE_GLSL.match(
      new RegExp(`(?:void|float|vec2) ${name}\\([^)]*\\) \\{([^}]*)\\}`),
    );
    expect(match, `${name} not found in WATER_WAVE_GLSL`).not.toBeNull();
    return match ? match[1] : '';
  };

  it('bends the mid waves, the groundswell, and the group envelope', () => {
    // Straight-crested members interfere on a fixed lattice however many a
    // family has; the warp is what keeps the open sea from reading as a grid
    // of identical swells, so losing it from any long family is a regression.
    for (const name of ['midField', 'groundswellField', 'waveGroup']) {
      expect(glslFunction(name), name).toContain('waveWarp(p, t)');
    }
  });

  it('leaves the chop unwarped', () => {
    // The chop is the one family the fine zone-plane grid displaces, and it is
    // already decorrelated by the group envelope and the detail maps; keeping
    // it out of the warp keeps the added vertex cost to the long families.
    expect(glslFunction('chopField')).not.toContain('waveWarp');
  });

  it('keeps the warp far longer than every wavelength it bends', () => {
    for (const name of ['WARP_K1', 'WARP_K2']) {
      expect(lengthOf(name), name).toBeGreaterThan(300);
    }
  });

  it('bounds the warp so the apron still samples the bent groundswell', () => {
    // The local wavenumber perturbation the warp can add is at most
    // WARP_AMP * (|WARP_K1| + 0.6 * |WARP_K2|) (the 0.6 is the second term's
    // weight in waveWarp). Past ~16 percent, a warped 180 yard roller can
    // momentarily shorten below the ~4.5 samples per cycle the apron's coarse
    // cells need, and the open sea goes faceted exactly where the warp was
    // meant to loosen it.
    const amp = Number(WATER_WAVE_GLSL.match(/const float WARP_AMP = ([\d.]+);/)?.[1]);
    expect(amp).toBeGreaterThan(0);
    const k1 = vectors.get('WARP_K1');
    const k2 = vectors.get('WARP_K2');
    if (!k1 || !k2) throw new Error('warp wave vectors are not declared');
    const gradientCap = amp * (Math.hypot(k1.kx, k1.kz) + 0.6 * Math.hypot(k2.kx, k2.kz));
    expect(gradientCap).toBeLessThan(0.16);
  });
});

describe('water shader: one field, both stages, no grid', () => {
  const vert = shaderSource('WATER_VERT');
  const frag = shaderSource('WATER_FRAG');

  it('includes the shared field in both stages', () => {
    expect(vert).toMatch(/\$\{WATER_WAVE_GLSL\}/);
    expect(frag).toMatch(/\$\{WATER_WAVE_GLSL\}/);
  });

  it('shades from world position per pixel, never from a vertex varying', () => {
    // The seam this closes: a varying carries whatever the vertex stage could
    // sample, which differs per sheet. World position does not.
    for (const call of ['waveGroup(vWPos.xz', 'chopField(vWPos.xz', 'midField(vWPos.xz']) {
      expect(frag).toContain(call);
    }
    expect(frag).toContain('groundswellField(vWPos.xz');
    expect(frag).not.toContain('vSwell');
  });

  it('hands the fragment stage an open-water gate with no rect-edge feather', () => {
    // clamp(aSwellW, 0, 1) is 1 on a zone plane AND on the apron (the feather
    // rides in aSwellW - 1, which only the displacement reads) and 0 on a
    // still interior pool. Anything else here re-opens the seam.
    expect(vert).toContain('vOpenSea = gswW;');
    expect(vert).toContain('float gswW = clamp(aSwellW, 0.0, 1.0);');
    expect(frag).toContain('float openW = vOpenSea * waveDepthFade;');
    expect(frag).not.toContain('aSwellW');
  });

  it('displaces the chop on the zone planes only, still gated by the feather', () => {
    // The displacement half of the split is unchanged on purpose: a grid that
    // cannot sample a wavelength must not try to displace it.
    expect(vert).toContain('float chopW = clamp(aSwellW - 1.0, 0.0, 1.0);');
    expect(vert).toContain('pos.y += chopCrest * uSwellAmp * depthFade * rangeFade * chopW');
  });

  it('fades each family out at its own range, longest last', () => {
    const fades = Object.fromEntries(
      [...WATER_WAVE_GLSL.matchAll(/const vec2 (\w+_FADE) = vec2\(([\d.]+), ([\d.]+)\);/g)].map(
        (m) => [m[1], [Number(m[2]), Number(m[3])]],
      ),
    );
    expect(Object.keys(fades).sort()).toEqual(['CHOP_FADE', 'GSWELL_FADE', 'MSWELL_FADE']);
    for (const [name, [near, far]] of Object.entries(fades)) {
      expect(far, name).toBeGreaterThan(near);
    }
    // A per-pixel wave has no mip chain, so the shorter it is the sooner it
    // has to leave; the ordering is what keeps moving water on screen from the
    // shore to the haze instead of stopping dead where the chop used to.
    expect(fades.CHOP_FADE[1]).toBeLessThan(fades.MSWELL_FADE[1]);
    expect(fades.MSWELL_FADE[1]).toBeLessThan(fades.GSWELL_FADE[1]);
    // It must still beat the vertex chop's old hard stop at 300 yards, or the
    // open sea gains nothing from being per-pixel.
    expect(fades.CHOP_FADE[1]).toBeGreaterThan(300);
  });
});

describe('water shader: the surf breathes and laps out of step', () => {
  const frag = shaderSource('WATER_FRAG');

  it('runs two shoreward lap waves at incommensurate speeds', () => {
    // One sine is a metronome; the beat between two whole-cycle speeds with no
    // small common factor is what makes the wash arrive irregularly.
    expect(frag).toContain('uTime * FOAM_LAP_W -');
    expect(frag).toContain('uTime * FOAM_LAP_W2 -');
  });

  it('gives the second lap an alongshore phase of its own', () => {
    // Without a world-position term the whole coastline laps in unison; with
    // it, one stretch of beach surges while the next rests.
    expect(frag).toMatch(/FOAM_LAP_W2[^;]*vWPos\.x[^;]*vWPos\.z/);
  });

  it('drives the foam band reach with the group envelope', () => {
    // The surf line must advance and retreat with the wave sets, not hold a
    // constant width that only flickers.
    expect(frag).toMatch(/float surge = [\d.]+ \+ [\d.]+ \* group;/);
    expect(frag).toMatch(/\* surge, 0\.0,\s+shoreDist/);
  });
});
