// Contract: every URL scheme the three.js GLB decoder stack bootstraps through must be
// allowed by the desktop shell CSP (electron/shell_guards.cjs buildContentSecurityPolicy).
//
// The desktop (Electron) shell is the only host that ships a CSP, and only PACKAGED
// builds serve it (electron:dev loads the Vite server, never the app:// handler that
// attaches the header), so a scheme the CSP misses breaks only the packed desktop app,
// which no other suite exercises. That is how the v0.39.0 desktop build hung at world
// entry: three's ZSTDDecoder (KTX2Loader's Zstandard path) boots its WASM via
// fetch("data:application/wasm;base64,...") and connect-src did not list data:.
//
// This suite scans the VENDORED three sources for literal scheme-prefixed fetch()
// bootstraps and asserts connect-src allows each one, so a three upgrade that changes a
// decoder bootstrap (or a CSP edit that drops an allowance) goes red here, in every
// vitest run, instead of in a packaged build. Peer suites:
// tests/electron_shell_guards.test.ts pins the CSP string itself;
// tests/basis_transcoder_csp.test.ts pins the eval-free basis transcoder patch.
// The live end-to-end variant is scripts/csp_shell_smoke.mjs (real browser, real CSP).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '../electron/shell_guards.cjs';

const ROOT = path.resolve(__dirname, '..');

// The decoder stack the renderer actually imports for GLB loading: KTX2 textures
// (src/render/assets/ktx2_support.ts wires KTX2Loader, whose Zstandard path is
// zstddec), meshopt geometry, and the GLTFLoader that drives them both.
const DECODER_FILES = [
  'libs/zstddec.module.js',
  'libs/meshopt_decoder.module.js',
  'loaders/KTX2Loader.js',
  'loaders/GLTFLoader.js',
];

const decoderSources: Array<[string, string]> = DECODER_FILES.map((file) => [
  file,
  readFileSync(path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', file), 'utf8'),
]);

// Literal scheme-prefixed fetch targets, e.g. fetch("data:application/wasm;base64," + b64).
// Dynamic URLs (object URLs minted at runtime) cannot be found this way; the explicit
// blob: assertions below pin those known cases.
const FETCH_SCHEME = /\bfetch\(\s*["'`]([a-z][a-z0-9+.-]*):/gi;

function fetchedSchemes(source: string): Set<string> {
  const schemes = new Set<string>();
  for (const match of source.matchAll(FETCH_SCHEME)) schemes.add(match[1].toLowerCase());
  return schemes;
}

const csp = buildContentSecurityPolicy({ apiOrigin: 'https://worldofclaudecraft.com' });
const directive = (name: string): string =>
  csp.split('; ').find((entry) => entry.startsWith(`${name} `)) ?? '';

describe('GLB decoder stack vs the desktop shell CSP', () => {
  it('still sees the zstd data: wasm bootstrap, so the scheme scan cannot rot silently', () => {
    // If a three upgrade removes this, the decoder bootstrap changed shape: re-derive
    // what the new code fetches (or spawns) and update the scan before trusting green.
    const zstd = decoderSources.find(([file]) => file === 'libs/zstddec.module.js');
    expect(zstd && [...fetchedSchemes(zstd[1])]).toContain('data');
  });

  it('allows every scheme the decoder stack fetch()es in connect-src', () => {
    for (const [file, source] of decoderSources) {
      for (const scheme of fetchedSchemes(source)) {
        expect(directive('connect-src'), `${file} fetches ${scheme}: URIs`).toContain(`${scheme}:`);
      }
    }
  });

  it('keeps blob: allowed for the object-URL paths the scan cannot see', () => {
    // GLTFLoader hands embedded textures to fetch() as blob: object URLs (a connect-src
    // request), and KTX2Loader runs its transcoder inside a blob worker.
    const gltf = decoderSources.find(([file]) => file === 'loaders/GLTFLoader.js');
    const ktx2 = decoderSources.find(([file]) => file === 'loaders/KTX2Loader.js');
    expect(gltf?.[1]).toContain('createObjectURL');
    expect(ktx2?.[1]).toContain('createObjectURL');
    expect(directive('connect-src')).toContain('blob:');
    expect(directive('worker-src')).toContain('blob:');
  });

  it('keeps WASM instantiation possible without unsafe-eval', () => {
    const zstd = decoderSources.find(([file]) => file === 'libs/zstddec.module.js');
    expect(zstd?.[1]).toContain('WebAssembly.instantiate');
    expect(directive('script-src')).toContain("'wasm-unsafe-eval'");
    expect(directive('script-src')).not.toContain("'unsafe-eval'");
  });

  it('keeps the data: allowance scoped to fetch and image surfaces, never executable ones', () => {
    for (const name of ['script-src', 'worker-src', 'frame-src', 'object-src']) {
      expect(directive(name), `${name} must not gain data:`).not.toContain(' data:');
    }
    expect(directive('img-src')).toContain(' data:');
  });
});
