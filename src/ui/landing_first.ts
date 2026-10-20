// The home page's landing-first boot (src/boot.ts, mode 'landing'): the landing page
// paints from the HTML and the stylesheets alone, and the game client (src/main.ts)
// downloads in the background once the page has loaded and starts on the visitor's
// first interaction. Before this, every visit downloaded and ran the whole client
// before the landing could show, which held a cold phone's first paint for seconds.
//
// What this module owns until the client takes over:
// - the body classes and viewport size the landing CSS keys on, its icons and its
//   characters-created counter (main.ts sets the same ones at boot, from the same
//   inputs, so its later pass changes nothing on screen);
// - lifting the boot splash once the stylesheets, fonts and backdrop are ready;
// - prefetching the client's modules once the page has loaded and settled (no compile,
//   no execution);
// - holding a button clicked before the client is ready: it shows a busy state, and
//   the click is replayed once main.ts has wired the start screens. main.ts signals
//   that by dispatching BOOT_SPLASH_OWNED_EVENT (liftBootSplashWhenReady), which it
//   does right after wireStartScreens().
// Links, form fields and the community <details> keep their native behaviour.

import {
  BROWSER_BODY_CLASSES,
  browserBodyClasses,
  cssEffectsTier,
  readBrowserEnv,
} from '../game/browser_env';
import { shouldUseStaticBackdrop } from '../game/landing_backdrop';
import { Settings } from '../game/settings';
import { loadingCurtainFadeMs } from '../game/ui_effects_profile';
import { liftBootSplashWhenReady } from './boot_splash';
import { BOOT_SPLASH_OWNED_EVENT } from './boot_splash_core';
import { LANDING_PHONE_TOUCH_QUERY, landingTouchInterface } from './landing_first_core';
import { loadProjectStats, type ProjectStats } from './project_stats';
import { hydrateIcons } from './ui_icons';

/** On the control whose click is waiting for the client; drives its busy styling. */
export const LANDING_BOOTING_ATTR = 'data-landing-booting';
/** On body while a click waits for the client. */
export const LANDING_BOOTING_CLASS = 'landing-booting';
/** The build's list of the client's module URLs (vite.config.ts, woc-landing-game-modules). */
export const GAME_MODULES_ELEMENT_ID = 'woc-game-modules';

/** Interactions that start the client. Scrolling with a wheel or trackpad does not. */
const START_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;
/** A click on one of these waits for the client and is replayed; anything else is native. */
const CLIENT_CONTROL_SELECTOR = 'button, [role="button"]';

function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

function saveDataHint(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * The classes main.ts stamps before its first paint (syncPhoneTouchClass, the landing
 * engine/effects stamp, applyLandingBackdrop's static decision), from the same inputs.
 */
export function stampLandingBody(settings: Settings): void {
  const body = document.body.classList;
  const phone = matches(LANDING_PHONE_TOUCH_QUERY);
  const touch = landingTouchInterface(settings.get('interfaceMode'), phone);
  body.toggle('mobile-touch', touch);
  const community = document.getElementById('community-menu') as HTMLDetailsElement | null;
  if (community) community.open = !touch;

  const env = readBrowserEnv();
  const tier = cssEffectsTier({
    engine: env.engine,
    version: env.engineVersion,
    mobile: env.mobile,
    renderTier: 'high',
    override: settings.get('browserEffects'),
  });
  body.remove(...BROWSER_BODY_CLASSES);
  body.add(...browserBodyClasses(env, tier));

  const reducedMotion = matches('(prefers-reduced-motion: reduce)') || settings.get('reduceMotion');
  document.getElementById('start-screen-backdrop')?.classList.toggle(
    'backdrop-static',
    shouldUseStaticBackdrop({
      phone,
      saveData: saveDataHint(),
      reducedMotion,
      highContrast: settings.get('landingHighContrast'),
    }),
  );
}

/**
 * syncAppViewport's landing branch (src/game/app_viewport.ts, body not game-active),
 * which html/body size from. That module imports the touch controls and with them the
 * i18n runtime, so it cannot load first; tests/landing_first.test.ts pins the two equal.
 */
export function syncLandingViewport(win: Window = window): void {
  const vv = win.visualViewport;
  const scale = vv?.scale ?? 1;
  const width = Math.max(1, Math.round((vv?.width ?? win.innerWidth) * scale));
  const height = Math.max(1, Math.round((vv?.height ?? win.innerHeight) * scale));
  win.document.documentElement.style.setProperty('--app-vw', `${width}px`);
  win.document.documentElement.style.setProperty('--app-vh', `${height}px`);
}

async function fetchProjectStats(): Promise<ProjectStats> {
  const res = await fetch('/api/project-stats', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`project stats ${res.status}`);
  return (await res.json()) as ProjectStats;
}

/** The client's module URLs the build listed, or none (dev, or a build without the list). */
export function gameModuleUrls(doc: Document = document): string[] {
  const el = doc.getElementById(GAME_MODULES_ELEMENT_ID);
  if (!el?.textContent) return [];
  try {
    const urls: unknown = JSON.parse(el.textContent);
    return Array.isArray(urls) ? urls.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Put the client's modules in the HTTP cache at idle priority. Plain prefetch, not
 * modulepreload: modulepreload also compiles each module, and compiling the client
 * on a phone's main thread is the cost this boot exists to keep off the landing.
 */
function prefetchGameModules(): void {
  if (saveDataHint()) return;
  for (const href of gameModuleUrls()) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'script';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  }
}

const onResize = () => syncLandingViewport();

/**
 * How long after the load event the client prefetch waits before asking for idle
 * time: the landing's own images and fonts are still decoding and painting around
 * load, and several megabytes of client competing with them would delay the largest
 * paint the visitor is waiting for.
 */
export const GAME_PREFETCH_DELAY_MS = 1500;

function afterLoadSettles(run: () => void): void {
  const idle = () => {
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 0);
    }
  };
  const later = () => setTimeout(idle, GAME_PREFETCH_DELAY_MS);
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}

export function runLandingFirst(startGame: () => Promise<unknown>): void {
  const settings = new Settings();
  stampLandingBody(settings);
  syncLandingViewport();
  window.addEventListener('resize', onResize);
  hydrateIcons();
  void loadProjectStats(fetchProjectStats);
  const osReducedMotion = matches('(prefers-reduced-motion: reduce)');
  void liftBootSplashWhenReady({
    landing: true,
    fadeMs: loadingCurtainFadeMs(settings.get('reduceMotion') || osReducedMotion),
  });
  afterLoadSettles(prefetchGameModules);

  // The lift above dispatched BOOT_SPLASH_OWNED_EVENT synchronously; the next one is
  // main.ts, once its start screens are wired.
  let started = false;
  let ready = false;
  let pending: HTMLElement | null = null;

  const markBusy = (el: HTMLElement | null) => {
    pending?.removeAttribute(LANDING_BOOTING_ATTR);
    pending?.removeAttribute('aria-busy');
    pending = el;
    pending?.setAttribute(LANDING_BOOTING_ATTR, '');
    pending?.setAttribute('aria-busy', 'true');
    document.body.classList.toggle(LANDING_BOOTING_CLASS, pending !== null);
  };

  const start = () => {
    if (started) return;
    started = true;
    for (const type of START_EVENTS) document.removeEventListener(type, start, true);
    startGame().catch((err: unknown) => {
      // The client failed to load (offline, a deploy mid-visit): drop the busy state
      // and let the next interaction try again.
      console.error('game client failed to load:', err);
      started = false;
      markBusy(null);
      for (const type of START_EVENTS) {
        document.addEventListener(type, start, { capture: true, passive: true });
      }
    });
  };

  const onClick = (event: MouseEvent) => {
    if (ready) return;
    start();
    const control = (event.target as Element | null)?.closest?.(CLIENT_CONTROL_SELECTOR);
    if (!(control instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    markBusy(control);
  };

  for (const type of START_EVENTS) {
    document.addEventListener(type, start, { capture: true, passive: true });
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener(
    BOOT_SPLASH_OWNED_EVENT,
    () => {
      ready = true;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', onClick, true);
      const target = pending;
      markBusy(null);
      if (target?.isConnected) target.click();
    },
    { once: true },
  );
}
