import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  patchFogFragmentNanGuard,
  patchOpaqueFragmentNanGuard,
} from '../src/render/final_color_nan_guard_core';

const OPAQUE_WRITE = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
const FOG_WRITE = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';

describe('final color NaN guard core', () => {
  it('scrubs outgoingLight immediately before opaque_fragment writes gl_FragColor', () => {
    const source = THREE.ShaderChunk.opaque_fragment;
    const patched = patchOpaqueFragmentNanGuard(source);
    expect(patched).not.toBe(source);
    const scrubStart = patched.indexOf('outgoingLight.x = ( outgoingLight.x < 0.0');
    const write = patched.indexOf(OPAQUE_WRITE);
    expect(scrubStart).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(scrubStart);
    // Nothing sits between the scrub and the write it protects.
    expect(patched.slice(scrubStart, write)).not.toContain(OPAQUE_WRITE);
  });

  it('is idempotent on opaque_fragment', () => {
    const once = patchOpaqueFragmentNanGuard(THREE.ShaderChunk.opaque_fragment);
    const twice = patchOpaqueFragmentNanGuard(once);
    expect(twice).toBe(once);
  });

  it('throws if the opaque_fragment anchor changes', () => {
    expect(() => patchOpaqueFragmentNanGuard('gl_FragColor = vec4( 1.0 );')).toThrow();
  });

  it('scrubs fog_fragment gl_FragColor.rgb after the fog mix, via a local copy', () => {
    const source = THREE.ShaderChunk.fog_fragment;
    const patched = patchFogFragmentNanGuard(source);
    expect(patched).not.toBe(source);
    const write = patched.indexOf(FOG_WRITE);
    const localCopy = patched.indexOf('vec3 wocFogNanGuard = gl_FragColor.rgb;');
    const finalWrite = patched.lastIndexOf('gl_FragColor.rgb = wocFogNanGuard;');
    expect(write).toBeGreaterThan(-1);
    expect(localCopy).toBeGreaterThan(write);
    expect(finalWrite).toBeGreaterThan(localCopy);
    // Still inside the #ifdef USE_FOG block the chunk opens with.
    expect(patched.slice(finalWrite)).toContain('#endif');
  });

  it('is idempotent on fog_fragment', () => {
    const once = patchFogFragmentNanGuard(THREE.ShaderChunk.fog_fragment);
    const twice = patchFogFragmentNanGuard(once);
    expect(twice).toBe(once);
  });

  it('throws if the fog_fragment anchor changes', () => {
    expect(() => patchFogFragmentNanGuard('gl_FragColor = fogColor;')).toThrow();
  });
});
