"""Reference renders of the Voltaic Warden's effects, staged on its real clips (authoring
aid; nothing here ships). LOOK targets for the game's effect layer, anchored on the
bones at the clips' contract frames:

  coil       Idle: the storm coil alive, arcs leaping from the electrode to the winding,
             a cold white-blue core glow behind the glass (Coil anchor: CoilCore).
  flip       FlipRattle at 2.90 s: every plate seats with a burst of sparks off its edges
             and a short arc from the plate to its yoke.
  discharge  Discharge at 1.08 s: the white-blue nova leaving the coil, a ground ring racing
             out across the Coil Crown, arcs crawling over the body.
  lash       StaticLash at 1.02 s: the lightning whip from the right palm to the tank (6 yd
             ahead), then the chain hop to a second player standing 4 yd from the tank.
  storm      CallStorm at 1.50 s: a bolt from the sky into the crown, the crown flaring.

  blender -b voltaic_warden.blend --python vfx_reference.py -- <out_dir> [--samples 64] [--only a,b]
         [--knight knight.glb]
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import frame as FR  # noqa: E402
import rig as R  # noqa: E402
import stage  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


ONLY = opt('--only', 'coil,flip,discharge,lash,storm').split(',')
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE' and o.name.startswith('VoltaicWarden'))
for o in scene.objects:
    if o.name.endswith('_hi') or '_hi.' in o.name:
        o.hide_render = True
cam = stage.setup(engine='CYCLES', res=(1600, 1000), sky=(0.12, 0.14, 0.2), knight=opt('--knight'),
                  ref_at=(0.6, -6.2, 0.0))
scene.cycles.samples = int(opt('--samples', 64))
for o in scene.objects:
    if o.type == 'LIGHT':
        o.data.energy *= 0.4
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.25
KNIGHTS = [o for o in scene.objects if o.name.startswith('Knight_') and o.parent is None]
FX = []
rng = random.Random(5)


def compositor_glare():
    try:
        ng = bpy.data.node_groups.new('VfxComp', 'CompositorNodeTree')
        rl = ng.nodes.new('CompositorNodeRLayers')
        g = ng.nodes.new('CompositorNodeGlare')
        try:
            g.glare_type = 'FOG_GLOW'
        except Exception:  # noqa: BLE001
            g.inputs['Type'].default_value = 'Fog Glow'
        out = ng.nodes.new('NodeGroupOutput')
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        ng.links.new(rl.outputs['Image'], g.inputs['Image'])
        ng.links.new(g.outputs['Image'], out.inputs[0])
        scene.compositing_node_group = ng
        scene.render.use_compositing = True
    except Exception as e:  # noqa: BLE001
        print('GLARE_SKIPPED', e)


compositor_glare()


def emit_mat(name, color, strength, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Emission Color'].default_value = (*color, 1)
    b.inputs['Emission Strength'].default_value = strength
    b.inputs['Alpha'].default_value = alpha
    return m


BOLT = emit_mat('fx_bolt', (0.85, 0.95, 1.0), 60.0)
HALO = emit_mat('fx_halo', (0.3, 0.6, 1.0), 8.0, alpha=0.25)
SPARK = emit_mat('fx_spark', (1.0, 0.85, 0.55), 40.0)
RING = emit_mat('fx_ring', (0.55, 0.85, 1.0), 14.0, alpha=0.7)
SHELL = emit_mat('fx_shell', (0.45, 0.75, 1.0), 3.0, alpha=0.12)


def track(o):
    FX.append(o)
    scene.collection.objects.link(o)
    return o


def clear_fx():
    for o in FX:
        if o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    FX.clear()


def act_time(name, t):
    act = bpy.data.actions[name]
    R.set_action(arm, act)
    f = act.frame_range[0] + t * R.FPS
    scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))


def bone_point(name, tail=False):
    pb = arm.pose.bones[name]
    return arm.matrix_world @ (pb.tail if tail else pb.head)


def bone_matrix(name):
    return arm.matrix_world @ arm.pose.bones[name].matrix


def tube_obj(name, paths, mat, radius):
    """Many polylines as thin tubes in one object."""
    bm = bmesh.new()
    for pts, r0 in paths:
        n = len(pts)
        sides = 6
        rings = []
        for i, p in enumerate(pts):
            t = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
            a = t.orthogonal().normalized()
            b = t.cross(a).normalized()
            r = radius * r0 * (1.0 - 0.6 * (i / max(1, n - 1)))
            ring = [bm.verts.new(Vector(p) + (a * math.cos(k * math.tau / sides) + b * math.sin(k * math.tau / sides)) * r)
                    for k in range(sides)]
            rings.append(ring)
        for r1, r2 in zip(rings, rings[1:]):
            for k in range(sides):
                bm.faces.new((r1[k], r1[(k + 1) % sides], r2[(k + 1) % sides], r2[k]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    me.materials.append(mat)
    return track(o)


def bolt_path(a, b, depth=6, jag=0.18, branch=0.0):
    """Midpoint-displacement lightning between a and b; returns [points] (+ branches)."""
    a, b = Vector(a), Vector(b)
    pts = [a, b]
    span = (b - a).length
    off = span * jag
    for _ in range(depth):
        out = [pts[0]]
        for p, q in zip(pts, pts[1:]):
            m = (p + q) * 0.5
            d = (q - p).normalized()
            r = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
            r -= d * r.dot(d)
            out += [m + r * off, q]
        pts = out
        off *= 0.55
    branches = []
    if branch:
        for i in range(2, len(pts) - 4, 5):
            if rng.random() < branch:
                d = (pts[i + 1] - pts[i]).normalized()
                end = pts[i] + (d + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.6, 0.6)))) \
                    .normalized() * span * rng.uniform(0.08, 0.2)
                branches.append(bolt_path(pts[i], end, depth=3, jag=0.25)[0])
    return pts, branches


def bolt(name, a, b, width=0.05, branch=0.4, jag=0.16):
    pts, br = bolt_path(a, b, jag=jag, branch=branch)
    tube_obj(name, [(pts, 1.0)] + [(p, 0.5) for p in br], BOLT, width)
    tube_obj(name + '_halo', [(pts, 1.0)] + [(p, 0.5) for p in br], HALO, width * 5)
    return pts


def point_light(loc, color, energy, radius=0.3):
    li = bpy.data.lights.new('fxl', 'POINT')
    li.energy = energy
    li.color = color
    li.shadow_soft_size = radius
    o = bpy.data.objects.new('fxl', li)
    o.location = loc
    return track(o)


def ring(name, c, R_, tube, mat, squash=0.35):
    bpy.ops.mesh.primitive_torus_add(major_radius=R_, minor_radius=tube, major_segments=128, minor_segments=10,
                                     location=c)
    o = bpy.context.active_object
    o.scale = (1, 1, squash)
    o.data.materials.append(mat)
    for coll in list(o.users_collection):
        coll.objects.unlink(o)
    return track(o)


def sphere(name, c, r, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=c, segments=48, ring_count=24)
    o = bpy.context.active_object
    o.data.materials.append(mat)
    for coll in list(o.users_collection):
        coll.objects.unlink(o)
    return track(o)


def sparks(name, origin, n, spread, length=(0.15, 0.5), up=0.4):
    paths = []
    for _ in range(n):
        d = (Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.2, 1) + up))).normalized()
        p0 = Vector(origin) + d * rng.uniform(0.0, spread)
        p1 = p0 + d * rng.uniform(*length)
        paths.append(([p0, (p0 + p1) * 0.5 + Vector((0, 0, -0.03)), p1], 1.0))
    return tube_obj(name, paths, SPARK, 0.012)


def shoot(name, az, el, dist, focus, lens=40):
    stage.aim(cam, az, el, dist, focus, lens)
    stage.still(os.path.join(OUT, name + '.png'))


def place_knight(i, at, yaw=0.0):
    if i < len(KNIGHTS):
        KNIGHTS[i].location = (at[0], at[1], KNIGHTS[i].location.z)
        KNIGHTS[i].rotation_euler = (KNIGHTS[i].rotation_euler.x, KNIGHTS[i].rotation_euler.y, yaw)


os.makedirs(OUT, exist_ok=True)
if 'coil' in ONLY:
    act_time('Idle', 0.4)
    c = bone_point('CoilCore')
    top = bone_point('CoilCore', tail=True)
    axis = (top - c).normalized()
    mid = (c + top) * 0.5
    paths = []
    for k in range(9):
        a0 = rng.uniform(0, math.tau)
        h = rng.uniform(-0.45, 0.45)
        p0 = mid + axis * h + Vector((math.cos(a0), math.sin(a0), 0)) * 0.1
        p1 = mid + axis * (h + rng.uniform(-0.2, 0.2)) + Vector((math.cos(a0 + 0.5), math.sin(a0 + 0.5), 0)) * 0.36
        pts, br = bolt_path(p0, p1, depth=4, jag=0.3)
        paths.append((pts, 1.0))
    tube_obj('coil_arcs', paths, BOLT, 0.016)
    tube_obj('coil_halo', paths, HALO, 0.06)
    point_light(mid + Vector((0, -0.2, 0)), (0.55, 0.8, 1.0), 900, 0.2)
    shoot('vfx_coil_arcs', 14, 6, 7.5, (mid.x, mid.y, mid.z + 0.1), 50)
    shoot('vfx_coil_arcs_wide', 30, 8, 22, (0.0, -0.5, 6.0), 45)
    clear_fx()
if 'flip' in ONLY:
    act_time('FlipRattle', 2.9)
    for p in FR.PLATES:
        M = bone_matrix('Plate_' + p.name)
        c = M.translation
        ax = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
        for s in (1, -1):
            sparks(f'sp_{p.name}{s}', c + ax * s * (p.hh + 0.05), 26, 0.12, (0.2, 0.7))
        pts = bolt_path(c + ax * (p.hh * 0.6), c - ax * (p.hh * 0.6), depth=4, jag=0.25)[0]
        tube_obj(f'arc_{p.name}', [(pts, 1.0)], BOLT, 0.012)
        tube_obj(f'arch_{p.name}', [(pts, 1.0)], HALO, 0.05)
    point_light((0, -2.5, 6.5), (0.6, 0.8, 1.0), 2500, 1.0)
    shoot('vfx_plate_flip_sparks', 28, 8, 26, (0.0, -0.3, 5.6), 45)
    clear_fx()
if 'discharge' in ONLY:
    act_time('Discharge', 1.08)
    c = bone_point('CoilCore')
    top = bone_point('CoilCore', tail=True)
    mid = (c + top) * 0.5
    sphere('nova_core', mid, 1.1, emit_mat('fx_core', (0.9, 0.97, 1.0), 25.0, alpha=0.8))
    sphere('nova_shell', mid, 4.2, SHELL)
    ring('ground_ring', (mid.x, mid.y, 0.06), 9.0, 0.35, RING, squash=0.35)
    ring('ground_ring2', (mid.x, mid.y, 0.04), 6.0, 0.12, RING, squash=0.3)
    paths = []
    for k in range(22):
        a = math.tau * k / 22 + rng.uniform(-0.1, 0.1)
        el = rng.uniform(-0.5, 0.6)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        pts, br = bolt_path(mid + d * 0.9, mid + d * rng.uniform(4.0, 7.0), depth=5, jag=0.2, branch=0.3)
        paths.append((pts, 1.0))
        paths += [(b, 0.5) for b in br]
    tube_obj('nova_arcs', paths, BOLT, 0.035)
    tube_obj('nova_arcs_halo', paths, HALO, 0.15)
    point_light(mid, (0.6, 0.85, 1.0), 20000, 1.2)
    shoot('vfx_discharge_ring', 30, 16, 34, (0.0, -1.0, 4.5), 40)
    clear_fx()
if 'lash' in ONLY:
    act_time('StaticLash', 1.02)
    hand = bone_matrix('R_Hand')
    palm = hand.translation + (hand.to_3x3() @ Vector((0, 0.45, 0)))
    tank = Vector((-0.6, -7.2, 1.6))
    other = Vector((3.2, -8.6, 1.6))
    place_knight(0, (tank.x, tank.y), math.pi)
    bolt('lash', palm, tank, width=0.06, branch=0.5, jag=0.14)
    bolt('chain', tank + Vector((0, 0, 0.3)), other, width=0.045, branch=0.3, jag=0.2)
    sparks('lash_hit', tank, 40, 0.3, (0.3, 1.0))
    sparks('chain_hit', other, 30, 0.3, (0.3, 0.9))
    ring('chain_mark', (other.x, other.y, 0.05), 1.0, 0.06, RING, squash=0.3)
    ring('tank_mark', (tank.x, tank.y, 0.05), 6.0, 0.05, emit_mat('fx_range', (0.5, 0.8, 1.0), 4.0, 0.5), squash=0.3)
    point_light(palm, (0.6, 0.85, 1.0), 3000, 0.4)
    point_light(tank, (0.6, 0.85, 1.0), 2000, 0.4)
    if opt('--knight'):
        import importlib
        n = len(KNIGHTS)
        stage.place_knight(opt('--knight'), (other.x, other.y, 0.0))
    shoot('vfx_static_lash_chain', 62, 22, 30, (0.6, -5.0, 3.2), 40)
    clear_fx()
if 'storm' in ONLY:
    act_time('CallStorm', 1.5)
    tip = bone_point('CrownTop', tail=True)
    sky = tip + Vector((2.5, 6.0, 30.0))
    bolt('sky_bolt', sky, tip, width=0.12, branch=0.6, jag=0.12)
    sparks('crown_sp', tip, 60, 0.4, (0.3, 1.2), up=0.2)
    sphere('crown_flash', tip, 0.5, emit_mat('fx_cf', (0.9, 0.97, 1.0), 30.0, alpha=0.8))
    point_light(tip, (0.6, 0.85, 1.0), 9000, 0.6)
    shoot('vfx_call_storm_crown', 205, 4, 34, (0.0, 0.5, 7.5), 40)
    clear_fx()
print('VFX_DONE')
