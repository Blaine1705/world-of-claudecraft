"""Build the Voltaic Warden from code (the Great Saurian / Balgath pipeline, hard-surface).

  blender -b --factory-startup --python build.py -- <out.glb> [options]

  --fast           coarser voxels (quick shape reviews)
  --bake N         bake size (default 4096; albedo and emissive ship at half, normal per ship.mjs)
  --nobake         clay surfaces per kind, no Cycles bake
  --clips A,B      author only these clips
  --blend path     save the .blend
  --tex dir        write the baked maps
  --stats path     JSON of counts and measurements
  --work dir       scratch for the VDB files
  -                as the output skips the export

Pipeline: every armour piece is a bevelled signed-distance shell (parts.py, hs.py)
meshed through OpenVDB (HIGH, carrying panel lines, trims, rivets, bolts, the
plates' faces) and decimated (LOW). Rigid pieces ride one bone; the power cables
blend along the bones they span. All lows share one UV atlas; Cycles bakes albedo,
roughness, metallic, tangent normals, occlusion and emission from the highs. The
glass of the storm coil and the glow pieces (coil arcs, visor slit, crown spark,
palm emitters) are not baked: they carry their own two materials. Everything joins
into one skinned mesh `VoltaicWarden` (three materials) on `VoltaicWardenRig`.
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import frame as FR  # noqa: E402
import mesh_kit as K  # noqa: E402
import parts as P  # noqa: E402
import rig as R  # noqa: E402
import surface as S  # noqa: E402

T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:7.1f}s]', *a, flush=True)


def opt(argv, name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


def bind(obj):
    kind = obj.get('binding', 'rigid')
    if kind == 'rigid':
        R.rigid(obj, obj['bone'])
    elif kind == 'cable':
        R.cable_weights(obj, obj['bones'].split(','))
    else:
        raise ValueError(kind)


def uv_boost(obj, center):
    nm = obj.name
    m = obj.get('mat')
    if m == 'plate':
        return 1.55
    if nm.startswith(('Helm', 'Jaw', 'Crest')):
        return 1.6
    if nm.startswith(('Coil', 'Gauges')):
        return 1.3
    if nm.startswith(('Knuckles', 'Fingers', 'Thumb', 'Hand')):
        return 1.15
    if nm.startswith('Sole') or center[2] < 0.1:
        return 0.35
    if m in ('rubber', 'steel'):
        return 0.6
    if nm.startswith(('Piston', 'Yoke', 'WaistColumn', 'PelvisCore', 'Clavicle', 'Neck')):
        return 0.7
    return 1.0


# ------------------------------------------------------------------ materials
def body_material(albedo, normal, orm, emis, strength=3.0):
    m = bpy.data.materials.new('VoltaicBody')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    ia = nt.nodes.new('ShaderNodeTexImage')
    ia.image = albedo
    nt.links.new(ia.outputs['Color'], b.inputs['Base Color'])
    io = nt.nodes.new('ShaderNodeTexImage')
    io.image = orm
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(io.outputs['Color'], sep.inputs[0])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    inn = nt.nodes.new('ShaderNodeTexImage')
    inn.image = normal
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(inn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    ie = nt.nodes.new('ShaderNodeTexImage')
    ie.image = emis
    nt.links.new(ie.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = strength
    return m


def glow_material():
    m = bpy.data.materials.new('VoltaicGlow')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = (0.55, 0.85, 1.0, 1.0)
    b.inputs['Base Color'].default_value = c
    b.inputs['Emission Color'].default_value = c
    b.inputs['Emission Strength'].default_value = 6.0
    b.inputs['Roughness'].default_value = 0.4
    return m


def glass_material():
    m = bpy.data.materials.new('VoltaicGlass')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.55, 0.82, 1.0, 1.0)
    b.inputs['Alpha'].default_value = 0.3
    b.inputs['Roughness'].default_value = 0.05
    b.inputs['Emission Color'].default_value = (0.25, 0.6, 1.0, 1.0)
    b.inputs['Emission Strength'].default_value = 0.5
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:  # noqa: BLE001
        m.blend_method = 'BLEND'
    m.use_backface_culling = False
    return m


CLAY = {'brass': (0.62, 0.46, 0.2), 'iron': (0.16, 0.17, 0.19), 'copper': (0.66, 0.32, 0.17),
        'gear': (0.3, 0.3, 0.31), 'steel': (0.75, 0.76, 0.78), 'porcelain': (0.85, 0.82, 0.74),
        'rubber': (0.06, 0.06, 0.06), 'plate': (0.75, 0.38, 0.2)}


def clay_materials():
    out = {}
    for k, c in CLAY.items():
        m = bpy.data.materials.new('Clay_' + k)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*S.srgb(c)[:3], 1)
        b.inputs['Roughness'].default_value = 0.45
        b.inputs['Metallic'].default_value = 0.6 if k not in ('porcelain', 'rubber') else 0.0
        out[k] = m
    return out


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


# ------------------------------------------------------------------ main
def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    out = argv[0]
    fast = '--fast' in argv
    bake_size = int(opt(argv, '--bake', 4096))
    nobake = '--nobake' in argv
    workdir = os.path.abspath(opt(argv, '--work', os.path.join(HERE, '..', '_work')))
    os.makedirs(workdir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = R.FPS
    pairs, extra = P.build_all(fast=fast, workdir=workdir, log=log)
    highs = [h for h, _ in pairs]
    lows = [lo for _, lo in pairs]
    for o in lows + extra:
        bind(o)
    stats = {'tris': {}, 'parts': len(lows) + len(extra)}
    for o in lows + extra:
        stats['tris'][o.name] = K.triangles(o)
    log('triangles total', sum(stats['tris'].values()), 'highs', sum(len(h.data.polygons) for h in highs))
    log('TOP', sorted(stats['tris'].items(), key=lambda kv: -kv[1])[:20])
    glow_m, glass_m = glow_material(), glass_material()
    if nobake:
        clay = clay_materials()
        for o in lows:
            o.data.materials.clear()
            o.data.materials.append(clay[o['mat']])
    else:
        S.unwrap(lows, scale_fn=uv_boost)
        log('uv done')
        bake_mats = S.bake_materials()
        for h in highs:
            h.data.materials.clear()
            h.data.materials.append(bake_mats[h['mat']])
        tex_dir = opt(argv, '--tex')
        if tex_dir:
            os.makedirs(tex_dir, exist_ok=True)
        tmp = [K.duplicate(o, o.name + '_bk') for o in lows]
        for o in bpy.context.selected_objects:
            o.select_set(False)
        for o in tmp:
            o.select_set(True)
        bpy.context.view_layer.objects.active = tmp[0]
        bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        for o in extra:
            o.hide_render = True
        res = S.bake_all(highs, joined, size=bake_size, samples=int(opt(argv, '--samples', 30)), cage=0.05, ray=0.16,
                         out_dir=tex_dir)
        for o in extra:
            o.hide_render = False
        bpy.data.objects.remove(joined, do_unlink=True)
        ao = res['ao'][..., :1]
        albedo = res['albedo'].copy()
        albedo[..., :3] *= (1.0 - 0.45 * (1.0 - ao))
        orm = np.ones_like(albedo)
        orm[..., 0] = ao[..., 0]
        orm[..., 1] = res['rough'][..., 0]
        orm[..., 2] = res['metal'][..., 0]
        k = 2 if bake_size >= 4096 else 1
        a_img = to_numpy_image('VoltaicAlbedo', downsample(albedo, k) if k > 1 else albedo)
        n_img = to_numpy_image('VoltaicNormal', downsample(res['normal'], k) if k > 1 else res['normal'], 'Non-Color')
        o_img = to_numpy_image('VoltaicORM', downsample(orm, k * 2), 'Non-Color')
        e_img = to_numpy_image('VoltaicEmissive', downsample(res['emit'], k) if k > 1 else res['emit'])
        if tex_dir:
            for img, nm in ((a_img, 'albedo'), (n_img, 'normal'), (o_img, 'orm'), (e_img, 'emissive')):
                img.filepath_raw = os.path.join(tex_dir, f'voltaic_{nm}_{img.size[0]}.png')
                img.file_format = 'PNG'
                img.save()
        mat = body_material(a_img, n_img, o_img, e_img)
        for o in lows:
            o.data.materials.clear()
            o.data.materials.append(mat)
        log('bake done')
    for o in extra:
        o.data.materials.clear()
        o.data.materials.append(glass_m if o['mat'] == 'glass' else glow_m)
    for h in highs:
        h.hide_render = True
        h.hide_viewport = True
    for o in lows + extra:
        for nm in ('Col', 'PL', 'PM'):
            col = o.data.color_attributes.get(nm)
            if col is not None:
                o.data.color_attributes.remove(col)
    arm = R.build_armature()
    allp = lows + extra
    ob = join(allp, 'VoltaicWarden')
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    missing = {g.name for g in ob.vertex_groups} - {b.name for b in arm.data.bones}
    if missing:
        raise RuntimeError(f'groups with no bone: {missing}')
    stats['tris_total'] = K.triangles(ob)
    stats['bones'] = len(arm.data.bones)
    stats['materials'] = [m.name for m in ob.data.materials]
    log('mesh', stats['tris_total'], 'tris', stats['bones'], 'bones', stats['materials'])
    import clips as C
    only = opt(argv, '--clips')
    names = C.make_clips(arm, only.split(',') if only else None)
    log('clips', len(names))
    if 'Idle' in names:
        R.set_action(arm, bpy.data.actions['Idle'])
        bpy.context.scene.frame_set(1)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        co = np.array([(ev.matrix_world @ v.co)[:] for v in ev.data.vertices])
        stats['idle_height'] = float(co[:, 2].max())
        stats['idle_minz'] = float(co[:, 2].min())
        stats['width_x'] = float(co[:, 0].max() - co[:, 0].min())
        stats['depth_y'] = float(co[:, 1].max() - co[:, 1].min())
        log('IDLE height', round(stats['idle_height'], 2), 'minz', round(stats['idle_minz'], 3), 'width',
            round(stats['width_x'], 2))
    stats['clips'] = {n: round(float(bpy.data.actions[n].get('duration', 0)), 3) for n in names}
    if out != '-':
        export(out, arm)
        stats['glb_bytes'] = os.path.getsize(out)
    if opt(argv, '--stats'):
        with open(opt(argv, '--stats'), 'w') as f:
            json.dump(stats, f, indent=1)
    if opt(argv, '--blend'):
        if 'Idle' in names:
            R.set_action(arm, bpy.data.actions['Idle'])
        bpy.ops.wm.save_as_mainfile(filepath=opt(argv, '--blend'))
        log('saved blend')
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
        export_vertex_color='NONE', export_image_format='JPEG', export_jpeg_quality=90,
    )
    log('WROTE', path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
