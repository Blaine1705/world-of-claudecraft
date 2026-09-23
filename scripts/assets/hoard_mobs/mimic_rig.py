"""The Voracious Chest: a mimic whose LID is its upper jaw, rigged and animated in Blender.

A sibling of quadruped_rig.py for a body that script cannot pose: the chest opens
like a mouth. The raw Tripo model (up +Z, facing +X: the lock and the teeth are on
+X) is split along the seam (the line of teeth) by the spec's "seam" plane:

  * the chest shell is CUT along that plane and the two halves separated, so the
    lid swings open as one rigid piece with no face stretched across the seam; the
    two cut openings are capped with a dark maw material (the roof and the floor of
    the mouth);
  * everything above the seam (lid, top bands, spikes, the teeth that hang from it)
    is weighted rigidly to the Lid bone, hinged at the BACK top edge of the chest;
    everything below to Body;
  * the two clawed arms that stand out from the sides are three-bone chains
    (ArmUpper/ArmLower/Hand) weighted by distance along their own shell; the two
    short rear feet (HindFoot) are rigid;
  * clips are keyed procedurally from world-axis turns: Idle, Walk, Run, Attack
    (the bite: rear back with the lid wide open, lunge and snap it shut about 55%
    in), Hit, Death, Cast (lid open wide, body pumping), Leap (crouch, spring,
    land).

One GLB per clip is written; assemble.mjs merges them into the shipped model:

  blender --background --python mimic_rig.py -- <raw.glb> <out dir> --spec <spec.json> [--blend file]
  node assemble.mjs <key> <out dir> <model.glb> Idle,Walk,Run,Attack,Cast,Hit,Death,Leap
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, geometry

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]
BLEND = args[args.index('--blend') + 1] if '--blend' in args else None
ONLY = args[args.index('--only') + 1].split(',') if '--only' in args else None
with open(args[args.index('--spec') + 1], encoding='utf-8') as handle:
    SPEC = json.load(handle)
MOTION = SPEC.get('motion', {})
FPS = 24

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
scene.render.fps = FPS
mesh_obj = next(o for o in scene.objects if o.type == 'MESH')
world = mesh_obj.matrix_world.copy()
mesh_obj.parent = None
mesh_obj.data.transform(world)
mesh_obj.matrix_world = Matrix.Identity(4)
if SPEC.get('rotateZ'):
    mesh_obj.data.transform(Matrix.Rotation(math.radians(SPEC['rotateZ']), 4, 'Z'))
for o in list(scene.objects):
    if o is not mesh_obj:
        bpy.data.objects.remove(o, do_unlink=True)
mesh_obj.name = SPEC['name']

# ---------------------------------------------------------------- skeleton
# name: (parent, head, tail). It faces +X, +Y is its left, +Z is up. "X.*" is
# written once and mirrored to .L (+Y) and .R (-Y).
BONES = []
for name, parent, head, tail in SPEC['bones']:
    if name.endswith('.*'):
        for side, sign in (('L', 1), ('R', -1)):
            mirror = lambda p: (p[0], p[1] * sign, p[2])
            BONES.append((name[:-1] + side, parent[:-1] + side if parent.endswith('.*') else parent,
                          mirror(head), mirror(tail)))
    else:
        BONES.append((name, parent, tuple(head), tuple(tail)))
BONE_AT = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}

arm_data = bpy.data.armatures.new(SPEC['name'] + 'Rig')
arm = bpy.data.objects.new(SPEC['name'] + 'Rig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name, parent, head, tail in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = Vector(head), Vector(tail)
    if parent:
        eb.parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------ cut the lid off the seam
SEAM = SPEC['seam']
SEAM_CO = Vector(SEAM['point'])
SEAM_NO = Vector(SEAM['normal']).normalized()


def above(p):
    return (p - SEAM_CO).dot(SEAM_NO)


def flood(verts):
    """Connected components over the given vertex set (by edges)."""
    inside = set(verts)
    seen, out = set(), []
    for v in verts:
        if v in seen:
            continue
        stack, group = [v], []
        seen.add(v)
        while stack:
            cur = stack.pop()
            group.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o in inside and o not in seen:
                    seen.add(o)
                    stack.append(o)
        out.append(group)
    return out


maw = bpy.data.materials.new('MimicMaw')
maw.use_nodes = True
bsdf = maw.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = tuple(SPEC.get('mawColor', (0.11, 0.015, 0.018))) + (1.0,)
bsdf.inputs['Roughness'].default_value = 0.85
maw.diffuse_color = bsdf.inputs['Base Color'].default_value
mesh_obj.data.materials.append(maw)
MAW_INDEX = len(mesh_obj.data.materials) - 1

bm = bmesh.new()
bm.from_mesh(mesh_obj.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
shells = sorted(flood(list(bm.verts)), key=len, reverse=True)
chest = shells[0]
chest_set = set(chest)
chest_faces = list({f for v in chest for f in v.link_faces})
chest_edges = list({e for v in chest for e in v.link_edges})
cut = bmesh.ops.bisect_plane(bm, geom=chest + chest_edges + chest_faces, dist=1e-5,
                             plane_co=SEAM_CO, plane_no=SEAM_NO)
cut_edges = [g for g in cut['geom_cut'] if isinstance(g, bmesh.types.BMEdge)]
bmesh.ops.split_edges(bm, edges=cut_edges)
# After the split the chest falls apart into pieces above and below the plane.
# Re-find the chest pieces from its old verts: bisect keeps them and adds cut
# verts, and the split duplicates the cut verts.
stack = [v for v in bm.verts if v in chest_set]
seen = set(stack)
while stack:
    cur = stack.pop()
    for e in cur.link_edges:
        o = e.other_vert(cur)
        if o not in seen:
            seen.add(o)
            stack.append(o)
chest_verts = list(seen)
pieces = flood(chest_verts)
lid_verts = set()
for piece in pieces:
    # After the bisect every face lies wholly on one side: the vertex farthest
    # from the plane tells which side a (possibly thin) piece is on.
    if above(max(piece, key=lambda v: abs(above(v.co))).co) > 0:
        lid_verts.update(piece)
    if os.environ.get('MIMIC_DEBUG'):
        c = sum((v.co for v in piece), Vector()) / len(piece)
        print('PIECE', len(piece), tuple(round(x, 3) for x in c),
              'extent', [round(min(v.co[i] for v in piece), 3) for i in range(3)],
              [round(max(v.co[i] for v in piece), 3) for i in range(3)], 'lid', piece[0] in lid_verts)

# Cap both cut openings (the roof and the floor of the mouth) with the convex
# hull of the cross-section, pulled a little inside the walls. Each cap sits a
# hair past the plane on the OTHER side, so it covers every cut face of its own
# half (no sliver of the groove pokes through it) and still hides when closed.
axis_u = Vector((0, 1, 0)).cross(SEAM_NO).normalized()
axis_v = SEAM_NO.cross(axis_u)


def section_hull(offset):
    """Convex hull (plane coords) of the chest cut by the seam plane moved by
    offset along its normal: taken a little INTO each half, so an overhanging lid
    rim never widens the body's cap, nor a flared body top the lid's."""
    pts = []
    for e in {e for v in chest_verts for e in v.link_edges}:
        a, b = (above(v.co) - offset for v in e.verts)
        if a * b < 0:
            p = e.verts[0].co.lerp(e.verts[1].co, a / (a - b))
            pts.append(((p - SEAM_CO).dot(axis_u), (p - SEAM_CO).dot(axis_v)))
    return [pts[i] for i in geometry.convex_hull_2d(pts)]


INSET = SPEC.get('capInset', 0.965)
CAP_LIFT = SPEC.get('capLift', 0.0015)
DEPTH = SPEC.get('capSection', 0.015)
HULLS = {}
for name, facing in (('Body', 1), ('Lid', -1)):
    hull = HULLS[name] = section_hull(-facing * DEPTH)
    cu = sum(h[0] for h in hull) / len(hull)
    cv = sum(h[1] for h in hull) / len(hull)
    ring = [bm.verts.new(SEAM_CO + axis_u * (cu + (hu - cu) * INSET) + axis_v * (cv + (hv - cv) * INSET)
                         + SEAM_NO * facing * CAP_LIFT) for hu, hv in hull]
    face = bm.faces.new(ring)
    face.normal_update()
    if face.normal.dot(SEAM_NO) * facing < 0:
        face.normal_flip()
    face.material_index = MAW_INDEX
    face.smooth = False
    if name == 'Lid':
        lid_verts.update(ring)
    chest_verts.extend(ring)
print('SEAM pieces', [(len(p), round(sum(above(v.co) for v in p) / len(p), 3)) for p in pieces],
      'hull', len(hull))

# ----------------------------------------------------------------- weights
# Every other shell: a big one is an arm; small ones (teeth, spikes, studs,
# claws) are rigid to the part they sit on.
SIDE = lambda y: 'L' if y > 0 else 'R'
ARM_CHAIN = ('ArmUpper', 'ArmLower', 'Hand')


def seg_distance(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def nearest_arm_bone(p, side):
    return min(('%s.%s' % (n, side) for n in ARM_CHAIN),
               key=lambda n: seg_distance(p, *BONE_AT[n]))


def deep_inside(p, share):
    """True when p projects well inside the body's cross-section: inside the hull
    shrunk to `share` of its size about its centre."""
    hull = HULLS['Body']
    cu = sum(h[0] for h in hull) / len(hull)
    cv = sum(h[1] for h in hull) / len(hull)
    u, v = (p - SEAM_CO).dot(axis_u), (p - SEAM_CO).dot(axis_v)
    u, v = cu + (u - cu) / share, cv + (v - cv) / share
    signs = set()
    for (au, av), (bu, bv) in zip(hull, hull[1:] + hull[:1]):
        signs.add((bu - au) * (v - av) - (bv - av) * (u - au) > 0)
    return len(signs) == 1


weights = {}
junk = []
in_chest = set(chest_verts)
others = flood([v for v in bm.verts if v not in in_chest])
TEETH = SPEC.get('teethBand', 0.07)
FOOT = SPEC['footRegion']
for group in others:
    c = sum((v.co for v in group), Vector()) / len(group)
    side = SIDE(c.y)
    if len(group) > 150 and abs(c.y) > 0.2:
        # An arm: distance weights over its three bones, smoothed along the shell.
        for v in group:
            scored = sorted((seg_distance(v.co, *BONE_AT['%s.%s' % (n, side)]), '%s.%s' % (n, side))
                            for n in ARM_CHAIN)
            w = {n: 1.0 / max(d, 0.01) ** 4 for d, n in scored[:2]}
            total = sum(w.values())
            weights[v] = {n: x / total for n, x in w.items()}
        members = set(group)
        for _ in range(3):
            nxt = {}
            for v in group:
                acc = dict(weights[v])
                for e in v.link_edges:
                    o = e.other_vert(v)
                    if o in members:
                        for n, x in weights[o].items():
                            acc[n] = acc.get(n, 0.0) + x
                total = sum(acc.values())
                nxt[v] = {n: x / total for n, x in acc.items()}
            weights.update(nxt)
        continue
    if os.environ.get('MIMIC_DEBUG'):
        print('SHELL', len(group), tuple(round(x, 3) for x in c), 'above', round(above(c), 3),
              'deep', deep_inside(c, 0.75), 'span', [round(min(above(v.co) for v in group), 3),
                                                    round(max(above(v.co) for v in group), 3)])
    if abs(c.y) > FOOT['armY']:
        bone = nearest_arm_bone(c, side)
    elif (c.z < FOOT['maxZ'] and c.x < FOOT['maxX']
          and seg_distance(c, *BONE_AT['HindFoot.' + side]) < FOOT.get('radius', 0.07)):
        bone = 'HindFoot.' + side
    elif abs(above(c)) < TEETH and deep_inside(c, SPEC.get('junkShare', 0.6)):
        # Stray bits deep inside the chest (hidden while it is shut) would float
        # in the open mouth: drop them.
        junk.extend(group)
        continue
    elif abs(above(c)) < TEETH and len(group) >= SPEC.get('toothVerts', 8):
        # A tooth at the seam belongs to the jaw it grows from. Its tip is the
        # vertex farthest from its centre (the base carries the verts): a tooth
        # pointing DOWN hangs from the lid, one pointing up stands on the body.
        tip = max(group, key=lambda v: (v.co - c).length).co
        bone = 'Lid' if (tip - c).dot(SEAM_NO) < 0 else 'Body'
    else:
        bone = 'Lid' if above(c) > 0 else 'Body'
    for v in group:
        weights[v] = {bone: 1.0}
for v in chest_verts:
    weights[v] = {'Lid' if v in lid_verts else 'Body': 1.0}

print('JUNK dropped', len(junk), 'verts')
bmesh.ops.delete(bm, geom=junk, context='VERTS')
bm.verts.index_update()
order = list(bm.verts)
bm.to_mesh(mesh_obj.data)
bm.free()
me = mesh_obj.data
if me.has_custom_normals:
    with bpy.context.temp_override(object=mesh_obj, active_object=mesh_obj):
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
me.shade_smooth()
me.set_sharp_from_angle(angle=math.radians(SPEC.get('sharpAngle', 40)))
for p in me.polygons:
    if p.material_index == MAW_INDEX:
        p.use_smooth = False

groups = {n: mesh_obj.vertex_groups.new(name=n) for n, *_ in BONES if n != 'Root'}
for i, v in enumerate(order):
    for n, w in weights[v].items():
        if w > 0.01:
            groups[n].add([i], w, 'REPLACE')
mesh_obj.parent = arm
mod = mesh_obj.modifiers.new('Armature', 'ARMATURE')
mod.object = arm

# ------------------------------------------------------------------- clips
REST = {b.name: b.matrix_local.copy() for b in arm_data.bones}
PARENT = {b.name: (b.parent.name if b.parent else None) for b in arm_data.bones}
ORDER = [b.name for b in arm_data.bones]
AXES = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}


def apply_pose(pose):
    """pose: bone -> {'turn': [(axis, degrees), ...], 'move': (x, y, z)}; turns
    are about WORLD axes through the bone's posed head, first one innermost."""
    posed = {}
    for name in ORDER:
        parent = PARENT[name]
        base = REST[name] if parent is None else posed[parent] @ REST[parent].inverted() @ REST[name]
        spec = pose.get(name, {})
        rot = Matrix.Identity(4)
        for axis, degrees in spec.get('turn', []):
            about = AXES[axis] if isinstance(axis, str) else Vector(axis)
            rot = Matrix.Rotation(math.radians(degrees), 4, about) @ rot
        pivot = base.to_translation()
        final = Matrix.Translation(pivot) @ rot @ Matrix.Translation(-pivot) @ base
        final = Matrix.Translation(Vector(spec.get('move', (0, 0, 0)))) @ final
        posed[name] = final
        pb = arm.pose.bones[name]
        pb.rotation_mode = 'QUATERNION'
        pb.matrix_basis = base.inverted() @ final


def wave(t, freq=1.0, lag=0.0):
    return math.sin(2 * math.pi * (t * freq - lag))


def ease(a, b, t):
    t = max(0.0, min(1.0, (t - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bump(a, b, t):
    """0 -> 1 -> 0 over [a, b], smooth."""
    if t <= a or t >= b:
        return 0.0
    return math.sin(math.pi * (t - a) / (b - a)) ** 2


FOOT_DROP = MOTION.get('footDrop', 0.0)


def body(pose, move=(0, 0, 0), pitch=0.0, roll=0.0, yaw=0.0):
    """pitch > 0 dips the front (the lid lip) toward the ground."""
    pose['Body'] = {'move': move, 'turn': [('Y', pitch), ('X', roll), ('Z', yaw)]}


def lid(pose, open_deg):
    pose['Lid'] = {'turn': [('Y', -open_deg)]}


def arm_pose(pose, side, swing=0.0, lift=0.0, elbow=0.0, claw=0.0):
    """swing > 0 reaches the hand forward; lift > 0 raises the whole arm; elbow > 0
    swings the forearm outward (straightens), < 0 tucks it under; claw > 0 curls
    the hand inward."""
    s = 1 if side == 'L' else -1
    out = Vector((0, s, 0))
    hinge = tuple(out.cross(Vector((0, 0, 1))))
    pose['ArmUpper.' + side] = {'turn': [(hinge, lift), ('Z', -swing * s)]}
    pose['ArmLower.' + side] = {'turn': [(hinge, elbow)]}
    pose['Hand.' + side] = {'turn': [(hinge, -claw)]}


def foot(pose, side, swing=0.0, lift=0.0, splay=0.0, shift=0.0):
    """swing > 0 reaches the foot forward, lift raises it and shift slides it
    forward (metres): the feet hang off Root, so they follow a body lunge here."""
    s = 1 if side == 'L' else -1
    pose['HindFoot.' + side] = {'turn': [('Y', -swing), ('X', -splay * s)],
                                'move': (shift, 0.0, lift - FOOT_DROP)}


def rest_feet(pose):
    for side in ('L', 'R'):
        foot(pose, side)


def clip_idle(t):
    pose = {}
    breath = 0.5 * (1 - math.cos(2 * math.pi * t * 2))  # two slow breaths
    crack = bump(0.3, 0.72, t)
    body(pose, move=(0, 0, MOTION.get('idleBob', 0.006) * breath), pitch=-1.2 * breath)
    lid(pose, 1.5 * breath + MOTION.get('idleCrack', 9) * crack)
    for side in ('L', 'R'):
        lag = 0.0 if side == 'L' else 0.2
        arm_pose(pose, side, swing=2 * wave(t, 1, lag), lift=-2 * breath, elbow=1.5 * breath,
                 claw=6 * crack + 2 * wave(t, 2, lag))
    rest_feet(pose)
    return pose


def gait(t, stride, lift, bob, lean, chatter, lid_base):
    pose = {}
    body(pose, move=(0, 0, bob * (1 - math.cos(4 * math.pi * t)) * 0.5), pitch=lean + 1.5 * wave(t, 2, 0.1),
         roll=3 * wave(t), yaw=4 * wave(t, 1, 0.25))
    lid(pose, lid_base + chatter * (0.5 + 0.5 * wave(t, 2, 0.15)))
    for side, phase in (('L', 0.0), ('R', 0.5)):
        swing = stride * wave(t, 1, phase + 0.25)
        up = max(0.0, wave(t, 1, phase))  # lifted while it swings forward
        arm_pose(pose, side, swing=swing, lift=lift * up, elbow=-0.5 * lift * up, claw=-10 * up + 6)
    for side, phase in (('L', 0.5), ('R', 0.0)):
        up = max(0.0, wave(t, 1, phase))
        foot(pose, side, swing=0.8 * stride * wave(t, 1, phase + 0.25), lift=0.03 * up)
    return pose


def clip_walk(t):
    return gait(t, MOTION.get('walkStride', 22), MOTION.get('walkLift', 14), 0.012, 2, 4, 1)


def clip_run(t):
    return gait(t, MOTION.get('runStride', 32), MOTION.get('runLift', 20), 0.025, 7, 12, 4)


def clip_attack(t):
    back = ease(0.0, 0.38, t) * (1 - ease(0.42, 0.55, t))
    lunge = ease(0.42, 0.55, t) * (1 - ease(0.7, 1.0, t))
    wide = MOTION.get('biteOpen', 70)
    opened = wide * ease(0.04, 0.36, t) * (1 - ease(0.46, 0.55, t))
    rebound = 5 * bump(0.55, 0.68, t)
    pose = {}
    body(pose, move=(-0.05 * back + 0.1 * lunge, 0, 0.02 * back - 0.01 * lunge),
         pitch=-14 * back + 12 * lunge)
    lid(pose, opened + rebound)
    for side in ('L', 'R'):
        arm_pose(pose, side, swing=10 * back + 26 * lunge, lift=18 * back - 10 * lunge,
                 elbow=14 * back - 8 * lunge, claw=-18 * back + 22 * lunge)
    for side in ('L', 'R'):
        foot(pose, side, swing=-12 * lunge + 6 * back, shift=-0.04 * back + 0.085 * lunge,
             lift=0.02 * bump(0.4, 0.62, t))
    return pose


def clip_cast(t):
    up = ease(0.0, 0.2, t) * (1 - ease(0.82, 1.0, t))
    pump = up * max(0.0, math.sin(2 * math.pi * 3 * (t - 0.18) / 0.64)) if 0.18 < t < 0.82 else 0.0
    wide = MOTION.get('castOpen', 75)
    pose = {}
    body(pose, move=(-0.02 * up + 0.015 * pump, 0, 0.012 * up + 0.012 * pump), pitch=-8 * up + 5 * pump)
    lid(pose, wide * up + 8 * pump)
    for side in ('L', 'R'):
        arm_pose(pose, side, swing=-6 * up, lift=-8 * up + 4 * pump, elbow=14 * up, claw=-12 * up)
    rest_feet(pose)
    return pose


def clip_hit(t):
    jolt = ease(0.0, 0.15, t) * (1 - ease(0.22, 1.0, t))
    clatter = 20 * bump(0.02, 0.4, t)
    pose = {}
    body(pose, move=(-0.04 * jolt, 0, 0.01 * jolt), pitch=-9 * jolt, roll=4 * jolt)
    lid(pose, clatter)
    for side in ('L', 'R'):
        arm_pose(pose, side, swing=-8 * jolt, lift=12 * jolt, elbow=10 * jolt, claw=-10 * jolt)
    for side in ('L', 'R'):
        foot(pose, side, swing=5 * jolt, shift=-0.03 * jolt)
    return pose


def clip_death(t):
    stagger = ease(0.0, 0.2, t) * (1 - ease(0.2, 0.5, t))
    fall = ease(0.2, 0.7, t)
    flop = ease(0.35, 0.8, t)
    bounce = 8 * bump(0.8, 0.95, t)
    pose = {}
    body(pose, move=(-0.02 * stagger, 0, 0.015 * stagger - MOTION.get('deathDrop', 0.075) * fall),
         pitch=-8 * stagger + 6 * fall, roll=MOTION.get('deathRoll', 10) * fall)
    lid(pose, 20 * stagger + MOTION.get('deathOpen', 105) * flop - bounce)
    for side in ('L', 'R'):
        arm_pose(pose, side, swing=(8 if side == 'L' else -6) * fall, lift=10 * stagger - 22 * fall,
                 elbow=26 * fall, claw=-20 * stagger + 35 * fall)
    for side in ('L', 'R'):
        foot(pose, side, swing=-6 * fall, lift=MOTION.get('deathDrop', 0.075) * 0.6 * fall, splay=18 * fall)
    return pose


def clip_leap(t):
    crouch = ease(0.0, 0.24, t) * (1 - ease(0.26, 0.36, t))
    air = ease(0.28, 0.42, t) * (1 - ease(0.72, 0.84, t))
    land = ease(0.8, 0.87, t) * (1 - ease(0.87, 1.0, t))
    pose = {}
    body(pose, move=(0.01 * air, 0, -0.045 * crouch + 0.07 * air - 0.04 * land),
         pitch=6 * crouch - 10 * air + 8 * land)
    lid(pose, 26 * air + 6 * bump(0.87, 1.0, t))
    for side in ('L', 'R'):
        arm_pose(pose, side, swing=-6 * crouch + 24 * air + 8 * land, lift=-14 * crouch + 26 * air - 18 * land,
                 elbow=-18 * crouch - 10 * air + 22 * land, claw=10 * crouch - 20 * air + 10 * land)
    for side in ('L', 'R'):
        foot(pose, side, swing=6 * crouch - 28 * air, lift=0.05 * air - 0.01 * crouch, splay=10 * land)
    return pose


# name: (function, seconds)
CLIPS = {
    'Idle': (clip_idle, 3.0),
    'Walk': (clip_walk, 1.0),
    'Run': (clip_run, 0.6),
    'Attack': (clip_attack, 1.0),
    'Cast': (clip_cast, 1.2),
    'Hit': (clip_hit, 0.55),
    'Death': (clip_death, 1.7),
    'Leap': (clip_leap, 1.0),
}

os.makedirs(OUT, exist_ok=True)
arm.animation_data_create()
for clip, (fn, seconds) in CLIPS.items():
    if ONLY and clip not in ONLY:
        continue
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    arm.animation_data.action = action
    frames = max(2, round(seconds * FPS))
    for f in range(frames + 1):
        apply_pose(fn(f / frames))
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f + 1)
            pb.keyframe_insert('location', frame=f + 1)
    scene.frame_start, scene.frame_end = 1, frames + 1
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    mesh_obj.select_set(True)
    path = os.path.join(OUT, '%s_%s.glb' % (SPEC['key'], clip.lower()))
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_animations=True, export_animation_mode='ACTIVE_ACTIONS',
        export_optimize_animation_size=False,
    )
    print('WROTE', path, frames + 1, 'frames')
if BLEND:
    arm.animation_data.action = bpy.data.actions.get('Idle') or arm.animation_data.action
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print('SAVED', BLEND)
