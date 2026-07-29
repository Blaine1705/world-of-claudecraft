import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('graphics-overhaul integration', () => {
  it('keeps the non-ghost collider sweep in the chase-camera path', () => {
    const renderer = source('src/render/renderer.ts');
    expect(renderer).toContain(
      "import { cameraOcclusion, supportHeightAt } from '../sim/colliders';",
    );
    expect(renderer).toContain("from './camera_collision';");
    expect(renderer).toContain('let hardT = cameraOcclusion(');
    expect(renderer).toContain('let softT = cameraOcclusion(');
    expect(renderer).toContain('stepCameraOcclusion(');
    expect(renderer).toContain('const ct = this.camOcclusion.pullT;');
  });

  it('routes reduced motion through every occluder-fade consumer', () => {
    const consumers = [
      'src/render/props.ts',
      'src/render/foliage.ts',
      'src/render/dungeon.ts',
      'src/render/eastbrook_town.ts',
      'src/render/yumi_maze.ts',
    ];
    for (const file of consumers) {
      const text = source(file);
      expect(text, file).toMatch(/stepOccluderFade\([^)]+,\s*reducedMotion\)/s);
    }
  });

  it('invalidates the scree placement grid after terrain and water rebuilds', () => {
    const renderer = source('src/render/renderer.ts');
    for (const method of ['rebuildTerrain', 'rebuildWater', 'rebuildWaterBodies']) {
      const start = renderer.indexOf(`${method}(`);
      expect(start, method).toBeGreaterThan(0);
      const body = renderer.slice(start, renderer.indexOf('\n  }', start));
      expect(body, method).toContain('this.cliffScree.invalidate();');
    }
  });
});
