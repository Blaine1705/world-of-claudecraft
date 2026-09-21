// The pure half of scripts/shader_link_bench.mjs: turns per-program link
// timings into the numbers that answer one question, "is the cost held by a
// few programs or spread over all of them". No fs, no browser; pinned by
// tests/shader_link_bench_report.test.ts.
//
// Two costs per program. `firstMs` is the first salted link: everything cold
// that a salt can make cold. `repeatMs` is the median of the later salted
// links: the browser and ANGLE caches still miss, but the GPU driver may now
// hit on the identical compiled bytecode, so it approximates the backend
// compile alone. The ranking uses `repeatMs` when there is one, because it is
// the part a shader rewrite can change and the more repeatable of the two.

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** One row per program that linked; failures are returned apart. */
export function summarizePrograms(results) {
  const rows = [];
  const failures = [];
  for (const r of results) {
    const runs = r.runs ?? [];
    if (!runs.length || runs.some((run) => !run.ok)) {
      failures.push({ hash: r.hash, name: r.name, log: runs.find((run) => !run.ok)?.log ?? '' });
      continue;
    }
    const firstMs = runs[0].ms;
    const later = runs.slice(1).map((run) => run.ms);
    const repeatMs = later.length ? median(later) : firstMs;
    rows.push({
      hash: r.hash,
      name: r.name,
      kind: r.kind,
      firstStep: r.firstStep,
      profiles: r.profiles ?? [],
      firstMs,
      repeatMs,
      costMs: repeatMs,
    });
  }
  rows.sort((a, b) => b.costMs - a.costMs);
  return { rows, failures };
}

/**
 * How concentrated the cost is. `topShare(n)` is the share of the summed cost
 * held by the n dearest programs; `tailRatio` is p95 over the median. A flat
 * corpus has a tailRatio near 1 and a top-10 share near 10 / count.
 */
export function concentration(rows) {
  const costs = rows.map((r) => r.costMs);
  const total = costs.reduce((a, b) => a + b, 0);
  const topShare = (n) =>
    total > 0 ? rows.slice(0, n).reduce((a, r) => a + r.costMs, 0) / total : 0;
  const med = median(costs);
  return {
    count: rows.length,
    totalMs: total,
    medianMs: med,
    p90Ms: quantile(costs, 0.9),
    p95Ms: quantile(costs, 0.95),
    maxMs: costs.length ? Math.max(...costs) : 0,
    tailRatio: med > 0 ? quantile(costs, 0.95) / med : 0,
    top10Share: topShare(10),
    top10FlatShare: rows.length ? Math.min(1, 10 / rows.length) : 0,
    top10PercentShare: topShare(Math.max(1, Math.round(rows.length / 10))),
  };
}

const ms = (v) => v.toFixed(1);
const pct = (v) => `${(v * 100).toFixed(1)} %`;

export function renderLinkBenchReport(payload) {
  const { rows, failures } = summarizePrograms(payload.results);
  const c = concentration(rows);
  const firstTotal = rows.reduce((a, r) => a + r.firstMs, 0);
  const lines = ['# Shader link bench report', ''];
  lines.push(`- machine: ${payload.machine?.renderer ?? 'unknown'}`);
  lines.push(`- browser: ${payload.browser}, angle flag: ${payload.angle}`);
  lines.push(
    `- corpus: commit ${payload.corpus?.gitSha}, ${payload.corpus?.programCount} programs`,
  );
  lines.push(`- ${payload.reps} salted links per program, ${payload.seconds} s in total`);
  lines.push(`- linked ${rows.length}, failed ${failures.length}`, '');
  lines.push('## Distribution (cost = median of the repeated salted links)', '');
  lines.push('| measure | value |', '|---|---|');
  lines.push(`| programs | ${c.count} |`);
  lines.push(`| sum of costs | ${ms(c.totalMs)} ms |`);
  lines.push(`| sum of first links | ${ms(firstTotal)} ms |`);
  lines.push(`| median | ${ms(c.medianMs)} ms |`);
  lines.push(`| p90 | ${ms(c.p90Ms)} ms |`);
  lines.push(`| p95 | ${ms(c.p95Ms)} ms |`);
  lines.push(`| max | ${ms(c.maxMs)} ms |`);
  lines.push(`| p95 over median | ${c.tailRatio.toFixed(2)} |`);
  lines.push(
    `| share held by the 10 dearest | ${pct(c.top10Share)} (flat would be ${pct(c.top10FlatShare)}) |`,
  );
  lines.push(
    `| share held by the dearest 10 percent | ${pct(c.top10PercentShare)} (flat would be 10.0 %) |`,
  );
  lines.push('', '## The 40 dearest programs', '');
  lines.push('| rank | cost ms | first ms | kind | name | first met | profiles | program |');
  lines.push('|---|---|---|---|---|---|---|---|');
  rows.slice(0, 40).forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${ms(r.costMs)} | ${ms(r.firstMs)} | ${r.kind || '-'} | ${r.name || '-'} | ${r.firstStep || '-'} | ${r.profiles.join(' ')} | ${r.hash} |`,
    );
  });
  lines.push(
    '',
    '## Cost by material kind',
    '',
    '| kind | programs | median ms | sum ms |',
    '|---|---|---|---|',
  );
  const kinds = new Map();
  for (const r of rows) {
    const list = kinds.get(r.kind || '(other)') ?? [];
    list.push(r.costMs);
    kinds.set(r.kind || '(other)', list);
  }
  for (const [kind, list] of [...kinds].sort((a, b) => median(b[1]) - median(a[1]))) {
    lines.push(
      `| ${kind} | ${list.length} | ${ms(median(list))} | ${ms(list.reduce((a, b) => a + b, 0))} |`,
    );
  }
  if (failures.length) {
    lines.push('', '## Programs that failed to link', '');
    for (const f of failures.slice(0, 30))
      lines.push(`- ${f.hash} ${f.name}: ${f.log.replace(/\s+/g, ' ')}`);
  }
  return `${lines.join('\n')}\n`;
}
