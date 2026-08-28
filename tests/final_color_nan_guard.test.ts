import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installFinalColorNanGuard } from '../src/render/final_color_nan_guard';

describe('installFinalColorNanGuard', () => {
  it('patches both chunks on a fresh chunk set and reports changed', () => {
    const chunks = {
      opaque_fragment: THREE.ShaderChunk.opaque_fragment,
      fog_fragment: THREE.ShaderChunk.fog_fragment,
    };
    const changed = installFinalColorNanGuard(chunks);
    expect(changed).toBe(true);
    expect(chunks.opaque_fragment).toContain('WOC_OPAQUE_NAN_GUARD');
    expect(chunks.fog_fragment).toContain('WOC_FOG_NAN_GUARD');
  });

  it('reports unchanged on a second call against the same chunk set', () => {
    const chunks = {
      opaque_fragment: THREE.ShaderChunk.opaque_fragment,
      fog_fragment: THREE.ShaderChunk.fog_fragment,
    };
    installFinalColorNanGuard(chunks);
    const changed = installFinalColorNanGuard(chunks);
    expect(changed).toBe(false);
  });
});
