// HUD domain: dungeon encounter prompts the local player acts on: the Gaol
// Turnkey's Iron Cage escape, Gaoler Ossick's chain alert and the Stormbrass
// Foundry's alert, composed by the HUD as one DungeonPrompts member.

export type { CageEscapeDeps } from './cage_escape_painter';
export { CageEscapePrompt } from './cage_escape_painter';
export type { CageEscapeInput, CageEscapeLive, CageEscapeView } from './cage_escape_view';
export { buildCageEscapeView } from './cage_escape_view';
export type { DungeonPromptsFrame } from './dungeon_prompts';
export { DungeonPrompts } from './dungeon_prompts';
export type { FoundryAlertDeps } from './foundry_alert_painter';
export { FoundryAlert } from './foundry_alert_painter';
export type {
  FoundryAlertEntity,
  FoundryAlertInput,
  FoundryAlertKind,
  FoundryAlertView,
} from './foundry_alert_view';
export { buildFoundryAlertView } from './foundry_alert_view';
export type { GaolChainDeps } from './gaol_chain_painter';
export { GaolChainAlert } from './gaol_chain_painter';
export type { GaolChainInput, GaolChainKind, GaolChainView } from './gaol_chain_view';
export { buildGaolChainView, wardHealthText, wardHitText } from './gaol_chain_view';
