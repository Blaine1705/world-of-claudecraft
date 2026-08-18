import { describe, expect, it } from 'vitest';
import { isBootMuted, isMutedVolumeKey, MUTED_VOLUME_KEYS } from '../src/game/boot_mute';

describe('isBootMuted', () => {
  it('is off with no flag', () => {
    expect(isBootMuted('')).toBe(false);
    expect(isBootMuted('?perf=1')).toBe(false);
  });

  it('mutes on a bare ?mute', () => {
    expect(isBootMuted('?mute')).toBe(true);
  });

  it('mutes on the truthy spellings', () => {
    expect(isBootMuted('?mute=1')).toBe(true);
    expect(isBootMuted('?mute=true')).toBe(true);
    expect(isBootMuted('?mute=TRUE')).toBe(true);
  });

  it('stays UNmuted when pinned off, so the flag can be carried in a shared URL', () => {
    expect(isBootMuted('?mute=0')).toBe(false);
    expect(isBootMuted('?mute=false')).toBe(false);
    expect(isBootMuted('?mute=False')).toBe(false);
  });

  it('reads the flag alongside other query params', () => {
    expect(isBootMuted('?perf=1&mute=1&diagnostics=1')).toBe(true);
    expect(isBootMuted('?perf=1&diagnostics=1')).toBe(false);
  });

  it('survives a malformed query string rather than throwing at boot', () => {
    expect(isBootMuted('%')).toBe(false);
  });
});

describe('isMutedVolumeKey', () => {
  it('covers every audio channel, so nothing keeps playing under the flag', () => {
    expect([...MUTED_VOLUME_KEYS].sort()).toEqual(['musicVolume', 'sfxVolume', 'voiceVolume']);
    for (const key of MUTED_VOLUME_KEYS) expect(isMutedVolumeKey(key)).toBe(true);
  });

  it('leaves non-audio settings alone', () => {
    expect(isMutedVolumeKey('cameraSpeed')).toBe(false);
    expect(isMutedVolumeKey('graphicsPreset')).toBe(false);
  });
});

// The flag is only useful if it reaches the values main.ts pushes into the audio
// subsystems, so drive the real Settings rather than the predicate alone.
describe('Settings under the mute flag', () => {
  function withSearch<T>(search: string, run: () => T): T {
    const had = Object.hasOwn(globalThis, 'location');
    const prev = (globalThis as { location?: unknown }).location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { search } });
    try {
      return run();
    } finally {
      if (had) Object.defineProperty(globalThis, 'location', { configurable: true, value: prev });
      else delete (globalThis as { location?: unknown }).location;
    }
  }

  it('reports every audio channel as silent', async () => {
    const { Settings } = await import('../src/game/settings');
    withSearch('?mute=1', () => {
      const s = new Settings();
      expect(s.isMuted()).toBe(true);
      for (const key of MUTED_VOLUME_KEYS) expect(s.get(key)).toBe(0);
      // all() is a separate read path and feeds the startup apply-all loop, so it
      // has to agree or the sliders would push a non-zero level back out.
      const all = s.all();
      for (const key of MUTED_VOLUME_KEYS) expect(all[key]).toBe(0);
    });
  });

  it('leaves non-audio settings untouched', async () => {
    const { Settings } = await import('../src/game/settings');
    withSearch('?mute=1', () => {
      expect(new Settings().get('cameraSpeed')).toBeGreaterThan(0);
    });
  });

  it('does NOT persist the silence: a normal boot is loud again', async () => {
    const { Settings } = await import('../src/game/settings');
    withSearch('?mute=1', () => {
      const muted = new Settings();
      expect(muted.get('musicVolume')).toBe(0);
    });
    withSearch('', () => {
      const normal = new Settings();
      expect(normal.isMuted()).toBe(false);
      expect(normal.get('musicVolume')).toBeGreaterThan(0);
    });
  });
});

// The first version of this flag only zeroed the settings volumes, and the
// landing-page theme and the music director both play through paths that never
// read them: the page still made noise. These pin every audio source.
describe('every audio source honours the flag', () => {
  function withSearch<T>(search: string, run: () => T): T {
    const had = Object.hasOwn(globalThis, 'location');
    const prev = (globalThis as { location?: unknown }).location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { search } });
    try {
      return run();
    } finally {
      if (had) Object.defineProperty(globalThis, 'location', { configurable: true, value: prev });
      else delete (globalThis as { location?: unknown }).location;
    }
  }

  it('clamps the SFX bus to silence whatever a caller asks for', async () => {
    const { sfx } = await import('../src/game/sfx');
    withSearch('?mute=1', () => {
      sfx.setVolume(1);
      expect((sfx as unknown as { vol: number }).vol).toBe(0);
    });
    withSearch('', () => {
      sfx.setVolume(0.8);
      expect((sfx as unknown as { vol: number }).vol).toBeCloseTo(0.8);
    });
  });

  it('clamps the voice bus the same way', async () => {
    const { voice } = await import('../src/game/voice');
    withSearch('?mute=1', () => {
      voice.setVolume(1);
      expect((voice as unknown as { vol: number }).vol).toBe(0);
    });
  });

  it('refuses to re-arm the music director while muted', async () => {
    const { music } = await import('../src/game/music');
    withSearch('?mute=1', () => {
      // setEnabled(true) is what the options toggle and the startup apply loop
      // both call; under the flag it must be inert rather than starting playback.
      music.setEnabled(true);
      expect(music.enabled).toBe(false);
    });
  });
});
