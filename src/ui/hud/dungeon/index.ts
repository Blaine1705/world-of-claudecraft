// HUD domain: dungeon encounter prompts the local player acts on. Today the
// Gaol Turnkey's Iron Cage escape (the panel the HUD composes while caged).

export type { CageEscapeDeps } from './cage_escape_painter';
export { CageEscapePrompt } from './cage_escape_painter';
export type { CageEscapeInput, CageEscapeLive, CageEscapeView } from './cage_escape_view';
export { buildCageEscapeView } from './cage_escape_view';
