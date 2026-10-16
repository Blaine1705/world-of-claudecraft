// The Gourdlight Eve tricks' bodies (src/sim/seasonal/: a trick-or-treat trick
// or the Jar of Mischief): for a few seconds the player wears a bat's or a
// skeleton's body. They ride the polymorph SLOT's look only (its lazy build and
// its compile gate, form_rig_sync.ts), never its control: the aura is kind
// 'seasonal_cosmetic', which no sim rule reads. Both bodies are the shipped
// creatures' own rigs and clips, sized to a player.
import type { VisualDef } from './manifest';

/** The two trick bodies, derived from the creature defs already in `visuals`. */
export function seasonalTrickLooks(
  visuals: Readonly<Record<string, VisualDef>>,
): Record<string, VisualDef> {
  const out: Record<string, VisualDef> = {};
  const bat = visuals.mob_hoard_bat_swarmling;
  if (bat)
    out.form_trick_bat = { ...bat, height: 1.25, hover: 0.55, tint: 0x6a5a6a, tintStrength: 0.35 };
  const skeleton = visuals.skel_minion;
  if (skeleton) out.form_trick_skeleton = { ...skeleton, height: 2.05, tint: undefined };
  return out;
}
