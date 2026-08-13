// The desktop shell's GPU preference, seen from the renderer.
//
// The Electron shell asks the OS for the dedicated gaming GPU at launch. A
// MUXless laptop panel cannot always drive that adapter, so the shell prefs
// store keeps an opt-out that applies on the NEXT launch. This module owns the
// renderer half of that contract: whether the installed shell exposes the
// preference at all, and reflecting the STORED value into the local setting so
// the options row shows what the next launch will do.
//
// The renderer setting (forceHighPerfGpu, default true) and the shell store
// field (gpuForceOptOut, default false) are INVERSES: forcing the GPU on means
// opting out is off. Every crossing inverts exactly once: here on the way in,
// and in the options write arm (main.ts applySetting) on the way out.
//
// Lives in src/game so main.ts stays a firewall (composition only), beside the
// other bridge consumers (desktop_gpu_status.ts, desktop_presentation.ts).

import type { DesktopBridge } from '../runtime';

/** The minimal settings writer this module needs (the live Settings store). */
export interface DesktopGpuPrefSettings {
  set(key: 'forceHighPerfGpu', value: boolean): boolean;
}

/**
 * True when the installed shell exposes BOTH halves of the preference. The
 * options row is gated on this, never on isNativeAppShell(): that flag is also
 * true in the mobile Capacitor shells, and a desktop shell installed before the
 * preference shipped exposes neither method, so the row would be dead there.
 */
export function desktopGpuPrefSupported(bridge: DesktopBridge | null | undefined): boolean {
  return (
    typeof bridge?.getGpuForceOptOut === 'function' &&
    typeof bridge?.setGpuForceOptOut === 'function'
  );
}

/**
 * Reflect the shell's stored GPU preference into the local setting at boot, so
 * the options row reads what the next launch will do rather than a local guess.
 *
 * Writes settings.set DIRECTLY and deliberately NOT through the options
 * onSettingChange path: that arm pushes the value back to the shell, so routing
 * the reflection through it would echo the shell's own value straight back at
 * it. Absent method (older shell or plain browser), a rejected read, or a
 * non-boolean answer all write nothing and leave the stored value alone.
 */
export async function syncDesktopGpuPrefSetting(
  bridge: DesktopBridge | null | undefined,
  settings: DesktopGpuPrefSettings,
): Promise<void> {
  const read = bridge?.getGpuForceOptOut;
  if (typeof read !== 'function') return;
  let optOut: unknown;
  try {
    optOut = await read.call(bridge);
  } catch {
    // The shell is an independently updated binary: a failed read must leave
    // the stored setting untouched rather than assert a default over it.
    return;
  }
  if (typeof optOut !== 'boolean') return;
  settings.set('forceHighPerfGpu', !optOut);
}
