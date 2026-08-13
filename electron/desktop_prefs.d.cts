// Hand-written declarations for electron/desktop_prefs.cjs so the Vitest suite
// (tests/electron_desktop_prefs.test.ts) type-checks its imports. Keep in sync
// with the .cjs exports (same convention as shell_guards.d.cts).

import type { WindowRect } from './window_memory.cjs';

export interface DesktopPrefs {
  version: number;
  maximized: boolean;
  gpuForceOptOut: boolean;
  windowBounds?: WindowRect;
  displayId?: number;
}

export interface DesktopPrefsReadDeps {
  statSync?: (filePath: string) => { size?: unknown; isFile?: () => boolean } | null;
  readFileSync?: (filePath: string, encoding: string) => unknown;
}

export interface DesktopPrefsWriteDeps {
  mkdirSync?: (dirPath: string, options: { recursive: boolean }) => unknown;
  writeFileSync?: (
    filePath: string,
    data: string,
    options: { encoding: string; flag: string },
  ) => void;
  renameSync?: (fromPath: string, toPath: string) => void;
  unlinkSync?: (filePath: string) => void;
  /** Injected only by tests, so a scratch path can be known in advance. */
  random?: () => number;
}

export const DESKTOP_PREFS_FILENAME: string;
export const DESKTOP_PREFS_VERSION: number;
export const MAX_PREFS_FILE_BYTES: number;
export function defaultDesktopPrefs(): DesktopPrefs;
export function desktopPrefsTempPath(filePath: string, random?: () => number): string;
export function sanitizeDesktopPrefs(input: unknown): DesktopPrefs;
export function loadDesktopPrefs(filePath: string, deps?: DesktopPrefsReadDeps): DesktopPrefs;
export function saveDesktopPrefs(
  filePath: string,
  prefs: unknown,
  deps?: DesktopPrefsWriteDeps,
): boolean;
