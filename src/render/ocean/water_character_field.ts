import * as THREE from 'three';
import { zoneAt } from '../../sim/data';
import {
  buildWaterCharacterField,
  WATER_CHARACTERS,
  WATER_FIELD_LAYERS,
  waterCharacterFor,
  waterCharacterTexels,
  waterFieldLayout,
} from './water_character_core';

// The water character field as a texture: one small three-layer array texture
// over the world (water_character_core.ts holds the table and the bake), and
// the shared uniforms every water surface reads it through. Built once, on the
// first surface that asks; a session that never builds water never pays for
// it. Half floats, so the sampler filters it on every WebGL2 device.

interface FieldUniforms {
  uWaterChar: THREE.IUniform<THREE.DataArrayTexture>;
  /** x, z of the field's min corner, then 1 / its world width and depth. */
  uWaterCharRect: THREE.IUniform<THREE.Vector4>;
}

let uniforms: FieldUniforms | null = null;

function arrayTexture(data: Float32Array, width: number, height: number): THREE.DataArrayTexture {
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const tex = new THREE.DataArrayTexture(half, width, height, WATER_FIELD_LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.HalfFloatType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  tex.name = 'ocean-water-character';
  return tex;
}

/** The shared field uniforms, baking the field on first use. */
export function waterCharacterUniforms(): FieldUniforms {
  if (uniforms) return uniforms;
  const layout = waterFieldLayout();
  const data = buildWaterCharacterField(layout, (x, z) => {
    const zone = zoneAt(x, z);
    return waterCharacterFor(zone.id, zone.biome);
  });
  uniforms = {
    uWaterChar: { value: arrayTexture(data, layout.width, layout.height) },
    uWaterCharRect: {
      value: new THREE.Vector4(
        layout.minX,
        layout.minZ,
        1 / (layout.width * layout.cell),
        1 / (layout.height * layout.cell),
      ),
    },
  };
  return uniforms;
}

/** A one-texel field of the open sea, for a surface that must not bake the world. */
export function openSeaCharacterTexture(): THREE.DataArrayTexture {
  return arrayTexture(waterCharacterTexels(WATER_CHARACTERS.vale), 1, 1);
}
