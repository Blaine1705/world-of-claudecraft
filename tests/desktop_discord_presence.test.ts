// Discord Rich Presence (src/game/discord_presence.ts): the published payload's
// PRIVACY FLOOR, the pure coalescer's every arm, the capability gate, the frame
// feed's throttle and dungeon hold, and textual pins on the two src/main.ts
// wiring sites (a wiring edit is exactly the regression a module suite cannot
// see; same house pattern as tests/desktop_display_mode_sync.test.ts).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildZoneActivity,
  createDiscordPresenceCore,
  type DiscordPresenceSnapshot,
  desktopDiscordPresenceSupported,
  desktopPresenceOnFrame,
  initDiscordPresence,
  pushDiscordPresenceEnabled,
} from '../src/game/discord_presence';
import { Settings } from '../src/game/settings';
import type { DesktopBridge, DesktopDiscordActivity } from '../src/runtime';
import { DUNGEON_X_THRESHOLD, zoneAt } from '../src/sim/data';
import { zoneDisplayName } from '../src/ui/entity_i18n';

const SESSION_START_SEC = 1_700_000_000;

const snapshot = (over: Partial<DiscordPresenceSnapshot> = {}): DiscordPresenceSnapshot => ({
  enabled: true,
  zoneId: 'zone_a',
  zoneName: 'Zone A',
  sessionStartSec: SESSION_START_SEC,
  ...over,
});

describe('buildZoneActivity: the published payload carries the zone and nothing else', () => {
  it('publishes EXACTLY details + timestamps.start', () => {
    // The privacy floor, pinned as a key set rather than a field spot-check: a
    // character name, an account id, or a party roster added to the activity
    // reds here before it can reach a public Discord profile.
    const activity = buildZoneActivity('Eastbrook Vale', SESSION_START_SEC);
    expect(Object.keys(activity)).toEqual(['details', 'timestamps']);
    expect(Object.keys(activity.timestamps ?? {})).toEqual(['start']);
    expect(activity).toEqual({
      details: 'Eastbrook Vale',
      timestamps: { start: SESSION_START_SEC },
    });
  });

  it('keeps that key set for a long non-Latin zone name (no locale-shaped extra fields)', () => {
    const activity = buildZoneActivity('ミレフェン湿地帯のとても長い地域名', SESSION_START_SEC);
    expect(Object.keys(activity)).toEqual(['details', 'timestamps']);
    expect(Object.keys(activity.timestamps ?? {})).toEqual(['start']);
    expect(activity.details).toBe('ミレフェン湿地帯のとても長い地域名');
  });

  it('passes the session start through in SECONDS, unrounded by the builder', () => {
    // Discord wants epoch seconds; a milliseconds value here would put the
    // elapsed clock ~54000 years in the future rather than fail loudly.
    expect(buildZoneActivity('Zone A', 1_700_000_123).timestamps?.start).toBe(1_700_000_123);
  });
});

describe('createDiscordPresenceCore: the coalescer', () => {
  it('emits the first zone immediately, at any clock value', () => {
    const core = createDiscordPresenceCore();
    expect(core.update(0, snapshot())).toEqual({
      kind: 'set',
      activity: { details: 'Zone A', timestamps: { start: SESSION_START_SEC } },
    });
  });

  it('dedups a zone it already published, however long it is polled', () => {
    const core = createDiscordPresenceCore();
    expect(core.update(0, snapshot())).not.toBeNull();
    expect(core.update(1_000, snapshot())).toBeNull();
    expect(core.update(60_000, snapshot())).toBeNull();
  });

  it('holds a new zone until the interval boundary, then publishes the LATEST one', () => {
    // Trailing edge: a player crossing three borders inside one window
    // publishes where they ENDED, not where they were when it opened.
    const core = createDiscordPresenceCore({ intervalMs: 15_000 });
    expect(core.update(0, snapshot())).not.toBeNull();
    expect(core.update(5_000, snapshot({ zoneId: 'zone_b', zoneName: 'Zone B' }))).toBeNull();
    expect(core.update(9_000, snapshot({ zoneId: 'zone_c', zoneName: 'Zone C' }))).toBeNull();
    expect(core.update(15_000, snapshot({ zoneId: 'zone_c', zoneName: 'Zone C' }))).toEqual({
      kind: 'set',
      activity: { details: 'Zone C', timestamps: { start: SESSION_START_SEC } },
    });
    // and the window reopens from the emit, not from the first poll
    expect(core.update(20_000, snapshot({ zoneId: 'zone_d', zoneName: 'Zone D' }))).toBeNull();
    expect(core.update(30_000, snapshot({ zoneId: 'zone_d', zoneName: 'Zone D' }))).toEqual({
      kind: 'set',
      activity: { details: 'Zone D', timestamps: { start: SESSION_START_SEC } },
    });
  });

  it('honors a custom interval (the boundary is >=, not >)', () => {
    const core = createDiscordPresenceCore({ intervalMs: 2_000 });
    expect(core.update(0, snapshot())).not.toBeNull();
    expect(core.update(1_999, snapshot({ zoneId: 'zone_b', zoneName: 'Zone B' }))).toBeNull();
    expect(core.update(2_000, snapshot({ zoneId: 'zone_b', zoneName: 'Zone B' }))).toMatchObject({
      kind: 'set',
    });
  });

  it('clears exactly once per disable transition, and not again while disabled', () => {
    const core = createDiscordPresenceCore();
    core.update(0, snapshot());
    expect(core.update(1_000, snapshot({ enabled: false }))).toEqual({ kind: 'clear' });
    expect(core.update(2_000, snapshot({ enabled: false }))).toBeNull();
    expect(core.update(60_000, snapshot({ enabled: false }))).toBeNull();
  });

  it('clears without waiting for the rate-limit window (the off switch is user intent)', () => {
    const core = createDiscordPresenceCore({ intervalMs: 15_000 });
    core.update(0, snapshot());
    expect(core.update(100, snapshot({ enabled: false }))).toEqual({ kind: 'clear' });
  });

  it('clears on a first-ever disabled poll (nothing here knows what is on the socket)', () => {
    const core = createDiscordPresenceCore();
    expect(core.update(0, snapshot({ enabled: false }))).toEqual({ kind: 'clear' });
    expect(core.update(1_000, snapshot({ enabled: false }))).toBeNull();
  });

  it('resends the current zone after a re-enable (the clear forgets what was published)', () => {
    const core = createDiscordPresenceCore({ intervalMs: 15_000 });
    core.update(0, snapshot());
    expect(core.update(1_000, snapshot({ enabled: false }))).toEqual({ kind: 'clear' });
    // the same zone as before: without the forget it would dedup into silence
    expect(core.update(20_000, snapshot())).toEqual({
      kind: 'set',
      activity: { details: 'Zone A', timestamps: { start: SESSION_START_SEC } },
    });
  });

  it('publishes nothing for an unknown zone, and leaves the dedup memory alone', () => {
    const core = createDiscordPresenceCore({ intervalMs: 1_000 });
    expect(core.update(0, snapshot({ zoneId: null, zoneName: null }))).toBeNull();
    expect(core.update(1_000, snapshot())).toMatchObject({ kind: 'set' });
    // an unknown zone mid-session neither clears nor forgets the published zone
    expect(core.update(2_000, snapshot({ zoneId: null, zoneName: null }))).toBeNull();
    expect(core.update(3_000, snapshot())).toBeNull();
  });
});

describe('desktopDiscordPresenceSupported: BOTH halves or nothing', () => {
  it('is true only when both bridge methods are functions', () => {
    const activity = () => {};
    const enabled = () => {};
    expect(desktopDiscordPresenceSupported(null)).toBe(false);
    expect(desktopDiscordPresenceSupported(undefined)).toBe(false);
    expect(desktopDiscordPresenceSupported({} as DesktopBridge)).toBe(false);
    expect(
      desktopDiscordPresenceSupported({ setDiscordActivity: activity } as unknown as DesktopBridge),
    ).toBe(false);
    expect(
      desktopDiscordPresenceSupported({
        setDiscordPresenceEnabled: enabled,
      } as unknown as DesktopBridge),
    ).toBe(false);
    expect(
      desktopDiscordPresenceSupported({
        setDiscordActivity: activity,
        setDiscordPresenceEnabled: enabled,
      } as unknown as DesktopBridge),
    ).toBe(true);
  });

  it('rejects non-function junk on either key (a shell that answers with data)', () => {
    expect(
      desktopDiscordPresenceSupported({
        setDiscordActivity: true,
        setDiscordPresenceEnabled: () => {},
      } as unknown as DesktopBridge),
    ).toBe(false);
    expect(
      desktopDiscordPresenceSupported({
        setDiscordActivity: () => {},
        setDiscordPresenceEnabled: 1,
      } as unknown as DesktopBridge),
    ).toBe(false);
  });
});

describe('pushDiscordPresenceEnabled: the options write', () => {
  it('forwards the choice with the SAME polarity on both sides', () => {
    const setDiscordPresenceEnabled = vi.fn();
    const bridge = {
      setDiscordActivity: vi.fn(),
      setDiscordPresenceEnabled,
    } as unknown as DesktopBridge;
    pushDiscordPresenceEnabled(bridge, true);
    pushDiscordPresenceEnabled(bridge, false);
    // Pinned in order: an inversion added here would still call twice.
    expect(setDiscordPresenceEnabled.mock.calls).toEqual([[true], [false]]);
  });

  it('is a no-op without a bridge or without the method (older shell, web build)', () => {
    expect(() => pushDiscordPresenceEnabled(null, true)).not.toThrow();
    expect(() => pushDiscordPresenceEnabled({} as DesktopBridge, true)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Composition: init + the frame feed, against a fake bridge, the REAL zone data
// and the REAL settings store.

// Every Settings construction parses the whole blob through exactly one
// getItem('woc_settings'), so counting those counts constructions.
const SETTINGS_STORE_KEY = 'woc_settings';
let settingsReads = 0;

function installStorage(): void {
  const map = new Map<string, string>();
  settingsReads = 0;
  const storage = {
    get length() {
      return map.size;
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (k: string) => {
      if (k === SETTINGS_STORE_KEY) settingsReads++;
      return map.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  } as Storage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
}

// Two real zones, derived from the live data rather than hard-coded, so a world
// edit cannot quietly turn these arms into a single-zone test.
const ZONE_A = zoneAt(0, 0);
const ZONE_B = zoneAt(0, 300);

let clock = 0;
// id defaults to a real local player id: both hosts number them from 1 up, and
// only the online pre-snapshot placeholder is non-positive.
const world = (x: number, z: number, id = 1) => ({ player: { id, pos: { x, z } } });

function makeBridge(): {
  bridge: DesktopBridge;
  setDiscordActivity: ReturnType<typeof vi.fn>;
  setDiscordPresenceEnabled: ReturnType<typeof vi.fn>;
} {
  const setDiscordActivity = vi.fn();
  const setDiscordPresenceEnabled = vi.fn();
  return {
    setDiscordActivity,
    setDiscordPresenceEnabled,
    bridge: {
      setDiscordActivity,
      setDiscordPresenceEnabled,
    } as unknown as DesktopBridge,
  };
}

describe('initDiscordPresence + desktopPresenceOnFrame', () => {
  beforeEach(() => {
    installStorage();
    clock = SESSION_START_SEC * 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanity: the two probe points are different real zones', () => {
    expect(ZONE_A.id).not.toBe(ZONE_B.id);
  });

  it('publishes the localized zone name and the session clock on the first frame', () => {
    const { bridge, setDiscordActivity } = makeBridge();
    initDiscordPresence(bridge);
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).toHaveBeenCalledTimes(1);
    const activity = setDiscordActivity.mock.calls[0][0] as DesktopDiscordActivity;
    expect(activity.details).toBe(zoneDisplayName(ZONE_A.id));
    // and it is the display name, never the raw content id
    expect(activity.details).not.toBe(ZONE_A.id);
    expect(activity.timestamps?.start).toBe(SESSION_START_SEC);
  });

  it('stays inert on a shell exposing only one half of the contract', () => {
    const setDiscordActivity = vi.fn();
    initDiscordPresence({ setDiscordActivity } as unknown as DesktopBridge);
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).not.toHaveBeenCalled();
  });

  it('polls at most once per second, whatever the frame rate', () => {
    const { bridge, setDiscordActivity } = makeBridge();
    initDiscordPresence(bridge);
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).toHaveBeenCalledTimes(1);

    // A disable 100ms later: a clear is NOT rate limited by the core, so the
    // only thing that can swallow it is the per-second frame throttle.
    pushDiscordPresenceEnabled(bridge, false);
    clock += 100;
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).toHaveBeenCalledTimes(1);

    clock += 1_000;
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).toHaveBeenCalledTimes(2);
    expect(setDiscordActivity).toHaveBeenLastCalledWith(null);
  });

  it('clears exactly once while the setting stays off', () => {
    const { bridge, setDiscordActivity } = makeBridge();
    new Settings().set('discordPresence', false);
    initDiscordPresence(bridge);
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity.mock.calls).toEqual([[null]]);
    clock += 30_000;
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity.mock.calls).toEqual([[null]]);
  });

  it('reconciles the shell with the stored choice once at init, both polarities', () => {
    // A shell store can disagree with the renderer's (cleared localStorage, a
    // reset prefs file, a previous install told "off"), and without this the
    // off switch would only hold from the first toggle rather than from boot.
    new Settings().set('discordPresence', false);
    const off = makeBridge();
    initDiscordPresence(off.bridge);
    expect(off.setDiscordPresenceEnabled.mock.calls).toEqual([[false]]);

    new Settings().set('discordPresence', true);
    const on = makeBridge();
    initDiscordPresence(on.bridge);
    expect(on.setDiscordPresenceEnabled.mock.calls).toEqual([[true]]);
  });

  it('never reconciles a shell that cannot serve presence', () => {
    const setDiscordPresenceEnabled = vi.fn();
    initDiscordPresence({ setDiscordPresenceEnabled } as unknown as DesktopBridge);
    expect(setDiscordPresenceEnabled).not.toHaveBeenCalled();
  });

  it('reads the settings store exactly once per session, never in the poll', () => {
    const { bridge } = makeBridge();
    settingsReads = 0;
    initDiscordPresence(bridge);
    expect(settingsReads).toBe(1);
    for (let i = 0; i < 5; i++) {
      clock += 1_100;
      desktopPresenceOnFrame(world(0, 0));
    }
    // Five polls later the store has still been read exactly that once: the
    // poll reads the cache, never a fresh Settings.
    expect(settingsReads).toBe(1);
  });

  it('takes a toggle through the push, with no settings read at all', () => {
    const { bridge, setDiscordActivity } = makeBridge();
    initDiscordPresence(bridge);
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).toHaveBeenCalledTimes(1);
    settingsReads = 0;

    // The push is the cache refresh: the poll must see the new value without
    // going back to the store (main.ts applySetting is the single write path,
    // and it is the only caller of the push).
    pushDiscordPresenceEnabled(bridge, false);
    clock += 1_100;
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).toHaveBeenLastCalledWith(null);

    // Past the rate-limit window, so the resend is the only thing under test.
    pushDiscordPresenceEnabled(bridge, true);
    clock += 20_000;
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).toHaveBeenCalledTimes(3);
    expect((setDiscordActivity.mock.calls[2][0] as DesktopDiscordActivity).details).toBe(
      zoneDisplayName(ZONE_A.id),
    );
    expect(settingsReads).toBe(0);
  });

  it('publishes nothing until the online world has a real local player', () => {
    // ClientWorld.player is blankEntity(-1) at the origin until the first
    // snapshot: publishing there would put everyone in the starting zone AND
    // burn the rate-limit window that the real zone then needs.
    const { bridge, setDiscordActivity } = makeBridge();
    initDiscordPresence(bridge);
    desktopPresenceOnFrame(world(0, 0, -1));
    expect(setDiscordActivity).not.toHaveBeenCalled();

    clock += 1_100;
    desktopPresenceOnFrame(world(0, 300, 7));
    expect(setDiscordActivity).toHaveBeenCalledTimes(1);
    expect((setDiscordActivity.mock.calls[0][0] as DesktopDiscordActivity).details).toBe(
      zoneDisplayName(ZONE_B.id),
    );
  });

  it('holds the last overworld zone while the player is inside an instance', () => {
    const { bridge, setDiscordActivity } = makeBridge();
    initDiscordPresence(bridge);
    desktopPresenceOnFrame(world(0, 0));
    expect(setDiscordActivity).toHaveBeenCalledTimes(1);

    // Inside the instance strip, at a z whose overworld band is the OTHER zone:
    // without the hold this frame would publish that zone instead.
    clock += 30_000;
    desktopPresenceOnFrame(world(DUNGEON_X_THRESHOLD + 100, 300));
    expect(setDiscordActivity).toHaveBeenCalledTimes(1);

    // Back outside, in that other zone: the feed resumes normally.
    clock += 30_000;
    desktopPresenceOnFrame(world(0, 300));
    expect(setDiscordActivity).toHaveBeenCalledTimes(2);
    expect((setDiscordActivity.mock.calls[1][0] as DesktopDiscordActivity).details).toBe(
      zoneDisplayName(ZONE_B.id),
    );
  });

  it('re-arms from scratch on a second init (no state carried across sessions)', () => {
    const first = makeBridge();
    initDiscordPresence(first.bridge);
    desktopPresenceOnFrame(world(0, 0));
    expect(first.setDiscordActivity).toHaveBeenCalledTimes(1);

    // An init on a shell that cannot serve presence disarms the feed, and the
    // previous session's bridge stops being written to.
    initDiscordPresence({} as DesktopBridge);
    clock += 60_000;
    desktopPresenceOnFrame(world(0, 300));
    expect(first.setDiscordActivity).toHaveBeenCalledTimes(1);

    const second = makeBridge();
    initDiscordPresence(second.bridge);
    desktopPresenceOnFrame(world(0, 0));
    expect(second.setDiscordActivity).toHaveBeenCalledTimes(1);
    expect(first.setDiscordActivity).toHaveBeenCalledTimes(1);
    // The elapsed clock is re-captured per session, never carried over: the
    // second session's start is its own init time.
    expect(
      (second.setDiscordActivity.mock.calls[0][0] as DesktopDiscordActivity).timestamps,
    ).toEqual({ start: Math.floor(clock / 1000) });
  });
});

// ---------------------------------------------------------------------------
// Wiring pins on src/main.ts. Comments are stripped before matching (the colon
// guard keeps `://` scheme literals intact) so a commented-out line can never
// satisfy a positive pin.

describe('discord presence: src/main.ts wiring pins', () => {
  // LINE comments first, then block comments, which is the opposite of the
  // sibling suites: main.ts contains a line comment that itself contains a `/*`
  // (prose about a route), and stripping blocks first makes that stray opener
  // swallow ~1900 real lines up to the next `*/`, silently voiding any pin
  // inside them. The `[^:]` guard keeps `://` scheme literals intact.
  const stripComments = (source: string): string =>
    source.replace(/(^|[^:])\/\/[^\n]*/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
  const mainSource = stripComments(readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8'));

  it('routes the options toggle through the push, same polarity end to end', () => {
    expect(mainSource).toContain("if (key === 'discordPresence') {");
    expect(mainSource).toContain(
      "pushDiscordPresenceEnabled(desktopBridge(), settings.set('discordPresence', !!value));",
    );
    // No inversion at this crossing (unlike the GPU preference beside it): a `!`
    // added in front of the stored value would tell the shell the opposite.
    expect(mainSource).not.toContain('pushDiscordPresenceEnabled(desktopBridge(), !settings.set(');
  });

  it('feeds the presence from BOTH frame paths, and only those two', () => {
    expect(mainSource.match(/desktopPresenceOnFrame\(/g) ?? []).toHaveLength(2);
    expect(mainSource).toContain('desktopPresenceOnFrame(offlineSim);');
  });

  it('gates the online feed on not spectating (a watched zone is not your zone)', () => {
    // Pinned as the whole statement: the gate and the call are one line, so a
    // dropped gate cannot survive the pin, and the call cannot drift out of it.
    expect(mainSource).toContain('if (net.spectating === null) desktopPresenceOnFrame(net);');
    const feedAt = mainSource.indexOf('desktopPresenceOnFrame(net)');
    const gateAt = mainSource.lastIndexOf('net.spectating === null', feedAt);
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(feedAt);
  });
});
