// Pure validation and attribution for the GPU hitch capture protocol.
// Browser orchestration belongs in gpu_hitch_capture.mjs; this module has no
// DOM, Puppeteer, or application imports so its temporal rules stay testable.

export const GPU_HITCH_SCHEMA_VERSION = 1;
export const GPU_HITCH_PROBE_VERSION = 1;
export const GPU_HITCH_UPLOAD_BUCKET_MS = 100;

const MEASUREMENT_KEYS = Object.freeze([
  'linkmode',
  'linkrate',
  'linkburst',
  'compileroots',
  'prewarmdeadline',
  'modular',
  'modularpeers',
  'gfx',
]);

const COMPARABILITY_KEYS = Object.freeze([
  'sourceBuildId',
  'servedBuildId',
  'probeSha256',
  'analyzerSha256',
  'schemaVersion',
  'profile',
  'browserVersion',
  'browserFlags',
  'shaderDiskCache',
  'glVendor',
  'glRenderer',
  'viewport',
  'devicePixelRatio',
  'gfx',
  'scenario',
  'zone',
  'groupId',
  'fixture',
  'durationMs',
  'requested.linkmode',
  'requested.linkrate',
  'requested.linkburst',
  'requested.compileroots',
  'requested.prewarmdeadline',
  'requested.modular',
  'requested.modularpeers',
  'effective.prewarmPacing',
  'effective.modular',
  'rendererTier',
]);

const SAFE_GFX_VALUES = new Set(['low', 'medium', 'high', 'ultra', 'insane']);

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

function own(object, key) {
  return Object.hasOwn(object ?? {}, key);
}

function numericQueryValue(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function flagQueryValue(value) {
  if (value == null) return null;
  return value === 'off' || value === 'on' ? value : null;
}

function gfxQueryValue(value) {
  return SAFE_GFX_VALUES.has(value) ? value : null;
}

function linkModeQueryValue(value) {
  return value === 'adaptive' ? value : null;
}

/** Return only measurement knobs, never the full URL or its credentials. */
export function measurementParams(search = '') {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    MEASUREMENT_KEYS.map((key) => {
      const raw = params.get(key);
      if (key === 'linkmode') return [key, linkModeQueryValue(raw)];
      if (key === 'modular' || key === 'modularpeers') return [key, flagQueryValue(raw)];
      if (key === 'gfx') return [key, gfxQueryValue(raw)];
      return [key, numericQueryValue(raw)];
    }),
  );
}

/** Keep a safe origin and allowlisted knobs, dropping paths, fragments, and tokens. */
export function sanitizeCaptureUrl(input) {
  try {
    const url = new URL(input);
    if (url.origin === 'null') return null;
    const params = measurementParams(url.search);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== null) query.set(key, String(value));
    }
    const encodedQuery = query.toString();
    return `${url.origin}/${encodedQuery ? `?${encodedQuery}` : ''}`;
  } catch {
    return null;
  }
}

function queryRequestedValue(value) {
  if (value === null || value === undefined) return null;
  return value;
}

/**
 * Count events launched in the half-open interval [startMs, endMs).
 * The start, not the completion timestamp, is the causal attribution point.
 */
export function countEventsInWindow(events, startMs, endMs) {
  if (!Array.isArray(events) || !finite(startMs) || !finite(endMs) || endMs < startMs) return 0;
  return events.reduce(
    (count, event) =>
      finite(event?.startMs) && event.startMs >= startMs && event.startMs < endMs
        ? count + 1
        : count,
    0,
  );
}

/** Exact link pressure before a query starts. */
export function linksBeforeQuery(query, links, windowMs = 8_000) {
  if (!finite(query?.startMs) || !finite(windowMs) || windowMs < 0) {
    return { startMs: null, endMs: null, count: 0 };
  }
  const endMs = query.startMs;
  const startMs = Math.max(0, endMs - windowMs);
  return { startMs, endMs, count: countEventsInWindow(links, startMs, endMs) };
}

/**
 * Aggregate sparse upload buckets with honest boundary bounds. A bucket is
 * exact only when the complete bucket lies inside the requested interval.
 */
export function uploadBucketsBeforeQuery(
  query,
  buckets,
  windowMs = 8_000,
  bucketWidthMs = GPU_HITCH_UPLOAD_BUCKET_MS,
) {
  if (
    !finite(query?.startMs) ||
    !finite(windowMs) ||
    windowMs < 0 ||
    !finite(bucketWidthMs) ||
    bucketWidthMs <= 0
  ) {
    return {
      startMs: null,
      endMs: null,
      bucketWidthMs,
      certain: 0,
      possible: 0,
      bytesCertain: 0,
      bytesPossible: 0,
    };
  }
  const endMs = query.startMs;
  const startMs = Math.max(0, endMs - windowMs);
  let certain = 0;
  let possible = 0;
  let bytesCertain = 0;
  let bytesPossible = 0;
  for (const bucket of Array.isArray(buckets) ? buckets : []) {
    if (!finite(bucket?.startMs) || !finite(bucket?.count) || bucket.count < 0) continue;
    const bucketStart = bucket.startMs;
    const bucketEnd = bucketStart + bucketWidthMs;
    if (bucketEnd <= startMs || bucketStart >= endMs) continue;
    possible += bucket.count;
    const bytes = finite(bucket.bytes) && bucket.bytes >= 0 ? bucket.bytes : 0;
    bytesPossible += bytes;
    if (bucketStart >= startMs && bucketEnd <= endMs) {
      certain += bucket.count;
      bytesCertain += bytes;
    }
  }
  return {
    startMs,
    endMs,
    bucketWidthMs,
    certain,
    possible,
    bytesCertain,
    bytesPossible,
  };
}

function error(errors, message) {
  errors.push(message);
}

function validateNumber(errors, value, label, { integer = false, nonNegative = false } = {}) {
  if (!finite(value)) {
    error(errors, `${label} must be a finite number`);
    return;
  }
  if (integer && !Number.isInteger(value)) error(errors, `${label} must be an integer`);
  if (nonNegative && value < 0) error(errors, `${label} must be non-negative`);
}

function validateEventArray(errors, events, label, { requireEnd = true } = {}) {
  if (!Array.isArray(events)) {
    error(errors, `${label} must be an array`);
    return;
  }
  let previous = -Infinity;
  events.forEach((event, index) => {
    const prefix = `${label}[${index}]`;
    validateNumber(errors, event?.startMs, `${prefix}.startMs`, { nonNegative: true });
    if (finite(event?.startMs) && event.startMs < previous)
      error(errors, `${prefix}.startMs is not monotonic`);
    if (finite(event?.startMs)) previous = event.startMs;
    if (!requireEnd) return;
    validateNumber(errors, event?.endMs, `${prefix}.endMs`, { nonNegative: true });
    if (finite(event?.startMs) && finite(event?.endMs) && event.endMs < event.startMs)
      error(errors, `${prefix}.endMs precedes startMs`);
    if (own(event, 'durationMs')) {
      validateNumber(errors, event.durationMs, `${prefix}.durationMs`, { nonNegative: true });
      if (
        finite(event?.durationMs) &&
        finite(event?.startMs) &&
        finite(event?.endMs) &&
        Math.abs(event.durationMs - (event.endMs - event.startMs)) > 0.01
      )
        error(errors, `${prefix}.durationMs disagrees with timestamps`);
    }
  });
}

function validateCompileUnitArray(errors, units, label) {
  if (!Array.isArray(units)) {
    error(errors, `${label} must be an array`);
    return;
  }
  const statuses = new Set(['settled', 'pending', 'deferred', 'failed', 'post-reveal']);
  units.forEach((unit, index) => {
    const prefix = `${label}[${index}]`;
    if (typeof unit?.id !== 'string' || unit.id === '') error(errors, `${prefix}.id is missing`);
    if (typeof unit?.lane !== 'string' || unit.lane === '')
      error(errors, `${prefix}.lane is missing`);
    for (const key of ['submittedAtMs', 'syncEndAtMs', 'settledAtMs', 'failedAtMs']) {
      if (unit?.[key] !== null && unit?.[key] !== undefined)
        validateNumber(errors, unit[key], `${prefix}.${key}`, { nonNegative: true });
    }
    if (
      finite(unit?.submittedAtMs) &&
      finite(unit?.syncEndAtMs) &&
      unit.syncEndAtMs < unit.submittedAtMs
    )
      error(errors, `${prefix}.syncEndAtMs precedes submittedAtMs`);
    if (
      finite(unit?.syncEndAtMs) &&
      finite(unit?.settledAtMs) &&
      unit.settledAtMs < unit.syncEndAtMs
    )
      error(errors, `${prefix}.settledAtMs precedes syncEndAtMs`);
    if (unit?.statusAtReveal !== null && !statuses.has(unit?.statusAtReveal))
      error(errors, `${prefix}.statusAtReveal is invalid`);
  });
}

function validateReceipt(errors, capture) {
  const receipt = capture.effective;
  if (!receipt || typeof receipt !== 'object') {
    error(errors, 'effective runtime receipt is missing');
    return;
  }
  if (receipt.schemaVersion !== GPU_HITCH_SCHEMA_VERSION)
    error(errors, 'effective runtime receipt schemaVersion mismatch');
  for (const key of ['prewarmPacing', 'modular']) {
    if (!receipt[key] || typeof receipt[key] !== 'object')
      error(errors, `effective.${key} is missing`);
  }
}

function validateRequestedEffective(errors, capture) {
  const requested = capture.requested;
  const effective = capture.effective;
  if (!requested || typeof requested !== 'object') {
    error(errors, 'requested knobs are missing');
    return;
  }
  const pacing = effective?.prewarmPacing;
  if (requested.linkmode !== null) {
    if (requested.linkmode !== 'adaptive') {
      error(errors, 'requested linkmode is invalid');
    } else if (pacing?.available !== true) {
      error(errors, 'adaptive linkmode was requested but link pacing is unavailable');
    } else if (pacing.mode !== 'adaptive') {
      error(errors, 'requested adaptive linkmode did not produce adaptive pacing');
    } else if (pacing.linksPerSecond !== null) {
      error(errors, 'adaptive pacing must not claim a fixed linksPerSecond');
    }
  }
  if (requested.linkrate !== null) {
    if (pacing?.available !== true) {
      error(errors, 'linkrate was requested but link pacing is unavailable');
    } else if (requested.linkrate === 0 && pacing.mode !== 'unlimited') {
      error(errors, 'requested linkrate=0 did not produce unlimited pacing');
    } else if (requested.linkrate > 0 && pacing.linksPerSecond !== requested.linkrate) {
      error(errors, 'effective linksPerSecond does not match requested linkrate');
    }
  }
  if (
    requested.linkburst !== null &&
    pacing?.available === true &&
    pacing.burst !== requested.linkburst
  )
    error(errors, 'effective burst does not match requested linkburst');
  if (
    requested.compileroots !== null &&
    pacing?.available === true &&
    pacing.compileBatchRoots !== requested.compileroots
  )
    error(errors, 'effective compileBatchRoots does not match requested compileroots');
  if (
    requested.prewarmdeadline !== null &&
    pacing?.available === true &&
    pacing.hardMaxMs !== requested.prewarmdeadline
  )
    error(errors, 'effective hardMaxMs does not match requested prewarmdeadline');
  const modular = effective?.modular;
  for (const [key, field] of [
    ['modular', 'self'],
    ['modularpeers', 'peers'],
  ]) {
    const value = requested[key];
    if (value === null) continue;
    if (modular?.available !== true) {
      error(errors, `${key} was requested but modular flags are unavailable`);
    } else if ((value === 'off') === modular[field]) {
      error(errors, `effective modular ${field} does not match requested ${key}`);
    }
  }
}

function captureEvidence(capture) {
  const captureInfo = capture?.capture ?? {};
  const environment = capture?.environment ?? {};
  const flags = Array.isArray(environment.browserFlags) ? environment.browserFlags : [];
  const headless =
    captureInfo.headless === true ||
    environment.headless === true ||
    flags.some((flag) => typeof flag === 'string' && /^--headless(?:=|$)/.test(flag));
  const rendererText = [
    environment.glVendor,
    environment.glRenderer,
    capture?.effective?.renderer?.glVendor,
    capture?.effective?.renderer?.glRenderer,
    capture?.diagnostics?.rendererStats?.glVendor,
    capture?.diagnostics?.rendererStats?.glRenderer,
    environment.softwareRendering,
    environment.softwareRenderer,
  ]
    .filter((value) => typeof value === 'string')
    .join(' ');
  const swiftShader =
    /swiftshader/i.test(rendererText) ||
    flags.some((flag) => typeof flag === 'string' && /swiftshader/i.test(flag));
  const softwareRenderer =
    swiftShader ||
    environment.softwareRendering === true ||
    environment.softwareRenderer === true ||
    /(llvmpipe|softpipe|software rasterizer|software renderer)/i.test(rendererText);
  return {
    headless,
    swiftShader,
    softwareRenderer,
    performanceEvidence: !headless && !softwareRenderer,
  };
}

/** Validate a raw capture before any derived metric is trusted. */
export function validateCapture(capture, expected = {}) {
  const errors = [];
  const warnings = [];
  if (!capture || typeof capture !== 'object')
    return {
      valid: false,
      errors: ['capture is not an object'],
      warnings,
      performanceEvidence: false,
      evidenceKind: 'invalid',
    };
  const evidence = captureEvidence(capture);
  if (evidence.headless)
    warnings.push('headless capture is smoke-only and cannot be used as performance evidence');
  if (evidence.swiftShader)
    warnings.push(
      'SwiftShader software renderer is smoke-only and cannot be used as performance evidence',
    );
  else if (evidence.softwareRenderer)
    warnings.push('software renderer is smoke-only and cannot be used as performance evidence');
  const requiresPerformanceEvidence =
    expected.performanceEvidence === true ||
    expected.requirePerformanceEvidence === true ||
    expected.evidenceKind === 'performance' ||
    capture.capture?.performanceEvidence === true;
  if (requiresPerformanceEvidence && evidence.headless)
    error(errors, 'headless capture cannot be used as performance evidence');
  if (requiresPerformanceEvidence && evidence.swiftShader)
    error(errors, 'SwiftShader software renderer cannot be used as performance evidence');
  else if (requiresPerformanceEvidence && evidence.softwareRenderer)
    error(errors, 'software renderer cannot be used as performance evidence');
  if (capture.schemaVersion !== GPU_HITCH_SCHEMA_VERSION)
    error(errors, 'capture schemaVersion mismatch');
  if (capture.capture?.complete !== true) error(errors, 'capture is incomplete');
  const campaign = capture.capture ?? {};
  if (own(campaign, 'durationMs'))
    validateNumber(errors, campaign.durationMs, 'capture.durationMs', { nonNegative: true });
  if (own(campaign, 'totalElapsedMs')) {
    validateNumber(errors, campaign.totalElapsedMs, 'capture.totalElapsedMs', {
      nonNegative: true,
    });
    if (
      finite(campaign.totalElapsedMs) &&
      finite(campaign.durationMs) &&
      campaign.totalElapsedMs < campaign.durationMs
    )
      error(errors, 'capture.totalElapsedMs precedes durationMs');
  }
  const campaignFields = [campaign.groupId, campaign.leg, campaign.repetition, campaign.order];
  if (campaignFields.some((value) => value !== null && value !== undefined)) {
    if (typeof campaign.groupId !== 'string' || campaign.groupId === '')
      error(errors, 'capture.groupId is missing');
    if (typeof campaign.leg !== 'string' || campaign.leg === '')
      error(errors, 'capture.leg is missing');
    for (const key of ['repetition', 'order']) {
      if (!Number.isInteger(campaign[key]) || campaign[key] <= 0)
        error(errors, `capture.${key} must be a positive integer`);
    }
  }
  if (!capture.provenance || typeof capture.provenance !== 'object') {
    error(errors, 'provenance is missing');
  } else {
    for (const key of [
      'gitHead',
      'sourceBuildId',
      'servedBuildId',
      'probeSha256',
      'analyzerSha256',
    ]) {
      if (typeof capture.provenance[key] !== 'string' || capture.provenance[key] === '')
        error(errors, `provenance.${key} is missing`);
    }
    for (const key of [
      'sourceBuildId',
      'servedBuildId',
      'probeSha256',
      'analyzerSha256',
      'worktreeName',
    ]) {
      if (expected[key] !== undefined && capture.provenance[key] !== expected[key])
        error(errors, `provenance.${key} does not match expected value`);
    }
  }
  validateReceipt(errors, capture);
  validateRequestedEffective(errors, capture);
  const timeline = capture.timeline;
  if (!timeline || typeof timeline !== 'object') {
    error(errors, 'timeline is missing');
  } else {
    validateEventArray(errors, timeline.links, 'timeline.links');
    validateEventArray(errors, timeline.queries, 'timeline.queries');
    validateCompileUnitArray(errors, timeline.compileUnits ?? [], 'timeline.compileUnits');
    if (!Array.isArray(timeline.uploadBuckets))
      error(errors, 'timeline.uploadBuckets must be an array');
  }
  if (capture.environment?.contextLost > 0) error(errors, 'WebGL context was lost');
  if (capture.environment?.visible !== true) error(errors, 'capture page was not visible');
  const visibilityTransitions = capture.environment?.visibilityTransitions;
  if (!Array.isArray(visibilityTransitions)) {
    error(errors, 'environment.visibilityTransitions must be an array');
  } else {
    let previousVisibilityAt = -Infinity;
    visibilityTransitions.forEach((transition, index) => {
      validateNumber(errors, transition?.atMs, `environment.visibilityTransitions[${index}].atMs`, {
        nonNegative: true,
      });
      if (finite(transition?.atMs) && transition.atMs < previousVisibilityAt)
        error(errors, `environment.visibilityTransitions[${index}].atMs is not monotonic`);
      if (finite(transition?.atMs)) previousVisibilityAt = transition.atMs;
    });
  }
  if (
    visibilityTransitions?.some((transition) => transition?.state && transition.state !== 'visible')
  )
    error(errors, 'capture page became hidden');
  const valid = errors.length === 0;
  return {
    valid,
    errors,
    warnings,
    performanceEvidence: valid && evidence.performanceEvidence,
    evidenceKind: valid ? (evidence.performanceEvidence ? 'performance' : 'smoke') : 'invalid',
  };
}

function comparableValue(capture, key, varying = new Set()) {
  const provenance = capture?.provenance ?? {};
  const environment = capture?.environment ?? {};
  const requested = capture?.requested ?? {};
  const captureInfo = capture?.capture ?? {};
  switch (key) {
    case 'sourceBuildId':
      return provenance.sourceBuildId;
    case 'servedBuildId':
      return provenance.servedBuildId;
    case 'probeSha256':
      return provenance.probeSha256;
    case 'analyzerSha256':
      return provenance.analyzerSha256;
    case 'schemaVersion':
      return capture?.schemaVersion;
    case 'profile':
      return captureInfo.profile;
    case 'browserVersion':
      return environment.browserVersion;
    case 'browserFlags':
      return JSON.stringify(environment.browserFlags ?? []);
    case 'shaderDiskCache':
      return environment.shaderDiskCache;
    case 'glVendor':
      return environment.glVendor;
    case 'glRenderer':
      return environment.glRenderer;
    case 'viewport':
      return environment.viewport;
    case 'devicePixelRatio':
      return environment.devicePixelRatio;
    case 'gfx':
      return requested.gfx;
    case 'scenario':
      return captureInfo.scenario ?? null;
    case 'zone':
      return (
        captureInfo.zone ??
        captureInfo.zoneId ??
        capture?.environment?.zone ??
        capture?.environment?.zoneId ??
        capture?.diagnostics?.zone ??
        capture?.diagnostics?.zoneId ??
        capture?.diagnostics?.currentZoneId ??
        capture?.diagnostics?.rendererStats?.currentZoneId ??
        capture?.environment?.currentZoneId ??
        null
      );
    case 'groupId':
      return captureInfo.groupId ?? null;
    case 'fixture':
      return captureInfo.fixture ?? null;
    case 'durationMs':
      return captureInfo.durationMs ?? null;
    case 'requested.linkmode':
    case 'requested.linkrate':
    case 'requested.linkburst':
    case 'requested.compileroots':
    case 'requested.prewarmdeadline':
    case 'requested.modular':
    case 'requested.modularpeers':
      return requested[key.slice('requested.'.length)] ?? null;
    case 'effective.prewarmPacing':
      return effectivePacingForComparison(capture?.effective?.prewarmPacing, requested, varying);
    case 'effective.modular':
      return effectiveModularForComparison(capture?.effective?.modular, requested, varying);
    case 'rendererTier':
      return (
        capture?.effective?.renderer?.tier ??
        capture?.environment?.rendererTier ??
        capture?.diagnostics?.rendererStats?.tier ??
        null
      );
    default:
      return undefined;
  }
}

function effectivePacingForComparison(pacing, requested, varying) {
  if (!pacing || typeof pacing !== 'object') return null;
  const varyingMode = varying.has('linkmode');
  return {
    available: pacing.available ?? null,
    mode: varying.has('linkrate') || varyingMode ? null : (pacing.mode ?? null),
    linksPerSecond:
      varying.has('linkrate') || varyingMode
        ? null
        : requested.linkrate === null
          ? (pacing.linksPerSecond ?? null)
          : null,
    burst:
      varying.has('linkburst') || varyingMode
        ? null
        : requested.linkburst === null
          ? (pacing.burst ?? null)
          : null,
    compileBatchRoots: varying.has('compileroots')
      ? null
      : requested.compileroots === null
        ? (pacing.compileBatchRoots ?? null)
        : null,
    hardMaxMs: varying.has('prewarmdeadline')
      ? null
      : requested.prewarmdeadline === null
        ? (pacing.hardMaxMs ?? null)
        : null,
    scope: varyingMode ? null : (pacing.scope ?? null),
    reason: pacing.reason ?? null,
  };
}

function effectiveModularForComparison(modular, requested, varying) {
  if (!modular || typeof modular !== 'object') return null;
  return {
    available: modular.available ?? null,
    self: varying.has('modular')
      ? null
      : requested.modular === null
        ? (modular.self ?? null)
        : null,
    peers: varying.has('modularpeers')
      ? null
      : requested.modularpeers === null
        ? (modular.peers ?? null)
        : null,
    reason: modular.reason ?? null,
  };
}

/** Return all fields that make two A/B legs incomparable. */
export function comparabilityMismatches(left, right, { varying = [] } = {}) {
  const varyingSet = new Set(varying);
  const mismatches = [];
  for (const key of COMPARABILITY_KEYS) {
    if (
      varyingSet.has(key) ||
      (key.startsWith('requested.') && varyingSet.has(key.slice('requested.'.length))) ||
      (key === 'durationMs' &&
        (varyingSet.has('durationMs') || varyingSet.has('capture.durationMs'))) ||
      (key === 'effective.prewarmPacing' && varyingSet.has('effective.prewarmPacing')) ||
      (key === 'effective.modular' && varyingSet.has('effective.modular')) ||
      (key === 'rendererTier' && varyingSet.has('effective.renderer.tier'))
    )
      continue;
    if (
      JSON.stringify(comparableValue(left, key, varyingSet)) !==
      JSON.stringify(comparableValue(right, key, varyingSet))
    )
      mismatches.push(key);
  }
  return mismatches;
}

export function areComparable(left, right, options = {}) {
  return comparabilityMismatches(left, right, options).length === 0;
}

/** Derive a compact summary only after raw validation has succeeded. */
export function summarizeCapture(capture, { slowMs = 100, windowMs = 8_000 } = {}) {
  const validation = validateCapture(capture);
  if (!validation.valid)
    throw new Error(`cannot summarize invalid capture: ${validation.errors.join('; ')}`);
  const links = capture.timeline.links;
  const queries = capture.timeline.queries;
  const slowQueries = queries
    .filter((query) => query.durationMs >= slowMs)
    .map((query) => ({
      ...query,
      linksBefore: linksBeforeQuery(query, links, windowMs),
      uploadsBefore: uploadBucketsBeforeQuery(
        query,
        capture.timeline.uploadBuckets,
        windowMs,
        capture.timeline.uploadBucketWidthMs ?? GPU_HITCH_UPLOAD_BUCKET_MS,
      ),
    }));
  const queriesByKind = {};
  for (const query of queries) {
    let row = queriesByKind[query.kind];
    if (!row) {
      row = { calls: 0, totalMs: 0, maxMs: 0 };
      queriesByKind[query.kind] = row;
    }
    row.calls++;
    row.totalMs += query.durationMs;
    row.maxMs = Math.max(row.maxMs, query.durationMs);
  }
  return {
    schemaVersion: GPU_HITCH_SCHEMA_VERSION,
    linksTotal: links.length,
    linksByLane: links.reduce((out, link) => {
      out[link.lane] = (out[link.lane] ?? 0) + 1;
      return out;
    }, {}),
    queriesByKind,
    compileUnits: capture.timeline.compileUnits,
    compileUnitsAtReveal: capture.timeline.compileUnits.reduce((out, unit) => {
      const status = unit.statusAtReveal ?? 'unknown';
      out[status] = (out[status] ?? 0) + 1;
      return out;
    }, {}),
    slowQueries: slowQueries.sort((a, b) => b.durationMs - a.durationMs),
    phaseTransitions: capture.timeline.phases ?? [],
  };
}

/** Build a host-side provenance object without exposing an absolute path. */
export function makeProvenance({
  gitHead,
  branch,
  sourceBuildId,
  servedBuildId,
  probeSha256,
  analyzerSha256,
  worktreeName,
  dirty,
}) {
  return {
    gitHead: String(gitHead ?? ''),
    branch: String(branch ?? ''),
    sourceBuildId: String(sourceBuildId ?? ''),
    servedBuildId: String(servedBuildId ?? ''),
    probeSha256: String(probeSha256 ?? ''),
    analyzerSha256: String(analyzerSha256 ?? ''),
    worktreeName: String(worktreeName ?? ''),
    dirty: dirty === true,
  };
}

export function requestedValueForKey(requested, key) {
  return queryRequestedValue(requested?.[key]);
}
