// HUD domain: dungeon encounter prompts the local player acts on: the Gaol
// Turnkey's Iron Cage escape, Gaoler Ossick's chain alert, the Stormbrass
// Foundry's alert, the Wildheart Basin's and the Gravewyrm Sanctum's, composed by the HUD as one
// DungeonPrompts member; and the floating avoidance word (the plating's
// "Turned aside").

export type { CageEscapeDeps } from './cage_escape_painter';
export { CageEscapePrompt } from './cage_escape_painter';
export type { CageEscapeInput, CageEscapeLive, CageEscapeView } from './cage_escape_view';
export { buildCageEscapeView } from './cage_escape_view';
export type { DungeonPromptsFrame } from './dungeon_prompts';
export { DungeonPrompts } from './dungeon_prompts';
export type { AlertLook, EncounterAlertView, FoundryAlertDeps } from './foundry_alert_painter';
export { FoundryAlert } from './foundry_alert_painter';
export type { FoundrySceneEntity, FoundrySceneWorld } from './foundry_alert_scene_core';
export { FoundryAlertSceneScan } from './foundry_alert_scene_core';
export type {
  FoundryAlertEntity,
  FoundryAlertInput,
  FoundryAlertKind,
  FoundryAlertScene,
  FoundryAlertView,
} from './foundry_alert_view';
export { buildFoundryAlertView } from './foundry_alert_view';
export { fctAvoidanceText, platingTurnedAside } from './foundry_fct_core';
export type { GaolChainDeps } from './gaol_chain_painter';
export { GaolChainAlert } from './gaol_chain_painter';
export type { GaolChainInput, GaolChainKind, GaolChainView } from './gaol_chain_view';
export { buildGaolChainView, wardHealthText, wardHitText } from './gaol_chain_view';
export type { SanctumSceneEntity, SanctumSceneWorld } from './sanctum_alert_scene_core';
export { SanctumAlertSceneScan } from './sanctum_alert_scene_core';
export type {
  SanctumAlertEntity,
  SanctumAlertInput,
  SanctumAlertKind,
  SanctumAlertScene,
  SanctumAlertView,
} from './sanctum_alert_view';
export { buildSanctumAlertView, SANCTUM_ALERT_KINDS } from './sanctum_alert_view';
export type {
  WildheartAlertEntity,
  WildheartAlertInput,
  WildheartAlertKind,
  WildheartAlertView,
} from './wildheart_alert_view';
export { buildWildheartAlertView, WILDHEART_ALERT_KINDS } from './wildheart_alert_view';
