// The two preflights every full-strength gate runs before its step loop, moved
// here so gate.mjs and gate_select.mjs share one copy instead of the selective
// gate quietly losing both.
//
// The dependency-sync check is unchanged from the inline version in gate.mjs;
// only the log prefix is parameterized. The audio-tooling check additionally
// runs its two version probes concurrently and skips them outright when
// `sfx:check` is about to be a turbo cache hit this run (see
// isTurboCacheHit in gate_task_cache.mjs), since a broken toolchain cannot
// fail a step that never runs. tests/dependency_sync_gate_preflight.test.ts
// and tests/sfx_gate_preflight.test.ts spawn gate.mjs and assert on its exact
// stderr for both. Both preflights exist to turn a confusing mid-gate failure
// into a clear early one, which the selective gate needs at least as much: it
// is the path people will run most often.
import { spawn, spawnSync } from 'node:child_process';
import { FFMPEG_PATH, FFPROBE_PATH } from '../sfx/ffmpeg_paths.mjs';
import { isTurboCacheHit } from './gate_task_cache.mjs';
import {
  formatInstallSyncFailure,
  parseInstallProblems,
  shouldCheckInstallSync,
} from './npm_install_sync.mjs';

/**
 * Verify node_modules matches pnpm-lock.yaml. Returns an error string, or null.
 *
 * @param {{ label: string, shell: boolean, env?: Record<string, string | undefined> }} opts
 * @returns {string | null}
 */
export function checkDependencySync({ label, shell, env = process.env }) {
  if (env.WOC_SKIP_DEP_SYNC === '1') return null;
  const npmLs = spawnSync('npm', ['ls', '--depth=0', '--json'], { encoding: 'utf8', shell });
  if (!shouldCheckInstallSync(npmLs)) return null;
  try {
    const installProblems = parseInstallProblems(npmLs.stdout);
    if (installProblems.length > 0) {
      return `[${label}] FAIL at "dependency sync"\n${formatInstallSyncFailure(installProblems)}`;
    }
  } catch (err) {
    // npm ran but produced unparseable JSON: a problem with the check itself,
    // not evidence of drift, so warn and continue rather than fail on output we
    // cannot interpret.
    console.error(`[${label}] WARN: dependency sync check skipped: ${err.message}`);
  }
  return null;
}

/**
 * Probe one tool's resolved path BY EXECUTION (never existsSync: a present
 * but non-executable file must still count as missing).
 *
 * @param {string} toolPath
 * @param {boolean} shell
 * @returns {Promise<boolean>} true when the tool ran and exited 0
 */
function probeToolByExecution(toolPath, shell) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const child = spawn(toolPath, ['-version'], { stdio: 'ignore', shell });
    child.on('error', () => finish(false));
    child.on('exit', (code) => finish(code === 0));
  });
}

/**
 * Probe the resolved ffmpeg/ffprobe binaries BY EXECUTION. The static packages
 * download their binary via an install script, so a scripts-skipped install
 * leaves a missing file behind the import and the PATH fallback may be absent too.
 *
 * Runs the two probes concurrently, and skips them entirely when the gate's
 * `sfx:check` step (the only step that actually invokes ffmpeg/ffprobe) is
 * about to be a turbo cache hit this run: a broken toolchain cannot fail a
 * step that never runs, so the fail-fast this preflight exists for only
 * matters when the toolchain is actually about to be used.
 *
 * @param {{ label: string, shell: boolean, env?: Record<string, string | undefined> }} opts
 * @returns {Promise<string | null>} error text, or null when skipped or both tools run
 */
export async function checkAudioTooling({ label, shell, env = process.env }) {
  if (isTurboCacheHit('sfx:check', { shell, env })) return null;

  const tools = [
    ['ffmpeg', FFMPEG_PATH],
    ['ffprobe', FFPROBE_PATH],
  ];
  const ok = await Promise.all(tools.map(([, toolPath]) => probeToolByExecution(toolPath, shell)));
  const missing = tools.filter((_, i) => !ok[i]);
  if (missing.length === 0) return null;
  return (
    `[${label}] missing required SFX audio tooling: ${missing.map(([name]) => name).join(', ')}\n` +
    `[${label}] the bundled ffmpeg-static/ffprobe-static binaries are absent or broken (a\n` +
    `[${label}] scripts-skipped install leaves them missing): reinstall with\n` +
    `[${label}] pnpm install --frozen-lockfile (ensure onlyBuiltDependencies allows\n` +
    `[${label}] ffmpeg-static/ffprobe-static), or install FFmpeg (including ffprobe) on PATH,\n` +
    `[${label}] then re-run pnpm run ${label === 'gate' ? 'gate' : label}`
  );
}

/**
 * Run both preflights, printing and exiting on the first failure.
 *
 * @param {{ label: string, shell: boolean, env?: Record<string, string | undefined> }} opts
 */
export async function runGatePreflights({ label, shell, env = process.env }) {
  const depError = checkDependencySync({ label, shell, env });
  if (depError) {
    console.error(depError);
    process.exit(1);
  }
  const audioError = await checkAudioTooling({ label, shell, env });
  if (audioError) {
    console.error(audioError);
    process.exit(1);
  }
}
