import { describe, expect, it } from 'vitest';
import {
  type PostPlanInput,
  type PostRenderTargetPlan,
  postPipelinePlan,
} from '../src/render/post_plan_core';

const insaneInput: PostPlanInput = {
  gradeOnly: false,
  ao: true,
  aoFullRes: true,
  bloom: true,
  smaa: false,
  n8aoDisabled: false,
  smaaDisabled: false,
  isWebGL2: true,
  msaaSamples: 4,
};

describe('post pipeline plan', () => {
  it('pins the insane chain to one composer target and nineteen fullscreen stages', () => {
    const plan = postPipelinePlan(insaneInput);

    expect(plan.scene).toEqual({
      pass: 'n8ao',
      aoQuality: 'Medium',
      aoScale: 1,
    });
    expect(plan.composerPasses).toEqual(['n8ao', 'bloom', 'output-grade']);
    expect(plan.singleComposerBuffer).toBe(true);
    expect(plan.resolveCount).toBe(0);
    expect(plan.renderTargets).toHaveLength(16);
    expect(plan.fullscreenStages).toHaveLength(19);
    expect(plan.fullscreenStages.map((stage) => stage.id)).toEqual([
      'n8ao-evaluate',
      'n8ao-denoise-0',
      'n8ao-denoise-1',
      'n8ao-accumulation-copy',
      'n8ao-composite',
      'bloom-high-pass',
      'bloom-blur-x-0',
      'bloom-blur-y-0',
      'bloom-blur-x-1',
      'bloom-blur-y-1',
      'bloom-blur-x-2',
      'bloom-blur-y-2',
      'bloom-blur-x-3',
      'bloom-blur-y-3',
      'bloom-blur-x-4',
      'bloom-blur-y-4',
      'bloom-mip-composite',
      'bloom-add',
      'output-grade',
    ]);
  });

  it('pins every surviving insane target size, format, sample count, and depth attachment', () => {
    const plan = postPipelinePlan(insaneInput);
    const expected: PostRenderTargetPlan[] = [
      {
        id: 'composer-a',
        scale: 1,
        format: 'rgba16f',
        samples: 0,
        depth: 'none',
      },
      {
        id: 'n8ao-beauty',
        scale: 1,
        format: 'rgba16f',
        samples: 0,
        depth: 'depth32ui-texture',
      },
      { id: 'n8ao-ao-a', scale: 1, format: 'rgba8', samples: 0, depth: 'none' },
      { id: 'n8ao-ao-b', scale: 1, format: 'rgba8', samples: 0, depth: 'none' },
      {
        id: 'n8ao-accumulation',
        scale: 1,
        format: 'rgba16f',
        samples: 0,
        depth: 'none',
      },
      { id: 'bloom-bright', scale: 0.5, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-h-0', scale: 0.5, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-v-0', scale: 0.5, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-h-1', scale: 0.25, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-v-1', scale: 0.25, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-h-2', scale: 0.125, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-v-2', scale: 0.125, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-h-3', scale: 0.0625, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-v-3', scale: 0.0625, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-h-4', scale: 0.03125, format: 'rgba16f', samples: 0, depth: 'none' },
      { id: 'bloom-v-4', scale: 0.03125, format: 'rgba16f', samples: 0, depth: 'none' },
    ];

    expect(plan.renderTargets).toEqual(expected);
  });

  it('keeps medium MSAA only on geometry and performs exactly one resolve', () => {
    const plan = postPipelinePlan({
      ...insaneInput,
      gradeOnly: true,
      ao: false,
      aoFullRes: false,
      bloom: false,
    });

    expect(plan.scene).toEqual({
      pass: 'render',
      aoQuality: null,
      aoScale: null,
    });
    expect(plan.composerPasses).toEqual(['render', 'output-grade']);
    expect(plan.renderTargets).toEqual([
      {
        id: 'composer-a',
        scale: 1,
        format: 'rgba16f',
        samples: 4,
        depth: 'depth-renderbuffer',
      },
    ]);
    expect(plan.fullscreenStages.map((stage) => stage.id)).toEqual(['output-grade']);
    expect(plan.resolveCount).toBe(1);
  });

  it('keeps high AO half resolution and the two buffers required by tail SMAA', () => {
    const plan = postPipelinePlan({
      ...insaneInput,
      aoFullRes: false,
      smaa: true,
    });

    expect(plan.scene).toEqual({
      pass: 'n8ao',
      aoQuality: 'Low',
      aoScale: 0.5,
    });
    expect(plan.composerPasses).toEqual(['n8ao', 'bloom', 'output-grade', 'smaa']);
    expect(plan.singleComposerBuffer).toBe(false);
    expect(plan.renderTargets.filter((target) => target.id.startsWith('composer-'))).toHaveLength(
      2,
    );
    expect(plan.renderTargets).toContainEqual({
      id: 'n8ao-depth-downsample',
      scale: 0.5,
      format: 'r32f+rgba16f',
      samples: 0,
      depth: 'none',
    });
    expect(plan.renderTargets).toHaveLength(20);
    expect(plan.fullscreenStages).toHaveLength(23);
    expect(plan.resolveCount).toBe(0);
  });

  it('keeps the AO attribution fallback single-sample without allocating N8AO targets', () => {
    const plan = postPipelinePlan({
      ...insaneInput,
      n8aoDisabled: true,
    });

    expect(plan.scene).toEqual({
      pass: 'render',
      aoQuality: null,
      aoScale: null,
    });
    expect(plan.composerPasses).toEqual(['render', 'bloom', 'output-grade']);
    expect(plan.composerSamples).toBe(0);
    expect(plan.resolveCount).toBe(0);
    expect(plan.renderTargets.some((target) => target.id.startsWith('n8ao-'))).toBe(false);
  });

  it('keeps the SMAA attribution fallback on one composer buffer', () => {
    const plan = postPipelinePlan({
      ...insaneInput,
      aoFullRes: false,
      smaa: true,
      smaaDisabled: true,
    });

    expect(plan.composerPasses).toEqual(['n8ao', 'bloom', 'output-grade']);
    expect(plan.singleComposerBuffer).toBe(true);
    expect(plan.renderTargets.filter((target) => target.id.startsWith('composer-'))).toHaveLength(
      1,
    );
    expect(plan.renderTargets.some((target) => target.id.startsWith('smaa-'))).toBe(false);
  });

  it('keeps the advanced AO profile half resolution without bloom or SMAA', () => {
    const plan = postPipelinePlan({
      ...insaneInput,
      aoFullRes: false,
      bloom: false,
    });

    expect(plan.composerPasses).toEqual(['n8ao', 'output-grade']);
    expect(plan.fullscreenStages.map((stage) => stage.id)).toEqual([
      'n8ao-depth-downsample',
      'n8ao-evaluate',
      'n8ao-denoise-0',
      'n8ao-denoise-1',
      'n8ao-accumulation-copy',
      'n8ao-composite',
      'output-grade',
    ]);
  });

  it('models two resolves only for a multisampled RenderPass followed by tail SMAA', () => {
    const plan = postPipelinePlan({
      ...insaneInput,
      ao: false,
      aoFullRes: false,
      bloom: false,
      smaa: true,
    });

    expect(plan.scene.pass).toBe('render');
    expect(plan.composerSamples).toBe(4);
    expect(plan.singleComposerBuffer).toBe(false);
    expect(plan.resolveCount).toBe(2);
  });

  it('does not request MSAA without WebGL2', () => {
    const plan = postPipelinePlan({
      ...insaneInput,
      gradeOnly: true,
      ao: false,
      aoFullRes: false,
      bloom: false,
      isWebGL2: false,
    });

    expect(plan.composerSamples).toBe(0);
    expect(plan.resolveCount).toBe(0);
  });
});
