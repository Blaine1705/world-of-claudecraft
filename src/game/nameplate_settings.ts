// Persist the renderer's nameplate/selection booleans through one settings seam.
import {
  type TargetHighlightFlags,
  type TargetHighlightSettingKey,
  targetHighlightFlagFor,
} from '../render/target_highlight_core';
import type { Settings } from './settings';

export interface NameplateSettingsRenderer {
  showDevBadges: boolean;
  showOwnNameplate: boolean;
  showPlayerNameplates: boolean;
  targetHighlight: TargetHighlightFlags;
}

export function applyNameplateSetting(
  settings: Pick<Settings, 'set'>,
  renderer: NameplateSettingsRenderer,
  key: string,
  value: number | boolean,
): boolean {
  if (key === 'showDevBadges' || key === 'showOwnNameplate' || key === 'showPlayerNameplates') {
    renderer[key] = settings.set(key, !!value);
    return true;
  }
  const flag = targetHighlightFlagFor(key);
  if (!flag) return false;
  renderer.targetHighlight[flag] = settings.set(key as TargetHighlightSettingKey, !!value);
  return true;
}
