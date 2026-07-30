import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const gate = readFileSync(new URL('../scripts/gate.mjs', import.meta.url), 'utf8');
// gate.mjs with its line comments removed. A raw-substring pin on a step is not
// a pin at all: commenting the step out leaves the substring in the file, so the
// assertion stays green while the local gate quietly stops running it. Anything
// after `://` is left alone so a URL in a string cannot be truncated.
const gateCode = gate.replace(/(^|[^:])\/\/.*$/gm, '$1');

function jobSource(name: string): string {
  // The lookahead is the job boundary. It accepts digits and underscores too:
  // a future job id like `pr-gate2` would otherwise not terminate the previous
  // slice, letting one job's text bleed into another and quietly satisfying a
  // by-name pin from the wrong job.
  const match = workflow.match(new RegExp(`\\n  ${name}:[\\s\\S]*?(?=\\n  [a-z][a-z0-9_-]*:|$)`));
  if (!match) throw new Error(`missing CI job: ${name}`);
  return match[0];
}

describe('CI workflow parity', () => {
  it('runs the canonical game and admin typecheck in CI and the local gate', () => {
    expect(workflow.match(/run: npm run check:types/g)).toHaveLength(2);
    expect(workflow).not.toContain('run: npx tsc --noEmit');
    expect(gate).toContain("['typecheck', 'npm', ['run', 'check:types']]");
  });

  it('provisions FFmpeg from the static npm packages instead of apt', () => {
    // The gate preflight and the Studio playback/encode spawns resolve
    // ffmpeg/ffprobe via scripts/sfx/ffmpeg_paths.mjs (ffmpeg-static/
    // ffprobe-static with a PATH fallback); the conformance-measuring call sites
    // (sfx_conform.mjs, export_bundle.mjs) bind to the static packages directly.
    // Either way no CI job apt-installs system FFmpeg; reintroducing the install
    // step would put its cost back on every job it touches.
    expect(workflow).not.toContain('apt-get');
    expect(gate).toContain("from './sfx/ffmpeg_paths.mjs'");
  });

  it('runs the opt-in Chromium browser regressions in their own CI job', () => {
    const browserGate = jobSource('browser-gate');
    expect(browserGate).toContain('run: npx playwright install --with-deps chromium');
    expect(browserGate).toContain('run: npm run test:browser');
    expect(gate).toContain("['browser regressions', 'npm', ['run', 'test:browser']]");
  });

  it('posts the i18n coverage summary and diffs the committed artifacts in both jobs', () => {
    // The job-summary step is the out-of-band audit trail that replaced the
    // committed src/ui/i18n.status.summary.json; deleting it would silently
    // drop the trail, and re-adding the summary to a freshness diff or to
    // gate.mjs would resurrect the aggregate merge conflicts the degit removed.
    // The PR-tier copies of both steps live in pr-checks, not pr-gate.
    const prChecks = jobSource('pr-checks');
    const releaseGate = jobSource('release-gate');
    for (const job of [prChecks, releaseGate]) {
      expect(job).toContain('run: node scripts/i18n_coverage_summary.mjs');
      expect(job).toContain(
        'run: git diff --exit-code -- src/ui/i18n.resolved.generated src/admin/i18n.resolved.generated src/ui/i18n.catalog/translation_keys.generated.ts',
      );
      expect(job).not.toContain('src/ui/i18n.status.summary.json');
    }
    expect(gate).not.toContain('src/ui/i18n.status.summary.json');
  });

  it('runs the release tier against a release-to-main pull request merge result', () => {
    const prGate = jobSource('pr-gate');
    const prChecks = jobSource('pr-checks');
    const releaseGate = jobSource('release-gate');
    for (const job of [prGate, prChecks]) {
      expect(job).toContain(
        "github.event_name == 'pull_request' && (github.base_ref != 'main' || !startsWith(github.head_ref, 'release/'))",
      );
      expect(job).toContain(
        "github.event_name == 'push' && !startsWith(github.ref, 'refs/heads/release/')",
      );
      expect(job).toContain("github.event_name == 'workflow_dispatch'");
      expect(job).not.toContain('I18N_RELEASE_TIER');
    }
    // Anchored to the JOB level (the 4-space env block): moving the flag onto
    // a single step would silently run the four release test shards at PR tier.
    expect(releaseGate).toContain("\n    env:\n      I18N_RELEASE_TIER: '1'");
    expect(releaseGate).toContain(
      "github.event_name == 'pull_request' && github.base_ref == 'main'",
    );
    expect(releaseGate).toContain("startsWith(github.head_ref, 'release/')");
    expect(releaseGate).toContain(
      "github.event_name == 'push' && startsWith(github.ref, 'refs/heads/release/')",
    );
  });

  it('splits the PR tier into parallel test and checks jobs that cover every step', () => {
    const prGate = jobSource('pr-gate');
    const prChecks = jobSource('pr-checks');
    // Parallel means no needs edge in either direction, and splitting must not
    // DROP a check: the checks job carries every serialized step the single
    // pr-gate job used to run, while pr-gate keeps the test suite.
    expect(prGate).not.toContain('needs:');
    expect(prChecks).not.toContain('needs:');
    expect(prGate).toContain('run: npm test');
    expect(prChecks).not.toContain('run: npm test');
    for (const step of [
      'run: npm run i18n:gen',
      'run: node scripts/i18n_coverage_summary.mjs',
      'run: git diff --exit-code -- src/ui/i18n.resolved.generated',
      'run: npm run security:gate',
      'run: npm run check:types',
      'run: npm run build:env',
      'run: npm run build:server',
      'run: npm run build:bot',
      'run: npm run build\n',
    ]) {
      expect(prChecks).toContain(step);
      expect(prGate).not.toContain(step);
    }
  });

  it('shards the PR and release test steps four ways and keeps the checks single-shard', () => {
    const prGate = jobSource('pr-gate');
    const prChecks = jobSource('pr-checks');
    const releaseGate = jobSource('release-gate');
    // Both test jobs fan the ONE suite across the same 4-shard matrix. The run
    // line stays `npm test` (whose pretest regenerates the i18n artifacts in
    // every shard: the S3 guard, guide freshness, and the git-subprocess suites
    // need them regardless of which shard they hash into), never a bare vitest
    // invocation. fail-fast stays off so shards pass or fail independently and
    // a red run always reports the whole suite.
    const halfCoreCap =
      '--maxWorkers="$(node -p \'Math.max(1, Math.floor(require("node:os").availableParallelism() / 2))\')"';
    for (const job of [prGate, releaseGate]) {
      expect(job).toContain('strategy:');
      expect(job).toContain('fail-fast: false');
      expect(job).toContain('shard: [1, 2, 3, 4]');
      expect(job).toContain('run: npm test -- --shard=${{ matrix.shard }}/4');
      expect(job).toContain(halfCoreCap);
    }
    expect(workflow.match(/run: npm test -- --shard=\$\{\{ matrix\.shard \}\}\/4/g)).toHaveLength(
      2,
    );
    expect(workflow).not.toContain('npx vitest');
    // The local gate is the one place the whole suite still runs as a single
    // unsharded pass (bounded workers); a --shard flag there would silently
    // turn the pre-merge gate into a partial run, deleting the step would
    // silently drop tests from the gate entirely, and dropping the worker
    // bound would reintroduce the documented core-contention flake mode.
    expect(gate).not.toContain('--shard');
    expect(gate).toContain("'vitest (full suite)'");
    expect(gate).toContain('--maxWorkers=');
    // pr-checks stays a single unsharded job: its serialized checks run once.
    expect(prChecks).not.toContain('strategy:');
    expect(prChecks).not.toContain('matrix:');
    // pr-gate is tests-only, so nothing in it is gated to a single shard...
    expect(prGate).not.toContain('matrix.shard == 1');
    // ...while release-gate keeps its serialized checks and builds on exactly
    // one shard each (they are not partitionable and must not run four times):
    // i18n:gen, the freshness diff, the coverage summary, the malware gate,
    // typecheck, and the four builds (env, server, bot, client). Every new
    // non-test step added to release-gate needs the same single-shard
    // condition, and this count.
    expect(releaseGate.match(/if: matrix\.shard == 1/g)).toHaveLength(9);
    // The release TEST step itself must stay un-gated (run on every shard):
    // name-to-run adjacency proves no if: line sits between them, so a
    // compensating double-edit (gate the test step, un-gate a build; count
    // still 9) cannot silently shrink the release tier to a quarter of the
    // suite.
    expect(releaseGate).toMatch(
      /- name: Run tests \(release tier[^\n]*\n {8}run: npm test -- --shard=\$\{\{ matrix\.shard \}\}\/4/,
    );
    // Structural step counts close the remaining direction: a NEW step added
    // to either matrix job changes these totals and must consciously update
    // this test (an unconditioned addition to release-gate would otherwise
    // run four times per release push; pr-gate stays exactly checkout,
    // setup-node, npm ci, and the sharded test run).
    expect(prGate.match(/\n {6}- name: /g)).toHaveLength(4);
    expect(releaseGate.match(/\n {6}- name: /g)).toHaveLength(13);
    // ...and by NAME, because the two counts above are compensable: deleting a
    // build step and adding any other single-shard step keeps both totals and
    // would silently stop shipping that bundle from the release tier.
    for (const build of [
      'run: npm run build:env',
      'run: npm run build:server',
      'run: npm run build:bot',
      'run: npm run build\n',
    ]) {
      expect(releaseGate).toContain(build);
    }
  });

  it('builds every bundle in the local gate too, including the Discord bot', () => {
    // scripts/gate.mjs is the local mirror of the CI step list (its own header
    // says to keep them in sync), and nothing else pins its build steps: a
    // deleted gate step is invisible to CI, which runs its own list.
    // Matched against the comment-stripped source and with tolerant whitespace,
    // so neither commenting a step out nor a biome re-wrap can decide this.
    for (const [label, script] of [
      ['env build', 'build:env'],
      ['server build', 'build:server'],
      ['bot build', 'build:bot'],
      ['client build', 'build'],
    ] as const) {
      expect(gateCode).toMatch(
        new RegExp(
          `\\[\\s*'${label}',\\s*'npm',\\s*\\[\\s*'run',\\s*'${script}'\\s*\\]\\s*,?\\s*\\]`,
        ),
      );
    }
    // ...and in the CI order, so the cheap bundles still fail before the slow
    // client build does.
    expect(gateCode.indexOf("'server build'")).toBeLessThan(gateCode.indexOf("'bot build'"));
    expect(gateCode.indexOf("'bot build'")).toBeLessThan(gateCode.indexOf("'client build'"));
  });

  it('keeps the bot build a real, ungated failure in both CI jobs', () => {
    const prChecks = jobSource('pr-checks');
    const releaseGate = jobSource('release-gate');
    // Name-to-run adjacency, because `toContain('run: npm run build:bot')` is
    // also satisfied by `run: npm run build:bot || true` (which can never fail)
    // and by a copy-pasted `if: matrix.shard == 1` slipped between the two
    // lines, which in this unsharded job is never true and would disable the
    // build outright. Either would put a broken bundle back on the host.
    expect(prChecks).toMatch(/- name: Build Discord bot\n {8}run: npm run build:bot\n/);
    // A step that is allowed to fail is not a gate.
    expect(workflow).not.toContain('continue-on-error');
    // In release-gate the step must ALSO stay tied to its own name and its
    // single-shard condition: the aggregate count of 9 is compensable, so
    // un-gating this build while gating some other step keeps the count and
    // quietly runs the bot build four times per release push.
    expect(releaseGate).toMatch(
      /- name: Build Discord bot\n {8}if: matrix\.shard == 1\n {8}run: npm run build:bot\n/,
    );
  });

  it('never runs untrusted pull-request code with write access', () => {
    // The jobs above run `npm ci`, the full suite, and four builds over the
    // head ref of any fork PR. That is only safe while the workflow stays on
    // `pull_request` with a read-only token: switching to
    // `pull_request_target`, or granting a job write scope so some check
    // "works on forks", would hand that untrusted code a privileged token and
    // nothing else in the repo would go red.
    expect(workflow).not.toContain('pull_request_target');
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n/);
    // Unanchored on purpose: the read-only grant is workflow-level, and a JOB
    // may re-declare `permissions:` at its own indent to widen it. Matching
    // only at column 0 would miss exactly that escalation.
    expect(workflow.match(/^\s*permissions:/gm)).toHaveLength(1);
    expect(workflow).not.toContain('secrets.');
  });
});
