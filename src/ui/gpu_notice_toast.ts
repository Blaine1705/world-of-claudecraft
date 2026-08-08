// GPU notice: a one-time, dismissible, shell-level toast shown when the session
// runs on a software rasterizer (WARP, SwiftShader, llvmpipe) or, inside the
// desktop shell, when the machine has a dedicated GPU the session is not using.
// Since Chromium 141 removed the automatic SwiftShader fallback, the Windows
// no-GPU shape is the D3D11 WARP device: the game still boots and plays (low
// tier), but at a slideshow frame rate with no explanation; this toast is that
// explanation. State transitions live in the pure view-core
// (src/ui/gpu_notice_view.ts); this module is the thin DOM consumer (it owns a
// fixed-position element on document.body; styles in src/styles/shell.css
// "software rendering notice" section). It works on both the pre-game shell
// and in-world, like the desktop update toast it is modeled on.
//
// The desktop shell publishes its verdict over the bridge, which can land
// EITHER before this notice inits (the shell integration boots long before the
// renderer exists) or after it. Both orders are supported: a pre-init verdict
// is held here and folded into initGpuNotice, and a post-init verdict re-runs
// the resolve and builds the DOM lazily if the notice becomes shown.

import {
  dismissGpuNotice,
  formatGpuNoticeSignature,
  type GpuNoticeState,
  type GpuNoticeVerdict,
  gpuNoticeBodyKey,
  mergeGpuNoticeVerdicts,
  resolveGpuNotice,
} from './gpu_notice_view';
import { t } from './i18n';

// Per-install dismissal: the notice explains a machine-level condition, so once
// a player has read it, never nag again for the SAME verdict (the stored value
// is the dismissed-component signature; a verdict that adds a component
// re-arms). A session-only fallback applies when storage is unavailable, e.g.
// hardened private modes.
const DISMISSED_KEY = 'woc_gpu_notice_dismissed';

const NO_VERDICT: GpuNoticeVerdict = { softwareRendering: false, discreteInactive: false };

function readDismissedSignature(): string {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(DISMISSED_KEY)) || '';
  } catch {
    return '';
  }
}

function writeDismissedSignature(value: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // Storage unavailable: the in-memory dismissal still hides it this session.
  }
}

// The shell verdict, OR-accumulated across pushes: a machine-level condition
// does not un-arm mid-session, and accumulating keeps a later partial payload
// from dropping a component that already fired. Held at module scope so it
// survives the init race in either direction.
let shellVerdict: GpuNoticeVerdict = NO_VERDICT;

// The live notice instance's re-resolve hook, or null before initGpuNotice runs.
let applyShellVerdict: ((verdict: GpuNoticeVerdict) => void) | null = null;

// Which components were actually DISPLAYED this session, latched true and never
// cleared by a dismissal: the perf-nudge sibling suppresses its redundant arms
// on "the boot notice already said this" (packet 0 ruling R16), which stays
// true after the player closes the notice. Reset by initGpuNotice (a new boot).
let displayed: GpuNoticeVerdict = NO_VERDICT;

/** Which verdict components this session actually showed the player. */
export function gpuNoticeDisplayed(): GpuNoticeVerdict {
  return { ...displayed };
}

/**
 * The desktop shell's GPU verdict arrived. Before initGpuNotice it is held for
 * the notice to fold in; after it, the live notice re-resolves and appears if
 * the new component is not already covered by a persisted dismissal.
 */
export function updateGpuNoticeShellVerdict(verdict: GpuNoticeVerdict): void {
  shellVerdict = mergeGpuNoticeVerdicts(shellVerdict, verdict);
  applyShellVerdict?.(shellVerdict);
}

// Returns true when the notice was shown by this init call. Whether a component
// was ever displayed (including by a later shell verdict) is gpuNoticeDisplayed.
export function initGpuNotice(input: {
  softwareRendering: boolean;
  discreteInactive?: boolean;
  desktopShell: boolean;
}): boolean {
  // A fresh boot: drop any previous instance and per-session display latch.
  applyShellVerdict = null;
  displayed = NO_VERDICT;

  const localVerdict: GpuNoticeVerdict = {
    softwareRendering: input.softwareRendering,
    discreteInactive: input.discreteInactive === true,
  };
  let verdict = mergeGpuNoticeVerdicts(localVerdict, shellVerdict);
  // Session fallback for the dismissal when storage writes are unavailable.
  let memoDismissed = '';
  const dismissedSignature = (): string => readDismissedSignature() || memoDismissed;

  let state: GpuNoticeState = resolveGpuNotice({
    ...verdict,
    dismissedSignature: dismissedSignature(),
  });

  let root: HTMLDivElement | null = null;
  let message: HTMLSpanElement | null = null;
  let dismissButton: HTMLButtonElement | null = null;

  const ensureDom = (): void => {
    if (root) return;
    root = document.createElement('div');
    root.id = 'gpu-notice';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.hidden = true;
    message = document.createElement('span');
    message.className = 'gpu-notice-message';
    dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'gpu-notice-dismiss';
    dismissButton.addEventListener('click', () => {
      const signature = formatGpuNoticeSignature(state.components);
      state = dismissGpuNotice(state);
      memoDismissed = signature;
      writeDismissedSignature(signature);
      render();
    });
    root.append(message, dismissButton);
    document.body.appendChild(root);
    // Locale flips re-render whatever is currently shown (the language selector
    // dispatches this on both the shell and the in-game options path). Bound
    // with the DOM so a session that never shows the notice adds no listener.
    document.addEventListener('woc:languagechange', render);
  };

  const render = (): void => {
    if (!state.shown) {
      if (root) root.hidden = true;
      return;
    }
    ensureDom();
    if (!root || !message || !dismissButton) return;
    root.hidden = false;
    message.textContent = t(gpuNoticeBodyKey(input.desktopShell, verdict));
    dismissButton.textContent = t('gpuNotice.dismiss');
    displayed = mergeGpuNoticeVerdicts(displayed, verdict);
  };

  applyShellVerdict = (next: GpuNoticeVerdict): void => {
    const merged = mergeGpuNoticeVerdicts(localVerdict, next);
    if (
      merged.softwareRendering === verdict.softwareRendering &&
      merged.discreteInactive === verdict.discreteInactive
    )
      return;
    verdict = merged;
    state = resolveGpuNotice({ ...verdict, dismissedSignature: dismissedSignature() });
    render();
  };

  render();
  return state.shown;
}
