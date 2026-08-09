import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Text pins for the 'desktop-presentation-changed' push. electron/*.cjs live
// outside tsc and outside every runnable suite (they need a real Electron main
// process), so these placement contracts can only be held by reading the
// sources, the same arrangement as tests/electron_gpu_push.test.ts.
const repoRoot = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

const main = read('electron/main.cjs');
const preload = read('electron/preload.cjs');
const flat = (text: string) => text.replace(/\s+/g, ' ');

// Every placement pin below is bounded to one function body, so a match
// elsewhere in main.cjs cannot satisfy it.
const sendHelperBody = (): string => {
  const start = main.indexOf('function sendPresentationState()');
  expect(start, 'sendPresentationState is gone from electron/main.cjs').toBeGreaterThan(-1);
  const end = main.indexOf('\n}', start);
  expect(end, 'could not find the end of sendPresentationState').toBeGreaterThan(start);
  return main.slice(start, end + 2);
};

const createMainWindowBody = (): string => {
  const start = main.indexOf('function createMainWindow()');
  expect(start, 'createMainWindow is gone from electron/main.cjs').toBeGreaterThan(-1);
  const end = main.indexOf('function openDesktopLogin()', start);
  expect(end, 'could not find the end of createMainWindow').toBeGreaterThan(start);
  return main.slice(start, end);
};

describe('the window presentation push to the renderer', () => {
  it('guards the one send on a live window and builds it through the reducer', () => {
    // One send site only: a second, unguarded send beside the guarded one would
    // reintroduce exactly what the guard exists to prevent (the window can be
    // gone by the time a window event handler runs). Pin the whole guarded
    // statement so an inverted guard or a hoisted send cannot pass.
    const body = sendHelperBody();
    expect(flat(body)).toContain(
      "if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.send('desktop-presentation-changed', presentationState); }",
    );
    expect(
      [...main.matchAll(/webContents\.send\('desktop-presentation-changed'/g)].length,
      'desktop-presentation-changed must have exactly one send site in main.cjs',
    ).toBe(1);

    // The payload argument must be a bare identifier (this regex refuses an
    // inline object literal), and that identifier must come from the reducer.
    expect(main).toContain("require('./presentation_events.cjs')");
    const send = /webContents\.send\('desktop-presentation-changed', (\w+)\)/.exec(body);
    expect(send, 'the send does not pass a prebuilt payload').not.toBeNull();
    const arg = (send as RegExpExecArray)[1];
    expect(body).toContain(`const ${arg} = presentationStatePayload(`);
  });

  it('registers all four window events with the right polarity', () => {
    // Polarity IS the contract: a swapped pair would tell the renderer a
    // minimized window is visible, and it parks work on this.
    const body = flat(createMainWindowBody());
    expect(body).toContain(
      "mainWindow.on('minimize', () => { presentationHidden = true; sendPresentationState(); });",
    );
    expect(body).toContain(
      "mainWindow.on('restore', () => { presentationHidden = false; sendPresentationState(); });",
    );
    expect(body).toContain(
      "mainWindow.on('hide', () => { presentationHidden = true; sendPresentationState(); });",
    );
    expect(body).toContain(
      "mainWindow.on('show', () => { presentationHidden = false; sendPresentationState(); });",
    );
    // A newly created window starts shown, and createMainWindow can run again
    // (macOS 'activate'), so the module-level flag must be reset here.
    expect(body).toContain("presentationHidden = false; mainWindow.on('minimize'");
  });

  it('re-pushes on did-finish-load without entangling the GPU flow', () => {
    // The channel has no replay: a reload or the crash-recovery page comes up
    // knowing nothing about whether its window is hidden.
    const body = flat(createMainWindowBody());
    expect(body).toContain(
      "mainWindow.webContents.on('did-finish-load', () => { sendPresentationState(); });",
    );
    // The GPU binding is a separate listener and keeps its own bare-identifier
    // shape (tests/electron_gpu_push.test.ts pins that it is the only one).
    expect(body).toContain("mainWindow.webContents.on('did-finish-load', logGpuStatus);");
  });

  it('the preload subscription shape-checks the payload and can unsubscribe', () => {
    const start = preload.indexOf('onPresentationChanged: (callback)');
    expect(start, 'preload is missing the onPresentationChanged bridge method').toBeGreaterThan(-1);
    const end = preload.indexOf('\n  },', start);
    expect(end).toBeGreaterThan(start);
    const body = preload.slice(start, end);
    expect(body).toContain("typeof callback !== 'function'");
    expect(body).toContain("typeof payload.hidden === 'boolean'");
    expect(body).toContain("ipcRenderer.on('desktop-presentation-changed', listener)");
    expect(body).toContain("ipcRenderer.removeListener('desktop-presentation-changed', listener)");
  });

  it('is push-only: no invoke side and no handler side', () => {
    expect(preload).not.toContain("ipcRenderer.invoke('desktop-presentation-changed'");
    expect(main).not.toContain("ipcMain.handle('desktop-presentation-changed'");
  });
});
