/**
 * Pins for the optional Epic BPT upload helper: fail-closed without credentials,
 * --help without secrets, no linux os, dry-run never spawns when gated.
 * Does not call real BuildPatchTool or network.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error untyped zero-dependency ops tool (scripts/*.mjs convention)
import * as rawBpt from '../scripts/epic-bpt-upload.mjs';

type BptHelpers = {
  DEFAULT_APP_LAUNCH: { win: string; mac: string };
  DEFAULT_BUILD_ROOTS: { win: string; mac: string };
  REQUIRED_ENV_KEYS: readonly string[];
  missingBptEnv: (env: NodeJS.ProcessEnv) => string[];
  parseArgs: (argv: string[]) => { help?: boolean; dryRun?: boolean; errors: string[] };
  resolveUploadPlan: (opts: {
    os: string;
    buildVersion: string;
    env: NodeJS.ProcessEnv;
    repoRoot: string;
  }) => { bptArgs: string[] };
  redactArgsForLog: (args: string[]) => string[];
  runCli: (
    argv: string[],
    opts: {
      env: NodeJS.ProcessEnv;
      log?: (s: string) => void;
      error?: (s: string) => void;
      repoRoot?: string;
      execBpt?: () => { status: number };
    },
  ) => number;
};

// Narrow the untyped script surface so noImplicitAny stays green under tsc.
const bpt = rawBpt as BptHelpers;

describe('epic-bpt-upload helpers', () => {
  it('lists every required env key (ops BPT family, not server EPIC_CLIENT_SECRET alone)', () => {
    expect(bpt.REQUIRED_ENV_KEYS).toEqual([
      'EPIC_BPT_BIN',
      'EPIC_BPT_ORGANIZATION_ID',
      'EPIC_BPT_PRODUCT_ID',
      'EPIC_BPT_ARTIFACT_ID',
      'EPIC_BPT_CLIENT_ID',
      'EPIC_BPT_CLIENT_SECRET',
      'EPIC_BPT_CLOUD_DIR',
    ]);
  });

  it('missingBptEnv reports all empty keys and none when provisioned', () => {
    expect(bpt.missingBptEnv({})).toEqual(bpt.REQUIRED_ENV_KEYS);
    expect(bpt.missingBptEnv({ EPIC_BPT_BIN: '  ' })).toContain('EPIC_BPT_BIN');
    const full: NodeJS.ProcessEnv = {};
    for (const k of bpt.REQUIRED_ENV_KEYS) full[k] = `x-${k}`;
    expect(bpt.missingBptEnv(full)).toEqual([]);
  });

  it('parseArgs accepts help and dry-run without os', () => {
    expect(bpt.parseArgs(['--help']).help).toBe(true);
    expect(bpt.parseArgs(['--dry-run', '--os', 'win', '--build-version', '1']).dryRun).toBe(true);
  });

  it('parseArgs rejects linux and unknown flags', () => {
    const linux = bpt.parseArgs(['--os', 'linux', '--build-version', '1']);
    expect(linux.errors.some((e) => /linux/i.test(e))).toBe(true);
    const bad = bpt.parseArgs(['--upload-prod']);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('default BuildRoots are loose release-epic dir trees only', () => {
    expect(bpt.DEFAULT_BUILD_ROOTS.win).toContain('release-epic');
    expect(bpt.DEFAULT_BUILD_ROOTS.win).toContain('win-unpacked');
    expect(bpt.DEFAULT_BUILD_ROOTS.mac).toContain('mac-universal');
    expect(bpt.DEFAULT_APP_LAUNCH.win).toMatch(/\.exe$/);
    expect(bpt.DEFAULT_APP_LAUNCH.mac).toContain('.app');
  });

  it('resolveUploadPlan uses ClientSecretEnvVar never inline secret value', () => {
    const plan = bpt.resolveUploadPlan({
      os: 'win',
      buildVersion: '0.1.0-windows',
      env: {
        EPIC_BPT_ORGANIZATION_ID: 'org',
        EPIC_BPT_PRODUCT_ID: 'prod',
        EPIC_BPT_ARTIFACT_ID: 'art',
        EPIC_BPT_CLIENT_ID: 'cid',
        EPIC_BPT_CLIENT_SECRET: 'super-secret-value',
        EPIC_BPT_CLOUD_DIR: '/tmp/cloud',
        EPIC_BPT_BIN: '/tmp/bpt',
      },
      repoRoot: '/repo',
    });
    expect(plan.bptArgs).toContain('-ClientSecretEnvVar=EPIC_BPT_CLIENT_SECRET');
    expect(plan.bptArgs.join(' ')).not.toContain('super-secret-value');
    expect(plan.bptArgs).toContain('-mode=UploadBinary');
    expect(
      plan.bptArgs.some((a) => a.startsWith('-BuildRoot=') && a.includes('win-unpacked')),
    ).toBe(true);
  });

  it('redactArgsForLog strips inline ClientSecret assignments', () => {
    expect(
      bpt.redactArgsForLog(['-ClientSecret=abc', '-ClientSecretEnvVar=EPIC_BPT_CLIENT_SECRET']),
    ).toEqual(['-ClientSecret=<redacted>', '-ClientSecretEnvVar=EPIC_BPT_CLIENT_SECRET']);
  });
});

describe('epic-bpt-upload runCli', () => {
  it('--help exits 0 without credentials', () => {
    const lines: string[] = [];
    const code = bpt.runCli(['--help'], {
      env: {},
      log: (s) => lines.push(s),
      error: (s) => lines.push(s),
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/epic-bpt-upload/);
    expect(lines.join('\n')).toMatch(/EPIC_BPT_CLIENT_SECRET/);
  });

  it('fails closed with exit 1 when credentials missing', () => {
    const errs: string[] = [];
    const code = bpt.runCli(['--os', 'win', '--build-version', '1.0.0'], {
      env: {},
      log: () => {},
      error: (s) => errs.push(s),
    });
    expect(code).toBe(1);
    expect(errs.join('\n')).toMatch(/missing required credentials/i);
    expect(errs.join('\n')).toMatch(/EPIC_BPT_CLIENT_SECRET/);
    expect(errs.join('\n')).not.toMatch(/login with epic/i);
  });

  it('refuses missing --os / --build-version with exit 2', () => {
    expect(
      bpt.runCli([], {
        env: {},
        log: () => {},
        error: () => {},
      }),
    ).toBe(2);
    expect(
      bpt.runCli(['--os', 'win'], {
        env: {},
        log: () => {},
        error: () => {},
      }),
    ).toBe(2);
  });

  it('dry-run works without secrets and never spawns BPT', () => {
    const lines: string[] = [];
    let spawned = false;
    const code = bpt.runCli(['--dry-run', '--os', 'win', '--build-version', '1.0.0-test'], {
      env: {},
      repoRoot: '/tmp',
      execBpt: () => {
        spawned = true;
        return { status: 0 };
      },
      log: (s) => lines.push(s),
      error: (s) => lines.push(s),
    });
    expect(code).toBe(0);
    expect(spawned).toBe(false);
    expect(lines.join('\n')).toMatch(/dry-run only/i);
    expect(lines.join('\n')).toMatch(/missing env/i);
  });

  it('real upload path fails closed before spawn when bin missing', () => {
    const full: NodeJS.ProcessEnv = {};
    for (const k of bpt.REQUIRED_ENV_KEYS) full[k] = `/nonexistent-${k}`;
    full.EPIC_BPT_BIN = '/nonexistent/BuildPatchTool';
    full.EPIC_BPT_CLOUD_DIR = '/tmp';
    let spawned = false;
    const code = bpt.runCli(['--os', 'win', '--build-version', '1.0.0-test'], {
      env: full,
      repoRoot: '/tmp',
      execBpt: () => {
        spawned = true;
        return { status: 0 };
      },
      log: () => {},
      error: () => {},
    });
    expect(code).toBe(1);
    expect(spawned).toBe(false);
  });
});
