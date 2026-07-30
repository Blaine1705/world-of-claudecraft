import type { WarriorProcId } from './aura_overlay_view';

export interface AuraOverlayConfig {
  enabled: boolean;
  showIcon: boolean;
  showArcs: boolean;
  iconPosX: number;
  iconPosY: number;
  arcsPosX: number;
  arcsPosY: number;
  opacity: number;
  scale: number;
  arcsScale: number;
  color: string;
}

export type AuraOverlayPatch = Partial<AuraOverlayConfig>;

const STORE_PREFIX = 'woc_aura_overlays:';
const LEGACY_DEFAULT_ICON_X = 0.64;
const PREVIOUS_DEFAULT_ICON_X = 0.54;
const DEFAULT_ICON_Y = 0.72;
const LAYOUT_VERSION = 3;

interface AuraOverlayDefaultLayout {
  iconX: number;
  arcsScale: number;
  color: string;
}

const PREVIOUS_DEFAULT_ICON_Y: Record<WarriorProcId, number> = {
  revenge_free: 0.32,
  battle_trance: 0.375,
  raised_guard: 0.43,
  iron_resolve: 0.485,
  overpower_charge: 0.54,
  sudden_death: 0.595,
  victory_rush: 0.65,
  enrage: 0.705,
};

const DEFAULT_LAYOUT: Record<WarriorProcId, AuraOverlayDefaultLayout> = {
  revenge_free: { iconX: 0.42, arcsScale: 0.8, color: '#ffe14d' },
  battle_trance: { iconX: 0.42, arcsScale: 0.9, color: '#3dc7ff' },
  raised_guard: { iconX: 0.5, arcsScale: 1, color: '#bd63ff' },
  iron_resolve: { iconX: 0.58, arcsScale: 1.1, color: '#ffe14d' },
  overpower_charge: { iconX: 0.5, arcsScale: 1.2, color: '#3dc7ff' },
  sudden_death: { iconX: 0.58, arcsScale: 1.3, color: '#bd63ff' },
  victory_rush: { iconX: 0.66, arcsScale: 1.4, color: '#ffe14d' },
  enrage: { iconX: 0.5, arcsScale: 1.5, color: '#3dc7ff' },
};

export function defaultAuraOverlayConfig(id: WarriorProcId): AuraOverlayConfig {
  const layout = DEFAULT_LAYOUT[id];
  return {
    enabled: false,
    showIcon: true,
    showArcs: true,
    iconPosX: layout.iconX,
    iconPosY: DEFAULT_ICON_Y,
    arcsPosX: 0.5,
    arcsPosY: 0.56,
    opacity: 0.7,
    scale: 1,
    arcsScale: layout.arcsScale,
    color: layout.color,
  };
}

function numberIn(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function boolOr(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function colorOr(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
}

export function sanitizeAuraOverlayConfig(id: WarriorProcId, raw: unknown): AuraOverlayConfig {
  const fallback = defaultAuraOverlayConfig(id);
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const legacyPosX = numberIn(value.posX, 0, 1, fallback.iconPosX);
  const legacyPosY = numberIn(value.posY, 0, 1, fallback.iconPosY);
  const legacyScale = numberIn(value.scale, 0.65, 1.6, fallback.scale);
  const hasLegacyPosX = value.posX !== undefined;
  const hasLegacyPosY = value.posY !== undefined;
  const hasLegacyScale = value.scale !== undefined;
  return {
    enabled: boolOr(value.enabled, fallback.enabled),
    showIcon: boolOr(value.showIcon, fallback.showIcon),
    showArcs: boolOr(value.showArcs, fallback.showArcs),
    iconPosX: numberIn(value.iconPosX, 0, 1, hasLegacyPosX ? legacyPosX : fallback.iconPosX),
    iconPosY: numberIn(value.iconPosY, 0, 1, hasLegacyPosY ? legacyPosY : fallback.iconPosY),
    arcsPosX: numberIn(value.arcsPosX, 0, 1, hasLegacyPosX ? legacyPosX : fallback.arcsPosX),
    arcsPosY: numberIn(value.arcsPosY, 0, 1, hasLegacyPosY ? legacyPosY : fallback.arcsPosY),
    opacity: numberIn(value.opacity, 0.25, 1, fallback.opacity),
    scale: legacyScale,
    arcsScale: numberIn(
      value.arcsScale,
      0.65,
      1.6,
      hasLegacyScale ? legacyScale : fallback.arcsScale,
    ),
    color: colorOr(value.color, fallback.color),
  };
}

type StoredConfigs = Partial<Record<WarriorProcId, AuraOverlayConfig>> & {
  __layoutVersion?: number;
};

export class AuraOverlayConfigStore {
  private readonly key: string;
  private configs: StoredConfigs;

  constructor(scope: string) {
    this.key = `${STORE_PREFIX}${scope}`;
    this.configs = this.load();
  }

  private load(): StoredConfigs {
    let raw: unknown = null;
    try {
      raw = JSON.parse(localStorage.getItem(this.key) ?? 'null');
    } catch {
      return { __layoutVersion: LAYOUT_VERSION };
    }
    if (!raw || typeof raw !== 'object') return { __layoutVersion: LAYOUT_VERSION };
    const configs = raw as StoredConfigs;
    if (configs.__layoutVersion !== LAYOUT_VERSION) {
      for (const [rawId, config] of Object.entries(configs)) {
        const id = rawId as WarriorProcId;
        const layout = DEFAULT_LAYOUT[id];
        if (!layout || typeof config !== 'object' || !config) continue;
        const previousDefault =
          config.iconPosX === PREVIOUS_DEFAULT_ICON_X &&
          (config.iconPosY === undefined || config.iconPosY === PREVIOUS_DEFAULT_ICON_Y[id]);
        if (config.iconPosX === LEGACY_DEFAULT_ICON_X || previousDefault) {
          config.iconPosX = layout.iconX;
          if (config.iconPosY === undefined || config.iconPosY === PREVIOUS_DEFAULT_ICON_Y[id]) {
            config.iconPosY = DEFAULT_ICON_Y;
          }
        }
      }
      configs.__layoutVersion = LAYOUT_VERSION;
      try {
        localStorage.setItem(this.key, JSON.stringify(configs));
      } catch {
        // Storage can be unavailable in privacy modes. Session state still works.
      }
    }
    return configs;
  }

  private save(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.configs));
    } catch {
      // Storage can be unavailable in privacy modes. Session state still works.
    }
  }

  get(id: WarriorProcId): AuraOverlayConfig {
    return sanitizeAuraOverlayConfig(id, this.configs[id]);
  }

  patch(id: WarriorProcId, patch: AuraOverlayPatch): AuraOverlayConfig {
    const next = sanitizeAuraOverlayConfig(id, { ...this.get(id), ...patch });
    this.configs = { ...this.configs, [id]: next };
    this.save();
    return { ...next };
  }

  reset(id: WarriorProcId): AuraOverlayConfig {
    const next = defaultAuraOverlayConfig(id);
    this.configs = { ...this.configs, [id]: next };
    this.save();
    return { ...next };
  }

  resetPosition(id: WarriorProcId): AuraOverlayConfig {
    const defaults = defaultAuraOverlayConfig(id);
    return this.patch(id, {
      iconPosX: defaults.iconPosX,
      iconPosY: defaults.iconPosY,
      arcsPosX: defaults.arcsPosX,
      arcsPosY: defaults.arcsPosY,
    });
  }
}
