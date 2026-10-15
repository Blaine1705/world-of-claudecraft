export const RELATED_WALK_BATCH: number;

export const BOUNDED_RELATED_ENV: 'WOC_VITEST_BOUNDED_RELATED';

export function filterTestsBySourceBounded<S extends { moduleId: string }>(io: {
  specs: readonly S[];
  config: {
    related?: string[];
    changed?: unknown;
    watch?: boolean;
    root: string;
    forceRerunTriggers: string[];
  };
  findChangedFiles: (opts: { root: string; changedSince: unknown }) => Promise<string[]>;
  getTestDependencies: (spec: S) => Promise<Set<string>>;
  matchesAny: (patterns: string[]) => (file: string) => boolean;
  batch?: number;
}): Promise<S[]>;

export function installBoundedRelatedFilter(vitest: unknown, options?: { batch?: number }): void;

export function vitestBoundedRelatedPlugin(): {
  name: string;
  configureVitest(context: { vitest: unknown }): void;
};
