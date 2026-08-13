// A small, read-only runtime receipt for the versioned GPU hitch probe.
// The probe can observe WebGL calls, but only the code consuming a setting can
// state whether that setting was actually applied. This surface deliberately
// contains no credentials, URLs, storage, or player identity.

declare const __APP_BUILD_ID__: string;

export const GPU_HITCH_RECEIPT_VERSION = 1;

export interface GpuHitchRuntimeReceipt {
  schemaVersion: number;
  buildId: string;
  requested: {
    linkmode: 'adaptive' | null;
    linkrate: number | null;
    linkburst: number | null;
    compileroots: number | null;
    prewarmdeadline: number | null;
    modular: string | null;
    modularpeers: string | null;
    gfx: string | null;
  };
  effective: {
    prewarmPacing: {
      available: boolean;
      source?: 'default' | 'query';
      mode: 'unsupported' | 'unlimited' | 'limited' | 'adaptive';
      linksPerSecond: number | null;
      burst: number | null;
      compileBatchRoots: number | null;
      hardMaxMs: number | null;
      chargedLinks?: number;
      scope?: 'compile-unit-sync-prologue' | 'compile-unit-lifecycle';
      adaptive?: {
        state: 'ramp' | 'steady' | 'backoff' | 'stalled' | 'revealed';
        windowLinks: number;
        minWindowLinks: number;
        maxWindowLinks: number;
        maxWindowObserved: number;
        estimatedLinksPerUnit: number;
        inFlightLinks: number;
        inFlightUnits: number;
        submittedUnits: number;
        settledUnits: number;
        failedUnits: number;
        backoffCount: number;
        noProgressCount: number;
        lastSettlementMs: number | null;
      };
      reason?: string;
    };
    modular: {
      available: boolean;
      self: null;
      peers: null;
      reason: string;
    };
    renderer: {
      tier: string | null;
      glVendor: string | null;
      glRenderer: string | null;
      contextLost: number | null;
    };
  };
}

declare global {
  interface Window {
    __wocGpuHitchReceipt?: GpuHitchRuntimeReceipt;
  }
}

function finiteQueryNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function queryFlag(value: string | null): string | null {
  return value === null ? null : value;
}

function requestedFromSearch(search: string): GpuHitchRuntimeReceipt['requested'] {
  const params = new URLSearchParams(search);
  return {
    linkmode: params.get('linkmode') === 'adaptive' ? 'adaptive' : null,
    linkrate: finiteQueryNumber(params.get('linkrate')),
    linkburst: finiteQueryNumber(params.get('linkburst')),
    compileroots: finiteQueryNumber(params.get('compileroots')),
    prewarmdeadline: finiteQueryNumber(params.get('prewarmdeadline')),
    modular: queryFlag(params.get('modular')),
    modularpeers: queryFlag(params.get('modularpeers')),
    gfx: params.get('gfx'),
  };
}

function appBuildId(): string {
  return typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';
}

export interface GpuHitchReceiptRendererStats {
  tier?: unknown;
  glVendor?: unknown;
  glRenderer?: unknown;
  contextLost?: unknown;
  prewarm?: {
    prewarmPacing?: GpuHitchRuntimeReceipt['effective']['prewarmPacing'];
  } | null;
}

export function publishGpuHitchRuntimeReceipt({
  search = typeof location !== 'undefined' ? location.search : '',
  renderer,
}: {
  search?: string;
  renderer?: GpuHitchReceiptRendererStats | null;
} = {}): GpuHitchRuntimeReceipt | null {
  if (typeof window === 'undefined') return null;
  const effectivePacing = renderer?.prewarm?.prewarmPacing;
  const receipt: GpuHitchRuntimeReceipt = {
    schemaVersion: GPU_HITCH_RECEIPT_VERSION,
    buildId: appBuildId(),
    requested: requestedFromSearch(search),
    effective: {
      prewarmPacing: effectivePacing ?? {
        available: false,
        mode: 'unsupported',
        linksPerSecond: null,
        burst: null,
        compileBatchRoots: null,
        hardMaxMs: null,
        reason: 'prewarm has not published an effective pacing receipt',
      },
      // The release build has no modular self/peer kill switches. The renderer
      // therefore reports the capability as absent, not as an inferred URL flag.
      modular: {
        available: false,
        self: null,
        peers: null,
        reason: 'modular self/peer flags are not present in this experimental build',
      },
      renderer: {
        tier: typeof renderer?.tier === 'string' ? renderer.tier : null,
        glVendor: typeof renderer?.glVendor === 'string' ? renderer.glVendor : null,
        glRenderer: typeof renderer?.glRenderer === 'string' ? renderer.glRenderer : null,
        contextLost: typeof renderer?.contextLost === 'number' ? renderer.contextLost : null,
      },
    },
  };
  window.__wocGpuHitchReceipt = receipt;
  return receipt;
}
