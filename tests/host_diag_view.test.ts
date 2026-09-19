// The System Report panel's result table (src/ui/host_diag_view.ts). The panel
// itself is a handful of nodes; the whole judgement is here, so every arm of the
// shell's (status, nativeStatus) matrix gets its own decisive assertion.
//
// Pure, so no DOM environment: the core returns KEYS, which is exactly what makes
// the table assertable as data rather than as rendered English.

import { describe, expect, it } from 'vitest';
import type { DesktopHostDiagResult } from '../src/runtime';
import {
  type HostDiagResultModel,
  hostDiagIdle,
  hostDiagResultModel,
  hostDiagRunning,
  hostDiagSettled,
} from '../src/ui/host_diag_view';

function saved(
  nativeStatus: DesktopHostDiagResult['nativeStatus'],
  fileName = 'woc-host-diag-20260919.json',
): DesktopHostDiagResult {
  return { status: 'saved', nativeStatus, fileName };
}

function model(result: DesktopHostDiagResult): HostDiagResultModel {
  const m = hostDiagResultModel(result);
  if (!m) throw new Error('expected a render model, got the silent (cancelled) arm');
  return m;
}

describe('host_diag_view: phases', () => {
  it('starts idle with no result and mints a fresh object each time', () => {
    expect(hostDiagIdle()).toEqual({ phase: 'idle', result: null });
    expect(hostDiagRunning()).toEqual({ phase: 'running', result: null });
    // Fresh objects, so one panel's state can never be reached through another's.
    expect(hostDiagIdle()).not.toBe(hostDiagIdle());
    expect(hostDiagRunning()).not.toBe(hostDiagRunning());
  });

  it('settles into the result phase, carrying the model the table chose', () => {
    const state = hostDiagSettled(saved('ok'));
    expect(state.phase).toBe('result');
    expect(state.result?.messageKey).toBe('hudChrome.hostDiag.saved');
  });
});

describe('host_diag_view: saved', () => {
  it('names the saved file and passes it through as a placeholder value', () => {
    const m = model(saved('ok', 'report.json'));
    expect(m.tone).toBe('success');
    expect(m.messageKey).toBe('hudChrome.hostDiag.saved');
    expect(m.messageValues).toEqual({ fileName: 'report.json' });
    expect(m.detailKey, 'a clean native run says nothing extra').toBeUndefined();
  });

  it('falls back to the nameless line rather than an empty placeholder', () => {
    const m = model({ status: 'saved', nativeStatus: 'ok' });
    expect(m.messageKey).toBe('hudChrome.hostDiag.savedNoName');
    expect(m.messageValues).toBeUndefined();
    const blank = model(saved('ok', ''));
    expect(blank.messageKey).toBe('hudChrome.hostDiag.savedNoName');
  });

  it('keeps the success tone and adds one detail line when the native half fell short', () => {
    const arms: [DesktopHostDiagResult['nativeStatus'], string][] = [
      ['partial', 'hudChrome.hostDiag.detailPartial'],
      ['unavailable', 'hudChrome.hostDiag.detailUnavailable'],
      ['error', 'hudChrome.hostDiag.detailNativeError'],
    ];
    for (const [nativeStatus, detailKey] of arms) {
      const m = model(saved(nativeStatus));
      expect(m.tone, `${nativeStatus} is still a saved file`).toBe('success');
      expect(m.messageKey).toBe('hudChrome.hostDiag.saved');
      expect(m.detailKey).toBe(detailKey);
    }
    // Each arm gets its OWN line: nothing collapses two shortfalls into one.
    const keys = arms.map(([nativeStatus]) => model(saved(nativeStatus)).detailKey);
    expect(new Set(keys).size).toBe(arms.length);
  });

  it('says NOTHING extra on unsupported-platform: macOS and Linux are expected, not broken', () => {
    // The one arm that must not warn. Off Windows there is no PowerShell half to
    // run, so the Electron-only report is exactly the intended output there and a
    // warning would send the player hunting a problem that does not exist.
    const m = model(saved('unsupported-platform'));
    expect(m.tone).toBe('success');
    expect(m.messageKey).toBe('hudChrome.hostDiag.saved');
    expect(m.detailKey).toBeUndefined();
    expect(Object.keys(m).includes('detailKey')).toBe(false);
  });

  it('says nothing extra when the shell reports no native status at all', () => {
    expect(model({ status: 'saved', nativeStatus: null, fileName: 'x.json' }).detailKey).toBe(
      undefined,
    );
  });
});

describe('host_diag_view: the non-saved arms', () => {
  it('returns to idle silently when the player cancelled the save dialog', () => {
    // A closed dialog is a decision, not a failure: no message at all.
    expect(hostDiagResultModel({ status: 'cancelled', nativeStatus: null })).toBeNull();
    expect(hostDiagSettled({ status: 'cancelled', nativeStatus: null })).toEqual({
      phase: 'idle',
      result: null,
    });
    // Even if the shell got as far as a native verdict before the cancel.
    expect(hostDiagResultModel({ status: 'cancelled', nativeStatus: 'ok' })).toBeNull();
  });

  it('reports a second request as info, not as a failure', () => {
    const m = model({ status: 'busy', nativeStatus: null });
    expect(m.tone).toBe('info');
    expect(m.messageKey).toBe('hudChrome.hostDiag.busy');
    expect(m.detailKey).toBeUndefined();
  });

  it('maps a reported error, a missing result and an unknown status to one error line', () => {
    // The glue already folds a missing bridge and a rejected promise into the
    // 'error' verdict; this pins that a null or unrecognized answer lands there
    // too, so no shell can ever leave the panel with nothing on screen.
    const expected = { tone: 'error', messageKey: 'hudChrome.hostDiag.failed' };
    expect(hostDiagResultModel({ status: 'error', nativeStatus: null })).toEqual(expected);
    expect(hostDiagResultModel({ status: 'error', nativeStatus: 'error' })).toEqual(expected);
    expect(hostDiagResultModel(null)).toEqual(expected);
    expect(hostDiagResultModel(undefined)).toEqual(expected);
    expect(hostDiagResultModel({ status: 'exploded' } as unknown as DesktopHostDiagResult)).toEqual(
      expected,
    );
    expect(hostDiagSettled(null).phase, 'and it is a RESULT, not a silent idle').toBe('result');
  });
});
