import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/nightly.yml', import.meta.url), 'utf8');
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { packageManager?: string };
const targetsEntry = readFileSync(
  new URL('../scripts/nightly_targets.mjs', import.meta.url),
  'utf8',
);
const reportEntry = readFileSync(new URL('../scripts/nightly_report.mjs', import.meta.url), 'utf8');

const PNPM_VERSION = (() => {
  const field = packageJson.packageManager ?? '';
  const match = field.match(/^pnpm@(\d+\.\d+\.\d+)$/);
  if (!match) {
    throw new Error(`package.json packageManager must be pnpm@X.Y.Z, got ${JSON.stringify(field)}`);
  }
  return match[1];
})();

// Same job-boundary slicing as tests/ci_workflow.test.ts: the lookahead stops
// at the next two-space job key so one job's text cannot satisfy a pin meant
// for another.
function jobSource(name: string): string {
  const match = workflow.match(
    new RegExp(`\\n  ${name}:[\\s\\S]*?(?=\\n  [A-Za-z][A-Za-z0-9_-]*:|$)`),
  );
  if (!match) throw new Error(`missing nightly job: ${name}`);
  return match[0];
}

// The serialized check steps the nightly mirrors from ci.yml's release-checks
// job (minus the tsc incremental cache, which is keyed to a moving tip here).
const NIGHTLY_CHECK_STEPS = [
  'run: npm run i18n:gen',
  'run: git diff --exit-code -- src/ui/i18n.resolved.generated',
  'run: npm run security:gate',
  'run: npm run check:types',
  'run: npm run build:env',
  'run: npm run build:server',
  'run: npm run build:bot',
  'run: npm run build\n',
] as const;

describe('nightly gate workflow', () => {
  it('runs on a schedule and manual dispatch only, never on PR or push traffic', () => {
    const triggers = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
    expect(triggers).toMatch(
      /\n {2}schedule:\n {4}# [^\n]+\n[^\n]*\n {4}- cron: '47 4 \* \* \*'\n/,
    );
    expect(triggers).toContain('workflow_dispatch:');
    expect(triggers).toMatch(/\n {6}ref:\n/);
    // The whole point of a separate file: zero added PR latency, and no cron
    // fan-out into ci.yml's PR-shaped jobs (same reasoning as audit.yml).
    expect(triggers).not.toContain('pull_request');
    expect(triggers).not.toMatch(/\n {2}push:/);
  });

  it('resolves refs through the tested script and fans every lane over them', () => {
    const targets = jobSource('targets');
    expect(targets).toContain('run: node scripts/nightly_targets.mjs');
    expect(targets).toContain('refs: ${{ steps.resolve.outputs.refs }}');
    expect(targets).toContain('NIGHTLY_REF: ${{ inputs.ref }}');
    expect(targets).toContain('filter: blob:none');
    for (const name of ['tests', 'checks', 'browser'] as const) {
      const job = jobSource(name);
      expect(job).toMatch(/^\s{4}needs: targets$/m);
      expect(job).toContain('ref: ${{ fromJSON(needs.targets.outputs.refs) }}');
      expect(job).toContain('fail-fast: false');
      expect(job).toContain('ref: ${{ matrix.ref }}');
      expect(job).toContain('run: pnpm install --frozen-lockfile');
      expect(job).toContain(`version: ${PNPM_VERSION}`);
    }
    // The entry scripts stay wired to the unit-tested planning lib.
    expect(targetsEntry).toContain("from './lib/nightly_plan.mjs'");
    expect(targetsEntry).toContain('refs=');
    expect(reportEntry).toContain("from './lib/nightly_plan.mjs'");
    expect(reportEntry).toContain('planNightlyReport');
  });

  it('runs the full unsharded suite per ref, with the bounded worker cap', () => {
    const tests = jobSource('tests');
    expect(tests).toContain(
      'run: npm test -- --maxWorkers="$(node -p \'Math.max(1, Math.floor(require("node:os").availableParallelism() / 2))\')"',
    );
    // Unsharded by design: a --shard flag here would quietly turn the nightly
    // proof into a partial run.
    expect(tests).not.toContain('--shard');
    expect(tests).not.toContain('I18N_RELEASE_TIER');
  });

  it('mirrors the serialized release checks and the browser lane', () => {
    const checks = jobSource('checks');
    for (const step of NIGHTLY_CHECK_STEPS) {
      expect(checks).toMatch(new RegExp(`\\n {8}${step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    expect(checks).not.toContain('run: npm test');
    const browser = jobSource('browser');
    expect(browser).toContain('run: npx playwright install --with-deps chromium');
    expect(browser).toContain('run: npm run test:browser');
    expect(browser).toContain('path: ~/.cache/ms-playwright');
  });

  it('always reports, and only the report job may write issues', () => {
    const report = jobSource('report');
    expect(report).toMatch(/^\s{4}needs: \[targets, tests, checks, browser\]$/m);
    expect(report).toMatch(/^\s{4}if: \$\{\{ always\(\) \}\}$/m);
    expect(report).toContain('run: node scripts/nightly_report.mjs');
    expect(report).toContain('GITHUB_TOKEN: ${{ github.token }}');
    expect(report).toContain('NIGHTLY_TARGETS: ${{ needs.targets.outputs.refs }}');
    // The report job must judge the workflow's own ref, never the matrix ref:
    // it is the one job holding a write scope.
    expect(report).not.toContain('matrix.ref');
    // Workflow-level permissions stay read-only; the report job's block is the
    // only widen and issues: write is the only write scope in the file.
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n\n/);
    expect(workflow.match(/^\s*permissions:/gm)).toHaveLength(2);
    expect(report).toMatch(/\n {4}permissions:\n {6}contents: read\n {6}issues: write\n/);
    expect(workflow.match(/^\s*[\w-]+: write\s*$/gm)).toEqual(['      issues: write']);
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toContain('pull_request_target');
  });

  it('bounds every job so a wedged runner cannot eat the night', () => {
    // One timeout per job: five jobs, five timeouts.
    expect(workflow.match(/^\s{4}timeout-minutes: \d+$/gm)).toHaveLength(5);
    // Nothing cancels a nightly pass; dispatch and schedule stay in separate
    // concurrency groups.
    expect(workflow).toContain('cancel-in-progress: false');
  });
});
