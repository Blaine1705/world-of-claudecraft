"""The Prime Draft's armature, rigid skinning, pose solver, clip keying and the
mechanics pass (adapted from the Balgath / Great Saurian kit).

Poses are authored the organic-kit way (aims in armature space, two-bone IK onto
targets with a pole, rest-frame turns), solved per frame and keyed linear, so the
encounter's contact frames are exact. On top of the authored body, `solve_mechanics`
keys every frame of:

  * the PISTONS: a cylinder bone on one part and a rod bone on the next, each aimed
    at the other's anchor, so the ram telescopes through every pose and never parts;
  * the CABLES: a rope (verlet, gravity, the floor) pinned at the gantry end and, while
    attached, at the plug in its back; the chain bones are placed on the rope with a
    length stretch so the cable meets the plug exactly. In Unbolt the plug end is
    released with a kick and the cable falls away;
  * the MOORINGS: the floor clamps and their bolts, which burst and fly in Unbolt.

Keys are written at frames from times in seconds (24 fps).
"""
import math

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

import mech as A

FPS = 24


def build_armature(name='PrimeDraft'):
    data = bpy.data.armatures.new(name + 'Rig')
    arm = bpy.data.objects.new(name + 'Rig', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for bname, parent, head, tail in A.ALL_BONES:
        eb = data.edit_bones.new(bname)
        eb.head, eb.tail = Vector(head), Vector(tail)
        eb.roll = 0.0
    for bname, parent, head, tail in A.ALL_BONES:
        if parent:
            data.edit_bones[bname].parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    data.display_type = 'STICK'
    return arm


# ------------------------------------------------------------------ weights
def mesh_arrays(obj):
    me = obj.data
    P = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', P)
    P = P.reshape(-1, 3)
    E = np.zeros(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', E)
    return P, E.reshape(-1, 2)


def cap4(W):
    if W.shape[1] > 4:
        idx = np.argsort(-W, axis=1)[:, 4:]
        np.put_along_axis(W, idx, 0.0, axis=1)
    W[W < 0.01] = 0
    s = W.sum(axis=1, keepdims=True)
    return W / np.maximum(s, 1e-9)


def write_groups(obj, bones, W):
    obj.vertex_groups.clear()
    groups = {b: obj.vertex_groups.new(name=b) for b in bones}
    for j, b in enumerate(bones):
        col = W[:, j]
        nz = np.nonzero(col > 0)[0]
        g = groups[b]
        for i in nz:
            g.add([int(i)], float(col[i]), 'REPLACE')


def rigid(obj, bone):
    obj.vertex_groups.clear()
    g = obj.vertex_groups.new(name=bone)
    g.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')


def _axis(a):
    if isinstance(a, str):
        return {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}[a]
    return Vector(a)


def _mirror_turn(a, deg):
    v = _axis(a)
    return ((v.x, -v.y, -v.z), deg)


def two_bone(root, l1, l2, target, pole, prev=None, max_step=20.0):
    """Directions of an upper and a lower bone reaching `target`, the joint bent
    toward `pole`. With `prev` (the joint's previous bend direction) the bend may
    turn at most `max_step` degrees per call: as a target sweeps past its pole the
    bend would otherwise flip to the far side in one frame."""
    d = Vector(target) - root
    dist = max(1e-4, min(d.length, (l1 + l2) * 0.9995))
    dn = d.normalized()
    cos_a = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
    a = math.acos(cos_a)
    p = Vector(pole) - dn * Vector(pole).dot(dn)
    if p.length < 1e-6:
        p = dn.orthogonal()
    p.normalize()
    if prev is not None:
        pp = prev - dn * prev.dot(dn)
        if pp.length > 1e-4:
            pp.normalize()
            ang = pp.angle(p)
            lim = math.radians(max_step)
            if ang > lim:
                axis = pp.cross(p)
                if axis.length < 1e-6:
                    axis = dn
                p = (Quaternion(axis.normalized(), lim) @ pp).normalized()
                p = (p - dn * p.dot(dn)).normalized()
    d1 = dn * math.cos(a) + p * math.sin(a)
    joint = root + d1 * l1
    d2 = (root + dn * dist - joint).normalized()
    two_bone.last_bend = p
    return d1, d2


class Pose(dict):
    """{bone: local Quaternion}, plus .root (Vector) and .scale ({bone: float})."""


class Rig:
    def __init__(self, arm):
        self.bones = A.ALL_BONES
        self.rest = {n: (Vector(h), Vector(t)) for n, _, h, t in A.ALL_BONES}
        self.parent = {n: p for n, p, _, _ in A.ALL_BONES}
        self.frames = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
        self.length = {n: (t - h).length for n, (h, t) in self.rest.items()}
        # the rest bend direction of each two-bone limb (where the joint points)
        self.rest_bend = {}
        for up, lo in (('L_UpperArm', 'L_Forearm'), ('R_UpperArm', 'R_Forearm'), ('L_Thigh', 'L_Shin'),
                       ('R_Thigh', 'R_Shin')):
            root, joint, tip = self.rest[up][0], self.rest[lo][0], self.rest[lo][1]
            line = (tip - root).normalized()
            off = joint - (root + line * (joint - root).dot(line))
            self.rest_bend[up] = off.normalized()

    # How far an upper limb may roll about its own length, relative to the clavicle or
    # the pelvis (degrees). Past it the arm reads as wrung like a towel: the elbow is
    # turned round instead, keeping the hand where it was asked to be.
    ROLL_LIMIT = {'L_UpperArm': 75.0, 'R_UpperArm': 75.0, 'L_Thigh': 28.0, 'R_Thigh': 28.0}

    def roll_of(self, name, d1, bend, dp):
        q = dp.inverted() @ self._limb_rotation(name, d1, bend)
        rest_m = self.frames[name]
        local = (rest_m.inverted() @ q.to_matrix() @ rest_m).to_quaternion()
        if local.w < 0:
            local.negate()
        return math.degrees(2 * math.atan2(local.y, local.w))

    ROLL_STEP = 11.0   # degrees per frame an upper limb may roll (the elbow swings round, never snaps)

    def _limit_roll(self, name, lo, root, tgt, bend, dp, prev=None):
        """Turn the bend plane round the root-to-target line until the upper bone's
        roll is within ROLL_LIMIT and, with `prev` (last frame's roll), within
        ROLL_STEP of it. The roll is unwrapped against `prev` first, so a pose past
        +180 is not read as -180 and clamped to the far limit."""
        l1, l2 = self.length[name], self.length[lo]
        d1, d2 = two_bone(root, l1, l2, tgt, bend)
        lim = self.ROLL_LIMIT.get(name)
        if lim is None:
            return d1, d2, bend, None
        dn = (Vector(tgt) - root).normalized()

        def unwrap(r):
            if prev is None:
                return r
            return r + 360.0 * round((prev - r) / 360.0)

        lo_r, hi_r = -lim, lim
        if prev is not None:
            lo_r, hi_r = max(lo_r, prev - self.ROLL_STEP), min(hi_r, prev + self.ROLL_STEP)
            if lo_r > hi_r:
                lo_r = hi_r = max(-lim, min(lim, prev))
        roll = unwrap(self.roll_of(name, d1, bend, dp))
        for _ in range(12):
            want = max(lo_r, min(hi_r, roll))
            over = roll - want
            if abs(over) < 0.5:
                break
            trial = (Quaternion(dn, math.radians(-over)) @ bend).normalized()
            t1, t2 = two_bone(root, l1, l2, tgt, trial)
            tb = two_bone.last_bend.copy()
            r2 = unwrap(self.roll_of(name, t1, tb, dp))
            if abs(r2 - want) > abs(over):        # the roll runs against the turn here
                trial = (Quaternion(dn, math.radians(over)) @ bend).normalized()
                t1, t2 = two_bone(root, l1, l2, tgt, trial)
                tb = two_bone.last_bend.copy()
                r2 = unwrap(self.roll_of(name, t1, tb, dp))
            d1, d2, bend, roll = t1, t2, tb, r2
        return d1, d2, bend, roll

    @staticmethod
    def _frame(y, z):
        y = y.normalized()
        z = (z - y * z.dot(y)).normalized()
        x = y.cross(z)
        return Matrix((x, y, z)).transposed()

    def _limb_rotation(self, bone, direction, bend):
        """Armature rotation taking `bone` from rest to point along `direction` with its
        bend plane facing `bend`: swing AND twist from one frame, so an arm raised
        overhead (straight against its rest direction) never spins on its axis."""
        h, t = self.rest[bone]
        rest_y = (t - h).normalized()
        upper = bone if bone in self.rest_bend else self.parent[bone]
        r = self._frame(rest_y, self.rest_bend[upper])
        w = self._frame(direction, bend)
        return (w @ r.transposed()).to_quaternion()

    def _mirror(self, table, kind):
        out = dict(table)
        for k, v in table.items():
            if k.startswith('L_') and 'R_' + k[2:] not in table:
                if kind == 'aim':
                    out['R_' + k[2:]] = Vector((-v[0], v[1], v[2]))
                elif kind == 'turns':
                    out['R_' + k[2:]] = [_mirror_turn(a, d) for a, d in v]
                else:
                    out['R_' + k[2:]] = v
        return out

    LIMITS = {'L_Hand': 70.0, 'R_Hand': 70.0, 'L_Foot': 70.0, 'R_Foot': 70.0}

    def pose(self, aims=None, ik=None, turns=None, root=(0, 0, 0), scale=None, mirror=True, memory=None,
             twist=None, offsets=None, world=None):
        """aims {bone: armature dir}; ik {key: (upper, lower, target, pole)};
        turns {bone: [(axis, deg)]} (rest-frame axes, applied after the aim, carried
        by the parent); root: Root bone offset; scale {bone: s}."""
        aims = {k: Vector(v) for k, v in (aims or {}).items()}
        turns = dict(turns or {})
        if mirror:
            aims = self._mirror(aims, 'aim')
            turns = self._mirror(turns, 'turns')
        ik = dict(ik or {})
        ik_upper = {u: (lo, Vector(tgt), Vector(pole)) for u, lo, tgt, pole in ik.values()}
        limb_rot = {}
        delta, head, out = {}, {}, Pose()
        for name, parent, h, t in self.bones:
            rh, rt = self.rest[name]
            if parent:
                head[name] = head[parent] + delta[parent] @ (rh - self.rest[parent][0])
                if offsets and name in offsets:
                    head[name] = head[name] + Vector(offsets[name])
                dp = delta[parent]
            else:
                head[name] = rh + Vector(root)
                dp = Quaternion()
            if name in ik_upper:
                lo, tgt, pole = ik_upper[name]
                prev = memory.get(name) if memory is not None else None
                d1, d2 = two_bone(head[name], self.length[name], self.length[lo], tgt, pole, prev, max_step=12.0)
                bend = two_bone.last_bend.copy()
                prev_roll = memory.get(name + '#roll') if memory is not None else None
                d1, d2, bend, roll = self._limit_roll(name, lo, head[name], tgt, bend, dp,
                                                      None if prev_roll is None else prev_roll.x)
                if memory is not None and roll is not None:
                    memory[name + '#roll'] = Vector((roll, 0.0, 0.0))
                if memory is not None:
                    memory[name] = bend
                limb_rot[name] = self._limb_rotation(name, d1, bend)
                limb_rot[lo] = self._limb_rotation(lo, d2, bend)
            q = Quaternion()
            if name in limb_rot:
                q = dp.inverted() @ limb_rot[name]
            elif world and name in world:
                # an armature-space orientation (a foot kept flat whatever the shin does)
                q = dp.inverted() @ world[name]
            elif name in aims:
                r0 = (rt - rh).normalized()
                want = dp.inverted() @ aims[name].normalized()
                lim = self.LIMITS.get(name)
                if lim is not None and r0.angle(want) > math.radians(lim):
                    # a wrist or an ankle bends so far and no further
                    axis = r0.cross(want)
                    if axis.length < 1e-6:
                        axis = r0.orthogonal()
                    want = Quaternion(axis.normalized(), math.radians(lim)) @ r0
                q = r0.rotation_difference(want)
            for a, deg in turns.get(name, []):
                q = Quaternion(_axis(a).normalized(), math.radians(deg)) @ q
            if twist and name in twist:
                # a roll about the bone's own length (pronation): applied in the bone's
                # rest frame first, so it stays a pure twist whatever the swing
                q = q @ Quaternion((rt - rh).normalized(), math.radians(twist[name]))
            delta[name] = dp @ q
            rest_m = self.frames[name]
            out[name] = (rest_m.inverted() @ q.to_matrix() @ rest_m).to_quaternion()
        out.root = Vector(root)
        out.loc = {k: Vector(v) for k, v in (offsets or {}).items()}
        out.scale = dict(scale or {})
        out.head = head
        out.delta = delta
        return out


# ------------------------------------------------------------------ keying
EASE = {
    'auto': ('BEZIER', 'AUTO'),
    'in': ('CUBIC', 'EASE_IN'),
    'out': ('CUBIC', 'EASE_OUT'),
    'inout': ('SINE', 'EASE_IN_OUT'),
    'quadin': ('QUAD', 'EASE_IN'),
    'expoin': ('EXPO', 'EASE_IN'),
    'backout': ('BACK', 'EASE_OUT'),
    'linear': ('LINEAR', 'AUTO'),
    'hold': ('CONSTANT', 'AUTO'),
}


def fcurves(act):
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out


def frame_of(t):
    return 1.0 + t * FPS


def make_clip(arm, name, keys, skip=()):
    """keys: [(t_seconds, Pose, ease)]. Returns the action. Bones in `skip` are left
    unkeyed (the solved pistons and cables are keyed per frame afterwards)."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    last = {}
    ease_at = {}
    for t, pose, ease in keys:
        f = frame_of(t)
        ease_at[round(f, 4)] = ease
        for pb in arm.pose.bones:
            q = pose.get(pb.name, Quaternion())
            q = Quaternion(q)
            prev = last.get(pb.name)
            if prev is not None and prev.dot(q) < 0:
                q.negate()
            last[pb.name] = q
            pb.rotation_quaternion = q
            pb.location = (0, 0, 0)
            s = pose.scale.get(pb.name, 1.0)
            pb.scale = (s, s, s)
        rb = arm.pose.bones['Root']
        rb.location = rb.bone.matrix_local.to_3x3().inverted() @ pose.root
        for bname, d in getattr(pose, 'loc', {}).items():
            pb = arm.pose.bones[bname]
            par = pose.delta.get(pb.parent.name) if pb.parent else None
            frame = (par.to_matrix() if par is not None else Matrix.Identity(3)) @ pb.bone.matrix_local.to_3x3()
            pb.location = frame.inverted() @ Vector(d)
        for pb in arm.pose.bones:
            if pb.name in skip:
                continue
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
            pb.keyframe_insert('scale', frame=f)
    for fc in fcurves(act):
        for kp in fc.keyframe_points:
            ease = ease_at.get(round(kp.co[0], 4), 'auto')
            interp, easing = EASE[ease]
            kp.interpolation = interp
            kp.easing = easing
            kp.handle_left_type = 'AUTO_CLAMPED'
            kp.handle_right_type = 'AUTO_CLAMPED'
        fc.update()
    act['duration'] = max(t for t, _, _ in keys)
    return act


def set_action(arm, act):
    arm.animation_data_create()
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]


# ------------------------------------------------------------------ follow-through


# ------------------------------------------------------------------ mechanics
G = 10.7          # yards / s^2
SUB = 10          # rope substeps per frame


def _aim_matrix(pb, head, want, stretch=1.0):
    """Armature matrix for `pb` at `head`, its Y axis turned onto `want` by the
    smallest swing from its rest orientation, optionally stretched along Y."""
    rest = pb.bone.matrix_local.to_3x3()
    y = rest.col[1].normalized()
    swing = y.rotation_difference(want.normalized())
    m3 = swing.to_matrix() @ rest
    if stretch != 1.0:
        m3 = m3 @ Matrix.Diagonal((1.0, stretch, 1.0))
    m = m3.to_4x4()
    m.translation = head
    return m


def _anchor_now(arm, bone, p_rest):
    pb = arm.pose.bones[bone]
    rest = pb.bone.matrix_local
    return pb.matrix @ (rest.inverted() @ Vector(p_rest))


class Rope:
    def __init__(self, a, b, length, n):
        pts = A.rest_catenary(a, b, length, n)
        self.p = pts.copy()
        self.pp = pts.copy()
        self.seg = length / n
        self.n = n

    def step(self, dt, pin0, pin1, damp=0.985, floor=0.13, iters=14):
        v = (self.p - self.pp) * damp
        self.pp = self.p.copy()
        self.p = self.p + v
        self.p[:, 2] -= G * dt * dt
        for _ in range(iters):
            self.p[0] = pin0
            if pin1 is not None:
                self.p[-1] = pin1
            d = self.p[1:] - self.p[:-1]
            L = np.linalg.norm(d, axis=1, keepdims=True)
            corr = d * (1 - self.seg / np.maximum(L, 1e-9)) * 0.5
            w0 = np.ones((self.n, 1))
            w1 = np.ones((self.n, 1))
            w0[0] = 0.0
            if pin1 is not None:
                w1[-1] = 0.0
            tot = np.maximum(w0 + w1, 1e-9)
            self.p[:-1] += corr * (2 * w0 / tot)
            self.p[1:] -= corr * (2 * w1 / tot)
            low = self.p[:, 2] < floor
            self.p[low, 2] = floor
        self.p[0] = pin0
        if pin1 is not None:
            self.p[-1] = pin1


def solve_mechanics(arm, act, loop=False, moor=None):
    """Key the pistons, the cables and the moorings of `act` every frame.
    moor: {'cable_tear': t or None, 'burst': {'L': t, 'R': t} or None}."""
    moor = moor or {}
    scene = bpy.context.scene
    set_action(arm, act)
    f0, f1 = act.frame_range
    frames = list(range(int(round(f0)), int(round(f1)) + 1))
    dt = 1.0 / FPS
    bones = arm.pose.bones
    tear = moor.get('cable_tear')
    burst = moor.get('burst') or {}
    fine = 3
    n_r = A.CABLE_SEGS * fine
    ropes = {}
    # rope state: settle on the first frame; a loop runs the clip once first
    scene.frame_set(frames[0])
    for side, s in (('L', 1), ('R', -1)):
        end = np.array(A.side_pt(A.CABLE_END, s))
        plug = np.array(_anchor_now(arm, 'Chest', A.side_pt(A.PLUG, s)))
        ropes[side] = Rope(end, plug, A.CABLE_LEN, n_r)
        for _ in range(80):
            ropes[side].step(dt / SUB, end, plug)
    passes = 2 if loop else 1
    rec = {}
    released = {'L': False, 'R': False}
    for ps in range(passes):
        for f in frames:
            scene.frame_set(f)
            t = (f - frames[0]) / FPS
            for side, s in (('L', 1), ('R', -1)):
                end = np.array(A.side_pt(A.CABLE_END, s))
                plug = np.array(_anchor_now(arm, 'Chest', A.side_pt(A.PLUG, s)))
                attached = tear is None or t < tear
                rp = ropes[side]
                if not attached and not released[side]:
                    released[side] = True
                    # the plug rips out of its socket: kicked back and up
                    kick = np.array((0.6 * s, 6.0, 3.0)) * (dt / SUB)   # yd/s, per rope sub-step
                    rp.pp[-fine * 2:] = rp.p[-fine * 2:] - kick
                for _ in range(SUB):
                    rp.step(dt / SUB, end, plug if attached else None)
                if ps == passes - 1:
                    rec[(f, side)] = rp.p[::fine].copy()
    names = {n for n, *_ in A.piston_bones()} | {n for n, *_ in A.cable_bones()}
    moor_names = set()
    for side in burst:
        for i in range(len(A.CLAMP_BOLTS)):
            moor_names |= {f'Clamp{side}{i}', f'Bolt{side}{i}'}
    for fc in list(fcurves(act)):
        if any(fc.data_path.startswith('pose.bones["%s"]' % b) for b in names | moor_names):
            while len(fc.keyframe_points):
                fc.keyframe_points.remove(fc.keyframe_points[0])
    for f in frames:
        scene.frame_set(f)
        t = (f - frames[0]) / FPS
        for name, ba, pa, bb, pb_, r in A.PISTONS:
            a_now = _anchor_now(arm, ba, pa)
            b_now = _anchor_now(arm, bb, pb_)
            d = b_now - a_now
            cyl = bones['P_' + name + '_Cyl']
            rod = bones['P_' + name + '_Rod']
            cyl.matrix = _aim_matrix(cyl, a_now, d)
            rod.matrix = _aim_matrix(rod, b_now, -d)
        for side in ('L', 'R'):
            pts = rec[(f, side)]
            for i in range(A.CABLE_SEGS):
                pb = bones['Cable%s%d' % (side, i)]
                if moor.get('hidden'):
                    pb.matrix_basis = Matrix.Diagonal((0.0, 0.0, 0.0, 1.0))
                    continue
                a, b = Vector(pts[i]), Vector(pts[i + 1])
                rest_len = (pb.bone.tail_local - pb.bone.head_local).length
                pb.matrix = _aim_matrix(pb, a, b - a, (b - a).length / rest_len)
        for side, tb in burst.items():
            for i in range(len(A.CLAMP_BOLTS)):
                for kind in ('Clamp', 'Bolt'):
                    pb = bones['%s%s%d' % (kind, side, i)]
                    R0 = pb.bone.matrix_local.to_3x3().to_4x4()
                    pb.matrix_basis = R0.inverted() @ _flight(kind, side, i, t - tb, (frames[-1] - f) / FPS) @ R0
        for name in sorted(names | moor_names):
            pb = bones[name]
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
            pb.keyframe_insert('scale', frame=f)
    for fc in fcurves(act):
        if any(fc.data_path.startswith('pose.bones["%s"]' % b) for b in names | moor_names):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
    return act


def _flight(kind, side, i, tt, remaining):
    """Local transform (the bone is upright on the static Root, so local is
    armature-aligned) of a burst clamp dog or bolt `tt` seconds after it shears:
    ballistic flight, a tumble, a bounce, lying on the floor, then gone (scaled to
    nothing over the last 0.3 s of the clip)."""
    if tt <= 0:
        return Matrix.Identity(4)
    s = 1 if side == 'L' else -1
    dx, dy = A.CLAMP_BOLTS[i]
    rng = np.random.default_rng(100 + i * 7 + (0 if s > 0 else 50) + (3 if kind == 'Bolt' else 0))
    out = np.array((np.sign(dx) * s, np.sign(dy) * 0.6, 0.0))
    out /= np.linalg.norm(out)
    if kind == 'Bolt':
        v = out * rng.uniform(2.5, 4.5) + np.array((0, 0, rng.uniform(9.0, 12.0)))
        spin = rng.uniform(700, 1100)
    else:
        v = out * rng.uniform(2.0, 3.2) + np.array((0, 0, rng.uniform(3.5, 5.0)))
        spin = rng.uniform(250, 420)
    t_land = 2 * v[2] / G
    if tt < t_land:
        p = v * tt + np.array((0, 0, -0.5 * G * tt * tt))
        ang = spin * tt
    else:
        p = np.array((v[0], v[1], 0.0)) * t_land
        b = tt - t_land
        p[2] = max(0.0, 1.4 * b - 0.5 * G * b * b) if b < 0.3 else 0.0
        p = p + np.array((v[0], v[1], 0)) * 0.15 * min(b, 0.4)
        ang = spin * t_land + spin * 0.15 * min(b, 0.3)
    ax = Vector((out[1], -out[0], 0.3)).normalized()
    sc = 1.0 if remaining >= 0.3 else max(0.0, remaining / 0.3)
    if kind == 'Clamp':
        # a dog lands on its side: keep its tumble to a quarter turn past upright
        ang = min(ang, 100.0 + 0.0 * ang)
    m = Matrix.Translation(Vector(p)) @ Quaternion(ax, math.radians(ang)).to_matrix().to_4x4()
    return m @ Matrix.Diagonal((sc, sc, sc, 1.0))
