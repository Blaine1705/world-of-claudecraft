// The Balgath Form contract: the LIGHT player-transformation body of the Balgath world
// boss. ONE skinned GLB that is the boss (public/models/creatures/balgath_cyclops.glb)
// with a cheaper mesh and nothing else changed.
//
// What must stay IDENTICAL to the boss, because the game binds to it:
// - the 41 joints: names, order, hierarchy and rest transforms. The form carries NO clips
//   of its own; its locomotion and ability clips come from the boss's mesh-free donors
//   (balgath_clip_donor.glb, balgath_ability_anims.glb) through `animUrls`, and those bind
//   by joint NAME onto the rest pose they were authored against.
// - the three KTX2 textures (colour, normal, ORM), byte for byte: the decimation keeps the
//   UVs, so the painted granite and the turquoise eye land exactly where they do on the
//   boss. The eyeGlow anchor (bone 'Head', bone-local offset) is therefore shared too.
// What changes: the one skinned primitive, decimated to at most
// BALGATH_FORM_MAX_TRIANGLES, renamed BALGATH_FORM_MESH, at most
// BALGATH_FORM_MAX_INFLUENCES weights per vertex.
//
// The factory is scripts/assets/balgath_form/model.py (Blender, run by
// export_balgath_form.mjs); the shipped file is pinned byte for byte by
// tests/balgath_form_asset.test.ts.

/** The one shipped file, relative to public/. */
export const BALGATH_FORM_FILE = 'models/chars/forms/balgath_form.glb';

/** The boss body the form is decimated from, relative to public/. */
export const BALGATH_FORM_SOURCE_FILE = 'models/creatures/balgath_cyclops.glb';

/** The one skinned mesh (and its node). */
export const BALGATH_FORM_MESH = 'Balgath_Form';

/** Triangle ceiling and the factory's target (the boss has 3,932). */
export const BALGATH_FORM_MAX_TRIANGLES = 2400;
export const BALGATH_FORM_TARGET_TRIANGLES = 2200;

/** Skin weights per vertex. */
export const BALGATH_FORM_MAX_INFLUENCES = 4;

/** The rig the donors bind to. */
export const BALGATH_FORM_JOINT_COUNT = 41;

/** The Blender release the raw export was authored and verified with. */
export const BALGATH_FORM_BLENDER_VERSION = '5.2.1';

/** Byte ceiling for the optimized GLB. The three 512px KTX2 textures are about 261 KB of
 *  it and are not negotiable (they ARE the boss's look); the geometry is the rest. */
export const BALGATH_FORM_MAX_BYTES = 320 * 1024;

/** The eyeGlow anchor the boss's VisualDef uses, measured on the rig at rest: the
 *  front-most head vertex resolved into the Head bone's frame. */
export const BALGATH_FORM_EYE = Object.freeze({ bone: 'Head', offset: [0.013, 0.115, -0.085] });
