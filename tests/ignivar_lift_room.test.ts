// The forge-lift room's render kit: the two-pose portcullis, the
// descending-shaft illusion, and the moving machinery decorators.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sharedUniforms } from '../src/render/gfx';
import {
  buildIgnivarLiftGate,
  buildIgnivarLiftShaft,
  decorateLiftBeamMaterial,
  decorateLiftDoorMaterial,
  decorateLiftWinchMaterial,
  ignivarLiftRoomInternalsForTest,
  LIFT_BEAM_PROGRAM_CACHE_KEY,
  LIFT_DOOR_PROGRAM_CACHE_KEY,
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
  it('renders nothing while sealed (the owner dresses the doorway)', () => {
    const sealed = buildIgnivarLiftGate(false);
    expect(sealed.name).toBe('ignivar-lift-gate-hidden');
    expect(sealed.children.length).toBe(0);
    // the arrival body is not this builder's: the unlock swaps the entity
    // to 'dungeon_door', which takes the generic arch-and-swirl portal
    expect(buildIgnivarLiftGate(true).children.length).toBe(0);
  });

  it('wraps the car in two shaft sheets and a dust cloud', () => {
    const shaft = buildIgnivarLiftShaft(false);
    const west = shaft.getObjectByName('liftShaftWest') as THREE.Mesh;
    const east = shaft.getObjectByName('liftShaftEast') as THREE.Mesh;
    const dust = shaft.getObjectByName('ignivarLiftDust') as THREE.Points;
    expect(west).toBeDefined();
    expect(east).toBeDefined();
    expect(dust).toBeDefined();
    const { shaftSheetX, carZMin, carZMax, roomGrilleX } = ignivarLiftRoomInternalsForTest;
    expect(west.position.x).toBeCloseTo(-shaftSheetX);
    expect(east.position.x).toBeCloseTo(shaftSheetX);
    // the sheets hang between the grille line and the shell wall's
    // inner face (x 9), so the bars read against the moving shaft
    expect(shaftSheetX).toBeGreaterThan(roomGrilleX);
    expect(shaftSheetX).toBeLessThan(9);
    expect(west.position.z).toBeCloseTo((carZMin + carZMax) / 2);
    const material = west.material as THREE.MeshBasicMaterial;
    const shader = compile(material);
    expect(shader.uniforms.uTime).toBe(sharedUniforms.uTime);
    expect(shader.fragmentShader).toContain('liftPhase');
    expect(shader.fragmentShader).toContain('liftBand');
  });

  it('spins the winch drum and beam sheave, cycles the door leaf, holds frames still', () => {
    const winch = decorateLiftWinchMaterial(new THREE.MeshStandardMaterial());
    const winchShader = compile(winch);
    expect(winchShader.uniforms.uTime).toBe(sharedUniforms.uTime);
    // the drum region: a radial band about the x-axis axle, inside the frame
    expect(winchShader.vertexShader).toContain('step(length(vec2(p.y - 0.47, p.z)), 0.25)');
    expect(winchShader.vertexShader).toContain('step(abs(p.x), 0.22)');
    expect(winchShader.vertexShader).toContain('uTime * 1.6');
    expect(winch.customProgramCacheKey()).toContain(LIFT_WINCH_PROGRAM_CACHE_KEY);

    const beam = decorateLiftBeamMaterial(new THREE.MeshStandardMaterial());
    const beamShader = compile(beam);
    // the hanging sheave wheel: the mid-span lobe under the bar
    expect(beamShader.vertexShader).toContain('step(abs(p.x), 0.11) * step(p.y, 0.17)');
    expect(beamShader.vertexShader).toContain('uTime * 2.1');
    expect(beam.customProgramCacheKey()).toContain(LIFT_BEAM_PROGRAM_CACHE_KEY);

    const door = decorateLiftDoorMaterial(new THREE.MeshStandardMaterial());
    const doorShader = compile(door);
    // the leaf inside the pocket posts, on the open-hold-shut loop
    expect(doorShader.vertexShader).toContain('step(abs(p.x), 0.27) * step(p.y, 0.92)');
    expect(doorShader.vertexShader).toContain('fract(uTime / 9.0)');
    expect(door.customProgramCacheKey()).toContain(LIFT_DOOR_PROGRAM_CACHE_KEY);
    // a pure slide: the door splices no normal pass
    expect(doorShader.vertexShader).not.toContain('objectNormal = mix(');

    // the rotating pieces DO rotate their normals so lighting follows
    for (const shader of [winchShader, beamShader]) {
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
