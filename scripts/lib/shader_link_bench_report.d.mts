export interface LinkRun {
  ms: number;
  ok: boolean;
  log?: string;
}

export interface LinkResult {
  hash: string;
  name: string;
  kind: string;
  firstStep?: string;
  profiles?: string[];
  runs?: LinkRun[];
}

export interface LinkRow {
  hash: string;
  name: string;
  kind: string;
  firstStep?: string;
  profiles: string[];
  firstMs: number;
  repeatMs: number;
  costMs: number;
}

export interface Concentration {
  count: number;
  totalMs: number;
  medianMs: number;
  p90Ms: number;
  p95Ms: number;
  maxMs: number;
  tailRatio: number;
  top10Share: number;
  top10FlatShare: number;
  top10PercentShare: number;
}

export function median(values: number[]): number;
export function quantile(values: number[], q: number): number;
export function summarizePrograms(results: LinkResult[]): {
  rows: LinkRow[];
  failures: { hash: string; name: string; log: string }[];
};
export function concentration(rows: LinkRow[]): Concentration;
export function renderLinkBenchReport(payload: {
  results: LinkResult[];
  machine?: { renderer?: string };
  browser?: string;
  angle?: string;
  reps?: number;
  seconds?: number;
  corpus?: { gitSha?: string; programCount?: number };
}): string;
