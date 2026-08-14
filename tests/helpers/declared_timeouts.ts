// Pure scraper for DECLARED vitest timeouts in a test file's source text.
// Consumed by tests/suite_duration_budget.test.ts (the anti-whale ratchet) and
// driven directly by its mkdtemp fixture, so the producer's parsing semantics
// are pinned by execution rather than assumed.
//
// What counts as a declared timeout, matching this repo's real forms:
//   it('...', () => { ... }, 120_000)            trailing-argument form
//   it('...', { timeout: 240_000 }, () => ...)   option-object form
//   it(..., fn, FULL_SWEEP ? 900_000 : 300_000)  ternary: the DIET (second) arm
//     counts, because that is the PR-time allowance; the sweep arm runs on the
//     nightly, which runs the whole suite regardless.
// Comments are stripped FIRST so a number in prose (or a commented-out old
// value) can never count, and values under 10 seconds are ignored (default
// vitest timeouts and fake-clock constants live below that line).
//
// Deliberate limitation, documented where the consumer states its contract:
// this reads ALLOWANCES, not runtimes. A file's sum is its declared worst
// case; describe-body collection work and it.each expansion are invisible
// here. The guard built on this is a conscious-decision ratchet, not a
// measurement.

export interface DeclaredTimeouts {
  perTest: number[];
  sum: number;
}

const MIN_COUNTED_MS = 10_000;

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const NUM = '([0-9][0-9_]*)';
const TERNARY = `\\?\\s*${NUM}\\s*:\\s*${NUM}`;
// Option-object form: `timeout: N` or `timeout: FLAG ? A : B`.
const OPTION_RE = new RegExp(`timeout:\\s*(?:[A-Za-z_$][\\w$]*\\s*${TERNARY}|${NUM})`, 'g');
// Trailing-argument form: a function body close, comma, the timeout, then the
// registration's closing paren (optionally via a trailing comma/newline).
const TRAILING_RE = new RegExp(
  `\\}\\s*,\\s*(?:[A-Za-z_$][\\w$]*\\s*${TERNARY}|${NUM})\\s*,?\\s*\\)`,
  'g',
);

function dietArm(match: RegExpMatchArray): number {
  const raw = match[2] ?? match[3] ?? match[1];
  return Number(raw.replace(/_/g, ''));
}

export function declaredTimeouts(source: string): DeclaredTimeouts {
  const clean = stripComments(source);
  const perTest: number[] = [];
  for (const match of clean.matchAll(OPTION_RE)) {
    const value = dietArm(match);
    if (value >= MIN_COUNTED_MS) perTest.push(value);
  }
  for (const match of clean.matchAll(TRAILING_RE)) {
    const value = dietArm(match);
    if (value >= MIN_COUNTED_MS) perTest.push(value);
  }
  return { perTest, sum: perTest.reduce((total, value) => total + value, 0) };
}
