import { readdirSync } from 'node:fs';
import path from 'node:path';

// The shared recursive source walk for guards that scan a directory of .ts
// files. It exists because the single-level `readdirSync(dir).filter(...)` it
// replaces was a silent-coverage bug four times over: #2485 in the professions
// grant sweep, then #2489 in the forbidden-login scan, the S3 emit drift guard,
// and the mobile window scrape. In every case a module moved into a
// subdirectory would leave the scan while the guard stayed green, covering less
// than the day before with no diff for a reviewer to notice.
//
// ONE argument, and it is meant to stay that way. A caller that wants less
// filters the returned list. A caller that wants a genuinely different corpus
// (another extension, absolute paths, a hashed record) hand-rolls its own walk
// and keeps it local: the point of this module is one contract shared by the
// guards that want exactly this one, not a walker framework with a knob per
// caller. The concrete case that stays OUT is
// tests/mobile_window_coverage.test.ts's src/styles read, which models the
// sheets an entry actually loads rather than the files on disk.

/** One source file found by {@link tsFilesUnder}. */
export interface TsSourceFile {
  /** Path relative to the scan root, joined with forward slashes at every depth. */
  readonly file: string;
  /** Absolute path, for `readFileSync`. */
  readonly full: string;
}

/**
 * Every `.ts` file under `root`, RECURSIVELY, sorted by name within each
 * directory.
 *
 * The sort matters: readdir returns byte-lexicographic order on a dev APFS
 * checkout and hash order on the ext4 CI runner, so an unsorted walk pins a
 * label list that only holds on one of them.
 *
 * The file arm is deliberately NOT gated on `entry.isFile()`. A `Dirent`
 * reports lstat, so that check reads false for a symlink, while the flat reads
 * this replaces followed one: gating on it would narrow coverage in exactly the
 * way this module exists to stop. Anything named `.ts` that is not a directory
 * gets returned.
 *
 * Walks by hand rather than through `readdirSync`'s `recursive: true`, which
 * emits directory entries into its own result (so a directory named `x.ts`
 * reaches `readFileSync` and throws EISDIR), returns platform-separator paths,
 * and does not sort.
 */
export function tsFilesUnder(root: string): TsSourceFile[] {
  const walk = (dir: string, prefix: string): TsSourceFile[] => {
    const out: TsSourceFile[] = [];
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full, `${prefix}${entry.name}/`));
      else if (entry.name.endsWith('.ts')) out.push({ file: `${prefix}${entry.name}`, full });
    }
    return out;
  };
  return walk(root, '');
}
