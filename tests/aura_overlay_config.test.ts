import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuraOverlayConfigStore,
  defaultAuraOverlayConfig,
  sanitizeAuraOverlayConfig,
} from '../src/ui/aura_overlay_config';

beforeEach(() => {
  const values = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
});

describe('aura overlay config', () => {
  it('defaults off with centered crescents and a compact icon row below the player', () => {
    expect(defaultAuraOverlayConfig('revenge_free')).toMatchObject({
      enabled: false,
      showIcon: true,
      showArcs: true,
      iconPosX: 0.42,
      iconPosY: 0.72,
      arcsPosX: 0.5,
      arcsPosY: 0.56,
      opacity: 0.7,
      scale: 1,
      arcsScale: 0.8,
      color: '#ffe14d',
    });
    const ids = [
      'revenge_free',
      'battle_trance',
      'raised_guard',
      'iron_resolve',
      'overpower_charge',
      'sudden_death',
      'victory_rush',
      'enrage',
    ] as const;
    const defaults = ids.map(defaultAuraOverlayConfig);
    expect(defaults.map((config) => config.arcsScale)).toEqual([
      0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5,
    ]);
    expect(defaults.every((config) => config.iconPosY === 0.72)).toBe(true);
    expect(defaultAuraOverlayConfig('raised_guard').iconPosX).toBe(0.5);
    expect(defaultAuraOverlayConfig('iron_resolve').iconPosX).toBe(0.58);
    expect(defaults.every((config) => config.arcsPosX === 0.5 && config.arcsPosY === 0.56)).toBe(
      true,
    );
  });

  it('clamps malformed values and rejects invalid colors', () => {
    expect(
      sanitizeAuraOverlayConfig('revenge_free', {
        posX: 9,
        posY: -2,
        opacity: 0,
        scale: 99,
        arcsScale: 0,
        enabled: 'yes',
        color: 'red',
      }),
    ).toMatchObject({
      iconPosX: 1,
      iconPosY: 0,
      arcsPosX: 1,
      arcsPosY: 0,
      opacity: 0.25,
      scale: 1.6,
      arcsScale: 0.65,
      enabled: false,
      color: '#ffe14d',
    });
  });

  it('persists independently per character and proc', () => {
    const raido = new AuraOverlayConfigStore('warrior:Raido');
    raido.patch('revenge_free', {
      iconPosX: 0.25,
      arcsPosX: 0.35,
      opacity: 0.5,
      scale: 0.8,
      arcsScale: 1.4,
      color: '#123abc',
    });
    raido.patch('victory_rush', { iconPosX: 0.75 });

    expect(new AuraOverlayConfigStore('warrior:Raido').get('revenge_free')).toMatchObject({
      iconPosX: 0.25,
      arcsPosX: 0.35,
      scale: 0.8,
      arcsScale: 1.4,
      color: '#123abc',
    });
    expect(new AuraOverlayConfigStore('warrior:Raido').get('victory_rush').iconPosX).toBe(0.75);
    expect(new AuraOverlayConfigStore('warrior:Other').get('revenge_free').iconPosX).toBe(0.42);
  });

  it('recovers from corrupt stored JSON', () => {
    localStorage.setItem('woc_aura_overlays:warrior:Raido', '{broken');
    const store = new AuraOverlayConfigStore('warrior:Raido');
    expect(store.get('revenge_free')).toEqual(defaultAuraOverlayConfig('revenge_free'));
    store.patch('revenge_free', { iconPosX: 0.64 });
    expect(new AuraOverlayConfigStore('warrior:Raido').get('revenge_free').iconPosX).toBe(0.64);
  });

  it('resets only position without changing appearance', () => {
    const store = new AuraOverlayConfigStore('warrior:Raido');
    store.patch('revenge_free', {
      iconPosX: 0.1,
      iconPosY: 0.9,
      arcsPosX: 0.2,
      arcsPosY: 0.8,
      opacity: 0.4,
      enabled: false,
    });
    expect(store.resetPosition('revenge_free')).toMatchObject({
      iconPosX: 0.42,
      iconPosY: 0.72,
      arcsPosX: 0.5,
      arcsPosY: 0.56,
      opacity: 0.4,
      enabled: false,
    });
  });

  it('migrates a legacy shared position to both independently movable parts', () => {
    localStorage.setItem(
      'woc_aura_overlays:warrior:Raido',
      JSON.stringify({ revenge_free: { posX: 0.2, posY: 0.7 } }),
    );
    expect(new AuraOverlayConfigStore('warrior:Raido').get('revenge_free')).toMatchObject({
      iconPosX: 0.2,
      iconPosY: 0.7,
      arcsPosX: 0.2,
      arcsPosY: 0.7,
    });
  });

  it('moves legacy default icons below the player without changing custom positions', () => {
    localStorage.setItem(
      'woc_aura_overlays:warrior:Raido',
      JSON.stringify({
        revenge_free: { iconPosX: 0.64 },
        raised_guard: { iconPosX: 0.61 },
      }),
    );
    const store = new AuraOverlayConfigStore('warrior:Raido');
    expect(store.get('revenge_free').iconPosX).toBe(0.42);
    expect(store.get('revenge_free').iconPosY).toBe(0.72);
    expect(store.get('raised_guard').iconPosX).toBe(0.61);
    store.patch('revenge_free', { iconPosX: 0.64 });
    expect(new AuraOverlayConfigStore('warrior:Raido').get('revenge_free').iconPosX).toBe(0.64);
  });

  it('migrates the previous default column but preserves an explicitly moved icon', () => {
    localStorage.setItem(
      'woc_aura_overlays:warrior:Raido',
      JSON.stringify({
        __layoutVersion: 2,
        revenge_free: { iconPosX: 0.54, iconPosY: 0.32 },
        raised_guard: { iconPosX: 0.61, iconPosY: 0.7 },
      }),
    );

    const store = new AuraOverlayConfigStore('warrior:Raido');

    expect(store.get('revenge_free')).toMatchObject({ iconPosX: 0.42, iconPosY: 0.72 });
    expect(store.get('raised_guard')).toMatchObject({ iconPosX: 0.61, iconPosY: 0.7 });
  });

  it('migrates the legacy shared size to icon and crescent sizes', () => {
    localStorage.setItem(
      'woc_aura_overlays:warrior:Raido',
      JSON.stringify({ revenge_free: { scale: 1.35 } }),
    );
    expect(new AuraOverlayConfigStore('warrior:Raido').get('revenge_free')).toMatchObject({
      scale: 1.35,
      arcsScale: 1.35,
    });
  });
});
