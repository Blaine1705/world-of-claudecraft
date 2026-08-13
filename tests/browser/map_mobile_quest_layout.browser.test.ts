// Real-browser regression for the landscape map + quest pairing. CSS text and
// arithmetic-only tests missed the original defect because the declaration was
// syntactically valid, but its custom property lived on a sibling and therefore
// made the computed quest width invalid.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from './_harness';

const EPSILON = 1;

beforeEach(async () => {
  document.body.className = 'mobile-touch game-active mobile-map-quest-open';
});

afterEach(() => {
  cleanup();
  document.body.className = '';
  document.documentElement.style.removeProperty('--app-vw');
  document.documentElement.style.removeProperty('--app-vh');
  document.documentElement.style.removeProperty('--ui-scale');
});

function mountWindows(): { quest: HTMLElement; map: HTMLElement; canvas: HTMLCanvasElement } {
  const ui = document.createElement('div');
  ui.id = 'ui';
  const quest = document.createElement('div');
  quest.id = 'quest-log-window';
  quest.className = 'window panel';
  quest.style.display = 'block';
  quest.textContent = 'Quests';
  const map = document.createElement('div');
  map.id = 'map-window';
  map.className = 'window panel';
  map.style.display = 'block';
  const canvas = document.createElement('canvas');
  canvas.id = 'map-canvas';
  canvas.width = 560;
  canvas.height = 560;
  const rail = document.createElement('div');
  rail.id = 'map-zoom';
  map.append(canvas, rail);
  ui.append(quest, map);
  document.body.appendChild(ui);
  return { quest, map, canvas };
}

describe('mobile map and quest layout', () => {
  it.each([
    { width: 844, height: 390, uiScale: 0.85 },
    { width: 844, height: 390, uiScale: 1 },
    { width: 844, height: 390, uiScale: 1.4 },
    { width: 820, height: 390, uiScale: 1.4 },
  ])(
    'computes non-overlapping windows at $width x $height and UI scale $uiScale',
    async ({ width, height, uiScale }) => {
      await page.viewport(width, height);
      document.documentElement.style.setProperty('--app-vw', `${width}px`);
      document.documentElement.style.setProperty('--app-vh', `${height}px`);
      document.documentElement.style.setProperty('--ui-scale', String(uiScale));
      const { quest, map, canvas } = mountWindows();
      const questRect = quest.getBoundingClientRect();
      const mapRect = map.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      expect(getComputedStyle(document.body).getPropertyValue('--mobile-map-rail').trim()).toBe(
        '58px',
      );
      expect(questRect.width).toBeGreaterThanOrEqual(220 * uiScale - EPSILON);
      expect(questRect.width).toBeLessThanOrEqual(300 * uiScale + EPSILON);
      expect(canvasRect.width).toBeGreaterThanOrEqual(272 - EPSILON);
      expect(questRect.right + 8).toBeLessThanOrEqual(mapRect.left + EPSILON);
      expect(mapRect.right).toBeLessThanOrEqual(width + EPSILON);
    },
  );
});
