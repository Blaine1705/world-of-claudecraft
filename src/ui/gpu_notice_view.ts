// Pure view-core for the GPU notice (DOM-free, Node-tested in
// tests/gpu_notice_view.test.ts). The thin DOM consumer is
// src/ui/gpu_notice_toast.ts; the verdict comes from the shared adapter-name
// detector plus the failIfMajorPerformanceCaveat probe
// (src/render/software_renderer.ts), assembled by
// src/game/software_render_notice.ts, merged with the desktop shell's own GPU
// verdict when one arrives (src/game/desktop_gpu_status.ts).
//
// Two independent components can arm the notice: 'software' (the session runs
// on a software rasterizer) and 'discrete-inactive' (the shell detected that a
// dedicated GPU exists but the session is on the power-saving one; a desktop
// only verdict). Software is the more severe of the two and owns the body copy
// when both are active.
//
// The notice is cosmetic-only and gameplay-neutral: it hides nothing and delays
// nothing a player acts on; it only EXPLAINS why a session runs at a slideshow
// frame rate and says what to do about it. It never re-nags for a verdict the
// player already dismissed, but a verdict that grows a NEW component re-arms it
// (the same shape as the perf nudge's keyed dismissal, perf_nudge_view.ts).

export type GpuNoticeComponent = 'discrete-inactive' | 'software';

/** Every component id, in the sorted order a signature stores them in. */
export const GPU_NOTICE_COMPONENTS = ['discrete-inactive', 'software'] as const;

/** The value shipped installs stored before signatures existed: a software dismissal. */
export const LEGACY_DISMISSED_VALUE = '1';

export interface GpuNoticeVerdict {
  softwareRendering: boolean;
  discreteInactive: boolean;
}

export interface GpuNoticeState {
  shown: boolean;
  dismissed: boolean;
  /** The components active right now, sorted; empty means nothing to show. */
  components: GpuNoticeComponent[];
}

export type GpuNoticeBodyKey =
  | 'gpuNotice.bodyDesktop'
  | 'gpuNotice.bodyWeb'
  | 'gpuNotice.bodyDiscreteInactive';

/** The active components of a verdict, built in sorted (signature) order. */
export function gpuNoticeComponents(verdict: GpuNoticeVerdict): GpuNoticeComponent[] {
  const components: GpuNoticeComponent[] = [];
  if (verdict.discreteInactive) components.push('discrete-inactive');
  if (verdict.softwareRendering) components.push('software');
  return components;
}

/** OR-merge two verdicts: a component stays armed once any source reports it. */
export function mergeGpuNoticeVerdicts(a: GpuNoticeVerdict, b: GpuNoticeVerdict): GpuNoticeVerdict {
  return {
    softwareRendering: a.softwareRendering || b.softwareRendering,
    discreteInactive: a.discreteInactive || b.discreteInactive,
  };
}

/** Component-wise equality, so the toast can skip no-change re-resolves. */
export function gpuNoticeVerdictsEqual(a: GpuNoticeVerdict, b: GpuNoticeVerdict): boolean {
  return a.softwareRendering === b.softwareRendering && a.discreteInactive === b.discreteInactive;
}

/**
 * The persisted-dismissal VALUE for a component set: sorted and comma-joined,
 * so the stored signature can be compared against a later verdict. Sorting
 * makes it order-proof; a verdict that adds a component produces a value the
 * stored one does not cover, which re-arms the notice.
 */
export function formatGpuNoticeSignature(components: readonly GpuNoticeComponent[]): string {
  return [...components].sort().join(',');
}

/**
 * Read a stored signature back into components. The legacy value '1' (what
 * every install shipped before the shell verdict existed) parses as a
 * software-rendering dismissal, so upgrading players are not re-nagged by
 * something they already closed. Unknown parts are dropped.
 */
export function parseGpuNoticeSignature(stored: string): GpuNoticeComponent[] {
  // Bound the parse: a legitimate signature is at most the full component set
  // (26 chars today). A longer value is hand-edited junk; treat it like any
  // other junk (no dismissal at all, the notice shows) without splitting a
  // possibly huge string first.
  if (stored.length > 64) return [];
  if (stored === LEGACY_DISMISSED_VALUE) return ['software'];
  const known = new Set<string>(GPU_NOTICE_COMPONENTS);
  return stored
    .split(',')
    .filter((part): part is GpuNoticeComponent => known.has(part))
    .sort();
}

/**
 * Resolve the state: show when at least one component is armed and the stored
 * dismissal does NOT already cover every armed component. A verdict that
 * shrinks back to a subset of what was dismissed stays hidden.
 */
export function resolveGpuNotice(input: {
  softwareRendering: boolean;
  discreteInactive: boolean;
  dismissedSignature: string;
}): GpuNoticeState {
  const components = gpuNoticeComponents(input);
  const dismissedComponents = parseGpuNoticeSignature(input.dismissedSignature);
  const covered =
    components.length > 0 && components.every((part) => dismissedComponents.includes(part));
  return { shown: components.length > 0 && !covered, dismissed: covered, components };
}

/** The player closed the notice: hide it now and remember the dismissal. */
export function dismissGpuNotice(state: GpuNoticeState): GpuNoticeState {
  return { shown: false, dismissed: true, components: state.components };
}

/**
 * Body-copy key selection. Software rendering is the more severe verdict and
 * wins when both components are active. Inside the desktop (Electron) shell
 * there is no "browser setting" to enable, so the browser-centric advice would
 * be actively wrong; point at GPU drivers and the Windows per-app graphics
 * setting instead. The inactive-discrete-GPU verdict only exists inside the
 * shell, so it has one key and no web variant.
 */
export function gpuNoticeBodyKey(
  desktopShell: boolean,
  verdict: GpuNoticeVerdict,
): GpuNoticeBodyKey {
  if (verdict.softwareRendering) {
    return desktopShell ? 'gpuNotice.bodyDesktop' : 'gpuNotice.bodyWeb';
  }
  return 'gpuNotice.bodyDiscreteInactive';
}
