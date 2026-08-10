import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOADING_BACKDROP_PATHS, selectLoadingBackdropPath } from '../src/ui/loading_backdrop_core';

describe('loading backdrop selection', () => {
  it('ships the maintainer-selected optimized artwork exactly once', () => {
    expect(LOADING_BACKDROP_PATHS).toEqual([
      '/textures/loading/hollow-crypt-empty.webp',
      '/textures/loading/crystal-delve.webp',
      '/textures/loading/duskmoor-eclipse.webp',
      '/textures/loading/thornpeak-storm.webp',
      '/textures/loading/eastbrook-mine-duel.webp',
      '/textures/loading/veiled-hollow-stag.webp',
      '/textures/loading/hollow-crypt-party.webp',
      '/textures/loading/eastbrook-square.webp',
      '/textures/loading/drakemaw-caldera.webp',
      '/textures/loading/fenbridge-march.webp',
      '/textures/loading/fenbridge-rain-skiff.webp',
    ]);
    expect(new Set(LOADING_BACKDROP_PATHS).size).toBe(LOADING_BACKDROP_PATHS.length);

    for (const logicalPath of LOADING_BACKDROP_PATHS) {
      const diskPath = join(process.cwd(), 'public', logicalPath);
      expect(existsSync(diskPath), logicalPath).toBe(true);
      expect(
        statSync(diskPath).size,
        `${logicalPath} should stay under 300 KB`,
      ).toBeLessThanOrEqual(300_000);
    }
  });

  it('maps the random-unit boundaries safely', () => {
    expect(selectLoadingBackdropPath(0)).toBe(LOADING_BACKDROP_PATHS[0]);
    expect(selectLoadingBackdropPath(0.999_999)).toBe(LOADING_BACKDROP_PATHS.at(-1));
    expect(selectLoadingBackdropPath(-1)).toBe(LOADING_BACKDROP_PATHS[0]);
    expect(selectLoadingBackdropPath(1)).toBe(LOADING_BACKDROP_PATHS.at(-1));
    expect(selectLoadingBackdropPath(Number.NaN)).toBe(LOADING_BACKDROP_PATHS[0]);
    expect(selectLoadingBackdropPath(Number.POSITIVE_INFINITY)).toBe(LOADING_BACKDROP_PATHS[0]);
  });

  it('reaches every alternative without repeating any previous backdrop', () => {
    const selectableCount = LOADING_BACKDROP_PATHS.length - 1;

    for (const previousPath of LOADING_BACKDROP_PATHS) {
      const reached = new Set<string>();
      for (let bucket = 0; bucket < selectableCount; bucket++) {
        const randomUnit = (bucket + 0.5) / selectableCount;
        const selected = selectLoadingBackdropPath(randomUnit, previousPath);
        expect(selected).not.toBe(previousPath);
        reached.add(selected);
      }

      expect(reached).toEqual(new Set(LOADING_BACKDROP_PATHS.filter((p) => p !== previousPath)));
    }
  });
});
