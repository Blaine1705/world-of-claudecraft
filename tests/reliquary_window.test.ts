// Source-guard suite for The Reliquary cold window wiring (the
// deeds_window.test.ts pattern): no magic hex/px in the painter, hud
// orchestration pins, entry HTML, keybind dispatch, CSS section banner and
// mobile full-bleed, fairness (no tier/governor). Behavior of the pure core
// is covered in tests/reliquary_view.test.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');

const painter = read('../src/ui/reliquary_window.ts');
const view = read('../src/ui/reliquary_view.ts');
const hud = read('../src/ui/hud.ts');
const mainSrc = read('../src/main.ts');
const inputSrc = read('../src/game/input.ts');
const keybindsSrc = read('../src/game/keybinds.ts');
const mobileControlsSrc = read('../src/game/mobile_controls.ts');
const chrome = read('../src/ui/i18n.catalog/hud_chrome.ts');
const optionsWindow = read('../src/ui/options_window.ts');
const components = read('../src/styles/components.css');
const hudMobile = read('../src/styles/hud.mobile.css');
const architecture = read('./architecture.test.ts');
const indexHtml = read('../index.html');
const playHtml = read('../play.html');

describe('painter hygiene', () => {
  it('keeps hex/px literals out of the painter TS (tokens and classes only)', () => {
    // Allow the #reliquary-window comment/id reference; ban free-standing hex colors.
    expect(painter).not.toMatch(/#[0-9a-fA-F]{3,8}(?![\w-])/);
    expect(painter).not.toMatch(/'\d+px'/);
  });

  it('contains no em/en dashes', () => {
    for (const src of [painter, view]) {
      expect(src).not.toMatch(/\u2014|\u2013/);
    }
  });

  it('reads neither the FPS governor nor the graphics tier (fairness)', () => {
    for (const src of [painter, view]) {
      expect(src).not.toMatch(/governor/);
      expect(src).not.toMatch(/ui_effects_profile|fxTier|data-fx-level/);
    }
  });

  it('elides slow-band repaints through the pure refresh signature', () => {
    // Strip whole-line comments so a comment-only mention cannot false-green.
    const code = painter
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n');
    expect(code).toContain('const input = this.buildInput()');
    expect(code).toContain('const sig = this.sigFromInput(input)');
    expect(code).toContain('if (sig === this.lastSig) return');
    // clearsDigest must be an argument to reliquaryRefreshSig (not only computed).
    expect(code).toMatch(/reliquaryRefreshSig\(\{[\s\S]*?clearsDigest[\s\S]*?\}\)/);
  });

  it('preserves scroll and restores focus across rebuilds', () => {
    expect(painter).toContain("el.querySelector('.reliquary-scroll')?.scrollTop");
    expect(painter).toContain('captureFocusKey');
    expect(painter).toContain('restoreFirstEnabled');
  });

  it('never imports Hud and never hardcodes the window id in the painter class surface', () => {
    expect(painter).not.toMatch(/from ['"]\.\/hud['"]/);
    expect(painter).toContain('root(): HTMLElement');
  });
});

describe('hud orchestration', () => {
  it('constructs ReliquaryWindow with windowFocus and thin toggle', () => {
    expect(hud).toContain('new ReliquaryWindow({');
    expect(hud).toContain("root: () => $('#reliquary-window')");
    expect(hud).toContain("...this.windowFocus('#reliquary-window')");
    expect(hud).toContain('toggleReliquary(): void');
    expect(hud).toContain('this.reliquaryWindow.toggle()');
  });

  it('polls refreshIfChanged on the slow band when open', () => {
    expect(hud).toContain(
      'if (slowHud && this.reliquaryWindow.isOpen) this.reliquaryWindow.refreshIfChanged()',
    );
  });

  it('closes via Esc managed-window case and re-renders on language switch', () => {
    expect(hud).toContain("case 'reliquary-window':");
    expect(hud).toContain('this.reliquaryWindow.close()');
    expect(hud).toContain('if (this.reliquaryWindow.isOpen) this.reliquaryWindow.render()');
  });

  it('wires minimap click and keybind label', () => {
    expect(hud).toContain(
      "$('#mm-reliquary')?.addEventListener('click', () => this.toggleReliquary())",
    );
    expect(hud).toContain("['#mm-reliquary', 'reliquary', 'hudChrome.reliquary.title']");
  });
});

describe('keybind and input dispatch', () => {
  it('defaults to Shift+KeyX adjacent to deeds', () => {
    expect(keybindsSrc).toContain("id: 'reliquary'");
    expect(keybindsSrc).toContain("defaults: ['Shift+KeyX']");
  });

  it('routes through input and main onUiKey', () => {
    expect(inputSrc).toContain("| 'reliquary'");
    expect(inputSrc).toContain("case 'reliquary':");
    expect(mainSrc).toContain("case 'reliquary':");
    expect(mainSrc).toContain('hud.toggleReliquary()');
  });

  it('binds the mobile More tray entry', () => {
    expect(mobileControlsSrc).toContain('onReliquary(): void');
    expect(mobileControlsSrc).toContain(
      "this.bindButton('mobile-reliquary', () => this.callbacks.onReliquary())",
    );
    expect(mainSrc).toContain('onReliquary: () => hud.toggleReliquary()');
  });
});

describe('entry HTML and i18n chrome', () => {
  it('ships the window shell and launchers in both entry HTMLs', () => {
    for (const [name, html] of [
      ['index.html', indexHtml],
      ['play.html', playHtml],
    ] as const) {
      expect(html, name).toContain('id="reliquary-window"');
      expect(html, name).toMatch(
        /id="mm-reliquary"[^>]*data-i18n-title="hudChrome\.reliquary\.title"/,
      );
      expect(html, name).toContain('id="mobile-reliquary"');
      expect(html, name).toContain('data-i18n="hudChrome.mobile.reliquary"');
    }
  });

  it('authors English hudChrome.reliquary keys', () => {
    expect(chrome).toContain('reliquary: {');
    expect(chrome).toContain("title: 'The Reliquary'");
    expect(chrome).toContain("navOverview: 'Overview'");
    expect(chrome).toContain("navConquerors: 'Conquerors'");
    expect(chrome).toContain("curatorUnranked: 'Unranked Curator'");
    expect(chrome).toContain("nearlyLabel: 'Nearly complete:'");
    expect(chrome).toContain('overviewEmpty:');
    expect(chrome).toContain('pageStubNote:');
    expect(chrome).toContain("clearsLabel: '{count} clears'");
    expect(chrome).toContain("reliquary: 'Reliquary'");
  });

  it('maps the reliquary keybind action through t() in Options', () => {
    // Without this entry, Options/gamepad fall back to raw English BIND_ACTIONS labels.
    expect(optionsWindow).toContain("reliquary: 'hudChrome.reliquary.title'");
  });
});

describe('styles and architecture registration', () => {
  it('has a desktop ten-dash section banner and mobile full-bleed rules', () => {
    expect(components).toContain('/* ---------- reliquary ---------- */');
    expect(components).toContain('#reliquary-window');
    expect(hudMobile).toContain('body.mobile-touch #reliquary-window');
    expect(hudMobile).toContain('env(safe-area-inset-left)');
  });

  it('registers the pure core in UI_PURE_CORES', () => {
    expect(architecture).toContain("'src/ui/reliquary_view.ts'");
  });
});
