import { INTERFACE_OFF_MENU_KEYS } from './interface_reset_keys';
import { transferKeyAllowed } from './settings_transfer_core';

export const FRAME_PRESET_LIMIT = 10;
export const FRAME_PRESETS_KEY = 'woc_frame_presets_v1';
export const FRAME_PRESET_SETTINGS = new Set<string>([
  ...INTERFACE_OFF_MENU_KEYS.frames,
  'uiScale',
  'partyFrameStyle',
  'partyFrameHealthText',
  'partyFrameSort',
  'partyFrameShowResource',
  'partyFrameShowAbsorbs',
  'partyFrameShowAuras',
  'partyFrameShowPets',
  'partyFrameShowSelf',
  'aurasOnPlayerFrame',
  'auraBarBelowFrame',
  'alwaysShowAllBuffs',
  'showTargetOfTarget',
  'showTargetSwingTimer',
  'showSecondaryActionBar',
  'showThirdActionBar',
  'showAttackButton',
  'showReliquaryTracker',
  'showTargetDots',
  'showDefensivesTrack',
  'showSelfBuffTrack',
  'showOffensiveTrack',
  'showUtilityTrack',
  'showUtilityModes',
  'showFriendlyTrack',
  'showShieldTrack',
]);
export interface FramePreset {
  name: string;
  geometry: Record<string, string>;
  settings: Record<string, boolean | number>;
}
export function framePresetGeometryKey(key: string): boolean {
  return (
    transferKeyAllowed('frames', key) ||
    [
      'woc_player_frame_pos_hidden',
      'woc_target_frame_pos_hidden',
      'woc_party_frame_pos_hidden',
      'woc_actionbar_bind_banner',
      'woc_party_collapsed',
      'woc_target_auras_filter',
      'woc_target_auras_visible',
      'woc_target_auras_visible_rows',
      'woc_target_auras_show_sources',
      'woc_target_auras_opacity',
      'woc_chat_frame_hidden',
    ].includes(key)
  );
}
export function parseFramePresets(text: string | null): (FramePreset | null)[] {
  const empty = () => Array<FramePreset | null>(FRAME_PRESET_LIMIT).fill(null);
  if (!text || text.length > 1024 * 1024) return empty();
  try {
    const data = JSON.parse(text);
    if (data?.v !== 1 || !Array.isArray(data.slots)) return empty();
    return empty().map((_, index) => {
      const slot = data.slots[index];
      if (!slot || typeof slot.name !== 'string' || !slot.geometry || !slot.settings) return null;
      const geometry: Record<string, string> = {};
      const settings: Record<string, boolean | number> = {};
      for (const [key, value] of Object.entries(slot.geometry))
        if (framePresetGeometryKey(key) && typeof value === 'string' && value.length <= 128 * 1024)
          geometry[key] = value;
      for (const [key, value] of Object.entries(slot.settings))
        if (
          FRAME_PRESET_SETTINGS.has(key) &&
          (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
        )
          settings[key] = value;
      return { name: slot.name.slice(0, 40), geometry, settings };
    });
  } catch {
    return empty();
  }
}
