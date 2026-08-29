// The forge-lift room's render kit: the two-pose portcullis, the
// descending-shaft illusion, and the moving machinery decorators.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sharedUniforms } from '../src/render/gfx';
import {
  buildIgnivarLiftGate,
  buildIgnivarLiftShaft,
  decorateLiftHandleMaterial,
  decorateLiftWinchMaterial,
  ignivarLiftRoomInternalsForTest,
  LIFT_HANDLE_PROGRAM_CACHE_KEY,
  LIFT_WINCH_PROGRAM_CACHE_KEY,
} from '../src/render/ignivar_lift_room';

type CompileShader = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

function compile(material: THREE.Material): CompileShader {
  const shader: CompileShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>',
  };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as unknown as THREE.WebGLRenderer,
  );
  return shader;
}

describe('the forge-lift room render kit', () => {
  it('drops the bars sealed and tucks them open around one shared frame', () => {
    const sealed = buildIgnivarLiftGate(false);
    const open = buildIgnivarLiftGate(true);
    for (const gate of [sealed, open]) {
      expect(gate.getObjectByName('left-post')).toBeDefined();
      expect(gate.getObjectByName('right-post')).toBeDefined();
      expect(gate.getObjectByName('bar-track')).toBeDefined();
      expect(gate.getObjectByName('ember-strip')).toBeDefined();
    }
    const sealedBar = sealed.getObjectByName('bar-6') as THREE.Mesh;
    const openBar = open.getObjectByName('bar-6') as THREE.Mesh;
    const sealedHeight = (sealedBar.geometry as THREE.BoxGeometry).parameters.height;
    const openHeight = (openBar.geometry as THREE.BoxGeometry).parameters.height;
    expect(sealedHeight).toBeGreaterThan(5);
    expect(openHeight).toBeLessThanOrEqual(1.0);
    // the bars reach the floor sealed, and hang under the track open
    expect(sealedBar.position.y - sealedHeight / 2).toBeLessThan(0.1);
    expect(openBar.position.y - openHeight / 2).toBeGreaterThan(4);
  });

  it('wraps the car in two shaft sheets and a dust cloud', () => {
    const shaft = buildIgnivarLiftShaft(false);
    const west = shaft.getObjectByName('liftShaftWest') as THREE.Mesh;
    const east = shaft.getObjectByName('liftShaftEast') as THREE.Mesh;
    const dust = shaft.getObjectByName('ignivarLiftDust') as THREE.Points;
    expect(west).toBeDefined();
    expect(east).toBeDefined();
    expect(dust).toBeDefined();
    const { shaftSheetX, carZMin } = ignivarLiftRoomInternalsForTest;
    expect(west.position.x).toBeCloseTo(-shaftSheetX);
    expect(east.position.x).toBeCloseTo(shaftSheetX);
    // the sheets sit outside the shaft-gap gearwork (the gear_machine at
    // x -10.6) so the machinery reads between the bars and the moving wall
    expect(shaftSheetX).toBeGreaterThan(11);
    expect(west.position.z).toBeLessThan(carZMin + 13);
    const material = west.material as THREE.MeshBasicMaterial;
    const shader = compile(material);
    expect(shader.uniforms.uTime).toBe(sharedUniforms.uTime);
    expect(shader.fragmentShader).toContain('liftPhase');
    expect(shader.fragmentShader).toContain('liftBand');
  });

  it('pumps the handle arm above its pivot and spins the winch drum only', () => {
    const handle = decorateLiftHandleMaterial(new THREE.MeshStandardMaterial());
    const handleShader = compile(handle);
    expect(handleShader.uniforms.uTime).toBe(sharedUniforms.uTime);
    expect(handleShader.vertexShader).toContain('step(0.36, p.y)');
    expect(handleShader.vertexShader).toContain('sin(uTime * 1.4)');
    expect(handle.customProgramCacheKey()).toContain(LIFT_HANDLE_PROGRAM_CACHE_KEY);

    const winch = decorateLiftWinchMaterial(new THREE.MeshStandardMaterial());
    const winchShader = compile(winch);
    expect(winchShader.uniforms.uTime).toBe(sharedUniforms.uTime);
    // the drum region: a radial band about the x-axis axle, inside the frame
    expect(winchShader.vertexShader).toContain('step(length(vec2(p.y - 0.47, p.z)), 0.25)');
    expect(winchShader.vertexShader).toContain('step(abs(p.x), 0.22)');
    expect(winchShader.vertexShader).toContain('uTime * 1.6');
    expect(winch.customProgramCacheKey()).toContain(LIFT_WINCH_PROGRAM_CACHE_KEY);
    // both splice the position pass AND the normal pass (lighting follows)
    for (const shader of [handleShader, winchShader]) {
      expect(shader.vertexShader).toContain('transformed = ignivarLiftSpin');
      expect(shader.vertexShader).toContain('objectNormal = mix(');
    }
  });

  it('composes with a prior material hook instead of replacing it', () => {
    const material = new THREE.MeshStandardMaterial();
    let priorRan = false;
    material.onBeforeCompile = () => {
      priorRan = true;
    };
    material.customProgramCacheKey = () => 'prior-key';
    decorateLiftWinchMaterial(material);
    compile(material);
    expect(priorRan).toBe(true);
    expect(material.customProgramCacheKey()).toBe(`prior-key|${LIFT_WINCH_PROGRAM_CACHE_KEY}`);
  });
});
