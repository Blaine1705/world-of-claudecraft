// Final provenance seal after the standard character optimizer. JSON-only rewrite:
// retain compressed geometry, skins and clips byte-for-byte in the BIN chunk.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_INPUTS = [
  'scripts/assets/drowned_temple_creatures/abyssal_lurker.py',
  'scripts/assets/drowned_temple_creatures/build_creature.py',
  'scripts/assets/drowned_temple_creatures/seal_abyssal_lurker.mjs',
  'scripts/assets/sunken_bastion_creatures/sea_kit.py',
  'scripts/assets/hollow_crypt_creatures/creature_kit.py',
  'docs/design/dungeon-rework/kit/hckit.py',
  'scripts/assets/specs/temple_abyssal_lurker.json',
  'scripts/assets/build_assets.mjs',
  'pnpm-lock.yaml',
];

export function sourceFingerprint() {
  const hash = createHash('sha256');
  for (const name of SOURCE_INPUTS)
    hash.update(name).update('\0').update(readFileSync(name)).update('\0');
  return hash.digest('hex');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = 'public/models/creatures/temple_abyssal_lurker.glb';
  const bytes = readFileSync(path);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  json.asset.extras = {
    ...json.asset.extras,
    sourceFingerprint: sourceFingerprint(),
    authoring: 'Original Blender quadrupedal amphibian; no imported concept geometry',
  };
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32);
  encoded.copy(padded);
  const remainder = bytes.subarray(20 + length);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(20 + padded.length + remainder.length, 8);
  header.writeUInt32LE(padded.length, 12);
  writeFileSync(path, Buffer.concat([header, padded, remainder]));
  console.log(`Sealed ${path}: ${json.asset.extras.sourceFingerprint}`);
}
