"""Build the first Eastbrook ferry art prototype in Blender.

Run with Blender in background mode. The unoptimized GLB, editable blend file,
and preview image are written below tmp/asset_src/eastbrook_ferry/.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tmp" / "asset_src" / "eastbrook_ferry"
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, color, roughness=0.8, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


def wood_texture():
    size = 512
    image = bpy.data.images.new("ferry_wood_grain", width=size, height=size, alpha=False)
    pixels = []
    for y in range(size):
        for x in range(size):
            grain = math.sin(y * 0.22 + math.sin(x * 0.035) * 2.6)
            grain += 0.42 * math.sin(y * 0.071 - x * 0.018)
            seam = 0.62 if y % 64 in (0, 1, 2) else 1.0
            knot = math.sin(math.hypot((x - 144) * 0.09, (y - 196) * 0.3))
            tone = (0.75 + 0.055 * grain + 0.025 * knot) * seam
            pixels.extend((0.39 * tone, 0.22 * tone, 0.105 * tone, 1.0))
    image.pixels[:] = pixels
    image.filepath_raw = str(OUT / "ferry_wood_grain.png")
    image.file_format = "PNG"
    image.save()
    mat = material("oiled oak with painted grain", (0.39, 0.22, 0.11))
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
    return mat


OAK = wood_texture()
DARK_OAK = material("tarred deep oak", (0.115, 0.075, 0.05))
BLUE = material("Eastbrook ferry blue", (0.09, 0.29, 0.42), 0.62)
CREAM = material("canvas cream", (0.7, 0.65, 0.48), 0.96)
BRASS = material("weathered brass", (0.58, 0.38, 0.13), 0.46, 0.58)
IRON = material("black forged iron", (0.11, 0.105, 0.095), 0.59, 0.45)
ROPE = material("salted rope", (0.48, 0.37, 0.22), 0.96)


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def box(name, center, scale, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if bevel:
        mod = obj.modifiers.new("soft worn edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.affect = "EDGES"
        obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def beam(name, start, end, radius, mat, vertices=8):
    a, b = Vector(start), Vector(end)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=d.length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    assign(obj, mat)
    return obj


def hull_ring(y, z, half_width):
    return [(-half_width, y, z), (half_width, y, z)]


# Bow points toward positive local Y. The long, uninterrupted middle deck is
# intentional: passengers should be able to move without a mast in the aisle.
stations = [
    (-13.8, 0.15), (-12.4, 2.8), (-10.0, 3.7), (-6.0, 4.25),
    (0.0, 4.35), (6.0, 4.25), (10.0, 3.7), (12.4, 2.8), (13.8, 0.15),
]
verts = []
for y, half in stations:
    verts.extend(hull_ring(y, 0.0, half * 0.58))
    verts.extend(hull_ring(y, 2.0, half))
faces = []
for i in range(len(stations) - 1):
    a, b = i * 4, (i + 1) * 4
    faces.extend([
        (a, b, b + 1, a + 1),
        (a, a + 2, b + 2, b),
        (a + 1, b + 1, b + 3, a + 3),
        (a + 2, b + 2, b + 3, a + 3),
    ])
mesh = bpy.data.meshes.new("ferry_hull_mesh")
mesh.from_pydata(verts, [], faces)
mesh.update()
hull = bpy.data.objects.new("ferry_hull", mesh)
bpy.context.collection.objects.link(hull)
assign(hull, BLUE)
assign(hull, DARK_OAK)
for polygon in mesh.polygons:
    polygon.material_index = 1 if polygon.index % 4 == 0 else 0

# Each deck plank is textured, individually legible and low enough for the
# gameplay support surface to be authored as a simple rectangle later.
for i in range(46):
    y = -11.5 + i * 0.5
    half = 3.55 if abs(y) < 9.5 else 3.1
    box(f"deck plank {i:02d}", (0, y, 2.1), (half * 2, 0.475, 0.11), OAK, 0.028)
    if i % 4 == 0:
        for x in (-half + 0.18, half - 0.18):
            box(f"plank bolt {i} {x:.1f}", (x, y, 2.17), (0.08, 0.08, 0.025), IRON)

for side in (-1, 1):
    for y in (-11, -8, -5, -2, 1, 4, 7, 10, 11.8):
        if y in (-8, -5):
            continue
        half = 3.55 if abs(y) < 10 else 2.9
        x = side * half
        beam(f"rail post {side} {y}", (x, y, 2.15), (x, y, 3.37), 0.11, DARK_OAK)
        box(f"brass rail cap {side} {y}", (x, y, 3.39), (0.26, 0.25, 0.06), BRASS, 0.015)
    for lo, hi in ((-9.8, -9.2), (-4.8, 9.8)):
        beam(f"upper rail {side} {lo}", (side * 3.55, lo, 3.36), (side * 3.55, hi, 3.36), 0.1, OAK)
        beam(f"lower rail {side} {lo}", (side * 3.55, lo, 2.65), (side * 3.55, hi, 2.65), 0.075, OAK)
        box(f"blue gunwale {side} {lo}", (side * 4.0, (lo + hi) / 2, 2.0), (0.31, hi - lo, 0.28), BLUE, 0.08)
    for y in (-9.1, -4.9):
        beam(f"boarding gate post {side} {y}", (side * 3.55, y, 2.15), (side * 3.55, y, 3.45), 0.15, BRASS)

# Keep the boarding side free of cabin and rigging. A short covered wheelhouse
# lives aft, with a playable open deck in front.
box("wheelhouse floor", (0, -9.6, 2.23), (3.8, 3.4, 0.18), DARK_OAK, 0.06)
for x in (-1.7, 1.7):
    for y in (-10.9, -8.3):
        beam(f"wheelhouse post {x} {y}", (x, y, 2.24), (x, y, 4.35), 0.12, OAK)
box("wheelhouse roof", (0, -9.6, 4.42), (4.6, 4.1, 0.26), BLUE, 0.09)
box("wheelhouse canopy", (0, -9.6, 4.58), (4.85, 4.25, 0.075), CREAM, 0.04)
beam("bow mast", (0, 10.65, 2.2), (0, 10.65, 11.6), 0.19, DARK_OAK, 12)
beam("bow yard", (-3.2, 10.65, 9.6), (3.2, 10.65, 9.6), 0.1, OAK)
box("furled cream sail", (0, 10.52, 9.35), (6.1, 0.26, 0.38), CREAM, 0.1)
for side in (-1, 1):
    beam(f"mast stay {side}", (0, 10.65, 11.2), (side * 3.5, 7.5, 2.7), 0.035, ROPE, 6)

for y in (-7.5, -2, 3.5, 8):
    box(f"hull brass band {y}", (0, y, 1.2), (8.2, 0.13, 0.08), BRASS, 0.025)

# Keep the source script object-oriented for editing but ship one mesh with
# one primitive per material, not hundreds of separate draw calls.
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = hull
bpy.ops.object.convert(target="MESH")
bpy.ops.object.join()
bpy.context.object.name = "eastbrook_ferry"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(island_margin=0.01)
bpy.ops.object.mode_set(mode="OBJECT")

# Only the ship enters the GLB. Preview ground, water, camera and lights are
# added after export and stay in the editable blend source only.
bpy.ops.object.select_all(action="SELECT")
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT / "eastbrook_ferry_raw.glb"),
    export_format="GLB",
    export_yup=True,
    use_selection=True,
)

box("preview water", (0, 0, 0.2), (45, 45, 0.08), material("preview sea", (0.05, 0.22, 0.29), 0.28))
bpy.ops.object.camera_add(location=(26, -30, 19))
camera = bpy.context.object
direction = Vector((0, 0, 3.8)) - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 39
bpy.context.scene.camera = camera
bpy.ops.object.light_add(type="AREA", location=(8, -11, 23))
bpy.context.object.data.energy = 2500
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 18
bpy.ops.object.light_add(type="SUN", location=(8, -11, 23))
bpy.context.object.rotation_euler = (0.55, -0.6, -0.5)
bpy.context.object.data.energy = 2.4
bpy.context.scene.world.color = (0.34, 0.38, 0.43)
bpy.context.scene.view_settings.view_transform = "AgX"
bpy.context.scene.view_settings.look = "AgX - Medium High Contrast"
bpy.context.scene.view_settings.exposure = 1.1
bpy.context.scene.render.engine = "BLENDER_EEVEE"
bpy.context.scene.render.resolution_x = 1600
bpy.context.scene.render.resolution_y = 1000
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.filepath = str(OUT / "eastbrook_ferry_preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "eastbrook_ferry.blend"))
bpy.ops.render.render(write_still=True)
