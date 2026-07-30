import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { OUTPUT_GRADE_FRAGMENT_SHADER, OutputGradePass } from '../src/render/post_output_grade';

describe('fused output and grade shader', () => {
  it('preserves the output half-float boundary before the exact grade operation order', () => {
    const shader = OUTPUT_GRADE_FRAGMENT_SHADER;
    const toneMapAt = shader.indexOf('outputColor.rgb = ACESFilmicToneMapping(outputColor.rgb);');
    const srgbAt = shader.indexOf('outputColor = sRGBTransferOETF(outputColor);');
    const halfAt = shader.indexOf('vec3 c = quantizeHalf(outputColor.rgb);');
    const liftAt = shader.indexOf('c = pow(max(vec3(0.0), c * GAIN + LIFT), GAMMA);');
    const curveAt = shader.indexOf('c = mix(c, c * c * (3.0 - 2.0 * c), 0.23);');
    const saturationAt = shader.indexOf('c = mix(vec3(l), c, 1.07);');
    const vignetteAt = shader.indexOf('c *= 1.0 - 0.20 * smoothstep(0.60, 0.95, dot(d, d) * 2.2);');
    const grainAt = shader.indexOf(
      'c += (fract(sin(dot(vUv * 731.7 + uTime, vec2(12.9898, 78.233))) * 43758.5) - 0.5) * 0.012;',
    );

    expect(toneMapAt).toBeGreaterThan(-1);
    expect(srgbAt).toBeGreaterThan(toneMapAt);
    expect(halfAt).toBeGreaterThan(srgbAt);
    expect(liftAt).toBeGreaterThan(halfAt);
    expect(curveAt).toBeGreaterThan(liftAt);
    expect(saturationAt).toBeGreaterThan(curveAt);
    expect(vignetteAt).toBeGreaterThan(saturationAt);
    expect(grainAt).toBeGreaterThan(vignetteAt);
    expect(shader).toContain('const vec3 LIFT = vec3(0.010, 0.008, 0.010);');
    expect(shader).toContain('const vec3 GAIN = vec3(1.10, 1.035, 0.90);');
    expect(shader).toContain('const vec3 GAMMA = vec3(0.975);');
    expect(shader).toContain('unpackHalf2x16(packHalf2x16(value.rg))');
    expect(shader).toContain('unpackHalf2x16(packHalf2x16(vec2(value.b, 0.0))).x');
    expect(shader).toContain('pc_fragColor = vec4(c, 1.0);');
  });

  it('propagates exposure and selects the same ACES and sRGB defines as OutputPass', () => {
    const time = { value: 17 };
    const pass = new OutputGradePass(time);
    const write = new THREE.WebGLRenderTarget(16, 8);
    const read = new THREE.WebGLRenderTarget(16, 8);
    const setRenderTarget = vi.fn();
    const clear = vi.fn();
    const renderer = {
      outputColorSpace: THREE.SRGBColorSpace,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 0.73,
      autoClearColor: true,
      autoClearDepth: true,
      autoClearStencil: false,
      setRenderTarget,
      clear,
    } as unknown as THREE.WebGLRenderer;
    vi.spyOn(pass.fsQuad, 'render').mockImplementation(() => {});

    pass.clear = true;
    pass.render(renderer, write, read);

    expect(pass.uniforms.tDiffuse.value).toBe(read.texture);
    expect(pass.uniforms.toneMappingExposure.value).toBe(0.73);
    expect(pass.uniforms.uTime).toBe(time);
    expect(pass.material.defines).toEqual({
      SRGB_TRANSFER: '',
      ACES_FILMIC_TONE_MAPPING: '',
    });
    expect(setRenderTarget).toHaveBeenCalledWith(write);
    expect(clear).toHaveBeenCalledWith(true, true, false);
    expect(pass.fsQuad.render).toHaveBeenCalledWith(renderer);

    pass.renderToScreen = true;
    pass.render(renderer, write, read);
    expect(setRenderTarget).toHaveBeenLastCalledWith(null);
  });
});
