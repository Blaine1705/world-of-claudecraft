import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const diagnostics = await import(
  '../scripts/assets/eastbrook_grand_armoury/provenance_diagnostics.mjs'
);
const {
  REMINT_COMMAND,
  collectPolishProvenanceInputPaths,
  diffProvenanceComponents,
  formatPolishProvenanceMismatch,
  gitDirtyStatusLines,
} = diagnostics;

// Phase 6 of the CI/CD performance packet: the 2026-08-05 provenance
// incident (the craft-cast merge committed pin 628f66e2... while its own
// committed tree computes 09f6f78b..., one leaf apart on
// runtimeRender.renderer.sha256) burned hours because the failure said
// nothing about WHICH input moved, whether the tree was dirty, or how to
// re-mint. These tests pin the diagnostics that now answer all three.

const SEALED = {
  townAsset: { source: 'scripts/x.mjs', sourceFingerprint: 'a'.repeat(64) },
  runtimeRender: {
    renderer: { path: 'src/render/renderer.ts', sha256: 'b'.repeat(64) },
    town: { path: 'src/render/eastbrook_town.ts', sha256: 'c'.repeat(64) },
  },
};

describe('diffProvenanceComponents', () => {
  it('names the exact diverged leaf with dotted keys, the craft-cast analysis', () => {
    const computed = structuredClone(SEALED);
    computed.runtimeRender.renderer.sha256 = 'd'.repeat(64);
    expect(diffProvenanceComponents(SEALED, computed)).toEqual([
      { key: 'runtimeRender.renderer.sha256', sealed: 'b'.repeat(64), computed: 'd'.repeat(64) },
    ]);
  });

  it('returns empty for identical trees and reports missing branches leaf by leaf', () => {
    expect(diffProvenanceComponents(SEALED, structuredClone(SEALED))).toEqual([]);
    const missingBranch = { townAsset: SEALED.townAsset };
    expect(
      diffProvenanceComponents(SEALED, missingBranch as never).map((d: { key: string }) => d.key),
    ).toEqual([
      'runtimeRender.renderer.path',
      'runtimeRender.renderer.sha256',
      'runtimeRender.town.path',
      'runtimeRender.town.sha256',
    ]);
  });
});

describe('collectPolishProvenanceInputPaths', () => {
  it('collects every input path plus the source-fingerprint file lists, minus the contract id', () => {
    const paths = collectPolishProvenanceInputPaths({
      inputs: {
        authoritativeLayout: 'src/sim/eastbrook_layout.ts',
        rendererIntegration: 'src/render/renderer.ts',
        captureContract: 'polish-v2',
      },
      sourceFileLists: [
        ['scripts/assets/x/model.js', 'pnpm-lock.yaml'],
        ['pnpm-lock.yaml', 'scripts/assets/y/model.js'],
      ],
    });
    expect(paths).toEqual([
      'pnpm-lock.yaml',
      'scripts/assets/x/model.js',
      'scripts/assets/y/model.js',
      'src/render/renderer.ts',
      'src/sim/eastbrook_layout.ts',
    ]);
    expect(paths).not.toContain('polish-v2');
  });

  it('matches the real provenance input surface: lockfile and renderer both in scope', async () => {
    const [contract, town, mailbox, notice] = await Promise.all([
      // @ts-expect-error The executable capture contract intentionally ships as plain Node ESM.
      import('../scripts/assets/eastbrook_grand_armoury/capture_contract.mjs'),
      import('../scripts/assets/eastbrook_town/source_fingerprint.mjs'),
      import('../scripts/assets/eastbrook_mailbox/source_fingerprint.mjs'),
      import('../scripts/assets/eastbrook_noticeboard/source_fingerprint.mjs'),
    ]);
    const paths = collectPolishProvenanceInputPaths({
      inputs: contract.EASTBROOK_POLISH_PROVENANCE_INPUTS,
      sourceFileLists: [
        town.EASTBROOK_TOWN_SOURCE_FILES,
        mailbox.EASTBROOK_MAILBOX_SOURCE_FILES,
        notice.EASTBROOK_NOTICEBOARD_SOURCE_FILES,
      ],
    });
    // The two inputs the incident history proves matter most.
    expect(paths).toContain('src/render/renderer.ts');
    expect(paths).toContain('pnpm-lock.yaml');
    expect(paths).not.toContain('polish-v2');
  });
});

describe('gitDirtyStatusLines', () => {
  it('returns porcelain lines from the injected git runner and null on git failure', () => {
    const calls: string[][] = [];
    const dirty = gitDirtyStatusLines({
      repoRoot: '/repo',
      paths: ['a.ts', 'b.ts'],
      runGit: (args: string[], cwd: string) => {
        calls.push([cwd, ...args]);
        return ' M a.ts\n?? b.ts\n';
      },
    });
    expect(dirty).toEqual([' M a.ts', '?? b.ts']);
    expect(calls).toEqual([['/repo', 'status', '--porcelain', '--', 'a.ts', 'b.ts']]);
    expect(
      gitDirtyStatusLines({
        repoRoot: '/repo',
        paths: ['a.ts'],
        runGit: () => {
          throw new Error('no git');
        },
      }),
    ).toBeNull();
    expect(gitDirtyStatusLines({ repoRoot: '/repo', paths: ['a.ts'], runGit: () => '' })).toEqual(
      [],
    );
  });
});

describe('formatPolishProvenanceMismatch', () => {
  const computed = {
    fingerprint: '09f6f78b9c049ba5df01a27ddf054f00928dce957dec2b4d819d5109e83c4d10',
    components: (() => {
      const c = structuredClone(SEALED);
      c.runtimeRender.renderer.sha256 = 'd'.repeat(64);
      return c;
    })(),
  };
  const pinnedFingerprint = '628f66e2ba22fb456ca64603dfee7311bf766ee5d9ebe71d5e2b2109b01f1d3b';

  it('always prints both fingerprints and the exact one-step remint command', () => {
    const message = formatPolishProvenanceMismatch({ pinnedFingerprint, computed });
    expect(message).toContain(computed.fingerprint);
    expect(message).toContain(pinnedFingerprint);
    expect(message).toContain(REMINT_COMMAND);
    expect(REMINT_COMMAND).toBe(
      'node scripts/assets/eastbrook_grand_armoury/remint_polish_provenance.mjs',
    );
  });

  it('names the moved leaf against the sealed components', () => {
    const message = formatPolishProvenanceMismatch({
      pinnedFingerprint,
      computed,
      sealedComponents: SEALED,
    });
    expect(message).toContain('runtimeRender.renderer.sha256');
    expect(message).toContain('b'.repeat(64));
    expect(message).toContain('d'.repeat(64));
  });

  it('separates the dirty-tree hazard from the legitimate-remint verdict', () => {
    const dirty = formatPolishProvenanceMismatch({
      pinnedFingerprint,
      computed,
      dirtyStatusLines: [' M src/render/renderer.ts'],
    });
    expect(dirty).toContain('WARNING: fingerprinted inputs differ from HEAD');
    expect(dirty).toContain(' M src/render/renderer.ts');
    expect(dirty).toContain('craft-cast');
    const clean = formatPolishProvenanceMismatch({
      pinnedFingerprint,
      computed,
      dirtyStatusLines: [],
    });
    expect(clean).toContain('a re-mint is legitimate');
    const unavailable = formatPolishProvenanceMismatch({
      pinnedFingerprint,
      computed,
      dirtyStatusLines: null,
    });
    expect(unavailable).toContain('git status unavailable');
  });

  it('flags a seal-consistent tree as a pin-only hand edit', () => {
    const message = formatPolishProvenanceMismatch({
      pinnedFingerprint,
      computed,
      sealedComponents: computed.components,
    });
    expect(message).toContain('the pin literal alone is stale');
  });
});

describe('wiring', () => {
  it('the capture-contract suite and the remint tool both use the diagnostics', () => {
    // Comments stripped first (block then line, the ci_workflow.test.ts
    // idiom) so a commented-out call cannot satisfy the pin.
    const strip = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const suite = strip(
      readFileSync(new URL('./eastbrook_polish_capture_contract.test.ts', import.meta.url), 'utf8'),
    );
    expect(suite).toContain('provenance_diagnostics.mjs');
    expect(suite).toContain('formatPolishProvenanceMismatch');
    expect(suite).toContain('gitDirtyStatusLines');
    const remint = strip(
      readFileSync(
        new URL(
          '../scripts/assets/eastbrook_grand_armoury/remint_polish_provenance.mjs',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(remint).toContain('provenance_diagnostics.mjs');
    expect(remint).toContain('gitDirtyStatusLines');
    expect(remint).toContain('collectPolishProvenanceInputPaths');
  });
});
