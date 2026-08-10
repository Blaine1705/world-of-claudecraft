// Pure win32-aware resolver for a binary under node_modules/.bin, so callers can
// spawn it directly instead of paying npx's per-invocation startup cost.
// @ts-check
import path from 'node:path';

/**
 * Resolve the absolute path to a local `node_modules/.bin/<binName>` binary.
 * On win32 the shim is a `.cmd` file; everywhere else it is the bare binary.
 * @param {string} repoRoot
 * @param {string} binName
 * @param {string} [platform]
 * @returns {string}
 */
export function resolveLocalBin(repoRoot, binName, platform = process.platform) {
  return path.join(
    repoRoot,
    'node_modules',
    '.bin',
    platform === 'win32' ? `${binName}.cmd` : binName,
  );
}
