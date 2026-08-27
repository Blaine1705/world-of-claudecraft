import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);

function ruleBlock(selector: string): string {
  const start = hudCss.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  return hudCss.slice(start, hudCss.indexOf('}', start));
}

describe('desktop player frame sizing', () => {
  it('keeps the full configured player frame width after dragging detaches it', () => {
    // The box is the playerFrameWidth setting scaled by the frame scale
    // (real-dimension sizing from the interface editor), and the docked and
    // detached seats carry the SAME expression: any difference between the
    // two renders as the content jumping sideways the moment a drag starts.
    const widthExpr =
      'width: calc(var(--player-frame-width, 612px) * var(--player-frame-scale, 1));';
    const docked = ruleBlock('#player-frame {');
    const detached = ruleBlock('#player-frame.pf-detached {');
    expect(docked).toContain(widthExpr);
    expect(detached).toContain(widthExpr);
    expect(hudCss).not.toContain('#player-frame.pf-detached .uf-bars');
  });
});
