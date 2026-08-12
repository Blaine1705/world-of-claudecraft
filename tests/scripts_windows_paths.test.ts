// Guards the scripts/ AND tests/ tooling against the Windows path-resolution
// trap: `new URL(import.meta.url).pathname` keeps a leading slash before a
// drive letter ("/D:/..."), which path.resolve/path.dirname then mangle into
// "D:\D:\...", so any script resolving its repo root that way cannot run on
// Windows at all. The portable form is fileURLToPath(import.meta.url)
// (node:url), correct on every OS; see scripts/assets/build_assets.mjs.
// Originally scripts/-only (#3225): four tests/ files carried the same trap
// with nothing scanning for it, so the walk now covers both roots.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptsRoot = join(repoRoot, 'scripts');
const testsRoot = join(repoRoot, 'tests');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (/\.(?:mjs|cjs|js|ts)$/.test(name) && !/\.d\.m?ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('scripts/ and tests/ Windows path safety', () => {
  it('no script or test takes .pathname off a file URL (breaks on Windows drive letters)', () => {
    const banned = /new URL\([^)]*import\.meta\.url[^)]*\)\s*\.pathname/;
    const offenders = [...walk(scriptsRoot), ...walk(testsRoot)]
      .filter((file) => {
        // Strip comments first: this guard polices CODE, not its own header
        // prose (above) naming the trap, or any future file that documents
        // it too. The line-comment strip keeps a `://` in a URL from eating
        // the rest of its line (same technique as scan_guard_self_audit.ts).
        const code = readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1');
        return banned.test(code);
      })
      .map((file) => relative(repoRoot, file));
    expect(
      offenders,
      `use path.dirname(fileURLToPath(import.meta.url)) from node:url instead: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the asset pipeline entries resolve ROOT via fileURLToPath (the fixed form)', () => {
    for (const entry of ['assets/build_assets.mjs', 'assets/build_foliage.mjs']) {
      const src = readFileSync(join(scriptsRoot, entry), 'utf8');
      expect(src, entry).toContain(
        "path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')",
      );
      expect(src, entry).toContain("import { fileURLToPath } from 'node:url';");
    }
  });
});
