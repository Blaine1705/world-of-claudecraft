import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DESKTOP_PREFS_FILENAME,
  DESKTOP_PREFS_VERSION,
  defaultDesktopPrefs,
  loadDesktopPrefs,
  MAX_PREFS_FILE_BYTES,
  sanitizeDesktopPrefs,
  saveDesktopPrefs,
} from '../electron/desktop_prefs.cjs';

// The prefs file is the shell's only piece of persistence and it is UNTRUSTED
// input (a user-writable path, hand-editable, truncatable by a crash), so every
// arm below is about the loader refusing to trust it: never throwing, never
// handing back file content, and always answering a complete object the boot
// path can read fields off blindly.

const scratch = mkdtempSync(join(tmpdir(), 'woc-desktop-prefs-'));
const scratchPath = (name: string) => join(scratch, name);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('desktop prefs schema', () => {
  it('pins the stored filename and schema version to their literals', () => {
    // Both are on-disk contract: main.cjs joins the filename onto userData, and
    // the version decides whether a file is honored at all.
    expect(DESKTOP_PREFS_FILENAME).toBe('desktop-prefs.json');
    expect(DESKTOP_PREFS_VERSION).toBe(1);
    expect(MAX_PREFS_FILE_BYTES).toBe(65536);
  });

  it('defaults to no window memory, not maximized, GPU force ON', () => {
    // The GPU force is the shipped behavior; the opt-out is opt-IN, so a fresh
    // or unusable store must never read as "the player asked to disable it".
    expect(defaultDesktopPrefs()).toEqual({
      version: 1,
      maximized: false,
      gpuForceOptOut: false,
    });
  });

  it('accepts exactly the whitelisted fields and drops everything else', () => {
    const prefs = sanitizeDesktopPrefs({
      version: 1,
      windowBounds: { x: 40, y: 60, width: 1600, height: 1000 },
      displayId: 12345,
      maximized: true,
      gpuForceOptOut: true,
      // Junk a hand-edited file could carry; none of it may survive.
      apiOrigin: 'https://evil.example',
      extra: 'nope',
    });
    expect(prefs).toEqual({
      version: 1,
      windowBounds: { x: 40, y: 60, width: 1600, height: 1000 },
      displayId: 12345,
      maximized: true,
      gpuForceOptOut: true,
    });
    expect(Object.keys(prefs).sort()).toEqual([
      'displayId',
      'gpuForceOptOut',
      'maximized',
      'version',
      'windowBounds',
    ]);
  });

  it('never returns or mutates the parsed object', () => {
    // The returned object is handed to main.cjs, which mutates it all session;
    // a shared reference would mean file content living on inside live state.
    const parsed = {
      version: 1,
      windowBounds: { x: 10, y: 20, width: 1200, height: 800 },
      maximized: false,
      gpuForceOptOut: false,
    };
    const prefs = sanitizeDesktopPrefs(parsed);
    expect(prefs).not.toBe(parsed);
    expect(prefs.windowBounds).not.toBe(parsed.windowBounds);
    prefs.gpuForceOptOut = true;
    if (prefs.windowBounds) prefs.windowBounds.x = 999;
    expect(parsed.gpuForceOptOut).toBe(false);
    expect(parsed.windowBounds.x).toBe(10);
  });

  it('rejects a non-object root', () => {
    for (const junk of [null, undefined, 42, 'prefs', [1, 2, 3], true]) {
      expect(sanitizeDesktopPrefs(junk)).toEqual(defaultDesktopPrefs());
    }
  });

  it('discards a file stamped with an unknown schema version', () => {
    const stored = {
      version: 2,
      windowBounds: { x: 10, y: 20, width: 1200, height: 800 },
      displayId: 7,
      maximized: true,
      gpuForceOptOut: true,
    };
    expect(sanitizeDesktopPrefs(stored)).toEqual(defaultDesktopPrefs());
    expect(sanitizeDesktopPrefs({ ...stored, version: '1' })).toEqual(defaultDesktopPrefs());
    // An ABSENT version is honored: every field is validated on its own merits.
    const { version: _dropped, ...unversioned } = stored;
    expect(sanitizeDesktopPrefs(unversioned).displayId).toBe(7);
  });

  it('takes booleans strictly, per field', () => {
    // One arm per field: a shared truthiness helper that regressed on one call
    // site would still pass a test that only exercised the other.
    for (const truthy of ['true', 1, {}, 'yes']) {
      expect(sanitizeDesktopPrefs({ version: 1, maximized: truthy }).maximized).toBe(false);
      expect(sanitizeDesktopPrefs({ version: 1, gpuForceOptOut: truthy }).gpuForceOptOut).toBe(
        false,
      );
    }
    expect(sanitizeDesktopPrefs({ version: 1, maximized: true }).maximized).toBe(true);
    expect(sanitizeDesktopPrefs({ version: 1, gpuForceOptOut: true }).gpuForceOptOut).toBe(true);
    expect(sanitizeDesktopPrefs({ version: 1, maximized: false }).maximized).toBe(false);
  });

  it('drops window bounds unless every field is a finite integer', () => {
    const good = { x: 0, y: 0, width: 1440, height: 900 };
    expect(sanitizeDesktopPrefs({ version: 1, windowBounds: good }).windowBounds).toEqual(good);
    // One bad field per case, so each field's check is exercised on its own.
    for (const bad of [
      { ...good, x: Number.NaN },
      { ...good, y: Number.POSITIVE_INFINITY },
      { ...good, width: 1440.5 },
      { ...good, height: '900' },
      { x: 0, y: 0, width: 1440 },
      'bounds',
      null,
    ]) {
      expect(
        sanitizeDesktopPrefs({ version: 1, windowBounds: bad }).windowBounds,
        `bounds should have been dropped: ${JSON.stringify(bad)}`,
      ).toBeUndefined();
    }
  });

  it('clamps sizes to the window minimums and the sanity ceiling', () => {
    const tiny = sanitizeDesktopPrefs({
      version: 1,
      windowBounds: { x: 0, y: 0, width: 10, height: 10 },
    }).windowBounds;
    expect(tiny).toEqual({ x: 0, y: 0, width: 1024, height: 720 });
    const huge = sanitizeDesktopPrefs({
      version: 1,
      windowBounds: { x: 99999, y: -99999, width: 99999, height: 99999 },
    }).windowBounds;
    expect(huge).toEqual({ x: 32767, y: -32768, width: 16384, height: 16384 });
  });

  it('keeps a non-integer displayId out of the store', () => {
    expect(sanitizeDesktopPrefs({ version: 1, displayId: 'primary' }).displayId).toBeUndefined();
    expect(sanitizeDesktopPrefs({ version: 1, displayId: 1.5 }).displayId).toBeUndefined();
    expect(sanitizeDesktopPrefs({ version: 1, displayId: 0 }).displayId).toBe(0);
  });
});

describe('loadDesktopPrefs', () => {
  it('answers defaults for a file that does not exist', () => {
    expect(loadDesktopPrefs(scratchPath('missing.json'))).toEqual(defaultDesktopPrefs());
  });

  it('round-trips a real save through a real file', () => {
    const filePath = scratchPath('nested/roundtrip.json');
    const saved = {
      version: 1,
      windowBounds: { x: 120, y: 80, width: 1600, height: 1000 },
      displayId: 4242,
      maximized: true,
      gpuForceOptOut: true,
    };
    expect(saveDesktopPrefs(filePath, saved)).toBe(true);
    // mkdir recursive: the userData subdirectory may not exist on a first run.
    expect(existsSync(filePath)).toBe(true);
    // Expectation built fresh, never compared against the object we passed in.
    expect(loadDesktopPrefs(filePath)).toEqual({
      version: 1,
      windowBounds: { x: 120, y: 80, width: 1600, height: 1000 },
      displayId: 4242,
      maximized: true,
      gpuForceOptOut: true,
    });
  });

  it('answers defaults for unparseable JSON', () => {
    const filePath = scratchPath('corrupt.json');
    writeFileSync(filePath, '{"version": 1, "maximi', 'utf8');
    expect(loadDesktopPrefs(filePath)).toEqual(defaultDesktopPrefs());
  });

  it('answers defaults for a JSON root that is not an object', () => {
    const filePath = scratchPath('array.json');
    writeFileSync(filePath, '[1,2,3]', 'utf8');
    expect(loadDesktopPrefs(filePath)).toEqual(defaultDesktopPrefs());
  });

  it('refuses an oversized file WITHOUT parsing it', () => {
    const filePath = scratchPath('huge.json');
    // Valid JSON that would otherwise load cleanly, padded past the cap: the
    // size gate must win, so this cannot pass by way of a parse failure.
    const padding = ' '.repeat(MAX_PREFS_FILE_BYTES + 1);
    writeFileSync(filePath, `{"version":1,"gpuForceOptOut":true}${padding}`, 'utf8');
    expect(loadDesktopPrefs(filePath)).toEqual(defaultDesktopPrefs());
    // The same content under the cap DOES load, proving the size is the reason.
    const smallPath = scratchPath('small.json');
    writeFileSync(smallPath, '{"version":1,"gpuForceOptOut":true}', 'utf8');
    expect(loadDesktopPrefs(smallPath).gpuForceOptOut).toBe(true);
  });

  it('never throws when the filesystem does', () => {
    const boom = () => {
      throw new Error('EACCES');
    };
    expect(loadDesktopPrefs('/nope/prefs.json', { statSync: boom })).toEqual(defaultDesktopPrefs());
    expect(
      loadDesktopPrefs('/nope/prefs.json', { statSync: () => ({ size: 10 }), readFileSync: boom }),
    ).toEqual(defaultDesktopPrefs());
  });
});

describe('saveDesktopPrefs', () => {
  it('writes through a temp file and renames it over the target', () => {
    const calls: string[] = [];
    const filePath = '/userdata/desktop-prefs.json';
    const ok = saveDesktopPrefs(
      filePath,
      { version: 1, gpuForceOptOut: true },
      {
        mkdirSync: (dir, options) => calls.push(`mkdir:${dir}:${options.recursive}`),
        writeFileSync: (target, data) => calls.push(`write:${target}:${data}`),
        renameSync: (from, to) => calls.push(`rename:${from}:${to}`),
      },
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([
      'mkdir:/userdata:true',
      'write:/userdata/desktop-prefs.json.tmp:{"version":1,"maximized":false,"gpuForceOptOut":true}',
      'rename:/userdata/desktop-prefs.json.tmp:/userdata/desktop-prefs.json',
    ]);
  });

  it('validates on the way OUT, so junk is never persisted', () => {
    const filePath = scratchPath('sanitized.json');
    expect(
      saveDesktopPrefs(filePath, {
        version: 1,
        windowBounds: { x: 5, y: 5, width: 10, height: 10 },
        displayId: 'primary',
        maximized: 'yes',
        gpuForceOptOut: true,
        secret: 'do not persist me',
      }),
    ).toBe(true);
    const raw = readFileSync(filePath, 'utf8');
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('primary');
    expect(JSON.parse(raw)).toEqual({
      version: 1,
      windowBounds: { x: 5, y: 5, width: 1024, height: 720 },
      maximized: false,
      gpuForceOptOut: true,
    });
  });

  it('reports false (and never throws) on every write failure', () => {
    const boom = () => {
      throw new Error('EROFS');
    };
    const noop = () => {};
    const prefs = { version: 1, gpuForceOptOut: true };
    // One failing dependency per case: a single catch that only covered the
    // write would still pass a test that only broke the write.
    expect(saveDesktopPrefs('/x/prefs.json', prefs, { mkdirSync: boom })).toBe(false);
    expect(saveDesktopPrefs('/x/prefs.json', prefs, { mkdirSync: noop, writeFileSync: boom })).toBe(
      false,
    );
    expect(
      saveDesktopPrefs('/x/prefs.json', prefs, {
        mkdirSync: noop,
        writeFileSync: noop,
        renameSync: boom,
      }),
    ).toBe(false);
    // All three healthy: the same call reports true, so the arms above fail for
    // the injected reason and not because the shape was wrong.
    expect(
      saveDesktopPrefs('/x/prefs.json', prefs, {
        mkdirSync: noop,
        writeFileSync: noop,
        renameSync: noop,
      }),
    ).toBe(true);
  });
});
