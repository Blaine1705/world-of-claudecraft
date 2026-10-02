// The Stormbrass Foundry's camera shake: the environment's own set pieces
// (the Crane Bridge's span slamming onto its seats) reach the renderer's
// trauma shake through this one sink, which the dungeon effects host
// (rift_death_zone.ts) fills in with the renderer's own callbacks. Unset (a
// headless build, a test) it is a no-op; reduced motion mutes it.

let sink: ((amount: number) => void) | null = null;
let reduced: (() => boolean) | null = null;

/** Wire the renderer's shake (and its reduced-motion read) in. */
export function setFoundryShakeSink(
  shake: ((amount: number) => void) | undefined,
  reducedMotion: (() => boolean) | undefined,
): void {
  sink = shake ?? null;
  reduced = reducedMotion ?? null;
}

/** Shake the camera (0..1 trauma), unless motion is reduced. */
export function foundryShake(amount: number): void {
  if (!sink || reduced?.()) return;
  sink(amount);
}
