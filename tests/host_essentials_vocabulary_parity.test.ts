// Cross-boundary drift guard for the "host essentials" closed vocabularies.
// Three layers each keep their OWN copy, because none of them may import the
// others (server/ never imports src/game; src/game never imports the CommonJS
// shell modules; electron/*.cjs is outside tsc): the shell that folds the
// Windows GUIDs (electron/host_essentials.cjs), the renderer that narrows what
// the bridge returned (src/game/desktop_host_essentials.ts), and the ingest
// that stores the column (server/perf_report_host.ts). This pin is the ONLY
// thing that keeps the three equal, exactly like
// tests/perf_suggestion_id_parity.test.ts does for the suggestion ids.
//
// It also ties the power-MODE map to the shipped host diagnostic's own
// collector (electron/host_diag/win/collectors/Power.ps1), so a support
// engineer reading a saved diagnostic and an analyst reading the fleet table
// are looking at the same four buckets.
//
// server/db.ts builds a pg Pool at module load and throws if DATABASE_URL is
// unset; server/perf_report_host.ts does not import it, but keep the guard in
// case a future import chain reaches it.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_host_essentials_parity';

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POWER_MODE_BY_GUID, POWER_MODES, POWER_PLANS } from '../electron/host_essentials.cjs';
import {
  HOST_POWER_MODES as SERVER_MODES,
  HOST_POWER_PLANS as SERVER_PLANS,
} from '../server/perf_report_host';
import {
  HOST_POWER_MODES as CLIENT_MODES,
  HOST_POWER_PLANS as CLIENT_PLANS,
} from '../src/game/desktop_host_essentials';

describe('host essentials vocabulary parity', () => {
  it('keeps the power-PLAN vocabulary identical across shell, client and server', () => {
    expect([...CLIENT_PLANS]).toEqual([...POWER_PLANS]);
    expect([...SERVER_PLANS]).toEqual([...POWER_PLANS]);
  });

  it('keeps the power-MODE vocabulary identical across shell, client and server', () => {
    expect([...CLIENT_MODES]).toEqual([...POWER_MODES]);
    expect([...SERVER_MODES]).toEqual([...POWER_MODES]);
  });

  it("keeps '' in both vocabularies as the unknown member", () => {
    // The server's choice fallback is '', so a vocabulary without it would
    // store a value no reader could interpret.
    expect(SERVER_PLANS).toContain('');
    expect(SERVER_MODES).toContain('');
  });

  it('keeps the power-MODE GUID map equal to the host diagnostic collector', () => {
    // Parse Power.ps1's $overlayNames hashtable: '<guid>' = 'Name'.
    const script = readFileSync(
      new URL('../electron/host_diag/win/collectors/Power.ps1', import.meta.url),
      'utf8',
    );
    const block = script.slice(
      script.indexOf('$overlayNames'),
      script.indexOf('function Resolve-Overlay'),
    );
    const parsed = new Map<string, string>();
    for (const m of block.matchAll(/'([0-9a-fA-F-]{36})'\s*=\s*'([A-Za-z]+)'/g)) {
      parsed.set(m[1].toLowerCase(), m[2]);
    }
    expect(parsed.size).toBe(4);
    // The .ps1 spells the names in PascalCase for a human-read JSON file; the
    // fleet column uses snake_case. The MAPPING is what must agree, so the
    // names are translated once here and compared GUID by GUID.
    const toColumnName: Record<string, string> = {
      BestPowerEfficiency: 'best_efficiency',
      Balanced: 'balanced',
      BetterPerformance: 'better_performance',
      BestPerformance: 'best_performance',
    };
    const fromPs1 = Object.fromEntries(
      [...parsed].map(([guid, name]) => [guid, toColumnName[name]]),
    );
    expect(fromPs1).toEqual({ ...POWER_MODE_BY_GUID });
    // Every translated name is a real vocabulary member (a typo above cannot
    // pass by matching an undefined on both sides).
    for (const name of Object.values(fromPs1)) expect(POWER_MODES).toContain(name);
  });

  it('keeps the HAGS and Game Mode rules equal to the Gpu.ps1 collector', () => {
    // Textual, because the .ps1 cannot be executed here: the two registry
    // addresses and the 2 = on / 1 = off mapping must still be the ones the
    // shell module reads.
    const script = readFileSync(
      new URL('../electron/host_diag/win/collectors/Gpu.ps1', import.meta.url),
      'utf8',
    );
    expect(script).toContain("'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers'");
    expect(script).toContain('.HwSchMode');
    expect(script).toContain("switch ($v) { 2 { 'on' } 1 { 'off' } default { $null } }");
    expect(script).toContain("'HKCU:\\Software\\Microsoft\\GameBar'");
    expect(script).toContain('.AutoGameModeEnabled');
    expect(script).toContain("if ($null -eq $v -or $v -eq 1) { 'on' } else { 'off' }");
  });
});
