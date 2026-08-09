import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Text pins for the 'desktop-display-changed' push, same arrangement and reasons
// as tests/electron_gpu_push.test.ts: electron/*.cjs need a real Electron main
// process, so these placement contracts can only be held by reading the sources.
const repoRoot = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

const main = read('electron/main.cjs');
const preload = read('electron/preload.cjs');
const flat = (text: string) => text.replace(/\s+/g, ' ');

const createMainWindowAt = (): { start: number; end: number } => {
  const start = main.indexOf('function createMainWindow()');
  expect(start, 'createMainWindow is gone from electron/main.cjs').toBeGreaterThan(-1);
  const end = main.indexOf('function openDesktopLogin()', start);
  expect(end, 'could not find the end of createMainWindow').toBeGreaterThan(start);
  return { start, end };
};

const createMainWindowBody = (): string => {
  const { start, end } = createMainWindowAt();
  return main.slice(start, end);
};

describe('the display change push to the renderer', () => {
  it('imports the screen module it reads the display from', () => {
    const destructure = main.slice(0, main.indexOf("} = require('electron')"));
    expect(destructure, 'screen is not imported from electron').toContain('screen,');
  });

  it('pins the whole send helper: window guard, reducer, dedup, latch, then send', () => {
    // Every line of this helper is load-bearing and the ORDER is the contract:
    // the window guard must precede the bounds read (a destroyed window throws),
    // and lastDisplayPush must be updated before the send or a repeated reading
    // would push forever. Pin the body verbatim rather than nearby strings.
    const start = main.indexOf('function sendDisplayChange()');
    expect(start, 'sendDisplayChange is gone from electron/main.cjs').toBeGreaterThan(-1);
    const end = main.indexOf('\n}', start);
    expect(end).toBeGreaterThan(start);
    const body = flat(main.slice(start, end + 2));
    expect(body).toBe(
      'function sendDisplayChange() { ' +
        'if (!mainWindow || mainWindow.isDestroyed()) return; ' +
        'const display = screen.getDisplayMatching(mainWindow.getBounds()); ' +
        'const displayChange = displayChangedPayload(display); ' +
        'if (!shouldForwardDisplayChange(lastDisplayPush, displayChange)) return; ' +
        'lastDisplayPush = displayChange; ' +
        "mainWindow.webContents.send('desktop-display-changed', displayChange); }",
    );
    expect(main).toContain("require('./display_events.cjs')");
    expect(
      [...main.matchAll(/webContents\.send\('desktop-display-changed'/g)].length,
      'desktop-display-changed must have exactly one send site in main.cjs',
    ).toBe(1);
  });

  it('registers display-metrics-changed exactly once, at app level and NOT per window', () => {
    // A per-window registration would stack a duplicate listener every time
    // createMainWindow ran (macOS 'activate' re-creates the window).
    const registrations = [...main.matchAll(/screen\.on\('display-metrics-changed'/g)];
    expect(registrations.length, 'display-metrics-changed must be registered once').toBe(1);
    const at = main.indexOf("screen.on('display-metrics-changed'");
    const { start, end } = createMainWindowAt();
    expect(
      at < start || at > end,
      'display-metrics-changed is registered inside createMainWindow',
    ).toBe(true);
    expect(createMainWindowBody()).not.toContain('display-metrics-changed');
  });

  it("debounces window 'move' on a captured window instance, off a top-level constant", () => {
    // 'moved' does not fire on Linux, so the trigger is 'move', which fires
    // continuously through a drag: only the settled position is worth a read.
    // `win`, not mainWindow, so this window's timer can never act on a successor.
    const debounceAt = main.indexOf('const MOVE_DISPLAY_DEBOUNCE_MS =');
    expect(debounceAt, 'the MOVE_DISPLAY_DEBOUNCE_MS constant is gone').toBeGreaterThan(-1);
    const { start } = createMainWindowAt();
    expect(debounceAt, 'MOVE_DISPLAY_DEBOUNCE_MS must be a top-level constant').toBeLessThan(start);
    expect(main).toMatch(/^const MOVE_DISPLAY_DEBOUNCE_MS = \d+;$/m);

    const body = flat(createMainWindowBody());
    expect(body).toContain(
      "mainWindow.on('move', () => { clearMoveDisplayTimer(); " +
        'moveDisplayTimer = setTimeout(() => { moveDisplayTimer = null; ' +
        'if (win.isDestroyed()) return; sendDisplayChange(); }, MOVE_DISPLAY_DEBOUNCE_MS); });',
    );
    // A fresh window starts with no remembered reading, and no timer may outlive
    // its window.
    expect(body).toContain('lastDisplayPush = null;');
    expect(body).toContain(
      "mainWindow.on('closed', () => { clearReadyToShowFallback(); " +
        'clearMoveDisplayTimer(); mainWindow = null; });',
    );
  });

  it('the preload subscription rejects non-finite numbers and can unsubscribe', () => {
    // The finiteness checks are the new territory here: a NaN scale factor would
    // poison the renderer's pixel-ratio math for the rest of the session.
    const start = preload.indexOf('onDisplayChanged: (callback)');
    expect(start, 'preload is missing the onDisplayChanged bridge method').toBeGreaterThan(-1);
    const end = preload.indexOf('\n  },', start);
    expect(end).toBeGreaterThan(start);
    const body = preload.slice(start, end);
    expect(body).toContain("typeof callback !== 'function'");
    expect(body).toContain("typeof payload.scaleFactor === 'number'");
    expect(body).toContain('Number.isFinite(payload.scaleFactor)');
    expect(body).toContain("typeof payload.displayId === 'number'");
    expect(body).toContain('Number.isFinite(payload.displayId)');
    expect(body).toContain("ipcRenderer.on('desktop-display-changed', listener)");
    expect(body).toContain("ipcRenderer.removeListener('desktop-display-changed', listener)");
  });

  it('is push-only: no invoke side and no handler side', () => {
    expect(preload).not.toContain("ipcRenderer.invoke('desktop-display-changed'");
    expect(main).not.toContain("ipcMain.handle('desktop-display-changed'");
  });

  it('carries only the two whitelisted fields: no bounds, no label', () => {
    // Window bounds are a separate, later contract; nothing here may leak them.
    const body = createMainWindowBody() + main.slice(main.indexOf('function sendDisplayChange()'));
    expect(body).not.toContain('getNormalBounds()');
    expect(/webContents\.send\('desktop-display-changed', \{/.test(main)).toBe(false);
  });
});
