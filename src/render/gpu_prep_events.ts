// Machine-readable record of the GPU-preparation escapes that used to leave
// only a console line: the reveal-gate watchdog, the gated scene-attach
// watchdog, and the compile gate's diagnostic timeout. Each of those is a
// bounded fail-soft path that hides a slow or stuck driver link, so the only
// evidence a capture could carry was a warning nobody parses.
// The reveal gate also reports its SOFT deadline here, which escapes nothing
// and exists only to leave that evidence, plus lifetime counters of where the
// roots of a held key became visible.
//
// Write-only telemetry: nothing here feeds a reveal, an admission, or any
// other decision, so recording an event can never change what the renderer
// draws. The ring is bounded and the recorder allocates nothing (slots are
// pooled objects rewritten in place), because a stuck lane can fire these
// steadily for as long as it stays stuck.
//
// Host-agnostic on purpose: no Three, no DOM, and the clock is injectable so a
// test can pin an exact ageMs instead of racing a real timer.

export type GpuPrepEventKind =
  | 'reveal-watchdog'
  | 'reveal-soft-deadline'
  | 'attach-watchdog'
  | 'gate-timeout'
  | 'submit-stop';

export const GPU_PREP_EVENT_KINDS: readonly GpuPrepEventKind[] = [
  'reveal-watchdog',
  'reveal-soft-deadline',
  'attach-watchdog',
  'gate-timeout',
  'submit-stop',
];

/** Newest events are kept; older ones fall out of the ring and only survive in
 *  the lifetime counts. */
export const GPU_PREP_EVENT_RING_SIZE = 64;

export interface GpuPrepEvent {
  kind: GpuPrepEventKind;
  /** What the event is about: a reveal key, a group name, a gate label. */
  key: string;
  /** How long the target had been waiting when the escape fired. */
  ageMs: number;
  /** Clock reading at the fire, from the module clock. */
  atMs: number;
  /** For a multi-root reveal key: how many of its roots had linked when the
   *  escape fired, out of how many. A whole town revealed at its watchdog
   *  with 9 of 41 linked is a very different first draw from 40 of 41, and
   *  the console line could never say which. 0/0 for the other kinds. */
  readyRoots: number;
  totalRoots: number;
  /** Units the reporting lane had handled when the event fired. For a
   *  submit-stop that is how many compile units the boot lane submitted
   *  before the stop truncated it, which is what makes a truncated manifest
   *  attributable from the capture alone. 0 for the other kinds. */
  units: number;
}

export interface GpuPrepEventInput {
  kind: GpuPrepEventKind;
  key: string;
  ageMs: number;
  readyRoots?: number;
  totalRoots?: number;
  units?: number;
}

/**
 * Lifetime totals of the reveal-gate holds, so a capture can say where the
 * roots of a held key actually became visible. The three populations
 * partition `rootsHeld`: piecewise (revealed as their own compile landed),
 * at the watchdog (still compiling when the hard escape fired), and the
 * remainder, which revealed when their key warmed.
 */
export interface GpuPrepRevealCounters {
  /** Keys that entered a hold (their compile request fired). */
  keysHeld: number;
  /** Roots behind those keys. */
  rootsHeld: number;
  /** Roots a consumer revealed before its key warmed. */
  rootsPiecewise: number;
  /** Roots still compiling when a hard watchdog revealed their key. */
  rootsAtWatchdog: number;
}

export interface GpuPrepEventsSnapshot {
  /** Events recorded since the last reset, across every kind. */
  total: number;
  /** Events that have already fallen out of the ring. */
  dropped: number;
  counts: Readonly<Record<GpuPrepEventKind, number>>;
  /** Oldest to newest, at most GPU_PREP_EVENT_RING_SIZE entries. */
  events: readonly Readonly<GpuPrepEvent>[];
  reveal: Readonly<GpuPrepRevealCounters>;
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

let clock: () => number = defaultNow;

/** The one clock the GPU-preparation escapes timestamp against, so a test that
 *  drives the watchdogs through a fake scheduler still gets exact ages. */
export function gpuPrepNow(): number {
  return clock();
}

export function setGpuPrepClockForTest(now: (() => number) | null): void {
  clock = now ?? defaultNow;
}

const ring: GpuPrepEvent[] = [];
let writeIndex = 0;
let total = 0;
const counts: Record<GpuPrepEventKind, number> = {
  'reveal-watchdog': 0,
  'reveal-soft-deadline': 0,
  'attach-watchdog': 0,
  'gate-timeout': 0,
  'submit-stop': 0,
};

const reveal: GpuPrepRevealCounters = {
  keysHeld: 0,
  rootsHeld: 0,
  rootsPiecewise: 0,
  rootsAtWatchdog: 0,
};

/** A non-negative finite count, so a caller's bad arithmetic cannot poison a
 *  lifetime total that a capture reads back as truth. */
const countOf = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

/** One key entered a hold, with the roots the host is about to compile. */
export function noteRevealKeyHeld(rootCount: number): void {
  reveal.keysHeld++;
  reveal.rootsHeld += countOf(rootCount);
}

/** One root revealed before its key warmed (the piecewise policy). */
export function noteRevealRootPiecewise(): void {
  reveal.rootsPiecewise++;
}

/** A hard watchdog revealed a key with this many roots still compiling. */
export function noteRevealRootsAtWatchdog(count: number): void {
  reveal.rootsAtWatchdog += countOf(count);
}

export function recordGpuPrepEvent(event: GpuPrepEventInput): void {
  const atMs = clock();
  const readyRoots = countOf(event.readyRoots);
  const totalRoots = countOf(event.totalRoots);
  const units = countOf(event.units);
  if (ring.length < GPU_PREP_EVENT_RING_SIZE) {
    ring.push({
      kind: event.kind,
      key: event.key,
      ageMs: event.ageMs,
      atMs,
      readyRoots,
      totalRoots,
      units,
    });
  } else {
    const slot = ring[writeIndex];
    slot.kind = event.kind;
    slot.key = event.key;
    slot.ageMs = event.ageMs;
    slot.atMs = atMs;
    slot.readyRoots = readyRoots;
    slot.totalRoots = totalRoots;
    slot.units = units;
  }
  writeIndex = (writeIndex + 1) % GPU_PREP_EVENT_RING_SIZE;
  counts[event.kind] += 1;
  total += 1;
}

const snapshotEvents: GpuPrepEvent[] = [];
const snapshot: GpuPrepEventsSnapshot & { events: GpuPrepEvent[] } = {
  total: 0,
  dropped: 0,
  counts,
  events: snapshotEvents,
  reveal,
};

/**
 * Current counts plus the ring, oldest first. The returned object and its
 * array are module-owned and refilled by the next call (the vfx_anchor scratch
 * contract): read or copy what you need before calling again.
 */
export function gpuPrepEventsSnapshot(): GpuPrepEventsSnapshot {
  snapshotEvents.length = 0;
  const filled = ring.length;
  const oldest = filled < GPU_PREP_EVENT_RING_SIZE ? 0 : writeIndex;
  for (let i = 0; i < filled; i++) snapshotEvents.push(ring[(oldest + i) % filled]);
  snapshot.total = total;
  snapshot.dropped = total - filled;
  return snapshot;
}

export function resetGpuPrepEventsForTest(): void {
  ring.length = 0;
  snapshotEvents.length = 0;
  writeIndex = 0;
  total = 0;
  for (const kind of GPU_PREP_EVENT_KINDS) counts[kind] = 0;
  reveal.keysHeld = 0;
  reveal.rootsHeld = 0;
  reveal.rootsPiecewise = 0;
  reveal.rootsAtWatchdog = 0;
}
