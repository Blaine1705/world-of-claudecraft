// One-call composition of the desktop-shell niceties the game client provides
// when running inside the Electron wrapper: pushing t()-localized strings for
// main-process dialogs and rendering the auto-update toast. src/main.ts calls
// this once (gated on DESKTOP_APP); every piece degrades to a no-op when the
// bridge or a bridge method is absent (older installed shell, plain browser).

import { desktopBridge } from '../runtime';
import { initDesktopUpdateToast } from '../ui/desktop_update_toast';
import { initDesktopDisplayChange } from './desktop_display_change';
import { initDesktopErrorRelay } from './desktop_error_relay';
import { initDesktopGpuStatus } from './desktop_gpu_status';
import { initDesktopNotifications } from './desktop_notifications';
import { initDesktopPresentation } from './desktop_presentation';
import { initDesktopShellStrings } from './desktop_shell_strings';

export function initDesktopShellIntegration(): void {
  const bridge = desktopBridge();
  if (!bridge) return;
  // Error relay first: its listeners should exist before anything else runs.
  initDesktopErrorRelay(bridge);
  initDesktopShellStrings(bridge);
  initDesktopUpdateToast(bridge);
  // Subscribes early on purpose: the shell's GPU verdict can arrive long before
  // the renderer (and therefore the notice) exists, and this latches it.
  initDesktopGpuStatus(bridge);
  // Both subscribe at composition time for the same reason: neither push has any
  // replay, so a change arriving before the subscription exists is simply lost.
  initDesktopDisplayChange(bridge);
  initDesktopPresentation(bridge);
  // Last, so the reading order mirrors the data flow: its away-gate reads the
  // presentation latch initDesktopPresentation subscribes above. The position
  // is defensive rather than load-bearing: every init here runs synchronously
  // in one task, and notification decisions only happen inside later bridge
  // callbacks and frame scans.
  initDesktopNotifications(bridge);
}
