# Gourdlight Eve's item icons, rendered from Blender (woc-item-icon-v1 contract:
# a centred, complete subject on an opaque, dark, painted ground, keyed from the
# top-left with a deep shadow; no text, frame or transparency).
#
#   blender --background --factory-startup --python \
#     scripts/assets/gourdlight_eve/icons.py -- --out <dir>
#
# The carved pumpkin head is the shipped model itself (model.py); the sweet, the
# treat pouch and the Jar of Mischief are built here for their icons only.
# Writes <dir>/<item-id>.png at 512x512 (the master); scripts/convert_item_icons_webp.mjs
# encodes the 128px shipping WebP.

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import model  # noqa: E402  (the shared factory: materials, pumpkins, lanterns)

TAU = math.pi * 2.0


def principled(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0, trans=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    if trans > 0:
        b.inputs["Transmission Weight"].default_value = trans
        b.inputs["IOR"].default_value = 1.45
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "BLENDED"
    return mat


def obj_from_bm(name, bm, mat, collection):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    collection.objects.link(o)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return o


def build_sweet(col):
    """A wrapped harvest sweet: an orange-and-black twist of paper round a round
    toffee, the two ends twisted and fanned out."""
    paper = principled("SweetPaper", (1.0, 0.24, 0.0), rough=0.3)
    stripe = principled("SweetStripe", (0.05, 0.04, 0.05), rough=0.4)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        v.co = Vector((x * 0.55, y * 0.42, z * 0.42))
    body = obj_from_bm("sweet_body", bm, paper, col)
    parts = [body]
    for side in (-1, 1):
        fbm = bmesh.new()
        rings = 8
        sides = 18
        prev = None
        for i in range(rings + 1):
            t = i / rings
            cx = side * (0.5 + t * 0.55)
            r = 0.16 * (1.0 - t) + 0.38 * t * t + 0.05
            ring = []
            for k in range(sides):
                a = k / sides * TAU + t * 1.6 * side
                rr = r * (1.0 + 0.25 * math.cos(a * 6.0) * t)
                ring.append(fbm.verts.new((cx, math.cos(a) * rr, math.sin(a) * rr)))
            if prev:
                for k in range(sides):
                    if side > 0:
                        fbm.faces.new((prev[k], prev[(k + 1) % sides], ring[(k + 1) % sides], ring[k]))
                    else:
                        fbm.faces.new((prev[k], ring[k], ring[(k + 1) % sides], prev[(k + 1) % sides]))
            prev = ring
        end = obj_from_bm("sweet_end_%d" % side, fbm, paper, col)
        sol = end.modifiers.new("s", "SOLIDIFY")
        sol.thickness = 0.02
        parts.append(end)
    # black bands round the middle
    for k, x in enumerate((-0.24, 0.0, 0.24)):
        sbm = bmesh.new()
        bmesh.ops.create_cone(sbm, cap_ends=False, segments=40, radius1=1.0, radius2=1.0, depth=0.07,
                              matrix=Matrix.Translation((x, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        s = obj_from_bm("sweet_band_%d" % k, sbm, stripe, col)
        rx = 0.55 * math.sqrt(max(0.0, 1.0 - (x / 0.55) ** 2)) + 0.006
        s.scale = (1.0, rx / 1.0 * 0.78, rx * 0.78)
        parts.append(s)
    root = bpy.data.objects.new("sweet", None)
    col.objects.link(root)
    for p in parts:
        p.parent = root
    root.rotation_euler = (0.25, 0.0, 0.45)
    return root


def tube(bm, pts, w, sides=8):
    prev = None
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        t = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        n1 = t.cross(up).normalized()
        n2 = t.cross(n1).normalized()
        ring = [bm.verts.new(p + (n1 * math.cos(k / sides * TAU) + n2 * math.sin(k / sides * TAU)) * w) for k in range(sides)]
        if prev:
            for k in range(sides):
                bm.faces.new((prev[k], prev[(k + 1) % sides], ring[(k + 1) % sides], ring[k]))
        prev = ring


def build_pouch(col):
    """A burlap treat pouch, gathered at the neck under an orange cord whose two
    ends hang down the front, a stitched gourd patch on its belly."""
    cloth = principled("PouchCloth", (0.5, 0.33, 0.17), rough=0.95)
    cord = principled("PouchCord", (1.0, 0.36, 0.0), rough=0.55)
    patch = principled("PouchPatch", (1.0, 0.32, 0.0), rough=0.7)
    bm = bmesh.new()
    rings = []
    sides = 40
    # a lathe profile: round belly, pinched neck, a frilled mouth flaring out
    prof = [(0.0, -0.55), (0.42, -0.5), (0.6, -0.3), (0.63, -0.05), (0.55, 0.18), (0.36, 0.34),
            (0.2, 0.42), (0.19, 0.47), (0.27, 0.58), (0.36, 0.66), (0.4, 0.7)]
    for i, (r, z) in enumerate(prof):
        ring = []
        for k in range(sides):
            a = k / sides * TAU
            fold = 1.0 + (0.08 if i >= 7 else 0.035) * math.sin(a * (11 if i >= 7 else 7))
            ring.append(bm.verts.new((math.cos(a) * r * fold, math.sin(a) * r * fold * 0.9, z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    sack = obj_from_bm("pouch_sack", bm, cloth, col)
    sol = sack.modifiers.new("s", "SOLIDIFY")
    sol.thickness = 0.02
    cbm = bmesh.new()
    pts = [Vector((math.cos(a / 30 * TAU) * 0.215, math.sin(a / 30 * TAU) * 0.2, 0.44)) for a in range(31)]
    tube(cbm, pts, 0.03)
    for side in (-1, 1):
        tail = [Vector((side * 0.05 + side * 0.08 * t, -0.23 - 0.4 * math.sin(t * 1.4), 0.42 - 0.36 * t))
                for t in [i / 12 for i in range(13)]]
        tube(cbm, tail, 0.022)
        bmesh.ops.create_icosphere(cbm, subdivisions=1, radius=0.045, matrix=Matrix.Translation(tail[-1]))
    tie = obj_from_bm("pouch_tie", cbm, cord, col)
    # the stitched gourd patch: a ribbed disc on the belly with a little stem
    pbm = bmesh.new()
    center = pbm.verts.new((0, -0.605, -0.12))
    ring = []
    for k in range(36):
        a = k / 36 * TAU
        r = 0.2 * (1.0 - 0.08 * (1 - abs(math.cos(a * 2.5))))
        ring.append(pbm.verts.new((math.cos(a) * r * 1.15, -0.59, -0.12 + math.sin(a) * r * 0.9)))
    for k in range(36):
        pbm.faces.new((center, ring[k], ring[(k + 1) % 36]))
    gourd_patch = obj_from_bm("pouch_patch", pbm, patch, col)
    root = bpy.data.objects.new("pouch", None)
    col.objects.link(root)
    for p in (sack, tie, gourd_patch):
        p.parent = root
    root.rotation_euler = (0.0, 0.0, 0.25)
    return root


def build_jar(col):
    """A squat glass jar, cork stopper tied with black ribbon, green fumes
    swirling inside it and leaking from under the cork."""
    glass = principled("JarGlass", (0.6, 0.85, 0.72), rough=0.06, alpha=0.32)
    cork = principled("JarCork", (0.52, 0.36, 0.2), rough=0.85)
    ribbon = principled("JarRibbon", (0.04, 0.03, 0.05), rough=0.45)
    fume = principled("JarFume", (0.3, 0.95, 0.35), rough=0.6, emit=(0.25, 1.0, 0.2), emit_strength=1.6)
    bm = bmesh.new()
    prof = [(0.0, 0.0), (0.42, 0.0), (0.5, 0.08), (0.52, 0.55), (0.42, 0.72), (0.27, 0.8), (0.27, 0.92), (0.3, 0.95)]
    rings = []
    sides = 40
    for r, z in prof:
        rings.append([bm.verts.new((math.cos(k / sides * TAU) * r, math.sin(k / sides * TAU) * r, z)) for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    jar = obj_from_bm("jar_glass", bm, glass, col)
    sol = jar.modifiers.new("s", "SOLIDIFY")
    sol.thickness = 0.03
    cbm = bmesh.new()
    bmesh.ops.create_cone(cbm, cap_ends=True, segments=24, radius1=0.25, radius2=0.29, depth=0.2,
                          matrix=Matrix.Translation((0, 0, 1.0)))
    stopper = obj_from_bm("jar_cork", cbm, cork, col)
    rbm = bmesh.new()
    bmesh.ops.create_cone(rbm, cap_ends=False, segments=32, radius1=0.285, radius2=0.285, depth=0.06,
                          matrix=Matrix.Translation((0, 0, 0.86)))
    rib = obj_from_bm("jar_ribbon", rbm, ribbon, col)
    sol2 = rib.modifiers.new("s", "SOLIDIFY")
    sol2.thickness = 0.03
    parts = [jar, stopper, rib]
    # the fumes: a twisted glowing wisp coiling up inside and a curl escaping
    fbm = bmesh.new()
    prev = None
    n = 60
    for i in range(n + 1):
        t = i / n
        a = t * TAU * 2.4
        r = 0.22 * (1.0 - 0.4 * t) + 0.05 * math.sin(t * 17.0)
        c = Vector((math.cos(a) * r, math.sin(a) * r, 0.12 + t * 0.6))
        w = 0.07 * (1.0 - 0.6 * abs(t - 0.5))
        ring = [fbm.verts.new(c + Vector((math.cos(k / 8 * TAU) * w, math.sin(k / 8 * TAU) * w, 0))) for k in range(8)]
        if prev:
            for k in range(8):
                fbm.faces.new((prev[k], prev[(k + 1) % 8], ring[(k + 1) % 8], ring[k]))
        prev = ring
    parts.append(obj_from_bm("jar_fume", fbm, fume, col))
    ebm = bmesh.new()
    prev = None
    for i in range(31):
        t = i / 30
        c = Vector((0.27 + t * 0.25 + 0.05 * math.sin(t * 9), 0.05 * math.cos(t * 7), 1.0 + t * 0.35))
        w = 0.04 * (1.0 - t) + 0.008
        ring = [ebm.verts.new(c + Vector((math.cos(k / 8 * TAU) * w, 0, math.sin(k / 8 * TAU) * w))) for k in range(8)]
        if prev:
            for k in range(8):
                ebm.faces.new((prev[k], prev[(k + 1) % 8], ring[(k + 1) % 8], ring[k]))
        prev = ring
    parts.append(obj_from_bm("jar_wisp", ebm, fume, col))
    root = bpy.data.objects.new("jar", None)
    col.objects.link(root)
    for p in parts:
        p.parent = root
    root.rotation_euler = (0.12, 0.0, 0.3)
    return root


def painted_ground(col):
    """The dark painted backdrop: a cyclorama card with a warm-to-umber falloff."""
    mat = bpy.data.materials.new("Backdrop")
    mat.use_nodes = True
    nt = mat.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 3.5
    tex.inputs["Detail"].default_value = 6.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.035, 0.022, 0.018, 1)
    ramp.color_ramp.elements[1].color = (0.11, 0.06, 0.035, 1)
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 1.0
    me = bpy.data.meshes.new("backdrop")
    me.from_pydata([(-6, 3, -3), (6, 3, -3), (6, 3, 6), (-6, 3, 6)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new("backdrop", me)
    me.materials.append(mat)
    col.objects.link(o)
    return o


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.015, 0.012, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.4
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "AREA"))
    key.data.energy = 220
    key.data.size = 1.6
    key.location = (-2.6, -2.4, 3.2)
    key.rotation_euler = (Vector((0, 0, 0.3)) - key.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(key)
    rim = bpy.data.objects.new("rim", bpy.data.lights.new("rim", "AREA"))
    rim.data.energy = 60
    rim.data.color = (1.0, 0.7, 0.4)
    rim.location = (2.4, 1.5, 1.8)
    rim.rotation_euler = (Vector((0, 0, 0.3)) - rim.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(rim)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def frame(cam, obj, pad=1.3):
    bpy.context.view_layer.update()
    pts = []
    for o in [obj] + list(obj.children_recursive):
        if o.type == "MESH":
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.z - lo.z, hi.y - lo.y)
    cam.location = ctr + Vector((0.0, -6.0, 1.4))
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = size * pad


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = argv[argv.index("--out") + 1]
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene, cam = setup_scene()
    col = bpy.data.collections.new("icons")
    scene.collection.children.link(col)
    painted_ground(col)
    # the head: the shipped factory's own pumpkin head, its glow up
    head_col = bpy.data.collections.new("head")
    scene.collection.children.link(head_col)
    _, (head,) = model.build_head(head_col)
    for m in bpy.data.materials:
        if m.name in ("GourdFlesh", "GourdInner", "GourdGlow"):
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Emission Strength"].default_value = 5.0
    head.rotation_euler = (0.0, 0.0, -0.35)
    subjects = {
        "carved_pumpkin_head": head,
        "gourdlight_sweet": build_sweet(col),
        "gourdlight_treat_pouch": build_pouch(col),
        "jar_of_mischief": build_jar(col),
    }
    for o in subjects.values():
        o.hide_render = True
        for c in o.children_recursive:
            c.hide_render = True
    for item_id, o in subjects.items():
        o.hide_render = False
        for c in o.children_recursive:
            c.hide_render = False
        frame(cam, o, 1.25 if item_id != "gourdlight_sweet" else 1.15)
        scene.render.filepath = os.path.join(out, item_id + ".png")
        bpy.ops.render.render(write_still=True)
        o.hide_render = True
        for c in o.children_recursive:
            c.hide_render = True


if __name__ == "__main__":
    main()
