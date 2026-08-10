export type PostEntryWarmupErrorSource = 'far-vista';

export interface PostEntryWarmupDependencies {
  settleFarVista: () => Promise<boolean>;
  onFarVistaSettled: (ready: boolean) => void;
  startCharacterPreloads: () => number;
  onCharacterPreloadsStarted: (count: number) => void;
  startBackgroundPreloads: () => number;
  onBackgroundPreloadsStarted: (count: number) => void;
  onWarmupError: (source: PostEntryWarmupErrorSource, error: unknown) => void;
}

/** Starts optional work only after the first interactive world frame. */
export function runPostEntryWarmups(deps: PostEntryWarmupDependencies): void {
  try {
    void deps
      .settleFarVista()
      .then(deps.onFarVistaSettled)
      .catch((error: unknown) => deps.onWarmupError('far-vista', error));
  } catch (error) {
    deps.onWarmupError('far-vista', error);
  }

  deps.onCharacterPreloadsStarted(deps.startCharacterPreloads());
  deps.onBackgroundPreloadsStarted(deps.startBackgroundPreloads());
}
