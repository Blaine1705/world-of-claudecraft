// How far a player may drift from an NPC before their open service window
// closes itself.
//
// The vendor, Heroic Quartermaster, trainer and unbind windows all walk away
// at the same distance, checked once per medium-band HUD tick in hud.ts. It
// lives in its own DOM-free module rather than inline in the coordinator
// because the vendor row gate's safety argument READS it: a locked row is
// painted when the window opens and never repainted, which is only correct
// while a player cannot gain proficiency inside this radius (the harvest reach
// is INTERACT_RANGE around a node, and no node sits that close to a counter
// stocking a gated tool). tests/professions_tool_gate.test.ts asserts that
// separation against THIS constant, so widening the radius here fails there
// instead of silently turning the lock stale.

/** Yards past which an open NPC service window closes (hud.ts proximity tick). */
export const NPC_WINDOW_CLOSE_RANGE = 8;
