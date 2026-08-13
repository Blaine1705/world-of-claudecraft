// Real-browser regression for the landscape map + quest pairing. CSS text and
// arithmetic-only tests missed the original defect because the declaration was
// syntactically valid, but its custom property lived on a sibling and therefore
// made the computed quest width invalid.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from './_harness';

const VIEWPORT = { width: 844, height: 390 };
const EPSILON = 1;

beforeEach(async () => {
  await page.viewport(VIEWPORT.width, VIEWPORT.height);
  document.documentElement.style.setProperty('--app-vw', `${VIEWPORT.width}px`);
  document.documentElement.style.setProperty('--app-vh', `${VIEWPORT.height}px`);
  document.documentElement.style.setProperty('--ui-scale', '1');
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
  it('computes two non-overlapping side-by-side windows at 844x390', () => {
    const { quest, map, canvas } = mountWindows();
    const questRect = quest.getBoundingClientRect();
    const mapRect = map.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    expect(getComputedStyle(document.body).getPropertyValue('--mobile-map-rail').trim()).toBe(
      '58px',
    );
    expect(questRect.width).toBeGreaterThanOrEqual(220 - EPSILON);
    expect(questRect.width).toBeLessThanOrEqual(300 + EPSILON);
    expect(canvasRect.width).toBeGreaterThanOrEqual(272 - EPSILON);
    expect(questRect.right + 8).toBeLessThanOrEqual(mapRect.left + EPSILON);
    expect(mapRect.right).toBeLessThanOrEqual(VIEWPORT.width + EPSILON);
  });
});
