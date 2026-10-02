"""Reference renders of the Prime Draft's effects, staged on its real clips
(authoring aid; nothing here ships). LOOK targets for the game's effect layer
(render/stormbrass_foundry/), anchored on bones at the clips' contact frames:

  lightning  Idle at 1.45 s (the head twitch): arcs crawling over the plates and the
             iron arm, hopping between joints, the conduits and the eye flaring.
  steam      Hatch_Open at 0.6 s (the warning shudder): steam jetting from the
             elbows, knees, the waist, the hatch seams and the stack mouths.
  overload   Overload at 0.12 s: the discharge, a cascade of arcs from the open
             chest down to the floor, sparks from every joint, a scorch ring.
  hatch      Hatch_Held at 0.4 s: the leaves open, the empty socket crackling, a
             burst of steam either side and the gold delivery ring on the floor
             (4 yd radius, 5 yd in front of the chest).

  blender -b primedraft.blend --python vfx_reference.py -- <out_dir> [--samples 64] [--only a,b] [--knight k.glb]
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
import rig as R  # noqa: E402
import stage  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


ONLY = opt('--only', 'lightning,steam,overload,hatch').split(',')
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE' and o.name.startswith('PrimeDraft'))
body = next(o for o in scene.objects if o.type == 'MESH' and o.name == 'PrimeDraft')
for o in scene.objects:
    if o.name.endswith('_hi') or '_hi.' in o.name:
        o.hide_render = True
cam = stage.setup(engine='CYCLES', res=(1600, 1000), sky=(0.1, 0.12, 0.16), knight=opt('--knight'),
                  ref_at=(5.2, -4.2, 0.0))
scene.cycles.samples = int(opt('--samples', 64))
for o in scene.objects:
    if o.type == 'LIGHT':
        o.data.energy *= 0.55 if o.name != 'rim' else 0.8
rng = random.Random(5)
FX = []


def emit_mat(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


BOLT = emit_mat('fx_bolt', (0.62, 0.85, 1.0), 40.0)
BOLT_CORE = emit_mat('fx_bolt_core', (0.95, 0.98, 1.0), 80.0)
SPARK = emit_mat('fx_spark', (1.0, 0.75, 0.38), 30.0)
GOLD = emit_mat('fx_gold', (1.0, 0.72, 0.2), 12.0)
SCORCH = emit_mat('fx_scorch', (0.3, 0.55, 1.0), 6.0)


def compositor_glare():
    try:
        ng = bpy.data.node_groups.new('VfxComp', 'CompositorNodeTree')
        rl = ng.nodes.new('CompositorNodeRLayers')
        g = ng.nodes.new('CompositorNodeGlare')
        try:
            g.glare_type = 'FOG_GLOW'
        except Exception:  # noqa: BLE001
            g.inputs['Type'].default_value = 'Fog Glow'
        outn = ng.nodes.new('NodeGroupOutput')
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        ng.links.new(rl.outputs['Image'], g.inputs['Image'])
        ng.links.new(g.outputs['Image'], outn.inputs[0])
        scene.compositing_node_group = ng
        scene.render.use_compositing = True
    except Exception as e:  # noqa: BLE001
        print('GLARE_SKIPPED', e)


compositor_glare()


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


def body_points():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [(ev.matrix_world @ v.co, (ev.matrix_world.to_3x3() @ v.normal).normalized()) for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def zig(a, b, jag, depth=5):
    pts = [Vector(a), Vector(b)]
    for _ in range(depth):
        out = [pts[0]]
        for p, q in zip(pts, pts[1:]):
            m = (p + q) * 0.5
            L = (q - p).length
            m += Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))) * jag * L
            out += [m, q]
        pts = out
    return pts


def tubes(name, polylines, mat, r):
    bm = bmesh.new()
    for pts, rad in polylines:
        rad = rad if rad else r
        n = len(pts)
        rings = []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
            s = t.orthogonal().normalized()
            u = t.cross(s)
            rr = rad * (1 - 0.6 * i / max(1, n - 1))
            ring = [bm.verts.new(p + (s * math.cos(a) + u * math.sin(a)) * rr) for a in
                    (0, 2.094, 4.189)]
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(3):
                bm.faces.new((r0[k], r0[(k + 1) % 3], r1[(k + 1) % 3], r1[k]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    me.materials.append(mat)
    return track(o)


def bolt(a, b, jag=0.18, r=0.03, branches=2, depth=5):
    main = zig(a, b, jag, depth)
    lines = [(main, r)]
    for _ in range(branches):
        i = rng.randrange(2, len(main) - 2)
        d = (Vector(b) - Vector(a)).length
        tip = main[i] + Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(-0.3, 1))).normalized() * d * rng.uniform(0.2, 0.45)
        lines.append((zig(main[i], tip, jag, depth - 1), r * 0.55))
    return lines


def crawl(pts, start, hops, reach=(0.5, 1.2), lift=0.08):
    """A chain of arcs hopping over the surface from a start point."""
    out = []
    cur = start
    for _ in range(hops):
        cands = [(p, n) for p, n in pts[::7] if reach[0] < (p - cur[0]).length < reach[1]]
        if not cands:
            break
        nxt = rng.choice(cands)
        out += bolt(cur[0] + cur[1] * lift, nxt[0] + nxt[1] * lift, jag=0.22, r=0.022, branches=1, depth=4)
        cur = nxt
    return out


def steam(name, c, d, length, width, density=0.9):
    m = bpy.data.materials.new(name + '_m')
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (0.92, 0.95, 0.97, 1)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 3.5
    nz.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ln = nt.nodes.new('ShaderNodeVectorMath')
    ln.operation = 'LENGTH'
    nt.links.new(tc.outputs['Object'], ln.inputs[0])
    fall = nt.nodes.new('ShaderNodeMapRange')
    fall.inputs[1].default_value = 1.0
    fall.inputs[2].default_value = 0.2
    nt.links.new(ln.outputs['Value'], fall.inputs[0])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    nt.links.new(fall.outputs[0], mul.inputs[0])
    nt.links.new(nz.outputs['Fac'], mul.inputs[1])
    mul2 = nt.nodes.new('ShaderNodeMath')
    mul2.operation = 'MULTIPLY'
    mul2.inputs[1].default_value = density
    nt.links.new(mul.outputs[0], mul2.inputs[0])
    nt.links.new(mul2.outputs[0], vol.inputs['Density'])
    nt.links.new(vol.outputs[0], outn.inputs['Volume'])
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    me.materials.append(m)
    d = Vector(d).normalized()
    o.location = Vector(c) + d * length * 0.5
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    o.scale = (width, width, length * 0.5)
    return track(o)


def sparks(name, origin, n, speed, t):
    lines = []
    for _ in range(n):
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.2, 1))).normalized()
        v = d * speed * rng.uniform(0.4, 1.2)
        p0 = Vector(origin) + v * t + Vector((0, 0, -5.0 * t * t))
        p1 = p0 - v.normalized() * rng.uniform(0.15, 0.45)
        lines.append(([p1, p0], 0.018))
    return tubes(name, lines, SPARK, 0.018)


def floor_ring(name, c, radius, tube, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=tube, major_segments=96, minor_segments=8,
                                     location=(c[0], c[1], 0.03))
    o = bpy.context.active_object
    o.scale = (1, 1, 0.15)
    o.data.materials.append(mat)
    for coll in o.users_collection:
        coll.objects.unlink(o)
    return track(o)


def shoot(name, az, el, dist, focus, lens=35):
    stage.aim(cam, az, el, dist, focus, lens)
    stage.still(os.path.join(OUT, name + '.png'))


os.makedirs(OUT, exist_ok=True)
JOINTS = ['L_UpperArm', 'R_UpperArm', 'L_Forearm', 'R_Forearm', 'L_Shin', 'R_Shin', 'L_Hand', 'R_Hand', 'Spine',
          'Neck', 'L_Foot', 'R_Foot']
if 'lightning' in ONLY:
    act_time('Idle', 1.45)
    pts = body_points()
    lines = []
    for j in JOINTS:
        c = bone_point(j)
        near = [(p, n) for p, n in pts[::5] if (p - c).length < 1.0]
        if near:
            lines += crawl(pts, rng.choice(near), rng.randint(2, 4))
    for _ in range(6):
        lines += crawl(pts, rng.choice(pts), 3, reach=(0.7, 1.6))
    tubes('crawl', lines, BOLT, 0.022)
    tubes('crawl_core', [(p, r * 0.4) for p, r in lines], BOLT_CORE, 0.01)
    shoot('vfx_rayos_por_el_cuerpo', 30, 8, 24, (0.0, 0.0, 6.0))
    clear_fx()
if 'steam' in ONLY:
    act_time('Hatch_Open', 0.6)
    for j, d in (('L_Forearm', (1, 0.3, 0.6)), ('R_Forearm', (-1, 0.3, 0.6)), ('L_Shin', (0.8, -0.4, 0.3)),
                 ('R_Shin', (-0.8, -0.4, 0.3)), ('Spine', (0.9, 0.2, 0.4)), ('Spine', (-0.9, 0.2, 0.4))):
        c = bone_point(j)
        steam('st_' + j + str(d[0]), c, d, 2.6, 0.55)
    for sx in (1, -1):
        c = bone_point('HatchL' if sx > 0 else 'HatchR')
        steam(f'st_hatch{sx}', (c.x, c.y - 0.1, c.z + 0.7), (sx * 0.5, -1, 0.5), 2.2, 0.45, 1.2)
    for sx in (1, -1):
        top = Vector((sx * 0.95, 2.4, 10.4))
        steam(f'st_stack{sx}', top, (sx * 0.2, 0.4, 1), 4.5, 0.9, 0.7)
    shoot('vfx_vapor_en_articulaciones', 28, 8, 26, (0.0, 0.0, 6.2))
    clear_fx()
if 'overload' in ONLY:
    act_time('Overload', 0.12)
    core = bone_point('Anchor_Core')
    pts = body_points()
    lines = []
    for k in range(9):
        a = rng.uniform(0, math.tau)
        tgt = Vector((core.x + math.cos(a) * rng.uniform(3, 7), core.y - 1.5 + math.sin(a) * rng.uniform(2, 6), 0.05))
        lines += bolt(core, tgt, jag=0.16, r=0.06, branches=3, depth=6)
    for j in JOINTS:
        c = bone_point(j)
        near = [(p, n) for p, n in pts[::5] if (p - c).length < 1.0]
        if near:
            lines += crawl(pts, rng.choice(near), 3)
        sparks('sp_' + j, c, 26, 7.0, 0.12)
    for sx in (1, -1):
        lines += bolt(core, bone_point('Anchor_Plug' + ('L' if sx > 0 else 'R')), jag=0.2, r=0.035, branches=1)
    tubes('discharge', lines, BOLT, 0.05)
    tubes('discharge_core', [(p, r * 0.4) for p, r in lines], BOLT_CORE, 0.02)
    floor_ring('scorch', (core.x, core.y - 1.5, 0), 6.0, 0.25, SCORCH)
    floor_ring('scorch2', (core.x, core.y - 1.5, 0), 3.4, 0.12, SCORCH)
    shoot('vfx_descarga_sobrecarga', 22, 6, 28, (0.0, -1.0, 5.4))
    clear_fx()
if 'hatch' in ONLY:
    act_time('Hatch_Held', 0.4)
    core = bone_point('Anchor_Core')
    lines = []
    tips = []
    for k in range(4):
        t = math.pi / 4 + k * math.pi / 2
        tips.append(core + Vector((math.cos(t) * 0.25, 0.0, math.sin(t) * 0.25)))
    for k in range(10):
        a, b = rng.sample(tips, 2)
        lines += bolt(a, b, jag=0.3, r=0.03, branches=1, depth=4)
    for k in range(5):
        a = rng.choice(tips)
        lines += bolt(a, core + Vector((rng.uniform(-1.4, 1.4), -rng.uniform(0.6, 1.4), rng.uniform(-1.0, 1.0))), jag=0.25,
                      r=0.025, branches=1, depth=4)
    tubes('socket_arcs', lines, BOLT, 0.03)
    tubes('socket_core', [(p, r * 0.4) for p, r in lines], BOLT_CORE, 0.012)
    for sx in (1, -1):
        steam(f'hs{sx}', (core.x + sx * 0.9, core.y - 0.8, core.z), (sx * 1, -0.7, 0.4), 2.4, 0.5, 1.4)
    ahead = core + Vector((0, -5.0, 0))
    floor_ring('deliver', (ahead.x, ahead.y, 0), 4.0, 0.14, GOLD)
    floor_ring('deliver_in', (ahead.x, ahead.y, 0), 3.7, 0.05, GOLD)
    shoot('vfx_escotilla_abierta', 14, 9, 17, (0.0, -2.5, 5.2))
    shoot('vfx_escotilla_abierta_cerca', 10, 4, 7.5, (core.x, core.y - 0.6, core.z), 45)
    clear_fx()
print('VFX_DONE')
