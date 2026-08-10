import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const preview = readFileSync(new URL('../src/render/armory_preview.ts', import.meta.url), 'utf8');
const characterPreview = readFileSync(
  new URL('../src/render/characters/preview.ts', import.meta.url),
  'utf8',
);
const inspect = readFileSync(new URL('../src/ui/armory_inspect.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/ui/daily_rewards_window.ts', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

describe('Armory preview lifecycle', () => {
  it('keeps one renderer and parks it instead of disposing on modal close', () => {
    const close = inspect.slice(inspect.indexOf('close(): void'), inspect.indexOf('async prewarm'));
    expect(close).toContain('this.hideOverlay(true)');
    expect(close).not.toContain('.dispose()');
    expect(inspect).toContain('this.parking.appendChild(this.stage)');
    expect(inspect).toContain('this.preview?.setActive(false)');
    expect(store).toContain('this.armoryInspect?.close()');
  });

  it('runs no hidden animation loop and retains warmed skin rigs', () => {
    expect(preview).toContain('const weaponRigs = new Map<string, CachedWeaponRig>()');
    expect(preview).toContain(
      "const characterRigs = new Map<string, CharacterVisual>([['', visual]])",
    );
    expect(preview).toContain('selectCharacterRig(next);');
    expect(preview).toContain('if (disposed || !active || prewarming) return;');
    expect(preview).not.toMatch(/applyMode\(\);\s*animate\(\);/);
    expect(preview).toContain('setActive(next: boolean)');
    expect(preview).toContain('composer.render();\n        prewarming = false;');
  });

  it('walks every armory skin through the post-entry prewarm schedule', () => {
    expect(store).toContain('WEAPON_SKIN_LIST.map((skin) => skin.id)');
    expect(hud).toContain('this.dailyRewardsWindow.armoryPrewarmSkinIds()');
    // One MODE per paced unit (a whole-skin unit was a measured 170 to 225 ms
    // main-thread block in live play).
    expect(hud).toContain(
      'this.dailyRewardsWindow.prewarmArmoryPreviewSkins([skinId], [armoryMode])',
    );
    // The schedule starts after the reveal (post-entry paced units), no longer
    // holding the loading curtain for the whole catalog.
    const revealAt = main.indexOf('const revealWorld = (): void => {');
    expect(revealAt).toBeGreaterThan(-1);
    const startAt = main.indexOf('hud.startPostEntryPreviewPrewarm();', revealAt);
    expect(startAt).toBeGreaterThan(revealAt);
  });

  it('warms both portrait framings so Inspect never pays the first PNG capture', () => {
    // The plan lives in the pure core; the hud composes it with the real
    // portrait thunk.
    const core = readFileSync(
      new URL('../src/ui/preview_prewarm_core.ts', import.meta.url),
      'utf8',
    );
    const start = core.indexOf('export function buildPostEntryPreviewPrewarmUnits');
    expect(start).toBeGreaterThan(-1);
    const plan = core.slice(start);
    expect(plan).toContain("['headshot', 'body'] as const");
    expect(plan).toContain('deps.renderPortrait(portraitClass, skin, framing)');
    const hudStart = hud.indexOf('private postEntryPreviewPrewarmUnits()');
    expect(hudStart).toBeGreaterThan(-1);
    const compose = hud.slice(hudStart, hud.indexOf('startPostEntryPreviewPrewarm(', hudStart));
    expect(compose).toContain('buildPostEntryPreviewPrewarmUnits');
    expect(compose).toContain('playerPortraitDataUrl(portraitClass as PlayerClass, skin, framing)');
  });

  it('prewarms player-card poses and never resizes the live preview to capture them', () => {
    const captureStart = characterPreview.indexOf('private async captureCloseupNow');
    const captureEnd = characterPreview.indexOf('/** Cleanup resources */', captureStart);
    const capture = characterPreview.slice(captureStart, captureEnd);
    expect(capture).toContain('new THREE.WebGLRenderTarget');
    expect(capture).toContain('readRenderTargetPixelsAsync');
    expect(capture).not.toContain('this.renderer.setSize(');
    expect(hud).toContain('prewarmCloseupPoses([pose])');
  });
});
