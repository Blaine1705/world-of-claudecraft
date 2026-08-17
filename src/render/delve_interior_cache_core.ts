// Delve interior build-cache decision (pure, Three-free). A delve module's
// z-stacked position within a slot is reused across runs, but which moduleId
// occupies that position is re-randomized every run (pickDelveModules), and
// same-index modules can also move when earlier randomized modules have
// different spans. A build cached by POSITION must be invalidated when either
// the module or its world placement changes: otherwise the previous run's walls
// keep standing while this run's mobs/interactables/boss spawn against the
// true, current module placement.
export type DelveInteriorBuildAction = 'skip' | 'build' | 'rebuild';

export type DelveInteriorPlacement = {
  moduleId: string;
  ox: number;
  oz: number;
};

function samePlacement(cached: DelveInteriorPlacement, current: DelveInteriorPlacement): boolean {
  return (
    cached.moduleId === current.moduleId && cached.ox === current.ox && cached.oz === current.oz
  );
}

export function delveInteriorBuildAction(
  cached: DelveInteriorPlacement | undefined,
  current: DelveInteriorPlacement,
  pending: boolean,
): DelveInteriorBuildAction {
  if (pending) return 'skip';
  if (cached === undefined) return 'build';
  return samePlacement(cached, current) ? 'skip' : 'rebuild';
}
