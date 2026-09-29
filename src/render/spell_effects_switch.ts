// The Spell Effects option: whether spell and ability visual effects draw in
// the 3D world. On by default; off is a player preference for a calmer or
// cheaper screen.
//
// It lives here rather than as a renderer field for the nameplate_dot_scale.ts
// reason: renderer.ts sits at its monolith ceiling, and the value is only ever
// handed through to the systems that draw spell effects. main.ts pushes it on
// boot and on every change (render never reads the settings store), and the
// state survives a renderer rebuild because it is module state, not renderer
// state.
//
// What OFF removes and what it keeps is the same split the cast-VFX readiness
// gate already makes while a cast's programs are still linking
// (cast_vfx_readiness_core.ts owns the fairness argument for it): the ability
// painter treats every cast as refused, so it draws none of the cast, release,
// travel, impact or linger composition and sleeps the per-entity cosmetic
// holds (windup orbs, buff orbits, shells, ground discs), while the reads a
// player acts on still draw: the terrain-draped area telegraph ring, the
// hard-crowd-control band over a stunned, feared or rooted body, and the
// rig's windup animation. The generic pooled spell particles (vfx.ts) that the
// renderer spawns for abilities with no authored spec, plus the per-frame cast
// sparkle and form auras, check `spellEffectsEnabled()` at their own entry
// points. Cast bars, nameplates, floating combat text and every HUD read are
// outside the 3D effects entirely and never consult this switch. World
// ambience that is not a spell (weather, water splashes, campfire embers,
// mount exhaust, landing dust, fireworks, the level-up pillar) is not a spell
// effect and keeps drawing.
//
// Three/DOM-free, so a test drives it directly.

let enabled = true;

/** Apply the stored setting. */
export function setSpellEffectsEnabled(on: boolean): void {
  enabled = on;
}

/** Whether spell and ability visual effects draw. */
export function spellEffectsEnabled(): boolean {
  return enabled;
}

/** The two cast-gate reads the ability painter consults. */
export interface SpellEffectsCastGate {
  /** Counted: one refusal per refused cast (readiness telemetry). */
  admit(mask: number): boolean;
  /** Uncounted: the per-frame answer. */
  ready(mask: number): boolean;
}

/**
 * Wrap the cast-VFX readiness gate so a closed Spell Effects switch refuses
 * every cast and every per-frame hold, which routes the painter onto its
 * existing telegraph-only arm. The inner gate is never consulted while the
 * switch is off, so readiness refusal counts stay a measure of program
 * linking, not of a player preference. `isOn` is read on every call, so a
 * flip takes effect on the next cast and the next frame without a rebuild.
 */
export function gateCastsBySpellEffects(
  inner: SpellEffectsCastGate,
  isOn: () => boolean = spellEffectsEnabled,
): SpellEffectsCastGate {
  return {
    admit: (mask) => isOn() && inner.admit(mask),
    ready: (mask) => isOn() && inner.ready(mask),
  };
}
