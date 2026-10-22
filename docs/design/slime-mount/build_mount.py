"""Paint, rig and animate the slime mount, then export a GLB.

blender --background --python build_mount.py -- <slime_static.glb> <out.glb>

The same clip list and seat contract as the gold sprite mount
(docs/design/sprite-mount on feat/gold-sprite-mount): Idle, Walk, Run, Jump at
30 fps, and a `saddle` bone the rider sits on. The slime sits on the ground in
its idle (the sprite hovers) and hops to move, and everything jiggles.

Rig: root -> move (translation, yaw) -> squash (scale, pivot on the ground so
the slime stays planted) -> base -> mid -> top, a three-bone jelly spine. The
body and the lower tack blend along the spine by height, so leaning the spine
bones by different amounts bends the jelly and lets the top lag behind or
overshoot the bottom. move -> saddle carries the seat, cap and pommel rigidly:
every frame it is placed where the spine carries the top of the body, turned
with it but never squashed, so the saddle keeps its shape and the rider rides
the wobble (MountSeatSpec bone `saddle`). Bone space for every bone: X right,
Y up, Z toward the viewer (the mount's front, Blender -Y).

The body texture is painted here: a sky-blue jelly gradient with an aqua glow
at its base, soft highlights and suspended bubbles, equirect over the body
(u = (phi + pi) / 2pi with phi = 0 at the front, v = 1 - theta / 180).
"""
import math
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

src_glb, out_glb = sys.argv[sys.argv.index("--") + 1 :]
FPS = 30


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


# --- scene: the static mount -------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS
bpy.ops.import_scene.gltf(filepath=src_glb)
body = next(o for o in sc.objects if o.type == "MESH")
body.name = "slime"
body.data.transform(body.matrix_world)
body.matrix_world = Matrix.Identity(4)
mesh = body.data
mesh.name = "slime"
for im in bpy.data.images:  # the Tripo maps, named for what they are
    for kind in ("Color", "ORM", "NormalGL"):
        if im.name.startswith(kind + "_"):
            im.name = "SlimeTack" + kind
slime_index = next(i for i, m in enumerate(mesh.materials) if m.name == "slime")
jelly_z = [mesh.vertices[v].co.z for p in mesh.polygons if p.material_index == slime_index for v in p.vertices]
H = max(jelly_z)  # top of the jelly, under the seat
print("BODY top", round(H, 3))

# --- body texture ------------------------------------------------------------------
TW, TH = 1024, 512
STOPS = [  # (theta from the top, sRGB)
    (0, (0.46, 0.78, 1.0)),
    (55, (0.22, 0.60, 0.99)),
    (105, (0.10, 0.44, 0.95)),
    (150, (0.14, 0.60, 1.0)),
    (180, (0.50, 0.96, 1.0)),
]
# (theta, phi, radius in radians of arc): phi 0 at the front, + toward the left.
BUBBLES = [
    (100, 1.95, 0.15), (116, 1.30, 0.07), (122, 2.45, 0.045), (128, 0.95, 0.17),
    (94, 2.70, 0.05), (118, 2.95, 0.11), (108, -1.40, 0.16), (126, -2.05, 0.09),
    (105, -0.70, 0.06), (131, -0.45, 0.13), (96, 0.35, 0.07), (114, -2.80, 0.07),
    (88, -2.35, 0.045), (124, 0.20, 0.045), (86, -1.05, 0.04), (87, 1.55, 0.045),
    (138, 1.70, 0.05), (140, -1.75, 0.06), (92, 3.10, 0.04), (110, 0.75, 0.035),
]
BUBBLE_IN, BUBBLE_RIM, GLINT = np.array((0.42, 0.80, 1.0)), np.array((0.82, 0.97, 1.0)), np.array((0.97, 1.0, 1.0))

th = np.radians(180 * (1 - (np.arange(TH) + 0.5) / TH))[:, None] * np.ones((1, TW))
ph = (-np.pi + 2 * np.pi * (np.arange(TW) + 0.5) / TW)[None, :] * np.ones((TH, 1))
deg = np.degrees(th)
col = np.zeros((TH, TW, 3))
for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
    t = np.clip((deg - a) / (b - a), 0, 1)
    t = t * t * (3 - 2 * t)
    seg = (deg >= a) & (deg <= b)
    for k in range(3):
        col[..., k] = np.where(seg, ca[k] + (cb[k] - ca[k]) * t, col[..., k])
D = np.stack([np.sin(th) * np.sin(ph), -np.sin(th) * np.cos(ph), np.cos(th)], -1)
# Watery mottling: a few slow waves across the direction sphere.
mott = (np.sin(5.1 * D[..., 0] + 2.3 * D[..., 2]) * np.sin(4.3 * D[..., 1] - 3.1 * D[..., 2] + 0.7)
        + 0.6 * np.sin(9.7 * D[..., 2] + 3.3 * D[..., 0]) * np.sin(7.9 * D[..., 1]))
col *= 1 + 0.05 * mott[..., None]
# Soft gloss: a lighter crown and two long highlights high on the flanks.
col += (0.10 * np.exp(-((deg - 28) / 16) ** 2))[..., None]
for hp in (1.25, -1.25):
    dph = np.angle(np.exp(1j * (ph - hp)))
    col += (0.16 * np.exp(-((deg - 62) / 9) ** 2 - (dph / 0.22) ** 2))[..., None]


def unit(t, p):
    t = math.radians(t)
    return np.array((math.sin(t) * math.sin(p), -math.sin(t) * math.cos(p), math.cos(t)))


for bt, bp, br in BUBBLES:
    c = unit(bt, bp)
    up = unit(bt - math.degrees(br) * 0.45, bp)  # the glint sits high on the bubble
    ang = np.arccos(np.clip(D @ c, -1, 1))
    s = ang / br
    inside = s < 1
    w_in = np.where(inside, 0.22 + 0.25 * s**2, 0.0)
    col = col * (1 - w_in[..., None]) + BUBBLE_IN * w_in[..., None]
    rim = np.clip(1 - np.abs(s - 0.9) / 0.12, 0, 1) * 0.65
    col = col * (1 - rim[..., None]) + BUBBLE_RIM * rim[..., None]
    g = np.clip(1 - np.arccos(np.clip(D @ up, -1, 1)) / (0.22 * br), 0, 1)
    g = 0.9 * g * g * (3 - 2 * g)
    col = col * (1 - g[..., None]) + GLINT * g[..., None]
col = np.clip(col, 0, 1)
px = np.concatenate([col, np.ones((TH, TW, 1))], -1).reshape(-1)  # row 0 is v = 0, the bottom
img = bpy.data.images.new("SlimeColor", TW, TH)
img.pixels[:] = px.astype(np.float32)
img.pack()
mat = mesh.materials[slime_index]
nt = mat.node_tree
tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
tex.image = img
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Roughness"].default_value = 0.25
nt.links.new(tex.outputs[0], bsdf.inputs["Emission Color"])  # jelly glows a little in shade
bsdf.inputs["Emission Strength"].default_value = 0.25

# --- armature -----------------------------------------------------------------------
arm_data = bpy.data.armatures.new("SlimeRig")
rig = bpy.data.objects.new("SlimeRig", arm_data)
sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
SPINE = [("base", 0.0, 0.4), ("mid", 0.4, 0.75), ("top", 0.75, 1.0)]
parent = None
for name, a, b in [("root", 0, 0.3), ("move", 0, 0.3), ("squash", 0, 0.3)] + SPINE:
    bone = eb.new(name)
    bone.head, bone.tail = (0, 0, a * H), (0, 0, b * H)
    bone.roll = 0
    bone.parent, bone.use_connect = parent, False
    parent = bone
saddle = eb.new("saddle")
saddle.head, saddle.tail = (0, 0, H), (0, 0, 1.3 * H)
saddle.roll = 0
saddle.parent, saddle.use_connect = eb["move"], False
bpy.ops.object.mode_set(mode="OBJECT")
m = arm_data.bones["move"].matrix_local.to_3x3()
assert (m.col[0] - Vector((1, 0, 0))).length < 1e-5, m
assert (m.col[2] - Vector((0, -1, 0))).length < 1e-5, m

# Weights by rest height: the spine blends base -> mid -> top up the body, and
# everything near the top (the seat, its cap and pommel, the body just under it)
# rides the saddle bone. The blanket, straps and stirrups below follow the jelly.
SADDLE_NONE, SADDLE_FULL = H - 0.22 * H, H - 0.10 * H
groups = {n: body.vertex_groups.new(name=n) for n in ("base", "mid", "top", "saddle")}
for v in mesh.vertices:
    z = v.co.z
    h = z / H
    ws = smooth((z - SADDLE_NONE) / (SADDLE_FULL - SADDLE_NONE))
    wb = 1 - smooth((h - 0.15) / 0.35)
    wt = smooth((h - 0.55) / 0.35)
    wm = max(0.0, 1 - wb - wt)
    for n, w in (("base", wb), ("mid", wm), ("top", wt)):
        if w * (1 - ws) > 1e-4:
            groups[n].add([v.index], w * (1 - ws), "REPLACE")
    if ws > 1e-4:
        groups["saddle"].add([v.index], ws, "REPLACE")
body.parent = rig
body.modifiers.new("Armature", "ARMATURE").object = rig


# --- motion helpers -----------------------------------------------------------------
def pose(up=0.0, sy=1.0, lean=0.0, side=0.0, yaw=0.0):
    """`up`: height off the ground (model units); `sy`: vertical squash with
    volume kept; `lean`: forward bend of the jelly spine (radians at the top,
    + toward the front); `side`: bend toward the mount's left; `yaw`: turn."""
    return dict(up=up, sy=sy, lean=lean, side=side, yaw=yaw)


def ring(x, f, tau, period=None, phase=math.pi / 2):
    """A damped wobble starting at x = 0: cos-shaped by default (starts at its
    peak), sin-shaped with phase 0. With `period`, the tails of earlier cycles
    are summed in, so a looped clip carries its jiggle across the seam."""
    total = 0.0
    for k in range(6 if period else 1):
        xx = x + k * (period or 0.0)
        if xx >= 0:
            total += math.exp(-xx / tau) * math.sin(2 * math.pi * f * xx + phase)
    return total


def bump(p, a, b):
    """A smooth hump over [a, b], zero outside."""
    if p <= a or p >= b:
        return 0.0
    return math.sin(math.pi * (p - a) / (b - a)) ** 2


def wave(t, period, amp, phase=0.0):
    return amp * math.sin(2 * math.pi * (t / period + phase))


# --- clips --------------------------------------------------------------------------
# Idle: sat on the ground, breathing, swaying, with two little shivers.
IDLE_LEN = 6.0


def idle(t):
    sy = 1 + wave(t, 3.0, 0.02)
    lean = wave(t, 2.0, 0.015) + wave(t, 1.2, 0.006, 0.3)
    side = wave(t, 3.0, 0.018, 0.2) + wave(t, 0.75, 0.004)
    for at, amp, tilt in ((1.3, 0.045, 0.0), (3.9, 0.035, 0.03)):
        if t > at:
            sy -= amp * ring(t - at, 3.0, 0.32)
            side += tilt * ring(t - at, 2.4, 0.36, phase=0.0)
    return pose(sy=sy, lean=lean, side=side, yaw=wave(t, 6.0, 0.04))


def hop(t, length, air_from, height, land, squash_in, stretch, lag, follow, f, tau, tilt=0.0):
    """One slime hop per loop: lands at t = 0 and jiggles down from it, gathers
    (squashes) before take-off at `air_from` of the cycle, stretches as it
    leaves the ground. The top lags back on take-off and carries on forward
    when it lands. Earlier landings' jiggle carries over the loop seam."""
    p = (t / length) % 1.0
    a = max(0.0, (p - air_from) / (1 - air_from))
    up = height * 4 * a * (1 - a) if p > air_from else 0.0
    sy = 1 - land * ring(t, f, tau, length)
    sy -= squash_in * bump(p, air_from - 0.14, air_from + 0.02)
    if p > air_from:
        sy += stretch * math.sin(math.pi * a) * (1 - a) * 2.5
    lean = tilt + follow * ring(t, f * 0.8, tau * 1.3, length, phase=0.0)
    lean -= lag * bump(p, air_from - 0.02, air_from + 0.3 * (1 - air_from))
    side = 0.012 * math.sin(2 * math.pi * p)
    return pose(up=up, sy=sy, lean=lean, side=side)


WALK_LEN = 1.0
RUN_LEN = 0.9  # 27 frames: whole frames so the loop closes


def walk(t):
    return hop(t, WALK_LEN, 0.45, 0.07 * H, land=0.09, squash_in=0.06, stretch=0.035,
               lag=0.05, follow=0.06, f=2.8, tau=0.18)


def run(t):
    return hop(t, RUN_LEN, 0.35, 0.26 * H, land=0.14, squash_in=0.08, stretch=0.05,
               lag=0.07, follow=0.08, f=3.2, tau=0.15, tilt=0.05)


# Jump spans the game's own airtime (2 x 6 / 16 = 0.75 s): gather, spring off
# with a stretch that wobbles out in the air, and end neutral on the ground pose
# because the game holds the last frame through a fall.
JUMP_LEN = 0.8
JUMP_UP = 0.55 * H


def jump(t):
    if t < 0.1:
        k = smooth(t / 0.1)
        return pose(sy=lerp(1.0, 0.78, k), lean=-0.02 * k)
    x = t - 0.1
    a = min(x / 0.6, 1.0)
    sy = 1 - 0.22 * ring(x, 3.0, 0.2) + 0.06 * math.sin(math.pi * a)
    lean = -0.02 - 0.08 * ring(x, 2.5, 0.22, phase=0.0)
    side = 0.03 * ring(x, 2.2, 0.25, phase=0.0)
    k = smooth((t - 0.62) / 0.18)
    return pose(up=JUMP_UP * 4 * a * (1 - a), sy=lerp(sy, 1.0, k), lean=lerp(lean, 0.0, k), side=lerp(side, 0.0, k))


CLIPS = [
    ("Idle", IDLE_LEN, idle),
    ("Walk", WALK_LEN, walk),
    ("Run", RUN_LEN, run),
    ("Jump", JUMP_LEN, jump),
]

# --- bake ---------------------------------------------------------------------------
SPINE_SHARE = {"base": 0.25, "mid": 0.4, "top": 0.35}  # of the lean, per spine bone
pb = rig.pose.bones
for b in pb:
    b.rotation_mode = "QUATERNION"
rig.animation_data_create()
SEAT = Vector((0, 0, H))  # armature space, rest
top_rest_inv = arm_data.bones["top"].matrix_local.inverted()
saddle_rest = arm_data.bones["saddle"].matrix_local.copy()
for clip, length, fn in CLIPS:
    action = bpy.data.actions.new(f"Slime_{clip}")
    rig.animation_data.action = action
    for f in range(round(length * FPS) + 1):
        p = fn(f / FPS)
        sxz = 1 / math.sqrt(p["sy"])
        pb["move"].location = (0.0, p["up"], 0.0)
        pb["move"].rotation_quaternion = Matrix.Rotation(p["yaw"], 3, "Y").to_quaternion()
        pb["squash"].scale = (sxz, p["sy"], sxz)
        for name, share in SPINE_SHARE.items():
            pb[name].rotation_quaternion = (
                Matrix.Rotation(p["lean"] * share, 3, "X") @ Matrix.Rotation(-p["side"] * share, 3, "Z")
            ).to_quaternion()
        bpy.context.view_layer.update()
        # The seat goes where the spine carries the top of the body, turned with
        # the top bone but unscaled.
        carry = pb["top"].matrix @ top_rest_inv
        seat = carry @ SEAT
        turn = carry.to_3x3().normalized().to_4x4()
        pb["saddle"].matrix = Matrix.Translation(seat) @ turn @ Matrix.Translation(-SEAT) @ saddle_rest
        bpy.context.view_layer.update()
        for b in ("move", "squash", "base", "mid", "top", "saddle"):
            for path in ("location", "rotation_quaternion", "scale"):
                pb[b].keyframe_insert(path, frame=f)  # full TRS per bone, no stale values
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 0, action)

for b in pb:  # rest pose for the bind
    b.location, b.scale = (0, 0, 0), (1, 1, 1)
    b.rotation_quaternion = (1, 0, 0, 0)

for screen in bpy.data.screens:  # open the .blend textured, not in plain Solid
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces[0].shading.type = "MATERIAL"
bpy.ops.wm.save_as_mainfile(filepath=out_glb.replace(".glb", ".blend"))
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    export_animation_mode="NLA_TRACKS",
    export_frame_range=False,
    export_force_sampling=True,
    export_optimize_animation_size=False,
)
print("EXPORTED", out_glb, [c[0] for c in CLIPS])
