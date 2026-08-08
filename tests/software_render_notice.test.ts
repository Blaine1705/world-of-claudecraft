import { beforeEach, describe, expect, it, vi } from 'vitest';

// The assembler combines three independently-tested signals; these tests pin
// the combiner itself: either local signal firing shows the notice, the
// adapter-name verdict short-circuits the probe (no throwaway context when the
// answer is already yes), a null probe (Node, or context creation threw) never
// shows, and the desktop shell's latched verdict is folded in on top.
vi.mock('../src/render/gfx', () => ({ gfxSoftwareRendering: vi.fn() }));
vi.mock('../src/render/software_renderer', () => ({ probeMajorPerformanceCaveat: vi.fn() }));
vi.mock('../src/ui/gpu_notice_toast', () => ({
  initGpuNotice: vi.fn(),
  updateGpuNoticeShellVerdict: vi.fn(),
  gpuNoticeDisplayed: vi.fn(() => ({ softwareRendering: false, discreteInactive: false })),
}));

import { initDesktopGpuStatus } from '../src/game/desktop_gpu_status';
import {
  discreteNoticeShown,
  initSoftwareRenderNotice,
  softwareNoticeShown,
} from '../src/game/software_render_notice';
import { gfxSoftwareRendering } from '../src/render/gfx';
import { probeMajorPerformanceCaveat } from '../src/render/software_renderer';
import type { DesktopBridge, DesktopGpuStatus } from '../src/runtime';
import { gpuNoticeDisplayed, initGpuNotice } from '../src/ui/gpu_notice_toast';

const gfxVerdict = vi.mocked(gfxSoftwareRendering);
const probe = vi.mocked(probeMajorPerformanceCaveat);
const notice = vi.mocked(initGpuNotice);
const displayed = vi.mocked(gpuNoticeDisplayed);

// Drives the real latch the assembler reads, the way the shell would.
function pushShellVerdict(status: DesktopGpuStatus | null): void {
  const shell: { push: ((status: DesktopGpuStatus) => void) | null } = { push: null };
  const bridge = {
    onGpuStatus: (callback: (status: DesktopGpuStatus) => void) => {
      shell.push = callback;
      return () => {};
    },
  } as unknown as DesktopBridge;
  initDesktopGpuStatus(bridge);
  if (status && shell.push) shell.push(status);
}

beforeEach(() => {
  vi.clearAllMocks();
  displayed.mockReturnValue({ softwareRendering: false, discreteInactive: false });
  // Every case starts with no shell verdict latched.
  pushShellVerdict(null);
});

describe('initSoftwareRenderNotice', () => {
  it('shows on the adapter-name verdict alone and skips the probe (short-circuit)', () => {
    gfxVerdict.mockReturnValue(true);
    initSoftwareRenderNotice(true);
    expect(notice).toHaveBeenCalledWith({
      softwareRendering: true,
      discreteInactive: false,
      desktopShell: true,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('shows when only the caveat probe fires (renderer-string drift backstop)', () => {
    gfxVerdict.mockReturnValue(false);
    probe.mockReturnValue(true);
    initSoftwareRenderNotice(false);
    expect(notice).toHaveBeenCalledWith({
      softwareRendering: true,
      discreteInactive: false,
      desktopShell: false,
    });
  });

  it('stays quiet on a hardware session', () => {
    gfxVerdict.mockReturnValue(false);
    probe.mockReturnValue(false);
    initSoftwareRenderNotice(false);
    expect(notice).toHaveBeenCalledWith({
      softwareRendering: false,
      discreteInactive: false,
      desktopShell: false,
    });
  });

  it('treats a null probe (no canvas, or getContext threw) as not-software', () => {
    gfxVerdict.mockReturnValue(false);
    probe.mockReturnValue(null);
    initSoftwareRenderNotice(true);
    expect(notice).toHaveBeenCalledWith({
      softwareRendering: false,
      discreteInactive: false,
      desktopShell: true,
    });
  });

  it('folds in a shell verdict that arrived before the renderer existed', () => {
    gfxVerdict.mockReturnValue(false);
    probe.mockReturnValue(false);
    pushShellVerdict({ softwareRendering: false, discreteInactive: true, adapter: 'Intel UHD' });
    initSoftwareRenderNotice(true);
    expect(notice).toHaveBeenCalledWith({
      softwareRendering: false,
      discreteInactive: true,
      desktopShell: true,
    });
  });

  it('accepts a software verdict from the shell even when both local signals say no', () => {
    gfxVerdict.mockReturnValue(false);
    probe.mockReturnValue(false);
    pushShellVerdict({ softwareRendering: true, discreteInactive: false, adapter: 'SwiftShader' });
    initSoftwareRenderNotice(true);
    expect(notice).toHaveBeenCalledWith({
      softwareRendering: true,
      discreteInactive: false,
      desktopShell: true,
    });
  });
});

describe('perf-nudge suppression exposures', () => {
  it('reports the software notice only for a software verdict (ruling R16)', () => {
    // The nudge's software arm suppresses only when the boot notice DISPLAYED
    // that verdict; a discrete-only notice must NOT suppress it, or a software
    // session would silently lose its explanation.
    displayed.mockReturnValue({ softwareRendering: true, discreteInactive: false });
    expect(softwareNoticeShown()).toBe(true);
    expect(discreteNoticeShown()).toBe(false);

    displayed.mockReturnValue({ softwareRendering: false, discreteInactive: true });
    expect(softwareNoticeShown()).toBe(false);
    expect(discreteNoticeShown()).toBe(true);
  });

  it('reports nothing shown when the notice never displayed', () => {
    displayed.mockReturnValue({ softwareRendering: false, discreteInactive: false });
    expect(softwareNoticeShown()).toBe(false);
    expect(discreteNoticeShown()).toBe(false);
  });

  it('reads the live display latch, so a verdict arriving after init still counts', () => {
    // perf_nudge samples these inside its interval check, well after the boot
    // notice inits, so the exposures must not be a boot-time snapshot.
    gfxVerdict.mockReturnValue(false);
    probe.mockReturnValue(false);
    initSoftwareRenderNotice(true);
    expect(discreteNoticeShown()).toBe(false);
    displayed.mockReturnValue({ softwareRendering: false, discreteInactive: true });
    expect(discreteNoticeShown()).toBe(true);
  });
});
