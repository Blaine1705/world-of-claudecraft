# Balgath Form: the LIGHT player-transformation body of the Balgath world boss.
#
# Blender factory, run headless by export_balgath_form.mjs:
#   blender --background --factory-startup --python model.py -- \
#     --src <texture-free, clip-free copy of balgath_cyclops.glb> --out <dir> \
#     --eye <x,y,z of the eyeGlow anchor, glTF bind space>
#
# The form is the SAME character as the boss (public/models/creatures/balgath_cyclops.glb):
# the same 41-joint Tripo auto-rig, the same painted granite atlas, the same single
# turquoise crystal eye. Only the triangle budget changes, so a player wearing it costs
# about half of what the raid boss costs. This factory owns exactly one job, the
# decimation; everything that must stay byte-identical to the boss (the joint nodes,
# their rest transforms, the inverse bind matrices, the KTX2 textures, the material) is
# NOT round-tripped through Blender at all. The exporter grafts the decimated
# attributes back into the boss's own glTF document, remapping joints by NAME.
#
# The decimation, in order:
#   1. Import with merge_vertices so the Tripo mesh (split at every UV seam on the wire)
#      becomes one welded, closed surface whose UV seams are face-corner data. Decimating
#      the split mesh would treat every seam as an open boundary and collapse the two
#      sides independently, opening cracks between the islands. Welded, the collapse
#      decimator keeps the UV seams itself: an edge whose face corners disagree on UVs is
#      a customdata boundary it weights like a mesh border, so the painted islands keep
#      their outlines.
#   2. Lock the eye. Everything inside EYE_LOCK_RADIUS of the eyeGlow anchor (the crystal
#      and its socket rim) goes in a vertex group the Decimate modifier inverts at the
#      maximum factor, so no edge there can collapse. Without it the quadric (which sees
#      a smooth dome, not a painted iris) melts the round eye into a jagged blob first.
#      Nothing else is weighted: tuning showed any wider protect group (head, hands,
#      feet, seams, feature ridges) starves the rest of the budget and costs the belt,
#      the buckle and the blocky toes that read at distance.
#   3. Collapse-decimate, triangulated, to the triangle target. The ratio is searched
#      (bisection on the evaluated triangle count) rather than guessed, so the budget is
#      hit exactly on every run.
#   4. Clean up: drop coincident face pairs (a flattened fin), degenerate and zero-area
#      faces and loose geometry, re-orient any face whose winding disagrees with its
#      neighbours, and clamp every vertex into the source bounds (floor-seated, never
#      proud of the boss's silhouette).
#   5. Weights: every vertex keeps at most 4 influences, renormalized to sum to 1.
#   6. Shade like the boss: the source's own normals are transferred onto the light
#      surface (nearest face, interpolated), so it does not facet.
#   7. Export the skinned mesh (no materials, no animations) as a raw GLB, and report the
#      surface deviation per region against the untouched source.
#
# Determinism: no randomness anywhere; the bisection is a fixed number of steps over a
# fixed interval, and Blender's collapse decimator is deterministic for a given input.
import argparse
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

TARGET_TRIANGLES = 2200
MAX_TRIANGLES = 2400
MAX_INFLUENCES = 4
MESH_NAME = 'Balgath_Form'
# Radius (source units; the boss stands 0.81 tall at rest) of the locked eye region:
# the crystal plus its socket rim.
EYE_LOCK_RADIUS = 0.07
# The Decimate modifier's maximum vertex_group_factor: a locked edge never collapses.
EYE_LOCK_FACTOR = 1000.0
# A faint extra cost on the skull, the one broad dome the camera looks at from behind
# for the whole transformation: at the lock factor this weight adds about as much as a
# visible bend in the dome costs, so the back of the head stays round without starving
# the belt, bracers and toes.
SKULL_BONES = ('Head', 'NeckTwist02')
SKULL_WEIGHT = 2e-6
# Regions the deviation report measures (bones whose weight dominates a source vertex).
REPORT_REGIONS = (
    ('head', ('Head', 'NeckTwist02')),
    ('hands', ('L_Hand', 'R_Hand')),
    ('feet', ('L_Foot', 'L_ToeBase', 'R_Foot', 'R_ToeBase')),
)
DOMINANT_WEIGHT = 0.5


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--eye', required=True)
    return parser.parse_args(argv)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source(path):
    bpy.ops.import_scene.gltf(
        filepath=path,
        merge_vertices=True,
        import_shading='SMOOTH',
        bone_heuristic='BLENDER',
        guess_original_bind_pose=False,
        disable_bone_shape=True,
    )
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if len(meshes) != 1 or len(arms) != 1:
        raise RuntimeError(f'expected one mesh and one armature, got {len(meshes)}, {len(arms)}')
    return meshes[0], arms[0]


def triangle_count(mesh_data):
    return sum(len(p.vertices) - 2 for p in mesh_data.polygons)


def evaluated_triangles(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    count = triangle_count(data)
    evaluated.to_mesh_clear()
    return count


def gltf_to_blender(point):
    """glTF is Y-up; the importer maps (x, y, z) to Blender's (x, -z, y)."""
    return Vector((point[0], -point[2], point[1]))


def region_verts(obj, bone_names):
    indices = {obj.vertex_groups[name].index for name in bone_names if name in obj.vertex_groups}
    out = set()
    for vert in obj.data.vertices:
        total = sum(g.weight for g in vert.groups if g.group in indices)
        if total >= DOMINANT_WEIGHT:
            out.add(vert.index)
    return out


def build_eye_lock(obj, eye):
    locked = [v.index for v in obj.data.vertices if (v.co - eye).length <= EYE_LOCK_RADIUS]
    if not locked:
        raise RuntimeError('no source vertex near the eye anchor: the anchor or the rig moved')
    group = obj.vertex_groups.new(name='EyeLock')
    skull = sorted(region_verts(obj, SKULL_BONES) - set(locked))
    if SKULL_WEIGHT > 0 and skull:
        group.add(skull, SKULL_WEIGHT, 'REPLACE')
    group.add(locked, 1.0, 'REPLACE')
    return group, len(locked)


def decimate(obj, group):
    mod = obj.modifiers.new('Decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.use_collapse_triangulate = True
    mod.vertex_group = group.name
    mod.invert_vertex_group = True
    mod.vertex_group_factor = EYE_LOCK_FACTOR
    # Decimate the REST mesh: ahead of the importer's Armature modifier, never after it.
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    lo, hi = 0.2, 1.0
    best = None
    for _ in range(24):
        mid = (lo + hi) / 2
        mod.ratio = mid
        count = evaluated_triangles(obj)
        if count <= TARGET_TRIANGLES:
            best = (mid, count)
            lo = mid
        else:
            hi = mid
    if best is None:
        raise RuntimeError('decimation never reached the triangle target')
    mod.ratio = best[0]
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return best


def drop_loose(bm):
    loose_edges = [e for e in bm.edges if not e.link_faces]
    bmesh.ops.delete(bm, geom=loose_edges, context='EDGES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')


def cleanup(obj, reference_bvh, bounds):
    """Remove what a collapse leaves behind, and report what it could not fix.

    Where a thin fin collapses flat, the collapse can leave PAIRS of coincident triangles
    over the same three vertices with opposite winding: a zero-volume pocket that
    z-fights and shades black. Every face of such a pair goes; the surrounding surface is
    already closed over it. After that, any face whose winding disagrees with its edge
    neighbours is re-oriented to agree with the majority (a topological flip), and faces
    lying ON the source surface but facing against it are counted as fold-overs."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.faces)

    by_verts = {}
    for face in bm.faces:
        by_verts.setdefault(tuple(sorted(v.index for v in face.verts)), []).append(face)
    duplicates = [f for group in by_verts.values() if len(group) > 1 for f in group]
    bmesh.ops.delete(bm, geom=duplicates, context='FACES_ONLY')
    drop_loose(bm)

    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges[:])
    # A dissolve can leave non-triangles; the shipped mesh is triangles.
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    zero = [f for f in bm.faces if f.calc_area() < 1e-12]
    bmesh.ops.delete(bm, geom=zero, context='FACES')
    drop_loose(bm)
    bm.normal_update()

    flipped = []
    for face in bm.faces:
        agree = 0
        disagree = 0
        for edge in face.edges:
            if len(edge.link_faces) != 2:
                continue
            if edge.is_contiguous:
                agree += 1
            else:
                disagree += 1
        if disagree > agree:
            flipped.append(face)
    if flipped:
        bmesh.ops.reverse_faces(bm, faces=flipped)
    bm.normal_update()

    folds = 0
    for face in bm.faces:
        hit = reference_bvh.find_nearest(face.calc_center_median())
        if hit[0] is not None and hit[3] < 0.002 and face.normal.dot(hit[1]) < -0.5:
            folds += 1

    # The collapse places each merged vertex at its quadric optimum, which can sit a hair
    # outside the original hull: a sole a few millimetres under the floor, a shoulder
    # proud of the silhouette. Clamp to the source bounds so the form stays floor-seated
    # and never outgrows the boss it copies.
    clamped = 0
    for vert in bm.verts:
        for axis in range(3):
            value = min(max(vert.co[axis], bounds[0][axis]), bounds[1][axis])
            if value != vert.co[axis]:
                vert.co[axis] = value
                clamped += 1

    after = len(bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    if obj.data.validate(verbose=True):
        raise RuntimeError('the decimated mesh still failed validation after cleanup')
    return before, after, len(duplicates), len(zero), len(flipped), folds, clamped


def fix_weights(obj):
    lock = obj.vertex_groups.get('EyeLock')
    if lock:
        obj.vertex_groups.remove(lock)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=MAX_INFLUENCES)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    worst = 0
    unweighted = 0
    for vert in obj.data.vertices:
        live = [g for g in vert.groups if g.weight > 0]
        worst = max(worst, len(live))
        if not live:
            unweighted += 1
    if unweighted:
        raise RuntimeError(f'{unweighted} vertices lost every weight')
    return worst


def make_reference(obj):
    """A static copy of the source surface WITH its imported normals: the normal-transfer
    source and the deviation yardstick."""
    ref = obj.copy()
    ref.data = obj.data.copy()
    ref.name = 'SourceReference'
    for mod in list(ref.modifiers):
        ref.modifiers.remove(mod)
    ref.parent = None
    bpy.context.scene.collection.objects.link(ref)
    return ref


def transfer_normals(obj, ref):
    """Shade the light mesh like the boss: interpolate the source's normals onto it.

    Normals recomputed from 2,200 triangles facet visibly across the belly and shoulders;
    the source's own normals, sampled at the nearest source face, keep the rounded granite
    shading the texture's baked cracks were painted against."""
    mod = obj.modifiers.new('NormalTransfer', 'DATA_TRANSFER')
    mod.object = ref
    mod.use_loop_data = True
    mod.data_types_loops = {'CUSTOM_NORMAL'}
    mod.loop_mapping = 'POLYINTERP_NEAREST'
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
        bpy.ops.object.modifier_apply(modifier=mod.name)


def deviation_report(obj, ref, regions):
    """Max and mean distance from every source vertex to the light surface, per region
    (source units; the boss is 0.81 tall at rest, so 0.004 is half a percent)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bvh = BVHTree.FromBMesh(bm)
    rows = []
    for name, verts in regions:
        dists = [bvh.find_nearest(ref.data.vertices[i].co)[3] for i in sorted(verts)]
        rows.append((name, len(dists), max(dists), sum(dists) / len(dists)))
    bm.free()
    return rows


def main():
    args = parse_args()
    reset_scene()
    obj, armature = import_source(args.src)
    source_tris = triangle_count(obj.data)
    eye = gltf_to_blender([float(c) for c in args.eye.split(',')])

    bm_ref = bmesh.new()
    bm_ref.from_mesh(obj.data)
    reference_bvh = BVHTree.FromBMesh(bm_ref)
    bm_ref.free()
    bounds = (
        [min(v.co[axis] for v in obj.data.vertices) for axis in range(3)],
        [max(v.co[axis] for v in obj.data.vertices) for axis in range(3)],
    )
    reference = make_reference(obj)
    regions = [(name, region_verts(obj, bones)) for name, bones in REPORT_REGIONS]
    regions.append(
        ('eye', {v.index for v in obj.data.vertices if (v.co - eye).length <= EYE_LOCK_RADIUS})
    )
    regions.append(('all', {v.index for v in obj.data.vertices}))

    # Imported custom normals would be dragged through the collapse; they are cleared here
    # and transferred back from the untouched reference once the surface is final.
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for poly in obj.data.polygons:
        poly.use_smooth = True

    group, locked = build_eye_lock(obj, eye)
    ratio, decimated_tris = decimate(obj, group)
    before, after, duplicates, zero, flipped, folds, clamped = cleanup(obj, reference_bvh, bounds)
    worst = fix_weights(obj)
    transfer_normals(obj, reference)
    deviation = deviation_report(obj, reference, regions)
    bpy.data.objects.remove(reference, do_unlink=True)
    final_tris = triangle_count(obj.data)
    if final_tris > MAX_TRIANGLES:
        raise RuntimeError(f'{final_tris} triangles over the {MAX_TRIANGLES} ceiling')

    obj.name = MESH_NAME
    obj.data.name = MESH_NAME
    obj.data.materials.clear()

    os.makedirs(args.out, exist_ok=True)
    out = os.path.join(args.out, 'balgath_form_blender.glb')
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_materials='NONE',
        export_animations=False,
        export_skins=True,
        export_influence_nb=MAX_INFLUENCES,
        export_all_influences=False,
        export_normals=True,
        export_texcoords=True,
        export_tangents=False,
        export_yup=True,
        export_apply=False,
        export_def_bones=False,
        export_leaf_bone=False,
        export_rest_position_armature=True,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
        export_morph=False,
        use_selection=False,
    )

    print('BALGATH_FORM_REPORT_BEGIN')
    print(f'source triangles: {source_tris}')
    print(f'eye lock: {locked} vertices within {EYE_LOCK_RADIUS} of the anchor')
    print(f'decimate ratio: {ratio:.6f} -> {decimated_tris} triangles')
    print(
        f'cleanup: {before} -> {after} faces, {duplicates} coincident removed, '
        f'{zero} zero-area removed, {flipped} re-oriented, {folds} fold-overs left, '
        f'{clamped} coordinates clamped to the source bounds'
    )
    print(f'final triangles: {final_tris}, vertices: {len(obj.data.vertices)}')
    print(f'max influences: {worst}')
    for name, count, worst_d, mean_d in deviation:
        print(f'deviation {name}: {count} source verts, max {worst_d:.5f}, mean {mean_d:.5f}')
    print(f'armature: {armature.name}, bones: {len(armature.data.bones)}')
    print(f'raw: {out}')
    print('BALGATH_FORM_REPORT_END')


main()
