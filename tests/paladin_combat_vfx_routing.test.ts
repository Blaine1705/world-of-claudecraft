import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Paladin combat VFX routing', () => {
  it('routes Solar Invocation, Sunward Disc, Dawnfall, and Final Edict distinctly', () => {
    const rendererPath = fileURLToPath(new URL('../src/render/renderer.ts', import.meta.url));
    const renderer = readFileSync(rendererPath, 'utf8');

    expect(renderer).toContain("ev.fx === 'paladinHolyShock'");
    expect(renderer).toContain('this.vfx.paladinHolyShock(');
    expect(renderer).toContain("ev.fx === 'paladinSunwardDisc'");
    expect(renderer).toContain('this.vfx.paladinSunwardDisc(');
    expect(renderer).toContain("this.triggerAttack(ev.sourceId, 'sunward_disc')");
    expect(renderer).toContain("ev.fx === 'paladinDawnfall'");
    expect(renderer).toContain('this.triggerAttack(ev.sourceId, ev.ability)');
    expect(renderer).toContain('this.vfx.paladinDawnfall(ev.sourceId, ev.range ?? 6)');
    expect(renderer).toContain("ev.fx === 'paladinDawnfallImpact'");
    expect(renderer).toContain('this.vfx.paladinDawnfallImpact(ev.targetId)');
    expect(renderer).toContain("ev.fx === 'paladinFinalEdict'");
    expect(renderer).toContain('this.vfx.paladinFinalEdict(ev.sourceId, ev.targetId)');
    expect(renderer).toContain("ev.fx === 'paladinBastionSweep'");
    expect(renderer).toContain("this.triggerAttack(ev.sourceId, 'bastion_sweep')");
    expect(renderer).toContain('this.vfx.paladinBastionSweep(');
    expect(renderer).toContain("ev.fx === 'paladinBastionSweepImpact'");
    expect(renderer).toContain('this.vfx.paladinBastionSweepImpact(ev.targetId)');
  });
});
