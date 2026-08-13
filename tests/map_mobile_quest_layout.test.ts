import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/hud.mobile.css', import.meta.url), 'utf8');

function wideLandscapeLayout(uiScale: number): {
  mapPhysical: number;
  questPhysical: number;
  unusedPhysical: number;
} {
  const viewportWidth = 844;
  const viewportHeight = 390;
  const safeInset = 47;
  const edge = safeInset / uiScale;
  const available = viewportWidth / uiScale - edge * 2;
  const gap = 8;
  const rail = 58;
  const map = Math.min(320, (viewportHeight - 104) / uiScale);
  const quest = Math.min(300, Math.max(220, available - gap - rail - map));
  return {
    mapPhysical: map * uiScale,
    questPhysical: quest * uiScale,
    unusedPhysical: (available - quest - gap - rail - map) * uiScale,
  };
}

describe('wide landscape map and quest layout', () => {
  it('uses a scale-correct side-by-side contract with the narrow stacked fallback intact', () => {
    expect(css).toContain('@media (min-width: 820px)');
    expect(css).toContain(
      'body.mobile-touch.mobile-map-quest-open {\n        /* Shared by the sibling quest sheet and map window.',
    );
    expect(css).toContain('--mobile-map-rail: 58px;');
    expect(css).toContain('--mobile-map-dual-available-width: calc(');
    expect(css).toContain('calc((var(--app-vh) - 104px) / var(--ui-scale, 1))');
    expect(css).toContain('left: var(--mobile-map-dual-edge-left);');
    expect(css).toContain('right: var(--mobile-map-dual-edge-right);');
    expect(css).toContain('--mobile-map-size: var(--mobile-map-dual-size);');
    expect(css).toContain('max-height: calc(\n          var(--app-vh) /');

    const stackedRule = css.indexOf('body.mobile-touch.mobile-map-quest-open #map-window {');
    const wideRule = css.indexOf('@media (min-width: 820px)', stackedRule);
    expect(stackedRule).toBeGreaterThan(-1);
    expect(wideRule).toBeGreaterThan(stackedRule);
  });

  it.each([0.85, 1, 1.4])(
    'keeps the 844x390 map at least 272 physical pixels at UI scale %s without overlap',
    (uiScale) => {
      const layout = wideLandscapeLayout(uiScale);
      expect(layout.mapPhysical).toBeGreaterThanOrEqual(272);
      expect(layout.questPhysical).toBeGreaterThanOrEqual(220 * uiScale);
      expect(layout.unusedPhysical).toBeGreaterThanOrEqual(0);
    },
  );
});
