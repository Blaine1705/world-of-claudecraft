export const REMINT_COMMAND: string;

export function diffProvenanceComponents(
  sealed: Record<string, unknown>,
  computed: Record<string, unknown>,
): Array<{ key: string; sealed: unknown; computed: unknown }>;

export function collectPolishProvenanceInputPaths(opts: {
  inputs: Record<string, string>;
  sourceFileLists?: ReadonlyArray<readonly string[]>;
}): string[];

export function gitDirtyStatusLines(opts: {
  repoRoot: string;
  paths: readonly string[];
  runGit?: (args: string[], cwd: string) => string;
}): string[] | null;

export function formatPolishProvenanceMismatch(opts: {
  pinnedFingerprint: string;
  computed: { fingerprint: string; components: Record<string, unknown> };
  sealedComponents?: Record<string, unknown> | null;
  dirtyStatusLines?: string[] | null;
}): string;
