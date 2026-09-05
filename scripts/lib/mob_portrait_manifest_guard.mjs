import { isDeepStrictEqual } from 'node:util';

function digestOf(file) {
  return file ? `${file.bytes}:${file.sha256}` : null;
}

function withoutRowsAndBundleFingerprint(manifest) {
  const { portraitCount: _portraitCount, portraits: _portraits, ...contract } = manifest;
  return {
    ...contract,
    rendererFingerprint: null,
    renderer: {
      ...manifest.renderer,
      browserBundle: manifest.renderer?.browserBundle
        ? { ...manifest.renderer.browserBundle, bytes: null, sha256: null }
        : manifest.renderer?.browserBundle,
    },
  };
}

// The browser bundle reaches unrelated gameplay modules. A bundle-digest-only
// move is already treated as bookkeeping by the manifest freshness check. When
// that same move accompanies newly added mobs, keep the same ruling for every
// pre-existing byte-identical row and require a renderer receipt only for the
// rows that actually changed. Any renderer script, output contract, bundle
// metadata, bootstrap review, or existing portrait change stays fail-closed.
function canScopeRendererDriftToChangedRows(previous, next) {
  if (!previous?.renderer || !next?.renderer) return false;
  if (
    previous.portraitCount !== previous.portraits?.length ||
    next.portraitCount !== next.portraits?.length
  )
    return false;
  return (
    previous.rendererFingerprint !== next.rendererFingerprint &&
    digestOf(previous.renderer.browserBundle) !== digestOf(next.renderer.browserBundle) &&
    isDeepStrictEqual(
      withoutRowsAndBundleFingerprint(previous),
      withoutRowsAndBundleFingerprint(next),
    )
  );
}

export function changedPortraitIds(previous, next) {
  if (
    !previous ||
    (previous.rendererFingerprint !== next.rendererFingerprint &&
      !canScopeRendererDriftToChangedRows(previous, next))
  ) {
    return next.portraits.map((portrait) => portrait.id);
  }
  const before = new Map(previous.portraits.map((portrait) => [portrait.id, portrait]));
  return next.portraits
    .filter((portrait) => {
      const prior = before.get(portrait.id);
      return !prior || !isDeepStrictEqual(prior, portrait);
    })
    .map((portrait) => portrait.id);
}

export function assertManifestWriteAuthorized({ previous, next, receipt, allowBootstrap = false }) {
  if (!previous || previous.schemaVersion !== next.schemaVersion) {
    if (!allowBootstrap) {
      throw new Error(
        'portrait manifest bootstrap/schema migration requires explicit reviewed bootstrap evidence',
      );
    }
    return;
  }

  const changedIds = changedPortraitIds(previous, next);
  if (changedIds.length === 0) return;
  if (!receipt) {
    throw new Error(
      `portrait inputs/outputs changed for ${changedIds.length} row(s) without a renderer receipt: ${changedIds.join(', ')}`,
    );
  }
  if (
    receipt.schemaVersion !== 1 ||
    receipt.generatedBy !== 'scripts/render_finder_portraits.mjs'
  ) {
    throw new Error('portrait renderer receipt has an unsupported schema or producer');
  }
  if (receipt.rendererFingerprint !== next.rendererFingerprint) {
    throw new Error('portrait renderer receipt does not match the current renderer fingerprint');
  }

  const receiptRows = new Map(receipt.portraits.map((portrait) => [portrait.id, portrait]));
  const nextRows = new Map(next.portraits.map((portrait) => [portrait.id, portrait]));
  for (const id of changedIds) {
    const expected = nextRows.get(id);
    const rendered = receiptRows.get(id);
    if (!rendered) throw new Error(`portrait renderer receipt is missing changed row ${id}`);
    if (rendered.sourceFingerprint !== expected.sourceFingerprint) {
      throw new Error(`portrait renderer receipt has stale source fingerprint for ${id}`);
    }
    if (
      rendered.output.sha256 !== expected.output.sha256 ||
      rendered.output.bytes !== expected.output.bytes
    ) {
      throw new Error(`portrait renderer receipt output does not match ${id}`);
    }
  }
}
