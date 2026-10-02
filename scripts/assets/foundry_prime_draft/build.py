"""Build the Prime Draft from code (hard-surface; adapted from the Balgath and
Great Saurian kits).

  blender -b --factory-startup --python build.py -- <out.glb> [options]

  --fast           coarser voxels and fewer triangles (look checks)
  --nobake         clay surfaces, no Cycles bake (shape, rig and clip checks)
  --bake N         bake size (default 4096; the shipped maps are halved from it)
  --clips A,B      author only these clips;  --noclips  none (rest pose only)
  --parts REGEX    build only the parts whose names match (look checks)
  --blend path     save the .blend
  --tex dir        write the baked maps to dir
  --stats path     write a JSON of counts and measurements
  --work dir       scratch for the VDB files
  -                as the output skips the export

Order: the armature and the clips come FIRST (the clips need no meshes), so the
piston strokes can be measured over every clip and each ram sized to them. Then the
parts: every hard-surface part is a distance field (bevelled plates, rims, engraved
panel lines, rivets and bolts) meshed high through OpenVDB and decimated low; the
lows share one UV atlas and Cycles bakes albedo, roughness, metallic, tangent
normals and occlusion from the highs. Glow parts get their own emissive material.
Two skinned meshes on one armature: PrimeDraft (the colossus) and
PrimeDraftMoorings (the gantry cables and the floor clamps, hidden after Unbolt).
"""
import json
import os
import re
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import glow as GL  # noqa: E402
import mech as A  # noqa: E402
import mesh_kit as K  # noqa: E402
import parts as P  # noqa: E402
import rig as R  # noqa: E402
import surface as S  # noqa: E402

T0 = time.time()
MESH_NAMES = {'body': 'PrimeDraft', 'moorings': 'PrimeDraftMoorings'}
GLOW = (0.55, 0.82, 1.0)


def log(*a):
    print(f'[{time.time() - T0:7.1f}s]', *a, flush=True)


def opt(argv, name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


def measure_strokes(arm, names):
    strokes = {}
    scene = bpy.context.scene
    for n in names:
        act = bpy.data.actions[n]
        R.set_action(arm, act)
        f0, f1 = act.frame_range
        for f in range(int(f0), int(f1) + 1):
            scene.frame_set(f)
            for name, ba, pa, bb, pb, r in A.PISTONS:
                d = (R._anchor_now(arm, ba, pa) - R._anchor_now(arm, bb, pb)).length
                lo, hi = strokes.get(name, (d, d))
                strokes[name] = (min(lo, d), max(hi, d))
    return strokes


def glow_material():
    m = bpy.data.materials.new('PrimeDraftGlow')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*S.srgb(GLOW)[:3], 1)
    b.inputs['Emission Color'].default_value = (*S.srgb(GLOW)[:3], 1)
    b.inputs['Emission Strength'].default_value = 6.0
    b.inputs['Roughness'].default_value = 0.3
    return m


CLAY = {'brass': (0.72, 0.55, 0.25), 'iron': (0.2, 0.2, 0.22), 'socket': (0.08, 0.07, 0.07), 'steel': (0.7, 0.7, 0.72),
        'copper': (0.7, 0.38, 0.2), 'ceramic': (0.85, 0.82, 0.74), 'cable': (0.06, 0.06, 0.06),
        'hazard': (0.85, 0.65, 0.1)}


def clay_materials():
    out = {}
    for k, c in CLAY.items():
        m = bpy.data.materials.new('Clay_' + k)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*S.srgb(c)[:3], 1)
        b.inputs['Roughness'].default_value = 0.45 if k in ('brass', 'steel', 'copper') else 0.6
        b.inputs['Metallic'].default_value = 0.8 if k in ('brass', 'steel', 'copper', 'iron') else 0.0
        out[k] = m
    return out


def shipping_material(albedo, normal, orm):
    body = bpy.data.materials.new('PrimeDraftBody')
    body.use_nodes = True
    nt = body.node_tree
    bsdf = nt.nodes['Principled BSDF']
    ia = nt.nodes.new('ShaderNodeTexImage')
    ia.image = albedo
    nt.links.new(ia.outputs['Color'], bsdf.inputs['Base Color'])
    io = nt.nodes.new('ShaderNodeTexImage')
    io.image = orm
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(io.outputs['Color'], sep.inputs[0])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    inn = nt.nodes.new('ShaderNodeTexImage')
    inn.image = normal
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(inn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return body


def to_numpy_image(name, arr, colorspace='sRGB'):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = colorspace
    img.pixels[:] = arr.astype(np.float32).ravel()
    img.pack()
    return img


def downsample(arr, k=2):
    h, w, c = arr.shape
    return arr.reshape(h // k, k, w // k, k, c).mean(axis=(1, 3))


def join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def uv_boost(obj, center):
    b = float(obj.get('boost', 1.0))
    if obj.get('mat') == 'cable':
        b *= 0.6
    if center[2] < 0.12:
        b *= 0.4
    return b


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    out = argv[0]
    fast = '--fast' in argv
    nobake = '--nobake' in argv
    bake_size = int(opt(argv, '--bake', 4096))
    workdir = os.path.abspath(opt(argv, '--work', os.path.join(HERE, '..', '_work')))
    os.makedirs(workdir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = R.FPS
    stats = {}
    # ---- armature and clips first
    arm = R.build_armature()
    import clips as C
    names = []
    if '--noclips' not in argv:
        only = opt(argv, '--clips')
        names = C.make_clips(arm, only.split(',') if only else None)
    log('clips', names)
    strokes = measure_strokes(arm, names) if names else {}
    # ---- parts
    flt = opt(argv, '--parts')
    parts = P.all_parts()
    glow_lows, brackets = GL.glow_parts(bpy)
    parts += brackets
    pist, report = GL.piston_parts(strokes)
    parts += pist
    stats['pistons'] = report
    bad = [k for k, v in report.items() if not v['ok']]
    log('pistons', len(report), 'stroke problems:', bad)
    if flt:
        rx = re.compile(flt)
        parts = [p for p in parts if rx.search(p.name)]
        glow_lows = [o for o in glow_lows if rx.search(o.name)] if True else glow_lows
    highs, lows = [], []
    for i, p in enumerate(parts):
        hi, lo = p.build(bpy, workdir, fast=fast)
        highs.append(hi)
        lows.append(lo)
        if i % 10 == 0:
            log('part', i, '/', len(parts), p.name, len(hi.data.polygons), '->', K.triangles(lo))
    cables = GL.cable_parts(bpy) if not flt or re.search(flt, 'Cable') else []
    cable_lows = []
    for c in cables:
        if isinstance(c, P.HSPart):
            hi, lo = c.build(bpy, workdir, fast=fast)
            highs.append(hi)
            lows.append(lo)
        else:
            c['group'] = 'moorings'
            c['boost'] = 0.6
            hi = K.duplicate(c, c.name + '_hi')
            highs.append(hi)
            lows.append(c)
            cable_lows.append(c)
    for o in glow_lows:
        o['group'] = 'body'
    log('parts built', len(lows), 'lows', len(glow_lows), 'glow')
    stats['tris_parts'] = {o.name: K.triangles(o) for o in lows + glow_lows}
    # ---- surfaces
    gmat = glow_material()
    if nobake:
        clay = clay_materials()
        for o in lows:
            o.data.materials.clear()
            o.data.materials.append(clay[o['mat']])
    else:
        S.unwrap(lows, scale_fn=uv_boost)
        cov = 0.0
        for o in lows:
            uv = np.zeros(len(o.data.loops) * 2)
            o.data.uv_layers.active.data.foreach_get('uv', uv)
            uv = uv.reshape(-1, 2)
            for p in o.data.polygons:
                q = uv[p.loop_start:p.loop_start + p.loop_total]
                x, y = q[:, 0], q[:, 1]
                cov += 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
        stats['uv_coverage'] = cov
        log('uv done, coverage', round(cov, 3))
        if '--uvtest' in argv:
            return
        bake_mats = S.bake_materials()
        for h in highs:
            h.data.materials.clear()
            h.data.materials.append(bake_mats[h['mat']])
        tex_dir = opt(argv, '--tex')
        if tex_dir:
            os.makedirs(tex_dir, exist_ok=True)
        # Blender runs one engine bake per selected high object: join the highs per
        # surface kind (8 objects instead of 140) or a bake takes hours
        by_kind = {}
        for h in highs:
            by_kind.setdefault(h['mat'], []).append(h)
        highs = [join(v, 'High_' + k) if len(v) > 1 else v[0] for k, v in by_kind.items()]
        log('highs joined', len(highs), sum(len(h.data.polygons) for h in highs), 'faces')
        dups = [K.duplicate(o, o.name + '_bk') for o in lows]
        joined = join(dups, 'BakeLow')
        res = S.bake_all(highs, joined, size=bake_size, samples=48 if bake_size >= 2048 else 16, out_dir=tex_dir)
        bpy.data.objects.remove(joined, do_unlink=True)
        ao = res['ao'][..., :1]
        albedo = res['albedo'].copy()
        albedo[..., :3] *= (1.0 - 0.6 * (1.0 - ao))
        orm = np.ones_like(albedo)
        orm[..., 0] = ao[..., 0]
        orm[..., 1] = res['rough'][..., 0]
        orm[..., 2] = res['metal'][..., 0]
        ship = bake_size // 2 if bake_size >= 4096 else bake_size
        k = bake_size // ship
        a_img = to_numpy_image('PrimeDraftAlbedo', downsample(albedo, k) if k > 1 else albedo)
        n_img = to_numpy_image('PrimeDraftNormal', downsample(res['normal'], k) if k > 1 else res['normal'], 'Non-Color')
        o_img = to_numpy_image('PrimeDraftORM', downsample(orm, k * 2), 'Non-Color')
        if tex_dir:
            for img, nm in ((a_img, 'albedo'), (n_img, 'normal'), (o_img, 'orm')):
                img.filepath_raw = os.path.join(tex_dir, f'primedraft_{nm}_{img.size[0]}.png')
                img.file_format = 'PNG'
                img.save()
        mat = shipping_material(a_img, n_img, o_img)
        for o in lows:
            o.data.materials.clear()
            o.data.materials.append(mat)
        log('bake done')
    for o in glow_lows:
        o.data.materials.clear()
        o.data.materials.append(gmat)
    for h in highs:
        h.hide_render = True
        h.hide_viewport = True
    # ---- skinning
    for o in lows + glow_lows:
        col = o.data.color_attributes.get('Col')
        if col is not None:
            o.data.color_attributes.remove(col)
        if o.get('binding') == 'cable':
            GL.cable_weights(o, o['chain'])
        else:
            R.rigid(o, o['bone'])
    allp = lows + glow_lows
    groups = {g: [o for o in allp if o.get('group', 'body') == g] for g in MESH_NAMES}
    meshes = {}
    for grp, nm in MESH_NAMES.items():
        if not groups[grp]:
            continue
        ob = join(groups[grp], nm)
        ob.parent = arm
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
        missing = {g.name for g in ob.vertex_groups} - {b.name for b in arm.data.bones}
        if missing:
            raise RuntimeError(f'{nm}: groups with no bone: {missing}')
        meshes[grp] = ob
        stats['tris_' + grp] = K.triangles(ob)
    stats['tris_total'] = sum(stats.get('tris_' + g, 0) for g in meshes)
    stats['bones'] = len(arm.data.bones)
    stats['materials'] = sorted({m.name for ob in meshes.values() for m in ob.data.materials})
    log('meshes', {g: stats['tris_' + g] for g in meshes}, stats['bones'], 'bones')
    if 'Idle' in names and 'body' in meshes:
        R.set_action(arm, bpy.data.actions['Idle'])
        bpy.context.scene.frame_set(1)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = meshes['body'].evaluated_get(dg)
        co = np.array([(ev.matrix_world @ v.co)[:] for v in ev.data.vertices])
        stats['idle_height'] = float(co[:, 2].max())
        stats['idle_minz'] = float(co[:, 2].min())
        stats['width_x'] = float(co[:, 0].max() - co[:, 0].min())
        stats['depth_y'] = float(co[:, 1].max() - co[:, 1].min())
        log('IDLE_HEIGHT', round(stats['idle_height'], 2), 'width', round(stats['width_x'], 2))
    stats['clips'] = {n: round(float(bpy.data.actions[n].get('duration', 0)), 3) for n in names}
    for ob in meshes.values():
        if ob.data.validate(clean_customdata=False):
            log('validated (fixed)', ob.name)
        ob.data.update()
    # the .blend is saved BEFORE the export, so a build is never lost to it
    if opt(argv, '--blend'):
        if 'Idle' in names:
            R.set_action(arm, bpy.data.actions['Idle'])
        bpy.ops.wm.save_as_mainfile(filepath=opt(argv, '--blend'))
        log('saved blend')
    if opt(argv, '--stats'):
        with open(opt(argv, '--stats'), 'w') as f:
            json.dump(stats, f, indent=1)
    if out != '-':
        export(out, arm)
        stats['glb_bytes'] = os.path.getsize(out)
        if opt(argv, '--stats'):
            with open(opt(argv, '--stats'), 'w') as f:
                json.dump(stats, f, indent=1)
    log('DONE')


def export(path, arm):
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    arm.select_set(True)
    for c in arm.children:
        c.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_skins=True, export_def_bones=False, export_cameras=False, export_lights=False,
        export_vertex_color='NONE', export_image_format='JPEG', export_jpeg_quality=88,
    )
    log('WROTE', path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
