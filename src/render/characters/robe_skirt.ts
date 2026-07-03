// Full-length robe skirt (VisualDef.robeSkirt): a lathed cloth cone parented
// to the hips bone, turning the shared short-tunic body into a floor-length
// vestment (the priest's cassock) without a new rigged GLB. The mesh is
// tagged as a body mesh and added BEFORE applyMaterials, so it wears the
// class skin atlas and follows every later skin swap; its UVs are remapped
// into the atlas's main robe cell so the cell's light-to-dark vertical
// gradient shades the cloth top-to-hem like the authored garment.
import * as THREE from 'three';

// Bone-space (raw KayKit rig units; hips sit 0.406 above the ground plane).
// Profile points run top to hem: slightly inside the tunic at the waist so
// the authored belt stays visible, flaring past the boots to just off the
// ground.
const PROFILE: Array<[number, number]> = [
  [0.34, 0.16],
  [0.4, 0.04],
  [0.44, -0.1],
  [0.5, -0.24],
  [0.56, -0.38],
];

// The shared palette atlas's main robe cell (x 384-640, y 0-256 of 1024;
// textures load flipY=false, so v runs top-down like the PNG).
const ROBE_CELL_U0 = 0.4;
const ROBE_CELL_U_SPAN = 0.2;
const ROBE_CELL_V0 = 0.02;
const ROBE_CELL_V_SPAN = 0.21;

let skirtGeo: THREE.LatheGeometry | null = null;
let skirtSrcMat: THREE.MeshStandardMaterial | null = null;

function robeSkirtGeometry(): THREE.LatheGeometry {
  if (skirtGeo) return skirtGeo;
  const points = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  skirtGeo = new THREE.LatheGeometry(points, 24);
  // Lathe UVs are u=around, v=along-profile (0 at the first point). Squeeze
  // both into the robe cell; v0 is the profile TOP, matching the cell's
  // light end.
  const uv = skirtGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      ROBE_CELL_U0 + uv.getX(i) * ROBE_CELL_U_SPAN,
      ROBE_CELL_V0 + uv.getY(i) * ROBE_CELL_V_SPAN,
    );
  }
  uv.needsUpdate = true;
  return skirtGeo;
}

/** Build the per-visual skirt mesh; the caller parents it to the hips bone. */
export function buildRobeSkirt(): THREE.Mesh {
  if (!skirtSrcMat) {
    // Placeholder color for the no-atlas case; applyMaterials swaps this for
    // the shared tinted/skinned variant like any other body mesh.
    skirtSrcMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c0, side: THREE.DoubleSide });
  }
  const mesh = new THREE.Mesh(robeSkirtGeometry(), skirtSrcMat);
  mesh.name = 'robe_skirt';
  mesh.userData.bodyMesh = true;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  // parented to an animated bone: bind-pose bounds lie
  mesh.frustumCulled = false;
  return mesh;
}
