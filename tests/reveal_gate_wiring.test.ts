// First-reveal compile gating wiring pins (hitch-hunt P3a). The gate's
// behavior is tested in tests/reveal_gate_core.test.ts / reveal_gate.test.ts,
// the cell state machine in tests/prop_cell_core.test.ts, and the town policy
// in tests/town_reveal_core.test.ts; what those cannot see is whether the
// live views actually consult a gate. These pins fail if the wiring is
// dropped: an unwired gate silently reverts to the measured 300 to 680 ms
// first-reveal submit stalls (S10) with every test still green. The scans
// run over comment-STRIPPED source so a commented-out wiring block cannot
// keep them green, and every anchor lookup fails loudly instead of slicing
// from -1.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prewarmResumeIsDebt } from '../src/render/prewarm_policy';

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const read = (path: string): string =>
  stripComments(readFileSync(new URL(path, import.meta.url), 'utf8'));

function anchor(source: string, needle: string): number {
  const index = source.indexOf(needle);
  expect(index, `anchor not found: ${needle}`).toBeGreaterThan(-1);
  return index;
}

describe('reveal gate wiring (source pins)', () => {
  const rendererSource = read('../src/render/renderer.ts');

  it('the renderer wires all three gates behind async-compile support', () => {
    const wiring = rendererSource.slice(
      anchor(rendererSource, 'if (this.asyncCompileSupported) {\n      const revealHost = {'),
      anchor(rendererSource, 'this.fenbridgeTownView.setRevealGate') + 400,
    );
    expect(wiring).toContain('priority: GPU_WORK_PRIORITY.VISIBLE_PREWARM,');
    expect(wiring).toContain('label: `reveal-gate:${target.name || target.type}`,');
    expect(wiring).toContain('this.compilePrewarmColorPrograms(target, false).then(() =>');
    expect(wiring).toContain('this.compileShadowPrograms(target),');
    expect(wiring).toContain('this.propsRevealGate = createRevealGate(revealHost, (key) =>');
    expect(wiring).toContain('this.propsView.revealRoots(key),');
    expect(wiring).toContain('this.propsView.setRevealGate(this.propsRevealGate);');
    // The band arm of the props gate arms at WORLD ENTRY (the tail of the
    // boot prewarm), never in the constructor: armed under the curtain, the
    // bands beyond half the fog would queue their compiles beside the
    // manifest's near-first units for content the initial frame links
    // anyway. The negative scans the WHOLE constructor, bounded on its
    // declaration and its closing brace, not a character window.
    const constructorStart = anchor(rendererSource, '\n  constructor(');
    const constructorEnd = rendererSource.indexOf('\n  }\n', constructorStart);
    expect(constructorEnd).toBeGreaterThan(constructorStart);
    const constructorBody = rendererSource.slice(constructorStart, constructorEnd);
    expect(constructorBody).toContain('this.propsView.setRevealGate(this.propsRevealGate);');
    expect(constructorBody).not.toContain('setBandRevealGate');
    const entryTail = rendererSource.slice(
      anchor(rendererSource, 'this.prewarmedZonePrograms.add(activeZone.id);'),
      anchor(rendererSource, '[entry-guard] prewarm done:'),
    );
    expect(entryTail).toContain('this.propsView.setBandRevealGate(this.propsRevealGate);');
    expect(wiring).toContain('this.eastbrookTownView.setRevealGate(');
    expect(wiring).toContain('this.fenbridgeTownView.setRevealGate(');
  });

  it('props threads the gate into the per-frame far-cell and band updates', () => {
    const propsSource = read('../src/render/props.ts');
    expect(propsSource).toContain(
      'updatePropCell(cell, camX, camZ, fogFar, undefined, revealGate);',
    );
    expect(propsSource).toContain(
      'updatePropCullable(cullables[i], camX, camZ, fogFar, fogFarSq, bandRevealGate);',
    );
    expect(propsSource).toContain('setBandRevealGate(gate: RevealGateCore | null): void {');
    // The reveal key IS the map key: if these diverge, revealRoots returns
    // [] for every consult and the gate degrades to an immediate reveal that
    // no behavior test can see. Band keys are minted from the slot at push
    // time and resolve to the one band object.
    expect(propsSource).toContain('new Map(farCells.map((cell) => [cell.key, cell]))');
    expect(propsSource).toContain('key: cellKey,');
    expect(propsSource).toContain(`mesh.name = \`far-bake:\${cellKey}\`;`);
    expect(propsSource).toContain('new Map(cullables.map((cullable) => [cullable.key, cullable]))');
    expect(propsSource).toContain(
      'cullableBounds(obj, propCullKey(cullables.length), box, sphere)',
    );
    const rootsAt = anchor(propsSource, 'revealRoots(key: string): readonly THREE.Object3D[] {');
    const roots = propsSource.slice(rootsAt, rootsAt + 200);
    expect(roots).toContain(
      'return propRevealRoots<THREE.Object3D>(farCellsByKey, cullablesByKey, key);',
    );
    // Every band goes through the ONE gated cull entry: no raw `.obj.visible =`
    // write anywhere in props.ts (the pre-change loop had exactly one). The
    // matcher is proven live on a fixture first, so the zero is not vacuous.
    const rawBandWrite = /\.obj\.visible\s*=/g;
    expect('c.obj.visible = cullableVisible(c, camX);'.match(rawBandWrite)).toHaveLength(1);
    expect(propsSource.match(rawBandWrite) ?? []).toHaveLength(0);
  });

  it.each([
    [
      'eastbrook',
      '../src/render/eastbrook_town.ts',
      'eastbrook-town-static',
      'target.group.visible = roofVisibilityPlan.visible && !buildingsHeld;',
    ],
    [
      'fenbridge',
      '../src/render/fenbridge_town.ts',
      'fenbridge-town-static',
      'target.group.visible = visibilityPlan.visible && !buildingsHeld;',
    ],
  ])(
    '%s resolves its static cull and its buildings through the town reveal policy',
    (_town, path, key, buildingWrite) => {
      const source = read(path);
      // The policy call must decide the SAME staticVisible the cull loop
      // applies, in that order: policy, latch, then the visibility writes,
      // batches first and then the buildings under the same hold.
      const policyAt = anchor(source, 'const reveal = townStaticReveal(');
      const keyAt = anchor(source, `'${key}',`);
      const latchAt = anchor(source, "if (reveal === 'revealed') staticRevealed = true;");
      const applyAt = anchor(source, "const staticVisible = reveal === 'revealed';");
      const cullAt = anchor(source, 'staticCullTargets[index].visible = staticVisible;');
      const heldAt = anchor(source, "const buildingsHeld = reveal === 'held';");
      const buildingAt = anchor(source, buildingWrite);
      expect(policyAt).toBeLessThan(keyAt);
      expect(keyAt).toBeLessThan(latchAt);
      expect(latchAt).toBeLessThan(applyAt);
      expect(applyAt).toBeLessThan(cullAt);
      expect(cullAt).toBeLessThan(heldAt);
      expect(heldAt).toBeLessThan(buildingAt);
      // The roots provider hands the gate the batch set the cull flips PLUS
      // every building group: a building outside the roots links its
      // unshared materials cold on its own first fog reveal.
      expect(source).toContain(
        'const staticRevealRoots: THREE.Object3D[] = [...staticCullTargets, ...buildingGroups];',
      );
      expect(source).toContain('buildingGroups.push(built.group);');
      expect(source).toContain('staticRevealRoots(): readonly THREE.Object3D[] {');
      expect(source).toContain('return staticRevealRoots;');
    },
  );

  it('the boot scene sweep stays visible-only, and the idle zone prepare links both arms', () => {
    // Measured (iGPU, far login, 2026-08-17): a `traverse` sweep also
    // collects the entity views hidden behind their live compile gates; their
    // already-linked programs settle instantly, the adaptive link budget of
    // the early submit lane reads that as progress and keeps submitting until
    // the hard deadline (13.8 s instead of stalling after one unit), and the
    // whole manifest behind it (settle-state, textures, the initial frame)
    // times out. Hidden decor is the reveal gates' job, not the sweep's.
    const sweep = rendererSource.slice(
      anchor(rendererSource, "id: 'scene',"),
      anchor(rendererSource, 'compileRootDistanceSq(root, this.sim.player.pos.x'),
    );
    // The scene unit's collector call, whitespace-agnostic: the visible-only
    // flag is the literal `true` second argument.
    expect(sweep).toMatch(
      /compileRoots\(\s*this\.scene\.children\.filter\(\(root\) => !stagedRoots\.has\(root\)\),\s*true,\s*\)/,
    );
    // The background (idle) zone prepare compiles the shadow-pass depth
    // variant AFTER the colour one, inside the same queue unit.
    const idle = rendererSource.slice(
      anchor(rendererSource, "if (opts?.pace === 'idle') {"),
      anchor(rendererSource, 'for (const mesh of waterMeshes) mesh.visible = true;'),
    );
    const idleUnit = idle.slice(
      anchor(idle, 'await this.backgroundGpuWork.run('),
      anchor(idle, '`zone-prepare-compile:${obj.name || obj.type}`,'),
    );
    const idleColourAt = anchor(
      idleUnit,
      'this.compilePrewarmColorPrograms(obj, false).then(() =>',
    );
    const idleShadowAt = anchor(idleUnit, 'this.compileShadowPrograms(obj),');
    expect(idleColourAt).toBeLessThan(idleShadowAt);
  });

  it('the foliage material prewarm resumes after a deadline drop with both compile arms', () => {
    const entry = rendererSource.slice(
      anchor(rendererSource, "id: 'foliage.materials',"),
      anchor(rendererSource, "id: 'foliage.great-tree-materials',"),
    );
    expect(entry).toContain('required: false,');
    expect(entry).toContain('resumeUnits: () => {');
    // The resumed group is staged HIDDEN (frustumCulled=false casters would
    // otherwise link on the next live frame), then linked colour THEN shadow,
    // one species per unit.
    const buildAt = anchor(entry, 'const group = buildFoliageMaterialPrewarmGroup();');
    const hideAt = anchor(entry, 'group.visible = false;');
    const groupAt = anchor(entry, "id: 'foliage-materials:group',");
    const compileAt = anchor(entry, 'group.children.map((child, index) => ({');
    const compileIdAt = anchor(entry, 'id: `foliage-materials:compile:${index}`,');
    const colourAt = anchor(entry, 'await this.compilePrewarmColorPrograms(child, false);');
    const shadowAt = anchor(entry, 'await this.compileShadowPrograms(child);');
    expect(buildAt).toBeLessThan(hideAt);
    expect(hideAt).toBeLessThan(groupAt);
    expect(groupAt).toBeLessThan(compileAt);
    expect(compileAt).toBeLessThan(compileIdAt);
    expect(compileIdAt).toBeLessThan(colourAt);
    expect(colourAt).toBeLessThan(shadowAt);
    // The compile units end before the entry's own run(): both arms belong
    // to the resume units, not to the boot run.
    expect(shadowAt).toBeLessThan(anchor(entry, 'run: () => {\n          foliagePrewarmGroup ='));
    // Ambient-scene debt: its dropped units ride the BOOT_DEBT arm.
    expect(prewarmResumeIsDebt('foliage.materials')).toBe(true);
  });
});
