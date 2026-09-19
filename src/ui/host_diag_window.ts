// Options > System Report: the desktop-shell-only panel a player with
// performance trouble uses to produce one host diagnostic file and learn what to
// do with it. Nothing is uploaded: the shell writes a file the player chooses a
// folder for, and the player sends it on themselves.
//
// The thin painter half of the pure-core + thin-painter recipe
// (src/ui/CLAUDE.md): every decision about what the panel SAYS lives in
// host_diag_view.ts, and everything here is nodes, one click handler, and the
// tone class the model names. A sibling module the options window composes
// rather than another method cluster on that painter, which is at its line
// ceiling (tests/monolith_budget.test.ts).
//
// COLD by contract: no requestAnimationFrame, no interval, no forced-reflow
// layout read. The run is a single awaited bridge call, so the busy state is two
// class writes rather than a driver, and the button is never rebuilt, which is
// what keeps keyboard focus on it across a completed run.

import { audio } from '../game/audio';
import {
  assembleHostDiagGameInfo,
  type HostDiagGameSources,
  runDesktopHostDiag,
} from '../game/desktop_host_diag';
import { frameRateCapRowReading } from '../game/frame_cadence_wiring';
import { perfReportSessionId } from '../game/perf_reporter';
import { activeGpuRendererName, GFX, graphicsPresetLabel } from '../render/gfx';
import { zoneBiomeAt } from '../sim/world';
import { appVersionInfo } from './app_version';
import { esc } from './esc';
import {
  type HostDiagResultModel,
  type HostDiagState,
  hostDiagIdle,
  hostDiagRunning,
  hostDiagSettled,
} from './host_diag_view';
import { getLanguage, t } from './i18n';
import type { TranslationKey } from './i18n.catalog';
import { settingsCard } from './settings_controls';

/** The settings read this panel needs, which the live `Settings` store satisfies
 *  structurally (all three keys are numbers). */
export interface HostDiagSettingsRead {
  get(key: 'graphicsPreset' | 'renderScale' | 'frameRateCap'): number;
}

/** The window seam. `OptionsWindowDeps` satisfies this structurally, so the
 *  options painter hands its own deps bag over unchanged. */
export interface HostDiagPanelDeps {
  root(): HTMLElement;
  world(): { player: { pos: { x: number; z: number } } };
  options(): { settings: HostDiagSettingsRead } | null;
}

/** The two navigations the window owns (it holds the view state, not the panel). */
export interface HostDiagPanelNav {
  back(): void;
  close(): void;
}

// The report's own description, one bullet per family of readings the shell and
// its Windows half collect. Kept as a key list so the order is one thing to read
// and the copy stays entirely in the catalog.
const CONTENTS_KEYS: readonly TranslationKey[] = [
  'hudChrome.hostDiag.containsHardware',
  'hudChrome.hostDiag.containsWindows',
  'hudChrome.hostDiag.containsNvidia',
  'hudChrome.hostDiag.containsDisplays',
  'hudChrome.hostDiag.containsPrograms',
  'hudChrome.hostDiag.containsGame',
];

function note(parent: HTMLElement, text: string, className = 'set-note'): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

/**
 * The game-side context the shell copies into the saved file. Resolved here
 * rather than in main.ts: every reading is either a module-level accessor or one
 * hop off the window's own deps, so the panel needs no new wiring.
 *
 * `sessionId` is the load-bearing field: it is the perf-report session id, which
 * is what joins this file to the automatic performance reports of the same
 * session. `glVendor` is deliberately absent, see the module note in
 * tests/desktop_host_diag.test.ts: the vendor string lives only on the live
 * Renderer instance, which this panel has no seam to, while the shell reads the
 * full adapter list from Electron itself, so nothing is lost.
 */
function gameSources(deps: HostDiagPanelDeps): HostDiagGameSources {
  const { version, build } = appVersionInfo();
  const settings = deps.options()?.settings ?? null;
  const reading = settings ? frameRateCapRowReading(settings.get('frameRateCap')) : null;
  const pos = deps.world().player.pos;
  return {
    sessionId: perfReportSessionId(),
    releaseVersion: version,
    buildId: build,
    graphicsPreset: settings ? graphicsPresetLabel(settings.get('graphicsPreset')) : null,
    gfxTier: GFX.tier,
    glRenderer: activeGpuRendererName() ?? null,
    renderScale: settings ? settings.get('renderScale') : null,
    targetFps: reading && 'fps' in reading ? reading.fps : null,
    zone: zoneBiomeAt(pos.x, pos.z),
    locale: getLanguage(),
  };
}

/**
 * Paint the panel into an already-mounted window body. Returns nothing: the
 * panel owns its own run state for as long as its nodes are connected, and a
 * navigation away simply discards them (a settled run whose nodes have gone
 * writes nothing).
 */
export function renderHostDiagPanel(
  body: HTMLElement,
  deps: HostDiagPanelDeps,
  nav: HostDiagPanelNav,
): void {
  body.classList.add('hostdiag-options');
  note(body, t('hudChrome.hostDiag.intro'));

  const card = settingsCard(body, t('hudChrome.hostDiag.containsTitle'), {
    className: 'hostdiag-card',
  });
  const list = document.createElement('ul');
  list.className = 'hostdiag-list';
  list.setAttribute('role', 'list');
  for (const key of CONTENTS_KEYS) {
    const item = document.createElement('li');
    item.textContent = t(key);
    list.appendChild(item);
  }
  card.appendChild(list);

  note(body, t('hudChrome.hostDiag.privacy'), 'set-note hostdiag-privacy');

  const action = document.createElement('div');
  action.className = 'hostdiag-action';
  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'btn ui-btn ui-btn--gold';
  create.textContent = t('hudChrome.hostDiag.create');
  action.appendChild(create);
  body.appendChild(action);

  // ONE polite live region carries both the in-flight line and the verdict, so a
  // screen reader hears the run start and the run end from the same place. It is
  // created empty and stays in the DOM for the panel's whole life: a region
  // inserted together with its text is not reliably announced.
  const live = document.createElement('div');
  live.className = 'hostdiag-live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const message = document.createElement('div');
  message.className = 'hostdiag-message';
  const detail = document.createElement('div');
  detail.className = 'hostdiag-detail';
  live.append(message, detail);
  body.appendChild(live);

  note(body, t('hudChrome.hostDiag.sendHint'));

  const TONE_CLASSES = ['is-success', 'is-info', 'is-warning', 'is-error'] as const;
  const paintResult = (model: HostDiagResultModel | null): void => {
    for (const cls of TONE_CLASSES) live.classList.remove(cls);
    if (!model) {
      message.textContent = '';
      detail.textContent = '';
      return;
    }
    live.classList.add(`is-${model.tone}`);
    // esc() on the resolved line: it is written as HTML so an interpolated file
    // name the shell handed back can never be markup (the one untrusted value
    // this panel prints).
    message.innerHTML = esc(t(model.messageKey, model.messageValues));
    detail.textContent = model.detailKey ? t(model.detailKey) : '';
  };

  let state: HostDiagState = hostDiagIdle();
  const paint = (): void => {
    const running = state.phase === 'running';
    create.disabled = running;
    create.setAttribute('aria-busy', String(running));
    if (running) {
      for (const cls of TONE_CLASSES) live.classList.remove(cls);
      live.classList.add('is-info');
      message.textContent = t('hudChrome.hostDiag.running');
      detail.textContent = '';
      return;
    }
    paintResult(state.result);
  };
  paint();

  create.addEventListener('click', () => {
    if (state.phase === 'running') return;
    audio.click();
    state = hostDiagRunning();
    paint();
    void runDesktopHostDiag(assembleHostDiagGameInfo(gameSources(deps))).then((result) => {
      // The run outlives a navigation away (the save dialog is the player's to
      // answer), so a settled request whose nodes have gone writes nothing.
      if (!body.isConnected) return;
      state = hostDiagSettled(result);
      paint();
    });
  });

  // Pinned under the scroller like every other options sub-view: the panel runs
  // long enough that Back must not scroll away (the window-shell rule).
  const footer = document.createElement('div');
  footer.className = 'options-footer ui-win-foot';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn ui-btn';
  back.textContent = t('hud.options.back');
  back.addEventListener('click', () => nav.back());
  footer.appendChild(back);
  const root = deps.root();
  root.appendChild(footer);
  root.querySelector('[data-close]')?.addEventListener('click', () => nav.close());
}
