"""The Smith's Heart raid's mountain rock kit (phase 2E): the sculpted faces,
ribs and crests that skin the raid's mountain (every room's), and the
boulders fallen from them.

Run (background, one scene):
  blender -b --factory-startup --python build_smith_heart_rock_kit.py -- \
      [--preview out.png] [--closeups DIR] [--views front,side] [--pieces A,B] [--save out.blend]

Writes smith_heart_rock_kit_components.glb next to this file (a full build
only; `--pieces` builds a subset for review renders and writes nothing); the
shipping build (scripts/assets/smith_heart_rock_kit/build.mjs) validates,
fingerprints and meshopts it into public/models/props/smith_heart_rock_kit.glb.

Pieces are named Kit_* (the runtime bakes each by name, heart_kit.ts) on the
kit's slots (KitStone lit, KitGlow emissive, KitGlass unused). Game yards,
+Z up, front -Y (the game's +Z after the glTF export). Origins:
  - Kit_RockFace*, Kit_RockTall*, Kit_RockButtress, Kit_RockCrest*: on the
    FRONT plane at the foot's centre; nothing stands in front of y = 0, the
    body runs back to +Y (rock_sculpt.py);
  - Kit_RockLipA, B: on a walk's lip (z 0, nothing above -0.05), hanging
    40 yd, the face leaning out over the void (toward -Y) as it falls;
  - Kit_Boulder*: the foot's centre.
Deterministic: every random draw is seeded, nothing reads the clock.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shkit  # noqa: E402,F401  (puts the shared dungeon kit on the path)
import rock_sculpt as rs  # noqa: E402
from build_smith_heart_hammer_kit import camera, look, preview_materials, scale_figure, setup_render  # noqa: E402
from hckit import export_kit  # noqa: E402


# The pieces' sizes (W across, H tall, D deep): the runtime plan reads them
# off the shipped GLB's bounds (tests/smith_heart_rock_kit.test.ts pins them).
def face(name, seed, W, H, D, far=False, **kw):
    """A face band (rock_sculpt.rock_face). Its far build (`far`) meshes the
    SAME sculpt at a third of the triangles, with fewer stones on it: the
    bands high up the mountain are seen from fifty yards and more."""
    def make():
        pn = name + ('Far' if far else '')
        p = rs.RP(pn, seed=seed, ao_dist=5.0)
        args = dict(kw)
        if far:
            args['target'] = max(700, int(args.get('target', 2100) * 0.36))
            args['scree_n'] = args.get('scree_n', 4) // 2
        return rs.rock_face(bpy, p, pn, seed, W, H, D, key=name, **args)
    return make


def rib(name, seed, W, H, D, far=False, target=1700):
    def make():
        pn = name + ('Far' if far else '')
        p = rs.RP(pn, seed=seed, ao_dist=5.0)
        return rs.buttress(bpy, p, pn, seed, W, H, D, key=name, target=int(target * 0.4) if far else target,
                           scree_n=1 if far else 2)
    return make


def lip(name, seed, W, H, D, out, grain=1.0, target=1100):
    def make():
        p = rs.RP(name, seed=seed, ao_dist=4.0)
        return rs.rock_lip(bpy, p, name, seed, W, H, D, out=out, grain=grain, target=target)
    return make


def stone(name, seed, size):
    def make():
        p = rs.RP(name, seed=seed, ao_dist=1.5)
        return rs.boulder(bpy, p, name, seed, size)
    return make


# Each band piece: (name, seed, W, H, D, options). The near build of every
# one, then the far build of each the runtime draws high up the mountain.
FACE_SPECS = [
    # The bands of the face, stacked up the slope.
    ('RockFaceA', 501, 24.0, 28.0, 15.0, dict(beds=3, peaks=2, target=2100)),
    ('RockFaceB', 503, 20.0, 24.0, 14.0, dict(beds=2, plate=(6.0, 14.0), thick=(3.0, 6.5), peaks=1, target=2000)),
    ('RockFaceC', 509, 26.0, 30.0, 16.0, dict(beds=3, overhang=True, peaks=3, target=2200)),
    # The tall faces of the first band (down into the chasm past the lip).
    ('RockTallA', 521, 22.0, 46.0, 15.0, dict(beds=4, peaks=2, target=2500)),
    ('RockTallB', 523, 18.0, 42.0, 14.0, dict(beds=4, overhang=True, peaks=1, target=2300)),
    # The crests of the top bands (the skyline).
    ('RockCrestA', 541, 24.0, 26.0, 18.0, dict(beds=2, peaks=3, lift=0.14, scree_n=6, target=2100)),
    ('RockCrestB', 547, 20.0, 30.0, 16.0, dict(beds=3, overhang=True, peaks=2, lift=0.1, target=2100)),
]

BUILDERS = {}
for (n, seed, W, H, D, kw) in FACE_SPECS:
    BUILDERS[n] = face(n, seed, W, H, D, **kw)
# A rib standing out of the face.
BUILDERS['RockButtress'] = rib('RockButtress', 531, 12.0, 44.0, 16.0)
for (n, seed, W, H, D, kw) in FACE_SPECS:
    BUILDERS[n + 'Far'] = face(n, seed, W, H, D, far=True, **kw)
BUILDERS['RockButtressFar'] = rib('RockButtress', 531, 12.0, 44.0, 16.0, far=True)
# The walks' sides where they fall into the chasm.
BUILDERS['RockLipA'] = lip('RockLipA', 581, 12.0, 40.0, 4.0, 0.38)
BUILDERS['RockLipB'] = lip('RockLipB', 587, 12.0, 40.0, 4.0, 0.38)
# Boulders.
BUILDERS['BoulderA'] = stone('BoulderA', 561, (3.6, 2.8, 2.4))
BUILDERS['BoulderB'] = stone('BoulderB', 563, (5.2, 3.8, 3.0))
BUILDERS['BoulderC'] = stone('BoulderC', 569, (2.2, 1.8, 1.6))


# ===================================================================== build
def build_rock_kit(root_name, names):
    """The kit's three slots, every named piece under one root, a triangle
    and bounds report per piece."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = []
    for name, emission, alpha in (('KitStone', 0.0, 1.0), ('KitGlow', 4.0, 1.0), ('KitGlass', 0.0, 0.4)):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = 0.9
        attribute = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'Col'
        mat.node_tree.links.new(attribute.outputs['Color'], bsdf.inputs['Base Color'])
        if emission:
            mat.node_tree.links.new(attribute.outputs['Color'], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = emission
        if alpha < 1.0:
            bsdf.inputs['Alpha'].default_value = alpha
        materials.append(mat)
    root = bpy.data.objects.new(root_name, None)
    bpy.context.scene.collection.objects.link(root)
    parts = []
    total = 0
    for n in names:
        obj = BUILDERS[n]().finish(materials, root)
        parts.append(obj)
        dg = bpy.context.evaluated_depsgraph_get()
        mesh = obj.evaluated_get(dg).to_mesh()
        mesh.calc_loop_triangles()
        tris = len(mesh.loop_triangles)
        total += tris
        bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        lo = [round(min(v[i] for v in bb), 2) for i in range(3)]
        hi = [round(max(v[i] for v in bb), 2) for i in range(3)]
        print(f'PIECE {obj.name} triangles {tris} min {lo} max {hi}', flush=True)
    print('KIT_TRIANGLES', total)
    return parts, materials


# ==================================================================== review
def stack_preview(parts, path):
    """A stretch of mountain as the runtime stacks it: three bands up a 60
    degree slope, the tall faces first, a rib, the crests on top, boulders
    at the foot and a 2 yd figure on a walk 8 yd out, under the Hammer's
    low warm key. Copies of the pieces (linked data), so the kit is kept."""
    by = {o.name[4:]: o for o in parts}
    rows = [
        (0.0, -14.0, ['RockTallA', 'RockTallB', 'RockTallA', 'RockTallB']),
        (12.0, 14.0, ['RockFaceA', 'RockFaceB', 'RockFaceC', 'RockFaceA', 'RockFaceB']),
        (24.0, 34.0, ['RockFaceC', 'RockFaceA', 'RockFaceB', 'RockFaceC']),
        (36.0, 56.0, ['RockCrestA', 'RockCrestB', 'RockCrestA', 'RockCrestB']),
    ]
    made = []
    for (yb, zb, names) in rows:
        x = -40.0 + (yb * 0.37) % 9
        for k, n in enumerate(names):
            if n not in by:
                continue
            ob = by[n].copy()
            bpy.context.scene.collection.objects.link(ob)
            ob.parent = None
            ob.location = (x, yb + (k % 2) * 1.2, zb - (k % 3) * 1.5)
            ob.rotation_euler = (0, 0, (k % 3 - 1) * 0.08)
            made.append(ob)
            x += 19.0 + (k % 2) * 2
    if 'RockButtress' in by:
        ob = by['RockButtress'].copy()
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = None
        ob.location = (2.0, -0.5, -16.0)
        made.append(ob)
    for (n, loc) in (('BoulderB', (-12, -9, 2.5)), ('BoulderA', (14, -8, 2.0)), ('BoulderC', (6, -10, 2.5))):
        if n in by:
            ob = by[n].copy()
            bpy.context.scene.collection.objects.link(ob)
            ob.parent = None
            ob.location = loc
            made.append(ob)
    for o in parts:
        o.hide_render = True
    # The walk the camera stands on (8 yd out from the front plane).
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -22, 1.0))
    walk = bpy.context.active_object
    walk.scale = (90, 14, 2)
    mat = bpy.data.materials.new('WalkMat')
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.3, 0.29, 0.28, 1)
    walk.data.materials.append(mat)
    fig = scale_figure()
    fig.location = (0, -20, 3.0)
    scene = setup_render(path, res=(1600, 1000))
    cam = camera('stack', lens=24)
    scene.camera = cam
    look(cam, (-6, -36, 10), (4, 10, 30))
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', path)
    return made


def render_closeups(parts, folder, views=('front',)):
    os.makedirs(folder, exist_ok=True)
    scene = setup_render('', res=(1100, 1100))
    cam = camera('closeup', lens=35)
    scene.camera = cam
    figure = scale_figure()
    dirs = {'front': Vector((-0.35, -1.2, 0.25)), 'side': Vector((-1.2, -0.35, 0.3)),
            'low': Vector((-0.25, -1.2, -0.1)), 'top': Vector((-0.3, -0.6, 1.1)), 'back': Vector((0.6, 1.1, 0.5))}
    for obj in parts:
        for o in parts:
            o.hide_render = o is not obj
        bb = [Vector(c) for c in obj.bound_box]
        lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        centre = (lo + hi) / 2
        size = max(4.0, (hi - lo).length)
        figure.location = (lo.x - 1.2, lo.y - 1.6, 1.0 + max(0.0, lo.z))
        for view in views:
            look(cam, centre + dirs[view].normalized() * size * 1.0, centre)
            scene.render.filepath = os.path.join(folder, f'{obj.name}_{view}.png')
            bpy.ops.render.render(write_still=True)
    for o in parts:
        o.hide_render = False


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

    def arg(flag):
        return argv[argv.index(flag) + 1] if flag in argv else None

    only = arg('--pieces')
    names = list(BUILDERS)
    if only:
        want = only.split(',')
        names = [n for n in names if n in want]
    parts, materials = build_rock_kit('SmithHeartRockKit_ROOT', names)
    if not only:
        export_kit(os.path.join(HERE, 'smith_heart_rock_kit_components.glb'))
    preview_materials(materials)
    if arg('--closeups'):
        render_closeups(parts, arg('--closeups'), (arg('--views') or 'front').split(','))
    if arg('--preview'):
        stack_preview(parts, arg('--preview'))
    if arg('--save'):
        bpy.ops.wm.save_as_mainfile(filepath=arg('--save'))


if __name__ == '__main__':
    main()
