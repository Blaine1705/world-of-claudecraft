// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_MODULES_ELEMENT_ID as BUILD_ELEMENT_ID } from '../scripts/lib/landing_game_modules.mjs';
import { syncAppViewport } from '../src/game/app_viewport';
import { Settings } from '../src/game/settings';
import { BOOT_PENDING_CLASS, BOOT_SPLASH_OWNED_EVENT } from '../src/ui/boot_splash_core';
import {
  GAME_MODULES_ELEMENT_ID,
  GAME_PREFETCH_DELAY_MS,
  gameModuleUrls,
  LANDING_BOOTING_ATTR,
  LANDING_BOOTING_CLASS,
  runLandingFirst,
  stampLandingBody,
  syncLandingViewport,
} from '../src/ui/landing_first';

const source = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

function mountLanding(): void {
  document.body.className = `${BOOT_PENDING_CLASS} start-screen-open`;
  document.body.innerHTML = `
    <div id="boot-splash"><img class="boot-splash-logo" alt=""></div>
    <main id="start-screen">
      <div id="start-screen-backdrop"></div>
      <details id="community-menu"></details>
      <span class="js-stat-characters">…</span>
      <a id="wiki-link" href="#wiki">Wiki</a>
      <button type="button" id="btn-play">Play</button>
      <button type="button" id="nav-btn-login">Log in</button>
    </main>
    <script type="application/json" id="${GAME_MODULES_ELEMENT_ID}">["/assets/main-a.js","/assets/renderer-b.js"]</script>`;
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What main.ts does once its start screens are wired. */
function clientReady(): void {
  document.dispatchEvent(new Event(BOOT_SPLASH_OWNED_EVENT));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ characters_created: 91190 }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const link of document.head.querySelectorAll('link[rel="prefetch"]')) link.remove();
});

describe('landing-first boot', () => {
  it('lifts the splash and fills the counter without starting the client', async () => {
    mountLanding();
    const startGame = vi.fn(() => new Promise<unknown>(() => undefined));
    runLandingFirst(startGame);
    await vi.waitFor(() =>
      expect(document.body.classList.contains(BOOT_PENDING_CLASS)).toBe(false),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('.js-stat-characters')?.textContent).toBe('91190'),
    );
    expect(startGame).not.toHaveBeenCalled();
    clientReady();
  });

  it('prefetches the listed client modules once the page has settled, without running them', async () => {
    mountLanding();
    const startGame = vi.fn(() => new Promise<unknown>(() => undefined));
    const prefetched = () =>
      [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]')].map((l) =>
        l.getAttribute('href'),
      );
    runLandingFirst(startGame);
    // Not while the landing's own images are still arriving.
    await new Promise((resolve) => setTimeout(resolve, GAME_PREFETCH_DELAY_MS / 2));
    expect(prefetched()).toEqual([]);
    await vi.waitFor(
      () => expect(prefetched()).toEqual(['/assets/main-a.js', '/assets/renderer-b.js']),
      { timeout: GAME_PREFETCH_DELAY_MS + 3000 },
    );
    expect(startGame).not.toHaveBeenCalled();
    clientReady();
  });

  it('starts the client once on the first interaction', () => {
    mountLanding();
    const startGame = vi.fn(() => new Promise<unknown>(() => undefined));
    runLandingFirst(startGame);
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('keydown'));
    document.dispatchEvent(new Event('touchstart'));
    expect(startGame).toHaveBeenCalledTimes(1);
    clientReady();
  });

  it('holds a button clicked before the client is ready, then replays it once', () => {
    mountLanding();
    const startGame = vi.fn(() => new Promise<unknown>(() => undefined));
    runLandingFirst(startGame);
    const play = document.getElementById('btn-play') as HTMLButtonElement;
    const handler = vi.fn();
    play.addEventListener('click', handler);

    play.click();
    expect(startGame).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
    expect(play.hasAttribute(LANDING_BOOTING_ATTR)).toBe(true);
    expect(play.getAttribute('aria-busy')).toBe('true');
    expect(document.body.classList.contains(LANDING_BOOTING_CLASS)).toBe(true);

    clientReady();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(play.hasAttribute(LANDING_BOOTING_ATTR)).toBe(false);
    expect(play.hasAttribute('aria-busy')).toBe(false);
    expect(document.body.classList.contains(LANDING_BOOTING_CLASS)).toBe(false);

    // After the hand-off every click is the client's own.
    play.click();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('replays only the last of several held clicks', () => {
    mountLanding();
    runLandingFirst(vi.fn(() => new Promise<unknown>(() => undefined)));
    const play = document.getElementById('btn-play') as HTMLButtonElement;
    const login = document.getElementById('nav-btn-login') as HTMLButtonElement;
    const onPlay = vi.fn();
    const onLogin = vi.fn();
    play.addEventListener('click', onPlay);
    login.addEventListener('click', onLogin);
    play.click();
    login.click();
    expect(play.hasAttribute(LANDING_BOOTING_ATTR)).toBe(false);
    expect(login.hasAttribute(LANDING_BOOTING_ATTR)).toBe(true);
    clientReady();
    expect(onPlay).not.toHaveBeenCalled();
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('leaves links to their native behaviour', () => {
    mountLanding();
    runLandingFirst(vi.fn(() => new Promise<unknown>(() => undefined)));
    const link = document.getElementById('wiki-link') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(link.hasAttribute(LANDING_BOOTING_ATTR)).toBe(false);
    clientReady();
  });

  it('drops the busy state when the client fails to load, and retries on the next interaction', async () => {
    mountLanding();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = deferred<unknown>();
    const startGame = vi
      .fn<() => Promise<unknown>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValue(new Promise<unknown>(() => undefined));
    runLandingFirst(startGame);
    const play = document.getElementById('btn-play') as HTMLButtonElement;
    play.click();
    expect(play.hasAttribute(LANDING_BOOTING_ATTR)).toBe(true);
    first.reject(new Error('offline'));
    await vi.waitFor(() => expect(play.hasAttribute(LANDING_BOOTING_ATTR)).toBe(false));
    document.dispatchEvent(new Event('pointerdown'));
    expect(startGame).toHaveBeenCalledTimes(2);
    clientReady();
  });
});

describe('stampLandingBody', () => {
  function stubPhone(phone: boolean, reducedMotion = false) {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion') ? reducedMotion : phone,
          media: query,
        }) as MediaQueryList,
    );
  }

  it('stamps the touch interface, the engine/effects classes and the static backdrop on a phone', () => {
    mountLanding();
    stubPhone(true);
    stampLandingBody(new Settings());
    const body = document.body.classList;
    expect(body.contains('mobile-touch')).toBe(true);
    expect([...body].some((c) => c.startsWith('engine-'))).toBe(true);
    expect([...body].some((c) => c.startsWith('fx-'))).toBe(true);
    expect(body.contains('is-mobile') || body.contains('is-desktop')).toBe(true);
    expect(document.getElementById('start-screen-backdrop')?.classList).toContain(
      'backdrop-static',
    );
    expect((document.getElementById('community-menu') as HTMLDetailsElement).open).toBe(false);
  });

  it('honours a stored Desktop interface mode and keeps the animated backdrop on a desktop', () => {
    mountLanding();
    localStorage.setItem('woc_settings', JSON.stringify({ interfaceMode: 1 }));
    stubPhone(true);
    stampLandingBody(new Settings());
    expect(document.body.classList.contains('mobile-touch')).toBe(false);

    mountLanding();
    localStorage.clear();
    stubPhone(false);
    stampLandingBody(new Settings());
    expect(document.body.classList.contains('mobile-touch')).toBe(false);
    expect(document.getElementById('start-screen-backdrop')?.classList).not.toContain(
      'backdrop-static',
    );
    expect((document.getElementById('community-menu') as HTMLDetailsElement).open).toBe(true);
  });
});

describe('syncLandingViewport', () => {
  it('writes the same --app-vw/--app-vh as syncAppViewport off the game screen', () => {
    document.body.className = '';
    const style = document.documentElement.style;
    syncAppViewport(window);
    const expected = [style.getPropertyValue('--app-vw'), style.getPropertyValue('--app-vh')];
    style.removeProperty('--app-vw');
    style.removeProperty('--app-vh');
    syncLandingViewport(window);
    expect([style.getPropertyValue('--app-vw'), style.getPropertyValue('--app-vh')]).toEqual(
      expected,
    );
    expect(expected[0]).toMatch(/^\d+px$/);
  });
});

describe('game module list', () => {
  it('reads the build list and tolerates its absence', () => {
    mountLanding();
    expect(gameModuleUrls()).toEqual(['/assets/main-a.js', '/assets/renderer-b.js']);
    document.getElementById(GAME_MODULES_ELEMENT_ID)?.remove();
    expect(gameModuleUrls()).toEqual([]);
  });

  it('uses the element id the build writes', () => {
    expect(GAME_MODULES_ELEMENT_ID).toBe(BUILD_ELEMENT_ID);
  });
});

describe('boot wiring', () => {
  it('boots index.html through src/boot.ts and play.html through src/main.ts', () => {
    expect(source('../index.html')).toContain('<script type="module" src="/src/boot.ts"></script>');
    expect(source('../index.html')).not.toContain('src="/src/main.ts"');
    expect(source('../play.html')).toContain('<script type="module" src="/src/main.ts"></script>');
  });

  it('links the style barrel from the boot entry and loads the client as a dynamic import', () => {
    const boot = source('../src/boot.ts');
    expect(boot.indexOf("import './styles/index.css';")).toBeGreaterThan(-1);
    expect(boot.indexOf("import './styles/index.css';")).toBeLessThan(boot.indexOf('import {'));
    expect(boot).toContain("const startClient = () => import('./main');");
    expect(boot).toContain('runLandingFirst(startClient);');
  });

  it('relies on main.ts signalling only after its start screens are wired', () => {
    // runLandingFirst replays a held click on BOOT_SPLASH_OWNED_EVENT, which
    // liftBootSplashWhenReady dispatches first thing: it must come after wireStartScreens.
    const main = source('../src/main.ts');
    const wired = main.indexOf('const localized = wireStartScreens();');
    const lift = main.indexOf('void liftBootSplashWhenReady({ landing: true, localized');
    expect(wired).toBeGreaterThan(0);
    expect(lift).toBeGreaterThan(wired);
  });
});
