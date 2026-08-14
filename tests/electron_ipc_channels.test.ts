import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Pin the preload <-> main IPC channel-name contract by scanning the sources:
// electron/*.cjs live outside tsc, so a rename on one side would otherwise
// only surface as a silent no-op (or a rejected invoke) at runtime.
const repoRoot = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

const preload = read('electron/preload.cjs');
const mainSide = read('electron/main.cjs') + read('electron/updater.cjs');

const matches = (source: string, re: RegExp): Set<string> => {
  const found = new Set<string>();
  for (const m of source.matchAll(re)) found.add(m[1]);
  return found;
};

describe('electron IPC channel contract (preload <-> main)', () => {
  it('every preload invoke has a main-side ipcMain.handle', () => {
    const invoked = matches(preload, /ipcRenderer\.invoke\('([^']+)'/g);
    const handled = matches(mainSide, /ipcMain\.handle\('([^']+)'/g);
    expect([...invoked].sort()).toEqual(
      expect.arrayContaining([
        'desktop-epic-capability',
        'desktop-epic-link-proof',
        'desktop-epic-link-settled',
        'desktop-gamepad-activity',
        'desktop-get-display-mode',
        'desktop-get-gpu-force-opt-out',
        'desktop-login-open-browser',
        'desktop-login-take-code',
        'desktop-set-display-mode',
        'desktop-set-gpu-force-opt-out',
        'desktop-set-strings',
        'desktop-steam-capability',
        'desktop-steam-link-settled',
        'desktop-steam-link-ticket',
        'desktop-update-install',
        'desktop-wallet-capability',
        'desktop-wallet-open-browser',
        'desktop-wallet-take-code',
      ]),
    );
    for (const channel of invoked) {
      expect(handled, `no ipcMain.handle for invoked channel ${channel}`).toContain(channel);
    }
  });

  it('every preload send has a main-side ipcMain.on', () => {
    const sent = matches(preload, /ipcRenderer\.send\('([^']+)'/g);
    const listened = matches(mainSide, /ipcMain\.on\('([^']+)'/g);
    expect([...sent]).toContain('desktop-renderer-error');
    for (const channel of sent) {
      expect(listened, `no ipcMain.on for sent channel ${channel}`).toContain(channel);
    }
  });

  it('every preload subscription has a main-side webContents.send', () => {
    const subscribed = matches(preload, /ipcRenderer\.on\('([^']+)'/g);
    const pushed = matches(mainSide, /webContents\.send\('([^']+)'/g);
    expect([...subscribed].sort()).toEqual([
      'desktop-display-changed',
      'desktop-gpu-status',
      'desktop-login-code',
      'desktop-presentation-changed',
      'desktop-update-event',
      'desktop-wallet-handoff-code',
    ]);
    for (const channel of subscribed) {
      expect(pushed, `nothing pushes subscribed channel ${channel}`).toContain(channel);
    }
  });

  it('every ipcMain.handle body checks the trusted-sender gate FIRST', () => {
    // A handler without the sender gate would answer IPC from any frame that
    // somehow runs in the window (the deny-by-default posture's last line).
    // Scan both registration sites: main.cjs handlers call trustedSender(...),
    // the updater's injected gate is named isTrusted(...). The check must
    // appear within the first statement's reach of the callback body.
    const registrations = mainSide.split(/ipcMain\.handle\(/).slice(1);
    expect(registrations.length).toBeGreaterThanOrEqual(5);
    for (const body of registrations) {
      const head = body.slice(0, 200);
      expect(
        /trustedSender\(|isTrusted\(/.test(head),
        `an ipcMain.handle body does not gate on the trusted sender: ${head.split('\n')[0]}`,
      ).toBe(true);
    }
  });

  it('the steam-link-settled handler body cancels the live auth ticket', () => {
    // The channel existing is not enough: the settle signal exists ONLY so the
    // shell CancelAuthTickets the live handle promptly (Valve's contract), so
    // the handler body must actually reach steamShell.cancelLinkTicket.
    const main = read('electron/main.cjs');
    const start = main.indexOf("ipcMain.handle('desktop-steam-link-settled'");
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('});', start));
    expect(body).toContain('steamShell.cancelLinkTicket()');
  });

  it('the epic-link-settled handler body cancels the live proof handle', () => {
    // Mirror of the Steam settle contract: the channel exists so the shell can
    // release any cancelable EOS adapter handle promptly after the link POST.
    const main = read('electron/main.cjs');
    const start = main.indexOf("ipcMain.handle('desktop-epic-link-settled'");
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('});', start));
    expect(body).toContain('epicShell.cancelLinkProof()');
  });

  it('reports whether the external wallet authorization page actually opened', () => {
    const main = read('electron/main.cjs');
    const start = main.indexOf("ipcMain.handle('desktop-wallet-open-browser'");
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('});', start));
    expect(body).toContain('await openDesktopWalletHandoff(code)');
  });

  it('the gpu-force-opt-out setter takes only a strict boolean and reports the write', () => {
    // The stored value decides whether the next launch re-execs itself (Linux
    // PRIME) and writes a Windows per-app preference, so a junk value must not
    // reach the file, and the renderer must learn when the write failed rather
    // than showing a toggle the next launch will not honor.
    const main = read('electron/main.cjs');
    const start = main.indexOf("ipcMain.handle('desktop-set-gpu-force-opt-out'");
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('\n});', start));
    expect(body).toContain('if (optOut !== true && optOut !== false) return false;');
    // The WHOLE record, spread from the live module-scope object: this is the
    // anti-clobber contract with the window-bounds saver. Saving only the
    // toggled field would wipe windowBounds/displayId/maximized from disk on
    // every mid-session toggle, so the spread is pinned literally.
    expect(body).toContain(
      'saveDesktopPrefs(desktopPrefsPath, { ...desktopPrefs, gpuForceOptOut: optOut })',
    );
    // The failure GUARD is load-bearing, not just the ordering: a bare save
    // call after this line would still satisfy an index comparison while
    // flipping the mirror on a write that never reached disk.
    expect(body).toContain(
      'if (!saveDesktopPrefs(desktopPrefsPath, { ...desktopPrefs, gpuForceOptOut: optOut })) {',
    );
    // The in-memory mirror is updated only after a successful save, so the
    // getter can never report a value the next launch would not read.
    const saveAt = body.indexOf('saveDesktopPrefs(desktopPrefsPath,');
    const commitAt = body.indexOf('desktopPrefs.gpuForceOptOut = optOut;');
    expect(commitAt).toBeGreaterThan(saveAt);

    const getterAt = main.indexOf("ipcMain.handle('desktop-get-gpu-force-opt-out'");
    expect(getterAt).toBeGreaterThan(-1);
    const getter = main.slice(getterAt, main.indexOf('\n});', getterAt));
    expect(getter, 'the getter must report the STORED value, not a live GPU reading').toContain(
      'return desktopPrefs.gpuForceOptOut === true;',
    );
  });

  it('the display-mode setter takes only the two literals, persists, then applies live', () => {
    // The stored mode decides how the NEXT launch reveals the window and the
    // live apply is what the player sees under the click, so a junk value must
    // reach neither, and a failed write must not leave the window in a mode the
    // next launch would not reproduce.
    const main = read('electron/main.cjs');
    const start = main.indexOf("ipcMain.handle('desktop-set-display-mode'");
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('\n});', start));
    // An untrusted frame is refused by VALUE, not just by a gate call whose
    // result something might ignore.
    expect(body).toContain('if (!trustedSender(event)) return false;');
    expect(body).toContain("if (mode !== 'borderless' && mode !== 'windowed') return false;");
    // Same anti-clobber contract as the GPU setter: the WHOLE record, spread
    // from the live module-scope object, or a mid-session change would wipe
    // windowBounds/displayId/maximized off disk.
    expect(body).toContain(
      'saveDesktopPrefs(desktopPrefsPath, { ...desktopPrefs, displayMode: mode })',
    );
    // The failure GUARD is load-bearing: without the `if (!` arm a failed disk
    // write would still flip the mirror and the live window, leaving a mode the
    // next launch cannot reproduce.
    expect(body).toContain(
      'if (!saveDesktopPrefs(desktopPrefsPath, { ...desktopPrefs, displayMode: mode })) {',
    );
    const saveAt = body.indexOf('saveDesktopPrefs(desktopPrefsPath,');
    const commitAt = body.indexOf('desktopPrefs.displayMode = mode;');
    const applyAt = body.indexOf("mainWindow.setFullScreen(mode === 'borderless');");
    expect(commitAt).toBeGreaterThan(saveAt);
    expect(applyAt).toBeGreaterThan(commitAt);
    // Idempotence: the world-entry apply-all loop re-sends the reflected mode,
    // and a same-value send must neither rewrite the file nor re-apply window
    // state over a manually fullscreened (or restored) window. The early
    // return sits after validation and before the save.
    const sameAt = body.indexOf('if (mode === desktopPrefs.displayMode) return true;');
    expect(sameAt).toBeGreaterThan(body.indexOf("if (mode !== 'borderless'"));
    expect(sameAt).toBeLessThan(saveAt);

    const getterAt = main.indexOf("ipcMain.handle('desktop-get-display-mode'");
    expect(getterAt).toBeGreaterThan(-1);
    const getter = main.slice(getterAt, main.indexOf('\n});', getterAt));
    expect(getter, 'the getter must report the STORED mode').toContain(
      'return desktopPrefs.displayMode;',
    );
    // The untrusted arm answers the DEFAULT by value: the generic gate sweep
    // only proves trustedSender is called, not that its verdict decides the
    // answer, and an untrusted frame must learn nothing about the real mode.
    expect(getter, 'an untrusted frame is answered with the default').toContain(
      "if (!trustedSender(event)) return 'borderless';",
    );
  });

  it('the gamepad-activity handler feeds the display-sleep lease', () => {
    // The channel existing proves nothing: it exists ONLY so controller input
    // keeps the display awake, and nothing else in the shell pings the lease.
    const main = read('electron/main.cjs');
    const start = main.indexOf("ipcMain.handle('desktop-gamepad-activity'");
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('\n});', start));
    expect(body).toContain('if (!trustedSender(event)) return false;');
    expect(body).toContain('powerSave.notifyActivity();');
  });

  it('the preload refuses junk display modes and swallows gamepad-notify rejections', () => {
    // Both behaviors live ONLY in the preload and fail silently when lost. The
    // junk refusal keeps main receiving values it can apply; the catch is
    // load-bearing and NOT redundant with the renderer module's own catch:
    // notifyGamepadActivity returns undefined to its caller, so the renderer
    // side can never see the invoke rejection, and dropping this catch would
    // surface one unhandled rejection per notify on a shell whose handler
    // rejects.
    expect(preload).toContain(
      "if (mode !== 'borderless' && mode !== 'windowed') return Promise.resolve(false);",
    );
    expect(preload).toContain("ipcRenderer.invoke('desktop-gamepad-activity').catch(() => {});");
  });

  it('activates the macOS app when the browser returns a wallet handoff', () => {
    const main = read('electron/main.cjs');
    const start = main.indexOf('function deliverWalletHandoffCode');
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf('\n}', start));
    expect(body).toContain('app.focus({ steal: true })');
  });

  it('the bridge methods the client feature-checks exist in the preload', () => {
    for (const method of [
      'openBrowserLogin',
      'takeLoginCode',
      'onLoginCode',
      'setShellStrings',
      'reportRendererError',
      'onUpdateEvent',
      'installUpdate',
      'onGpuStatus',
      'onPresentationChanged',
      'onDisplayChanged',
      'getGpuForceOptOut',
      'setGpuForceOptOut',
      'getDisplayMode',
      'setDisplayMode',
      'notifyGamepadActivity',
      'steamLinkTicket',
      'steamLinkSupported',
      'steamLinkSettled',
      'epicLinkProof',
      'epicLinkSupported',
      'epicLinkSettled',
      'walletConnectionSupported',
      'openWalletBrowser',
      'takeWalletHandoffCode',
      'onWalletHandoffCode',
    ]) {
      expect(preload, `preload is missing bridge method ${method}`).toContain(`${method}:`);
    }
  });
});
