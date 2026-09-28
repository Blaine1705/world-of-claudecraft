import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BALGATH_FORM_REPO_ROOT = path.resolve(HERE, '..', '..', '..');

// Every input that decides the shipped bytes. The form is decimated from the boss's own
// shipped GLB, so that file is an input too: a rebake of the boss (a new mesh, new
// textures) must turn this fingerprint stale and force the form to be rebuilt with it.
export const BALGATH_FORM_SOURCE_FILES = Object.freeze([
  'scripts/assets/balgath_form/model.py',
  'scripts/assets/balgath_form/contract.mjs',
  'scripts/assets/balgath_form/export_balgath_form.mjs',
  'scripts/assets/balgath_form/source_fingerprint.mjs',
  'scripts/assets/specs/balgath_form.json',
  'scripts/assets/build_assets.mjs',
  'pnpm-lock.yaml',
  'public/models/creatures/balgath_cyclops.glb',
]);

function lengthDelimiter(byteLength) {
  const delimiter = Buffer.alloc(8);
  delimiter.writeBigUInt64BE(BigInt(byteLength));
  return delimiter;
}

export function balgathFormSourceFingerprint(repoRoot = BALGATH_FORM_REPO_ROOT) {
  const hash = createHash('sha256');
  for (const relativePath of BALGATH_FORM_SOURCE_FILES) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const fileBytes = readFileSync(path.join(repoRoot, relativePath));
    hash.update(lengthDelimiter(pathBytes.byteLength));
    hash.update(pathBytes);
    hash.update(lengthDelimiter(fileBytes.byteLength));
    hash.update(fileBytes);
  }
  return hash.digest('hex');
}
