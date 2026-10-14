import type * as THREE from 'three';
import type { installSceneryDistanceExperiment } from './scenery_distance_experiment.mjs';
export interface BandItem {
  key: string;
  kind: string;
  bounds: number[];
  x: number;
  z: number;
  box: THREE.Box3;
  owner: THREE.Object3D;
  parts: { source: THREE.Mesh; matrix: THREE.Matrix4; index: number | null; tint: THREE.Color }[];
}
export function bandDistance(bounds: number[], x: number, z: number): number;
export function inMiddleBand(
  item: Pick<BandItem, 'kind' | 'bounds' | 'x' | 'z'>,
  x: number,
  z: number,
): boolean;
export function collectMiddleBandScenery(
  renderer: { scene: THREE.Scene; camera: THREE.Camera },
  radius?: number,
): BandItem[];
export function installMiddleBandExperiment(
  renderer: object,
  distance: ReturnType<typeof installSceneryDistanceExperiment>,
): Promise<{
  set(mode: 'cutoff' | 'simple' | 'sprites'): void;
  snapshot(): {
    mode: string;
    items: number;
    active: number[];
    counts: Record<string, number>;
    atlasBytes: number;
    stats: { name: string; before: number; after: number }[];
    simpleDraws: number;
    spriteDraws: number;
    nearViolations: number;
    inventory: { id: number; kind: string; bounds: number[]; parts: number }[];
  };
  dispose(): void;
}>;
