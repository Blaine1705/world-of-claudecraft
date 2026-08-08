import { describe, expect, it } from 'vitest';
import {
  dismissGpuNotice,
  formatGpuNoticeSignature,
  type GpuNoticeComponent,
  gpuNoticeBodyKey,
  gpuNoticeComponents,
  gpuNoticeVerdictsEqual,
  LEGACY_DISMISSED_VALUE,
  mergeGpuNoticeVerdicts,
  parseGpuNoticeSignature,
  resolveGpuNotice,
} from '../src/ui/gpu_notice_view';

// The notice now carries TWO independent components (software rendering, and
// the desktop shell's inactive-dedicated-GPU verdict), so every dimension gets
// a decisive case: component arming, the dismissal signature round trip, the
// legacy '1' parse shipped installs already stored, the subset rule that
// decides re-nag vs re-arm, and the body-copy precedence.

const NONE = { softwareRendering: false, discreteInactive: false };
const SOFTWARE = { softwareRendering: true, discreteInactive: false };
const DISCRETE = { softwareRendering: false, discreteInactive: true };
const BOTH = { softwareRendering: true, discreteInactive: true };

describe('gpuNoticeComponents', () => {
  it('lists only the armed components, in signature order', () => {
    expect(gpuNoticeComponents(NONE)).toEqual([]);
    expect(gpuNoticeComponents(SOFTWARE)).toEqual(['software']);
    expect(gpuNoticeComponents(DISCRETE)).toEqual(['discrete-inactive']);
    expect(gpuNoticeComponents(BOTH)).toEqual(['discrete-inactive', 'software']);
  });
});

describe('mergeGpuNoticeVerdicts', () => {
  it('ORs each component so a second source can only add, never un-arm', () => {
    expect(mergeGpuNoticeVerdicts(SOFTWARE, DISCRETE)).toEqual(BOTH);
    expect(mergeGpuNoticeVerdicts(SOFTWARE, NONE)).toEqual(SOFTWARE);
    expect(mergeGpuNoticeVerdicts(NONE, DISCRETE)).toEqual(DISCRETE);
    expect(mergeGpuNoticeVerdicts(NONE, NONE)).toEqual(NONE);
  });
});

describe('gpuNoticeVerdictsEqual', () => {
  it('is true only when BOTH components match (one negative per dimension)', () => {
    expect(gpuNoticeVerdictsEqual(BOTH, { ...BOTH })).toBe(true);
    expect(gpuNoticeVerdictsEqual(NONE, { ...NONE })).toBe(true);
    expect(gpuNoticeVerdictsEqual(SOFTWARE, BOTH)).toBe(false);
    expect(gpuNoticeVerdictsEqual(DISCRETE, BOTH)).toBe(false);
    expect(gpuNoticeVerdictsEqual(SOFTWARE, DISCRETE)).toBe(false);
  });
});

describe('gpu notice dismissal signature', () => {
  it('formats a sorted, order-proof value', () => {
    const reversed: GpuNoticeComponent[] = ['software', 'discrete-inactive'];
    expect(formatGpuNoticeSignature(reversed)).toBe('discrete-inactive,software');
    expect(formatGpuNoticeSignature(['software'])).toBe('software');
    expect(formatGpuNoticeSignature([])).toBe('');
  });

  it('parses its own values back, and drops unknown parts', () => {
    expect(parseGpuNoticeSignature('discrete-inactive,software')).toEqual([
      'discrete-inactive',
      'software',
    ]);
    expect(parseGpuNoticeSignature('software')).toEqual(['software']);
    expect(parseGpuNoticeSignature('')).toEqual([]);
    expect(parseGpuNoticeSignature('bogus,software')).toEqual(['software']);
  });

  it('treats an oversized stored value as junk (no dismissal) without splitting it', () => {
    // The bound is the guard; a value past it must parse as "nothing dismissed"
    // (the notice shows), the same verdict as any other unparseable junk.
    const oversized = `software,${'x'.repeat(80)}`;
    expect(oversized.length).toBeGreaterThan(64);
    expect(parseGpuNoticeSignature(oversized)).toEqual([]);
    expect(resolveGpuNotice({ ...SOFTWARE, dismissedSignature: oversized }).shown).toBe(true);
  });

  it('parses the legacy shipped value as a software dismissal', () => {
    // Installs that dismissed the notice before the shell verdict existed
    // stored '1'; that must keep meaning "software rendering, already read".
    expect(LEGACY_DISMISSED_VALUE).toBe('1');
    expect(parseGpuNoticeSignature(LEGACY_DISMISSED_VALUE)).toEqual(['software']);
  });
});

describe('resolveGpuNotice', () => {
  it('shows for either component on a first, undismissed session', () => {
    expect(resolveGpuNotice({ ...SOFTWARE, dismissedSignature: '' })).toEqual({
      shown: true,
      dismissed: false,
      components: ['software'],
    });
    expect(resolveGpuNotice({ ...DISCRETE, dismissedSignature: '' })).toEqual({
      shown: true,
      dismissed: false,
      components: ['discrete-inactive'],
    });
  });

  it('never shows when neither component is armed', () => {
    expect(resolveGpuNotice({ ...NONE, dismissedSignature: '' })).toEqual({
      shown: false,
      dismissed: false,
      components: [],
    });
  });

  it('stays hidden on relaunch for the exact verdict that was dismissed', () => {
    expect(resolveGpuNotice({ ...SOFTWARE, dismissedSignature: 'software' })).toEqual({
      shown: false,
      dismissed: true,
      components: ['software'],
    });
    expect(
      resolveGpuNotice({ ...BOTH, dismissedSignature: 'discrete-inactive,software' }).shown,
    ).toBe(false);
  });

  it('re-arms when the verdict grows a component the dismissal does not cover', () => {
    const state = resolveGpuNotice({ ...BOTH, dismissedSignature: 'software' });
    expect(state.shown).toBe(true);
    expect(state.dismissed).toBe(false);
    expect(state.components).toEqual(['discrete-inactive', 'software']);
  });

  it('honors the legacy value for software but not for the shell verdict', () => {
    // The load-bearing pair: an upgrading install that dismissed the old notice
    // is not re-nagged about software rendering, yet the brand new
    // inactive-dedicated-GPU verdict was never dismissed and must show.
    expect(
      resolveGpuNotice({ ...SOFTWARE, dismissedSignature: LEGACY_DISMISSED_VALUE }).shown,
    ).toBe(false);
    expect(
      resolveGpuNotice({ ...DISCRETE, dismissedSignature: LEGACY_DISMISSED_VALUE }).shown,
    ).toBe(true);
  });

  it('stays hidden when the verdict shrinks back to a subset of the dismissal', () => {
    const state = resolveGpuNotice({
      ...SOFTWARE,
      dismissedSignature: 'discrete-inactive,software',
    });
    expect(state.shown).toBe(false);
    expect(state.dismissed).toBe(true);
  });

  it('ignores a stored value it cannot parse rather than treating it as dismissed', () => {
    expect(resolveGpuNotice({ ...SOFTWARE, dismissedSignature: 'bogus' }).shown).toBe(true);
  });
});

describe('dismissGpuNotice', () => {
  it('hides the notice, remembers the dismissal, and keeps the dismissed components', () => {
    const state = resolveGpuNotice({ ...BOTH, dismissedSignature: '' });
    expect(dismissGpuNotice(state)).toEqual({
      shown: false,
      dismissed: true,
      components: ['discrete-inactive', 'software'],
    });
  });
});

describe('gpuNoticeBodyKey', () => {
  it('picks the desktop copy inside the Electron shell and the browser copy on the web', () => {
    // Inside the desktop shell "enable hardware acceleration in your browser" is
    // actively wrong advice (there is no such setting), so the split is load-bearing.
    expect(gpuNoticeBodyKey(true, SOFTWARE)).toBe('gpuNotice.bodyDesktop');
    expect(gpuNoticeBodyKey(false, SOFTWARE)).toBe('gpuNotice.bodyWeb');
  });

  it('uses the one desktop-only key for an inactive dedicated GPU', () => {
    expect(gpuNoticeBodyKey(true, DISCRETE)).toBe('gpuNotice.bodyDiscreteInactive');
    expect(gpuNoticeBodyKey(false, DISCRETE)).toBe('gpuNotice.bodyDiscreteInactive');
  });

  it('lets the more severe software verdict win when both components are armed', () => {
    expect(gpuNoticeBodyKey(true, BOTH)).toBe('gpuNotice.bodyDesktop');
    expect(gpuNoticeBodyKey(false, BOTH)).toBe('gpuNotice.bodyWeb');
  });
});
