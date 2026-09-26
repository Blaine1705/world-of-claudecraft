// Pure, host-agnostic core for Clique-style mouseover casting: given the unit
// the cursor is currently over, decide whether a pressed ability should be
// redirected onto it instead of the current target.
//
// The target-of-target frame joined the party/raid rows and focus frames as a
// hover source, so the redirect rule lives here rather than in the HUD
// coordinator. The staleness guard is intentionally two-tiered: an in-scope
// entity is always safe, and a party/raid roster member is safe even when the
// online client has dropped their entity from interest scope, which keeps combat
// resurrections working on released ghosts at the graveyard.

/** The two ability fields the redirect rule reads. */
export interface MouseoverCastAbility {
  requiresTarget?: boolean;
  targetType?: 'enemy' | 'friendly' | 'any' | string;
}

export interface MouseoverCastInput {
  /** Whether the mouseoverCast Interface option is on (default on). */
  enabled: boolean;
  /** The ability the player just pressed. */
  ability: MouseoverCastAbility | null | undefined;
  /** Whether the client still knows that entity. */
  exists(id: number): boolean;
  /** Local party/raid roster fallback for out-of-interest party members. */
  partyMemberPids?: () => readonly number[] | null;
}

/**
 * The entity a press should be redirected onto, or null to cast normally.
 *
 * Deliberately narrow: only a friendly ability that needs a target redirects,
 * so hovering a unit frame never steals an offensive press or an AOE from the
 * current target. 'any' abilities are not redirected either, since their
 * friendly reading is ambiguous.
 */
export function mouseoverCastTarget(
  hoveredId: number | null,
  input: MouseoverCastInput,
): number | null {
  if (hoveredId === null || !input.enabled) return null;
  if (!input.ability?.requiresTarget || input.ability.targetType !== 'friendly') return null;
  if (input.exists(hoveredId)) return hoveredId;
  return input.partyMemberPids?.()?.includes(hoveredId) ? hoveredId : null;
}

export interface MouseoverCastInputs {
  /** The Interface option (mouseoverCast, on by default). */
  enabled: boolean;
  /** Whether this client currently holds the entity. */
  hasEntity: (pid: number) => boolean;
  /** The local player's party/raid roster. */
  partyMemberPids: () => readonly number[] | null;
}

/** Compatibility wrapper for the focus-target controller's existing seam. */
export function mouseoverCastTargetPid(
  hoveredPid: number | null,
  ability: MouseoverCastAbility | null | undefined,
  inputs: MouseoverCastInputs,
): number | null {
  return mouseoverCastTarget(hoveredPid, {
    enabled: inputs.enabled,
    ability,
    exists: inputs.hasEntity,
    partyMemberPids: inputs.partyMemberPids,
  });
}
