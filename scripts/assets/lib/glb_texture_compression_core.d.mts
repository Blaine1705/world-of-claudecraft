export interface GlbClassification {
  images: number;
  convertible: number;
  hadMeshopt: boolean;
  /** The source already carries KHR_mesh_quantization, so it must be
   *  dequantized before the pass re-quantizes it. */
  hadQuantization: boolean;
  /** The file has textures a KTX2 pass would convert, and is not the drawable
   *  WEAPON_VFX partition. */
  needsTextures: boolean;
  /** The file does not already carry EXT_meshopt_compression. */
  needsMeshopt: boolean;
  skip: boolean;
}

export interface GlbStructuralSnapshot {
  skins: number;
  animations: number;
  meshes: number;
  nodes: number;
  nodesWithExtras: number;
  hasAssetExtras: boolean;
}

export interface GlbNode {
  name?: string;
  mesh?: number;
  skin?: number;
  camera?: number;
  extras?: unknown;
  matrix?: number[];
  children?: number[];
}

export interface GlbSkin {
  name?: string;
  joints?: number[];
}

export interface GlbAccessor {
  type?: string;
  componentType?: number;
  normalized?: boolean;
  count?: number;
  min?: number[];
  max?: number[];
}

export interface GlbPrimitive {
  attributes?: Record<string, number>;
  indices?: number;
  material?: number;
}

export interface GlbMesh {
  name?: string;
  primitives?: GlbPrimitive[];
}

export interface GlbJson {
  images?: { mimeType?: string }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  accessors?: GlbAccessor[];
  skins?: GlbSkin[];
  animations?: unknown[];
  meshes?: GlbMesh[];
  nodes?: GlbNode[];
  asset?: { extras?: unknown };
}

export function glbJsonChunk(buf: Buffer): GlbJson;
export function classifyGlb(
  json: GlbJson,
  options?: { textureExcluded?: boolean; geometryAddExcluded?: boolean },
): GlbClassification;
/** Directories the pass may not ADD geometry compression to (it may still
 *  re-apply it where it already exists). See classifyGlb's note. */
export const GEOMETRY_ADD_EXCLUDED_DIRS: readonly string[];
export function geometryAddExcludedPath(relPath: string): boolean;
export function meshoptEncodable(json: GlbJson): boolean;
export function structuralSnapshot(json: GlbJson): GlbStructuralSnapshot;
export function snapshotMismatch(
  before: GlbStructuralSnapshot,
  after: GlbStructuralSnapshot,
): string[] | null;
/** Human-readable violations of what a quantize + meshopt pass must preserve;
 *  empty when the pass is clean. */
export function geometryPassViolations(before: GlbJson, after: GlbJson): string[];
export function weaponVfxModelKeys(source: string): string[];
