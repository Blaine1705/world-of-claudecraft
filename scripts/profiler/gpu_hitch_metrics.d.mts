export const GPU_HITCH_SCHEMA_VERSION: number;
export const GPU_HITCH_PROBE_VERSION: number;
export const GPU_HITCH_UPLOAD_BUCKET_MS: number;

export function measurementParams(search?: string): Record<string, number | string | null>;
export function sanitizeCaptureUrl(input: string): string | null;
export function countEventsInWindow(events: unknown[], startMs: number, endMs: number): number;
export function linksBeforeQuery(
  query: { startMs?: number },
  links: unknown[],
  windowMs?: number,
): { startMs: number | null; endMs: number | null; count: number };
export function uploadBucketsBeforeQuery(
  query: { startMs?: number },
  buckets: unknown[],
  windowMs?: number,
  bucketWidthMs?: number,
): Record<string, number | null>;
export function validateCapture(
  capture: unknown,
  expected?: Record<string, unknown>,
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  performanceEvidence: boolean;
  evidenceKind: 'performance' | 'smoke' | 'invalid';
};
export function comparabilityMismatches(
  left: unknown,
  right: unknown,
  options?: { varying?: string[] },
): string[];
export function areComparable(
  left: unknown,
  right: unknown,
  options?: { varying?: string[] },
): boolean;
export function summarizeCapture(
  capture: unknown,
  options?: Record<string, number>,
): Record<string, unknown>;
export function makeProvenance(input: Record<string, unknown>): Record<string, unknown>;
export function requestedValueForKey(requested: unknown, key: string): unknown;
