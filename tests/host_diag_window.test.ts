// @vitest-environment happy-dom
// Options > System Report, driven for real (the options sub-panel pattern:
// tests/options_interface_rows.test.ts). The run is asynchronous and the button
// must not be usable while it is out, the verdict must be announced, and the one
// untrusted value the panel prints (the shell's file name) must never be markup.
//
// The bridge is installed as the real `globalThis.wocDesktop` global rather than
// mocked, so the panel exercises the actual src/game/desktop_host_diag.ts glue.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/game/audio', () => ({ audio: { click: vi.fn() } }));

import type { DesktopHostDiagGameInfo, DesktopHostDiagResult } from '../src/runtime';
import { renderHostDiagPanel } from '../src/ui/host_diag_window';
import { t } from '../src/ui/i18n';

type BridgeHost = { wocDesktop?: unknown };

interface Harness {
  root: HTMLElement;
  body: HTMLElement;
  nav: { back: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
}

function mount(): Harness {
  document.body.innerHTML =
    '<div id="options-menu"><button type="button" data-close></button><div id="win-body"></div></div>';
  const root = document.getElementById('options-menu') as HTMLElement;
  const body = document.getElementById('win-body') as HTMLElement;
  const nav = { back: vi.fn(), close: vi.fn() };
  const deps = {
    root: () => root,
    world: () => ({ player: { pos: { x: 12, z: -40 } } }),
    options: () => ({
      settings: { get: () => 1 },
    }),
  };
  renderHostDiagPanel(body, deps, nav);
  return { root, body, nav };
}

function createButton(host: Harness): HTMLButtonElement {
  const btn = host.body.querySelector<HTMLButtonElement>('.ui-btn--gold');
  if (!btn) throw new Error('no Create report button');
  return btn;
}

function live(host: Harness): HTMLElement {
  const el = host.body.querySelector<HTMLElement>('.hostdiag-live');
  if (!el) throw new Error('no live region');
  return el;
}

/** A bridge whose runHostDiag resolves only when the test says so, which is what
 *  makes the in-flight state observable (a real run takes ten seconds or more). */
function deferredBridge(): {
  settle: (result: DesktopHostDiagResult) => Promise<void>;
  calls: DesktopHostDiagGameInfo[];
} {
  const calls: DesktopHostDiagGameInfo[] = [];
  let resolve: (result: DesktopHostDiagResult) => void = () => {};
  (globalThis as BridgeHost).wocDesktop = {
    openBrowserLogin: () => Promise.resolve(),
    takeLoginCode: () => Promise.resolve(null),
    onLoginCode: () => () => {},
    runHostDiag: (game: DesktopHostDiagGameInfo) => {
      calls.push(game);
      return new Promise<DesktopHostDiagResult>((r) => {
        resolve = r;
      });
    },
  };
  return {
    calls,
    settle: async (result) => {
      resolve(result);
      // Two turns: the glue awaits the bridge, the panel then awaits the glue.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('host_diag_window: structure', () => {
  beforeEach(() => {
    delete (globalThis as BridgeHost).wocDesktop;
  });

  it('explains the report, lists what it contains, and states the privacy promise', () => {
    const host = mount();
    const text = host.body.textContent ?? '';
    expect(text).toContain(t('hudChrome.hostDiag.intro'));
    expect(text).toContain(t('hudChrome.hostDiag.containsTitle'));
    // One bullet per family of readings, in order, none of them dropped.
    const items = [...host.body.querySelectorAll('.hostdiag-list li')].map((li) => li.textContent);
    expect(items).toEqual([
      t('hudChrome.hostDiag.containsHardware'),
      t('hudChrome.hostDiag.containsWindows'),
      t('hudChrome.hostDiag.containsNvidia'),
      t('hudChrome.hostDiag.containsDisplays'),
      t('hudChrome.hostDiag.containsPrograms'),
      t('hudChrome.hostDiag.containsBrowsers'),
      t('hudChrome.hostDiag.containsGame'),
    ]);
    // The two lines that manage the player's expectations: nothing is uploaded,
    // and here is what to do with the file afterwards.
    expect(text).toContain(t('hudChrome.hostDiag.privacy'));
    expect(text).toContain(t('hudChrome.hostDiag.sendHint'));
  });

  it('carries a POLITE live region that exists before anything is written into it', () => {
    // An announcement region inserted together with its text is not reliably
    // announced, so the region must be present and empty on the first paint.
    const host = mount();
    const region = live(host);
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
    expect(createButton(host).disabled).toBe(false);
  });

  it('pins Back under the scroller and wires the title-bar close', () => {
    const host = mount();
    const foot = host.root.querySelector('.ui-win-foot');
    expect(foot, 'the footer is a sibling of the body, not inside it').not.toBeNull();
    expect(host.body.contains(foot as Node)).toBe(false);
    foot?.querySelector('button')?.dispatchEvent(new Event('click'));
    expect(host.nav.back).toHaveBeenCalledTimes(1);
    host.root.querySelector<HTMLButtonElement>('[data-close]')?.click();
    expect(host.nav.close).toHaveBeenCalledTimes(1);
  });
});

describe('host_diag_window: a run', () => {
  afterEach(() => {
    delete (globalThis as BridgeHost).wocDesktop;
  });

  it('disables the button with a collecting status while the run is out, then re-enables it', async () => {
    const bridge = deferredBridge();
    const host = mount();
    const btn = createButton(host);
    btn.click();
    expect(btn.getAttribute('aria-disabled'), 'busy while one is in flight').toBe('true');
    expect(btn.disabled, 'never natively disabled: that would drop keyboard focus').toBe(false);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(live(host).textContent).toContain(t('hudChrome.hostDiag.running'));
    // A press while busy must not reach the bridge again.
    btn.click();
    expect(bridge.calls).toHaveLength(1);

    await bridge.settle({ status: 'saved', nativeStatus: 'ok', fileName: 'report.json' });
    expect(btn.getAttribute('aria-disabled'), 'usable again after a completed run').toBe('false');
    expect(btn.getAttribute('aria-busy')).toBe('false');
    // Focus stays put because the button is never rebuilt.
    expect(host.body.contains(btn)).toBe(true);
    expect(live(host).textContent).not.toContain(t('hudChrome.hostDiag.running'));
  });

  it('sends the perf-report session id and the game context it could resolve', async () => {
    const bridge = deferredBridge();
    sessionStorage.setItem('woc_perf_session_id', 'joinme-1234');
    const host = mount();
    createButton(host).click();
    expect(bridge.calls[0]?.sessionId, 'the join key for the automatic perf reports').toBe(
      'joinme-1234',
    );
    expect(typeof bridge.calls[0]?.releaseVersion).toBe('string');
    expect(typeof bridge.calls[0]?.locale).toBe('string');
    await bridge.settle({ status: 'cancelled', nativeStatus: null });
    sessionStorage.removeItem('woc_perf_session_id');
  });

  it('renders a hostile file name as TEXT, never as markup', async () => {
    const bridge = deferredBridge();
    const host = mount();
    createButton(host).click();
    await bridge.settle({
      status: 'saved',
      nativeStatus: 'ok',
      fileName: '<img src=x onerror=alert(1)>',
    });
    const message = host.body.querySelector<HTMLElement>('.hostdiag-message');
    expect(message?.querySelector('img'), 'no element was created from the name').toBeNull();
    expect(message?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(live(host).classList.contains('is-success')).toBe(true);
  });

  it('adds the shortfall detail line for partial, and none for unsupported-platform', async () => {
    const partial = deferredBridge();
    const host = mount();
    createButton(host).click();
    await partial.settle({ status: 'saved', nativeStatus: 'partial', fileName: 'r.json' });
    expect(host.body.querySelector('.hostdiag-detail')?.textContent).toBe(
      t('hudChrome.hostDiag.detailPartial'),
    );

    const unsupported = deferredBridge();
    const mac = mount();
    createButton(mac).click();
    await unsupported.settle({
      status: 'saved',
      nativeStatus: 'unsupported-platform',
      fileName: 'r.json',
    });
    expect(
      mac.body.querySelector('.hostdiag-detail')?.textContent,
      'macOS is not a shortfall',
    ).toBe('');
  });

  it('says nothing at all when the player closed the save dialog', async () => {
    const bridge = deferredBridge();
    const host = mount();
    const btn = createButton(host);
    btn.click();
    await bridge.settle({ status: 'cancelled', nativeStatus: null });
    expect(live(host).textContent, 'a cancel is a decision, not a message').toBe('');
    expect(live(host).className).toBe('hostdiag-live');
    expect(btn.disabled).toBe(false);
  });

  it('reports a failed run, and reports one on a shell with no runHostDiag at all', async () => {
    const bridge = deferredBridge();
    const host = mount();
    createButton(host).click();
    await bridge.settle({ status: 'error', nativeStatus: 'error' });
    expect(host.body.querySelector('.hostdiag-message')?.textContent).toBe(
      t('hudChrome.hostDiag.failed'),
    );
    expect(live(host).classList.contains('is-error')).toBe(true);

    delete (globalThis as BridgeHost).wocDesktop;
    const bare = mount();
    createButton(bare).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(bare.body.querySelector('.hostdiag-message')?.textContent).toBe(
      t('hudChrome.hostDiag.failed'),
    );
  });

  it('writes nothing once its nodes have been discarded by a navigation away', async () => {
    // The save dialog is the player's to answer, so a run routinely outlives the
    // panel; the settled request must not paint into a detached tree.
    const bridge = deferredBridge();
    const host = mount();
    createButton(host).click();
    const region = live(host);
    document.body.innerHTML = '';
    await bridge.settle({ status: 'saved', nativeStatus: 'ok', fileName: 'r.json' });
    expect(region.textContent).toContain(t('hudChrome.hostDiag.running'));
  });
});
