import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  new URL('../scripts/geared_arrival_bench.mjs', import.meta.url),
  'utf8',
);

describe('geared arrival bench fixture bounds', () => {
  it('caps the crowd and bounds database operations', () => {
    expect(SOURCE).toContain(
      "throw new Error('BENCH_WAVES must contain positive integers totalling at most 40')",
    );
    expect(SOURCE).toContain('connectionTimeoutMillis: 5_000');
    expect(SOURCE).toContain('query_timeout: 15_000');
    expect(SOURCE).toContain('statement_timeout: 15_000');
    expect(SOURCE).toContain("options: '-c lock_timeout=5000'");
  });

  it('removes only the exact accounts created by the run', () => {
    expect(SOURCE).toContain('DELETE FROM accounts WHERE username = ANY($1::text[])');
    expect(SOURCE).toMatch(/gearcam_\$\{uniq\}/);
  });
});
