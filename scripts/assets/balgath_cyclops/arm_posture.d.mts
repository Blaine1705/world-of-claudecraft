// Type surface for scripts/assets/balgath_cyclops/arm_posture.mjs (see that file for
// behavior), so the asset suites can import it under strict tsc.
import type { Root } from '@gltf-transform/core';

export const ARM_POSTURE_CLIPS: readonly string[];
export const ELBOW_BEND_MIN: number;
export const PALM_OFF_MAX: number;

export interface ArmPostureFrame {
  side: string;
  t: number;
  elbowBend: number;
  palmOff: number;
  palmBack: number;
}

export interface ClipArmPosture {
  clip: string;
  minElbowBend: number;
  maxPalmOff: number;
  maxPalmBack: number;
  frames: ArmPostureFrame[];
}

export function clipArmPosture(root: Root, clipName: string, fps?: number): ClipArmPosture;
export function armPostureFailures(root: Root, clips?: readonly string[]): string[];
