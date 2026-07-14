import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

describe('Chronomancy clock audio', () => {
  it('uses a bounded procedural tick sequence for Hourglass activation', () => {
    const audio = source('../src/game/audio.ts');
    const hud = source('../src/ui/hud.ts');

    expect(audio).toContain('temporalClock(seconds = 1.6)');
    expect(audio).toContain('Math.min(10, Math.round(seconds * 4))');
    expect(hud).toContain('ev.name === ABILITIES.temporal_hourglass.name && ev.gained');
  });

  it('routes Rewind through the same short clock cue once per cast', () => {
    const rewind = source('../src/sim/combat/rewind.ts');
    const hud = source('../src/ui/hud.ts');

    expect(rewind.match(/fx: 'temporalClock'/g)).toHaveLength(1);
    expect(hud).toContain("if (ev.fx === 'temporalClock')");
    expect(hud).toContain('audio.temporalClock(2)');
  });
});
