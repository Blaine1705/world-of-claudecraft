// The System Report panel's pure decisions (the pure-core + thin-painter recipe
// in src/ui/CLAUDE.md): a three-step phase machine plus the ONE mapping from a
// desktop shell result to what the panel shows. DOM-free, so the whole result
// table is driven without a browser (tests/host_diag_view.test.ts).
//
// The i18n import is TYPE-ONLY by design: the core picks KEYS and placeholder
// values, and the painter resolves them through t(). That keeps the table
// assertable as data rather than as rendered English.

import type { DesktopHostDiagResult } from '../runtime';
import type { TranslationKey } from './i18n.catalog';

/** Where the panel stands: nothing asked for yet, a run in flight, or a verdict. */
export type HostDiagPhase = 'idle' | 'running' | 'result';

/** The render-model's tone vocabulary, which the painter maps to a CSS class. */
export type HostDiagTone = 'success' | 'info' | 'error';

export interface HostDiagResultModel {
  tone: HostDiagTone;
  messageKey: TranslationKey;
  /** Placeholder values for `messageKey`; absent when the line takes none. */
  messageValues?: Record<string, string>;
  /** One extra line under the message: what the Windows half could NOT do. */
  detailKey?: TranslationKey;
}

export interface HostDiagState {
  phase: HostDiagPhase;
  result: HostDiagResultModel | null;
}

/** Fresh objects rather than shared constants: the painter holds the state it is
 *  handed, so a shared literal would let one panel's mutation reach another. */
export function hostDiagIdle(): HostDiagState {
  return { phase: 'idle', result: null };
}

export function hostDiagRunning(): HostDiagState {
  return { phase: 'running', result: null };
}

// Which nativeStatus values earn a detail line, and which say nothing. 'ok'
// needs none, and 'unsupported-platform' is DELIBERATELY silent: macOS and
// Linux ship no PowerShell half at all, so the Electron-only report there is
// exactly what those platforms are meant to produce, not a shortfall the
// player could act on.
const NATIVE_DETAIL_KEYS: Readonly<Record<string, TranslationKey>> = {
  partial: 'hudChrome.hostDiag.detailPartial',
  unavailable: 'hudChrome.hostDiag.detailUnavailable',
  error: 'hudChrome.hostDiag.detailNativeError',
};

/**
 * The result table. Returns null for the ONE outcome that says nothing: the
 * player closed the save dialog, which is a decision, not a failure, so the
 * panel returns to idle silently.
 *
 * A missing result (no bridge, a rejected promise, a shell answering something
 * unknown) maps to the same error model a reported 'error' does: from the
 * player's side those are one event, "no file was written".
 *
 * Note the tone: a SAVED report is a success even when the Windows scan fell
 * short, because the file exists and support can still read it; the shortfall
 * rides the detail line instead of demoting the verdict.
 */
export function hostDiagResultModel(
  result: DesktopHostDiagResult | null | undefined,
): HostDiagResultModel | null {
  if (!result) return { tone: 'error', messageKey: 'hudChrome.hostDiag.failed' };
  if (result.status === 'cancelled') return null;
  if (result.status === 'busy') return { tone: 'info', messageKey: 'hudChrome.hostDiag.busy' };
  if (result.status !== 'saved') return { tone: 'error', messageKey: 'hudChrome.hostDiag.failed' };
  const fileName = result.fileName ?? '';
  const detailKey = result.nativeStatus ? NATIVE_DETAIL_KEYS[result.nativeStatus] : undefined;
  // The shell always names the file it wrote; the nameless arm is the defensive
  // one, and it drops the placeholder rather than printing an empty quote.
  const saved: HostDiagResultModel =
    fileName === ''
      ? { tone: 'success', messageKey: 'hudChrome.hostDiag.savedNoName' }
      : {
          tone: 'success',
          messageKey: 'hudChrome.hostDiag.saved',
          messageValues: { fileName },
        };
  return detailKey ? { ...saved, detailKey } : saved;
}

/** The phase a settled request leaves the panel in. */
export function hostDiagSettled(result: DesktopHostDiagResult | null | undefined): HostDiagState {
  const model = hostDiagResultModel(result);
  return model ? { phase: 'result', result: model } : hostDiagIdle();
}
