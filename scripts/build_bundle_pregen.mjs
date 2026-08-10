// Runs build:bundle's independent pregen steps concurrently instead of
// serially: the sitemap regeneration, the SFX manifest/runtime pack build,
// and the media manifest generation. Each step reads and writes its own
// disjoint set of files, so there is no shared input/output between them:
//   - build_sitemap.mjs: reads public/sitemap.xml + the guide route tables,
//     writes public/sitemap.xml.
//   - build_sfx_manifest.mjs: reads scripts/sfx/sfx_mix.json + public/audio/sfx,
//     writes src/game/sfx_manifest.generated.ts, public/audio/sfx/runtime-pack.json,
//     and the SFX gain ceilings file.
//   - build_media_manifest.mjs generate: reads public/{models,textures,env,vfx},
//     writes src/render/assets/manifest.generated.ts.
// All three must still finish before `vite build` runs (some of them feed
// generated sources the client bundle imports), so this orchestrator is the
// one thing build:bundle awaits before that step; it changes nothing after
// vite build.
//
// Usage: node scripts/build_bundle_pregen.mjs

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Node args for each pregen step, run relative to the repo root. */
export const PREGEN_STEPS = [
  ['scripts/build_sitemap.mjs'],
  ['scripts/build_sfx_manifest.mjs'],
  ['scripts/build_media_manifest.mjs', 'generate'],
];

/**
 * Spawn one pregen step and resolve with its captured stdout/stderr, or
 * reject with a descriptive error (carrying both streams) if it fails to
 * spawn or exits non-zero. The returned promise stays a plain promise (so a
 * bare `await runPregenStep(...)` keeps working), but the live ChildProcess
 * is also stashed on it so a caller running several steps concurrently can
 * still reach every child to await its exit.
 */
export function runPregenStep(args, execPath = process.execPath) {
  const child = spawn(execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const promise = new Promise((resolve, reject) => {
    child.on('error', (error) => {
      reject(new Error(`${args.join(' ')} failed to spawn: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(
          `${args.join(' ')} exited with code ${code}\nstderr:\n${stderr}\nstdout:\n${stdout}`,
        );
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
  promise.child = child;
  return promise;
}

/**
 * Run every step concurrently, then replay each step's captured output in
 * step order (deterministic regardless of finish order). Uses
 * Promise.allSettled rather than Promise.all so that on any one step's
 * failure, EVERY step has still fully finished (successfully or not) before
 * this function returns or throws: nothing keeps writing files in the
 * background after control returns to the caller (a re-run, a git checkout).
 * Whatever output the other steps produced is still replayed, and the
 * rejection includes the failing step's own stdout alongside its stderr, so
 * a failing concurrent run reports at least as much as the old serial chain
 * did.
 */
export async function runPregen(steps = PREGEN_STEPS) {
  const settled = await Promise.allSettled(steps.map((args) => runPregenStep(args)));
  const failures = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      const { stdout, stderr } = result.value;
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    } else {
      failures.push(result.reason);
    }
  }
  if (failures.length > 0) throw failures[0];
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    await runPregen();
  } catch (error) {
    console.error(`build_bundle_pregen: ${error.message}`);
    process.exit(1);
  }
}
