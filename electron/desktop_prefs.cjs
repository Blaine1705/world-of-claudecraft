'use strict';

// The desktop shell's own small preferences store: the handful of values the
// MAIN process needs before a renderer exists (window geometry, and whether the
// player opted out of the discrete-GPU force). Renderer-owned settings stay in
// the game's own settings store; nothing here is gameplay state.
//
// Two constraints shape the design:
//
//  1. It is read SYNCHRONOUSLY at the very top of main.cjs, before the Linux
//     PRIME relaunch decision and before the GPU switches are appended, because
//     both levers must run before Electron's own startup. A resolve plus a
//     small-file read plus JSON.parse measures well under a millisecond, so the
//     boot cost is noise; an async read would simply be too late.
//  2. The file is UNTRUSTED input. It sits in a user-writable directory and can
//     be hand-edited or truncated by a crash, so the loader never throws, never
//     returns (or mutates) the parsed object, and builds its answer FRESH from
//     whitelisted, individually validated fields. Nothing off the disk reaches a
//     window, an origin, a feed, or an IPC channel unvalidated.
//
// Writes are atomic (temp file plus rename) so a crash mid-write leaves the
// previous file intact rather than a half-written one that reads as corrupt.
// Pure and dependency-injected: tests/electron_desktop_prefs.test.ts exercises
// every arm with a real scratch directory and with throwing fake fs functions.

const nodeFs = require('node:fs');
const nodePath = require('node:path');
const {
  MAX_WINDOW_DIMENSION,
  MAX_WINDOW_POSITION,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_POSITION,
  MIN_WINDOW_WIDTH,
} = require('./window_memory.cjs');

// Bumped only when a field's MEANING changes. A file stamped with any other
// version is discarded wholesale rather than field-matched: a future build may
// reuse a name for something else, and defaults are always safe (worst case the
// player's window opens centered once).
const DESKTOP_PREFS_VERSION = 1;

const DESKTOP_PREFS_FILENAME = 'desktop-prefs.json';

// Same 64 KiB ceiling the server's readBody uses. The real file is a couple of
// hundred bytes; anything larger is a hand-edited or corrupt file, and the size
// is checked BEFORE the read/parse so a huge file is never brought into memory.
const MAX_PREFS_FILE_BYTES = 64 * 1024;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const isInteger = (value) => typeof value === 'number' && Number.isInteger(value);

/** Booleans are accepted strictly: 'true', 1, and null are junk, not true. */
const readBoolean = (value, fallback) => (value === true || value === false ? value : fallback);

/**
 * A window rect off disk, or null. Partial bounds are dropped whole: three of
 * four fields cannot place a window, and pairing a saved x with a default width
 * would restore a geometry no session ever had.
 */
function readWindowBounds(value) {
  if (!value || typeof value !== 'object') return null;
  const { x, y, width, height } = value;
  if (!isInteger(x) || !isInteger(y) || !isInteger(width) || !isInteger(height)) return null;
  return {
    x: clamp(x, MIN_WINDOW_POSITION, MAX_WINDOW_POSITION),
    y: clamp(y, MIN_WINDOW_POSITION, MAX_WINDOW_POSITION),
    width: clamp(width, MIN_WINDOW_WIDTH, MAX_WINDOW_DIMENSION),
    height: clamp(height, MIN_WINDOW_HEIGHT, MAX_WINDOW_DIMENSION),
  };
}

/** The prefs a first launch (or any unusable file) gets. */
function defaultDesktopPrefs() {
  return { version: DESKTOP_PREFS_VERSION, maximized: false, gpuForceOptOut: false };
}

/**
 * Build a complete, valid prefs object from arbitrary input. Always returns a
 * FRESH object (never the input, never a reference into it), so a caller can
 * hold and mutate the result without a path back to parsed file content. Used
 * on the way in AND on the way out, so junk can never be persisted either.
 *
 * windowBounds and displayId are omitted rather than defaulted: "no memory yet"
 * is a real state the restore resolver has to distinguish from "remembered".
 */
function sanitizeDesktopPrefs(input) {
  const prefs = defaultDesktopPrefs();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return prefs;
  // A version this build does not know (a newer file, or a hand-typed value):
  // discard everything. An ABSENT version is accepted, since every field below
  // is validated on its own merits anyway, and it is stamped current on save.
  if (input.version !== undefined && input.version !== DESKTOP_PREFS_VERSION) return prefs;
  const bounds = readWindowBounds(input.windowBounds);
  if (bounds) prefs.windowBounds = bounds;
  if (isInteger(input.displayId)) prefs.displayId = input.displayId;
  prefs.maximized = readBoolean(input.maximized, false);
  prefs.gpuForceOptOut = readBoolean(input.gpuForceOptOut, false);
  return prefs;
}

/**
 * Read the prefs file. NEVER throws and always answers a complete prefs object:
 * a missing file, an oversized one, unparseable JSON, a non-object root, and an
 * unknown schema version all resolve to defaults. Injectable fs for tests.
 */
function loadDesktopPrefs(filePath, deps = {}) {
  const statSync = deps.statSync ?? nodeFs.statSync;
  const readFileSync = deps.readFileSync ?? nodeFs.readFileSync;
  try {
    const stat = statSync(filePath);
    // Size first, so an absurd file is refused without ever being read.
    if (!stat || !isInteger(stat.size) || stat.size > MAX_PREFS_FILE_BYTES) {
      return defaultDesktopPrefs();
    }
    const text = readFileSync(filePath, 'utf8');
    if (typeof text !== 'string' || text.length > MAX_PREFS_FILE_BYTES) {
      return defaultDesktopPrefs();
    }
    return sanitizeDesktopPrefs(JSON.parse(text));
  } catch {
    // Missing file (the first launch), a permission error, a partial write: all
    // the same answer, because every one of them means "no usable memory".
    return defaultDesktopPrefs();
  }
}

/**
 * Persist the prefs. Atomic: the payload is written to a sibling temp file and
 * renamed over the target, so an interrupted write cannot leave a truncated
 * prefs file behind (rename is atomic within a directory on every platform we
 * ship). Never throws; returns whether the value actually landed on disk, which
 * is what the IPC setter reports to the renderer.
 */
function saveDesktopPrefs(filePath, prefs, deps = {}) {
  const mkdirSync = deps.mkdirSync ?? nodeFs.mkdirSync;
  const writeFileSync = deps.writeFileSync ?? nodeFs.writeFileSync;
  const renameSync = deps.renameSync ?? nodeFs.renameSync;
  try {
    const text = JSON.stringify(sanitizeDesktopPrefs(prefs));
    if (text.length > MAX_PREFS_FILE_BYTES) return false;
    mkdirSync(nodePath.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    writeFileSync(tempPath, text, 'utf8');
    renameSync(tempPath, filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  DESKTOP_PREFS_FILENAME,
  DESKTOP_PREFS_VERSION,
  MAX_PREFS_FILE_BYTES,
  defaultDesktopPrefs,
  sanitizeDesktopPrefs,
  loadDesktopPrefs,
  saveDesktopPrefs,
};
