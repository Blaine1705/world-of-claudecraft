import { describe, expect, it } from 'vitest';
import {
  classifyPrFiles,
  detectCode,
  fetchPrFiles,
  isCodePath,
  PR_FILES_CAP,
} from '../scripts/lib/ci_change_classify.mjs';

type Entry = { filename?: string; previous_filename?: string | null };

// Minimal fetch stub: serves `files` through the paginated PR files endpoint
// shape (per_page/page query params), recording every call for order and
// header assertions. Plain objects stand in for Response; the lib only reads
// ok, status, and json().
function pagedFetch(files: Entry[]) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = new URL(String(url));
    const page = Number(u.searchParams.get('page'));
    const perPage = Number(u.searchParams.get('per_page'));
    return {
      ok: true,
      status: 200,
      json: async () => files.slice((page - 1) * perPage, page * perPage),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const failingFetch = (status: number) =>
  (async () => ({
    ok: false,
    status,
    json: async () => ({}),
  })) as unknown as typeof fetch;

const BASE = {
  eventName: 'pull_request',
  prNumber: 123,
  repo: 'levy-street/world-of-claudecraft',
  token: 'ghs_test',
} as const;

describe('isCodePath', () => {
  it('matches directory rules at any depth, exactly as the old shell case globs did', () => {
    expect(isCodePath('src/sim/sim.ts')).toBe(true);
    expect(isCodePath('src/ui/hud/town/index.ts')).toBe(true);
    expect(isCodePath('scripts/lib/ci_change_classify.mjs')).toBe(true);
    expect(isCodePath('.github/workflows/ci.yml')).toBe(true);
    // Sibling-name near misses must not match: prefixes end at the slash.
    expect(isCodePath('srcs/notes.md')).toBe(false);
    expect(isCodePath('docs/src/diagram.md')).toBe(false);
    // Non-workflow .github files are not code (the PR template, agent docs).
    expect(isCodePath('.github/PULL_REQUEST_TEMPLATE.md')).toBe(false);
  });

  it('matches the top-level exact rules without widening them to nested paths', () => {
    for (const exact of [
      'package.json',
      'pnpm-lock.yaml',
      'tsconfig.json',
      'tsconfig.admin.json',
      'vite.config.ts',
      'vitest.browser.config.ts',
      'biome.json',
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
    ]) {
      expect(isCodePath(exact)).toBe(true);
    }
    expect(isCodePath('Dockerfile.bot')).toBe(true);
    // The shell case matched the WHOLE path, so a nested copy of an exact name
    // outside every code directory stayed non-code; preserve that.
    expect(isCodePath('docs/package.json')).toBe(false);
    expect(isCodePath('docs/examples/Dockerfile')).toBe(false);
  });

  it('leaves documentation surfaces classifiable as non-code', () => {
    expect(isCodePath('README.md')).toBe(false);
    expect(isCodePath('CLAUDE.md')).toBe(false);
    expect(isCodePath('docs/prd/some-spec.md')).toBe(false);
    expect(isCodePath('docs/screenshots/before.png')).toBe(false);
    expect(isCodePath('CREDITS.md')).toBe(false);
  });

  it('fails closed on input it cannot read', () => {
    expect(isCodePath('')).toBe(true);
    expect(isCodePath(undefined as unknown as string)).toBe(true);
    expect(isCodePath(7 as unknown as string)).toBe(true);
  });
});

describe('classifyPrFiles', () => {
  it('flags a code file anywhere in the listing and names it in the reason', () => {
    const result = classifyPrFiles([
      { filename: 'docs/prd/spec.md' },
      { filename: 'server/game.ts' },
      { filename: 'README.md' },
    ]);
    expect(result.code).toBe(true);
    expect(result.reason).toBe('code path change detected (server/game.ts): full PR tier');
  });

  it('classifies a fully non-code listing as docs-only with the skip reason', () => {
    const result = classifyPrFiles([
      { filename: 'docs/prd/spec.md' },
      { filename: 'docs/screenshots/after.png' },
      { filename: 'README.md' },
    ]);
    expect(result).toEqual({
      code: false,
      reason: 'docs-only (or non-code) change: skip pr-gate, pr-checks, browser-gate',
    });
  });

  it('classifies both ends of a rename, like the old add+delete diff pair', () => {
    // Renamed OUT of the code path set: the API folds this into one entry
    // whose filename is non-code; only previous_filename betrays it.
    const out = classifyPrFiles([
      { filename: 'docs/old_sim.md', previous_filename: 'src/sim/old.ts' },
    ]);
    expect(out.code).toBe(true);
    expect(out.reason).toBe(
      'code path change detected (renamed from src/sim/old.ts): full PR tier',
    );
    // A rename fully inside docs stays non-code.
    const docs = classifyPrFiles([
      { filename: 'docs/prd/new-name.md', previous_filename: 'docs/prd/old-name.md' },
    ]);
    expect(docs.code).toBe(false);
  });

  it('fails closed on an entry it cannot read', () => {
    expect(classifyPrFiles([{ filename: 'docs/a.md' }, {}]).code).toBe(true);
    expect(classifyPrFiles([{ filename: '' }]).code).toBe(true);
    expect(
      classifyPrFiles([{ filename: 'docs/a.md', previous_filename: 9 as unknown as string }]).code,
    ).toBe(true);
  });
});

describe('fetchPrFiles', () => {
  it('paginates until a short page and returns the concatenated listing', async () => {
    const files: Entry[] = Array.from({ length: 250 }, (_, i) => ({ filename: `docs/f${i}.md` }));
    const { impl, calls } = pagedFetch(files);
    const listed = await fetchPrFiles({ ...BASE, fetchImpl: impl });
    expect(listed).toHaveLength(250);
    expect(listed[249]).toEqual({ filename: 'docs/f249.md' });
    expect(calls.map((c) => new URL(c.url).searchParams.get('page'))).toEqual(['1', '2', '3']);
    expect(calls[0].url).toBe(
      'https://api.github.com/repos/levy-street/world-of-claudecraft/pulls/123/files?per_page=100&page=1',
    );
  });

  it('sends the token and API headers on every page request', async () => {
    const { impl, calls } = pagedFetch([{ filename: 'docs/a.md' }]);
    await fetchPrFiles({ ...BASE, fetchImpl: impl });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ghs_test');
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws on an HTTP error status', async () => {
    await expect(fetchPrFiles({ ...BASE, fetchImpl: failingFetch(403) })).rejects.toThrow(
      /HTTP 403/,
    );
  });

  it('throws on a non-array payload', async () => {
    const impl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: 'unexpected' }),
    })) as unknown as typeof fetch;
    await expect(fetchPrFiles({ ...BASE, fetchImpl: impl })).rejects.toThrow(/non-array/);
  });

  it('throws once the listing exceeds the completeness cap', async () => {
    const files: Entry[] = Array.from({ length: 250 }, (_, i) => ({ filename: `docs/f${i}.md` }));
    const { impl } = pagedFetch(files);
    await expect(fetchPrFiles({ ...BASE, fetchImpl: impl, cap: 200 })).rejects.toThrow(
      /more than 200 files/,
    );
    // The real cap matches the documented endpoint limit.
    expect(PR_FILES_CAP).toBe(3000);
  });
});

describe('detectCode (fail closed end to end)', () => {
  const neverFetch = (async () => {
    throw new Error('fetch must not be called for this case');
  }) as unknown as typeof fetch;

  it('returns code=true for non-PR events without touching the API', async () => {
    for (const eventName of ['push', 'workflow_dispatch', 'schedule', '']) {
      expect(await detectCode({ ...BASE, eventName, fetchImpl: neverFetch })).toEqual({
        code: true,
        reason: 'non-PR event: full PR tier (code=true)',
      });
    }
  });

  it('returns code=true when the PR context or token is missing', async () => {
    expect((await detectCode({ ...BASE, prNumber: Number.NaN, fetchImpl: neverFetch })).code).toBe(
      true,
    );
    expect((await detectCode({ ...BASE, prNumber: 0, fetchImpl: neverFetch })).code).toBe(true);
    expect((await detectCode({ ...BASE, repo: '', fetchImpl: neverFetch })).code).toBe(true);
    expect(await detectCode({ ...BASE, token: '', fetchImpl: neverFetch })).toEqual({
      code: true,
      reason: 'missing API token: full PR tier (code=true)',
    });
  });

  it('returns code=true on a forced API failure, never code=false', async () => {
    // The acceptance case for the API-driven classifier: an API that errors,
    // times out, or rejects must run the full suite.
    const rejecting = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const rejected = await detectCode({ ...BASE, fetchImpl: rejecting });
    expect(rejected.code).toBe(true);
    expect(rejected.reason).toBe(
      'changed-file listing failed (ECONNRESET): full PR tier (code=true)',
    );
    const denied = await detectCode({ ...BASE, fetchImpl: failingFetch(401) });
    expect(denied.code).toBe(true);
    expect(denied.reason).toMatch(/^changed-file listing failed .*HTTP 401/);
    // A non-Error throw still resolves to code=true.
    const weird = (async () => {
      throw 'string failure';
    }) as unknown as typeof fetch;
    expect((await detectCode({ ...BASE, fetchImpl: weird })).code).toBe(true);
  });

  it('returns code=true on an empty listing or a changed_files mismatch', async () => {
    const { impl: empty } = pagedFetch([]);
    expect(await detectCode({ ...BASE, fetchImpl: empty })).toEqual({
      code: true,
      reason: 'empty file list: full PR tier (code=true)',
    });
    const { impl } = pagedFetch([{ filename: 'docs/a.md' }, { filename: 'docs/b.md' }]);
    const mismatched = await detectCode({ ...BASE, reportedCount: 5, fetchImpl: impl });
    expect(mismatched).toEqual({
      code: true,
      reason: 'listed 2 files but the event reports 5: full PR tier (code=true)',
    });
  });

  it('classifies a docs-only PR as code=false when the listing is complete', async () => {
    const docs: Entry[] = [
      { filename: 'docs/prd/spec.md' },
      { filename: 'README.md' },
      { filename: 'docs/screenshots/after.png' },
    ];
    const { impl } = pagedFetch(docs);
    const counted = await detectCode({ ...BASE, reportedCount: 3, fetchImpl: impl });
    expect(counted.code).toBe(false);
    // changed_files missing from the payload skips the count check but still
    // classifies (the listing itself terminated normally).
    const { impl: uncounted } = pagedFetch(docs);
    expect((await detectCode({ ...BASE, fetchImpl: uncounted })).code).toBe(false);
  });

  it('classifies a code PR as code=true through the same path', async () => {
    const { impl } = pagedFetch([{ filename: 'docs/a.md' }, { filename: 'src/sim/sim.ts' }]);
    const result = await detectCode({ ...BASE, reportedCount: 2, fetchImpl: impl });
    expect(result).toEqual({
      code: true,
      reason: 'code path change detected (src/sim/sim.ts): full PR tier',
    });
  });
});
