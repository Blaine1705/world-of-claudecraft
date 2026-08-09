// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pins for the toast contracts nothing else covers: the woc:languagechange
// listener is bound WITH the DOM (a session that never shows the notice must
// add no listener, and a locale flip must never resurrect a dismissed notice),
// and the displayed latch counts BOTH components when the software body wins
// the copy. The end-to-end race and dismissal round trips live in
// tests/desktop_gpu_status.test.ts.

const LANGUAGE_EVENT = 'woc:languagechange';

async function bootToast() {
  vi.resetModules();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  return import('../src/ui/gpu_notice_toast');
}

const noticeRoot = (): HTMLElement | null => document.getElementById('gpu-notice');

const languageBindings = (spy: { mock: { calls: unknown[][] } }): number =>
  spy.mock.calls.filter((call) => call[0] === LANGUAGE_EVENT).length;

beforeEach(() => {
  localStorage.clear();
});

describe('the languagechange listener rides the DOM', () => {
  it('binds no listener and builds no node on a session that never shows the notice', async () => {
    const toast = await bootToast();
    const spy = vi.spyOn(document, 'addEventListener');
    expect(toast.initGpuNotice({ softwareRendering: false, desktopShell: true, desktopPlatform: 'other' })).toBe(false);
    expect(languageBindings(spy)).toBe(0);
    document.dispatchEvent(new Event(LANGUAGE_EVENT));
    expect(noticeRoot()).toBeNull();
  });

  it('binds exactly once for a shown notice, and a locale flip cannot resurrect a dismissal', async () => {
    const toast = await bootToast();
    const spy = vi.spyOn(document, 'addEventListener');
    expect(toast.initGpuNotice({ softwareRendering: true, desktopShell: true, desktopPlatform: 'other' })).toBe(true);
    expect(languageBindings(spy)).toBe(1);

    (document.querySelector('.gpu-notice-dismiss') as HTMLButtonElement).click();
    expect(noticeRoot()?.hidden).toBe(true);
    document.dispatchEvent(new Event(LANGUAGE_EVENT));
    expect(noticeRoot()?.hidden).toBe(true);
    expect(languageBindings(spy)).toBe(1);
  });
});

describe('the displayed latch under a persisted dismissal', () => {
  it('stays empty when a stored dismissal keeps the boot notice hidden', async () => {
    // R16 seam: the exposures mean "the player was TOLD this session". A boot
    // whose notice is hidden by a past install-level dismissal told them
    // nothing, so the latch must stay empty and leave the perf nudge free.
    // Phase 3 QA found no pin reds when the displayed merge moves above the
    // state.shown early-return in render(); this is that pin.
    const toast = await bootToast();
    localStorage.setItem('woc_gpu_notice_dismissed', 'software');
    expect(toast.initGpuNotice({ softwareRendering: true, desktopShell: true, desktopPlatform: 'other' })).toBe(false);
    expect(noticeRoot()).toBeNull();
    expect(toast.gpuNoticeDisplayed()).toEqual({
      softwareRendering: false,
      discreteInactive: false,
      hybridGpuLikely: false,
    });
  });
});

describe('the displayed latch on a both-component verdict', () => {
  it('counts both components as accounted for while the software body wins the copy', async () => {
    // Deliberate semantics, re-litigated and KEPT in phase 3 QA: the software
    // copy carries the identical remedy, so both components latch even though
    // the software body wins the copy (an armed-at-render latch). Honesty
    // note from that re-litigation: the discrete suppression this feeds is
    // unreachable in production wiring today (perf_doctor's !desktopShell gate
    // on 'integrated-gpu'); the latch is defense-in-depth, not load-bearing.
    // The WARP-flip shape reports both components at once.
    const toast = await bootToast();
    expect(
      toast.initGpuNotice({ softwareRendering: true, discreteInactive: true, desktopShell: true, desktopPlatform: 'other' }),
    ).toBe(true);
    expect(document.querySelector('#gpu-notice .gpu-notice-message')?.textContent ?? '').toContain(
      'without GPU acceleration',
    );
    expect(toast.gpuNoticeDisplayed()).toEqual({
      softwareRendering: true,
      discreteInactive: true,
      hybridGpuLikely: false,
    });
  });
});

describe('the hybrid verdict at the toast level', () => {
  it('shows the per-OS hybrid body and latches the hybrid component', async () => {
    const toast = await bootToast();
    expect(
      toast.initGpuNotice({
        softwareRendering: false,
        hybridGpuLikely: true,
        desktopShell: false,
        desktopPlatform: 'win',
      }),
    ).toBe(true);
    expect(document.querySelector('#gpu-notice .gpu-notice-message')?.textContent ?? '').toContain(
      'Settings > System > Display > Graphics',
    );
    expect(toast.gpuNoticeDisplayed()).toEqual({
      softwareRendering: false,
      discreteInactive: false,
      hybridGpuLikely: true,
    });
    // Dismissal stores the signature under the ONE key; the v0.36.0 per-variant
    // hybrid key is read-only compatibility and is never written back.
    (document.querySelector('.gpu-notice-dismiss') as HTMLButtonElement).click();
    expect(localStorage.getItem('woc_gpu_notice_dismissed')).toBe('hybrid');
    expect(localStorage.getItem('woc_gpu_notice_hybrid_dismissed')).toBeNull();
  });

  it('honors the v0.36.0 per-variant hybrid dismissal key without widening it', async () => {
    localStorage.setItem('woc_gpu_notice_hybrid_dismissed', '1');
    let toast = await bootToast();
    expect(
      toast.initGpuNotice({
        softwareRendering: false,
        hybridGpuLikely: true,
        desktopShell: false,
        desktopPlatform: 'linux',
      }),
    ).toBe(false);
    expect(noticeRoot()).toBeNull();
    expect(toast.gpuNoticeDisplayed()).toEqual({
      softwareRendering: false,
      discreteInactive: false,
      hybridGpuLikely: false,
    });
    // The same stored key must NOT cover a software verdict.
    toast = await bootToast();
    expect(
      toast.initGpuNotice({
        softwareRendering: true,
        desktopShell: false,
        desktopPlatform: 'linux',
      }),
    ).toBe(true);
  });
});
