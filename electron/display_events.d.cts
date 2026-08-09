// Hand-written declarations for electron/display_events.cjs so the Vitest suite
// (tests/electron_display_events.test.ts) type-checks its imports. Keep in sync
// with the .cjs exports (same convention as gpu_status_events.d.cts).

export interface DisplayChangedPayload {
  scaleFactor: number;
  displayId: number;
}

export function displayChangedPayload(display?: unknown): DisplayChangedPayload;

export function shouldForwardDisplayChange(
  prev: DisplayChangedPayload | null | undefined,
  next: DisplayChangedPayload,
): boolean;
