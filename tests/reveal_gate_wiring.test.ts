// First-reveal compile gating wiring pins (hitch-hunt P3a). The gate's
// behavior is tested in tests/reveal_gate_core.test.ts / reveal_gate.test.ts
// and the cell state machine in tests/prop_cell_core.test.ts; what those
// cannot see is whether the live views actually consult a gate. These pins
// fail if the wiring is dropped: an unwired gate silently reverts to the
// measured 300 to 680 ms first-reveal submit stalls (S10) with every test
// still green.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('reveal gate wiring (source pins)', () => {
  const rendererSource = read('../src/render/renderer.ts');

  it('the renderer wires all three gates behind async-compile support', () => {
    const wiring = rendererSource.slice(
      rendererSource.indexOf('// First-reveal compile gates (hitch-hunt P3a)'),
      rendererSource.indexOf('this.fenbridgeTownView.setRevealGate') + 400,
    );
    // Gating without async compile would make the gate itself the stall.
    expect(wiring).toContain('if (this.asyncCompileSupported) {');
    expect(wiring).toContain('compile: (root: object) => this.compileGate(root as THREE.Object3D)');
    expect(wiring).toContain('this.propsView.setFarCellRevealGate(');
    expect(wiring).toContain(
      'createRevealGate(revealHost, (key) => this.propsView.farCellRevealRoots(key))',
    );
    expect(wiring).toContain('this.eastbrookTownView.setRevealGate(');
    expect(wiring).toContain('this.fenbridgeTownView.setRevealGate(');
  });

  it('props threads the gate into the per-frame far-cell update', () => {
    const propsSource = read('../src/render/props.ts');
    expect(propsSource).toContain(
      'updatePropCell(cell, camX, camZ, fogFar, undefined, farCellRevealGate);',
    );
    // The gate key is the far-cell grid key and the roots are that cell's
    // bake meshes, named so queue stats attribute the compile.
    expect(propsSource).toContain('key: cellKey,');
    expect(propsSource).toContain(`mesh.name = \`far-bake:\${cellKey}\`;`);
    expect(propsSource).toContain('farCellsByKey.get(key)?.meshes ?? []');
  });

  it.each([
    ['eastbrook', '../src/render/eastbrook_town.ts', 'eastbrook-town-static'],
    ['fenbridge', '../src/render/fenbridge_town.ts', 'fenbridge-town-static'],
  ])('%s holds its first static reveal on the gate', (_town, path, key) => {
    const source = read(path);
    expect(source).toContain(
      `if (revealGate && !revealGate.allow('${key}')) staticVisible = false;`,
    );
    expect(source).toContain('else staticRevealed = true;');
    // The roots provider hands the gate the exact batch set the cull flips.
    expect(source).toContain('staticRevealRoots(): readonly THREE.Object3D[] {');
    expect(source).toContain('return staticCullTargets;');
  });
});
