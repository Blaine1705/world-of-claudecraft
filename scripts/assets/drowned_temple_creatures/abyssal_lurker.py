"""Original amphibious temple hunter, authored in Blender through the sea kit.

Low four-legged silhouette, shovel jaw, webbed paws and a broken coral ridge.
The user's proposal supplies only the aquatic predator direction; proportions,
topology, palette and animation are original, deliberately matching KayKit.
Budget: target 12k / ceiling 18k triangles, two material buckets, no textures,
500 KiB shipping ceiling. Authoring units are yards, Z up, facing -Y.
"""
import math

from sea_kit import GLOW, SeaBody, apply_pose, author_clip, expand_bones, loop, merge

SKIN = (0.25, 0.46, 0.48)
SHADE = (0.16, 0.31, 0.35)
BELLY = (0.55, 0.65, 0.57)
PLATE = (0.25, 0.38, 0.43)
CORAL = (0.67, 0.39, 0.32)
TIP = (0.83, 0.59, 0.44)
MOUTH = (0.10, 0.17, 0.21)
IVORY = (0.86, 0.85, 0.68)
CYAN = (0.32, 0.90, 0.91)


class LurkerBody(SeaBody):
    def finish(self, materials, parent):
        obj = super().finish(materials, parent)
        # The inherited kit writes linear values into sRGB BYTE_COLOR storage.
        # Reinterpret those stored values as linear before glTF export; otherwise
        # Blender linearizes them again and the intended teal becomes near-black.
        for color in obj.data.color_attributes['Col'].data:
            color.color = color.color_srgb
        return obj

BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.4)),
    ('Body', 'Root', (0, 0.7, 1.0), (0, -0.8, 1.1)),
    ('Head', 'Body', (0, -0.95, 1.15), (0, -2.2, 1.0)),
    ('Jaw', 'Head', (0, -1.2, 0.88), (0, -2.4, 0.72)),
    ('Throat', 'Head', (0, -1.0, 0.8), (0, -1.5, 0.7)),
    ('Tail1', 'Body', (0, 1.5, 1.0), (0, 2.7, 0.8)),
    ('Tail2', 'Tail1', (0, 2.7, 0.8), (0, 4.1, 0.5)),
    ('Arm.L', 'Body', (0.72, -0.65, 1.0), (1.45, -0.8, 0.65)),
    ('Hand.L', 'Arm.L', (1.45, -0.8, 0.65), (1.72, -1.5, 0.18)),
    ('Leg.L', 'Body', (0.72, 0.9, 0.95), (1.5, 1.5, 0.65)),
    ('Foot.L', 'Leg.L', (1.5, 1.5, 0.65), (1.8, 0.85, 0.16)),
])


def body():
    p = LurkerBody('AbyssalLurker', lichen=0, weather=0.08)

    def mass(center, radii, color, **kw):
        return p.blob(center, radii, color, rings=6, segments=10, **kw)

    p.on('Body')
    mass((0, 0.25, 1.04), (0.94, 1.68, 0.65), SKIN, bulge=0.10)
    mass((0, 0.12, 0.69), (0.77, 1.35, 0.34), BELLY)
    # Interlocking broad scutes read as armor, not hundreds of noisy scales.
    for k in range(5):
        y = -0.65 + k * 0.5
        z = 1.62 - abs(k - 2) * 0.06
        mass((0, y, z), (0.66 - abs(k - 2) * 0.06, 0.37, 0.18), PLATE,
             pitch=-0.12, smooth=False)
        p.cone((0, y + 0.06, z + 0.1), (0, y + 0.28, z + 0.56 - k * 0.04),
               0.16, CORAL, sides=5)
        for s in (-1, 1):
            mass((s * 0.75, y, 1.31), (0.23, 0.32, 0.13), PLATE,
                 roll=s * 0.65, smooth=False)
    # Two short branched coral pieces: visible silhouette, bounded clutter.
    for s in (-1, 1):
        p.tube([(s * 0.55, 0.8, 1.55), (s * 0.75, 0.95, 1.96),
                (s * 0.82, 1.08, 2.26)], [0.10, 0.07, 0.025], CORAL, sides=5, smooth=False)
        p.cone((s * 0.71, 0.93, 1.90), (s * 1.0, 1.00, 2.12), 0.06, TIP, sides=5)
    p.on('Head')
    mass((0, -1.55, 1.2), (1.03, 0.96, 0.51), SKIN, bulge=0.10)
    mass((0, -2.12, 1.02), (0.96, 0.48, 0.26), SHADE)
    # Broad inset mouth and heavy brow give a predator expression at play zoom.
    mass((0, -2.30, 0.87), (0.79, 0.30, 0.10), MOUTH)
    for s in (-1, 1):
        mass((s * 0.72, -1.82, 1.48), (0.22, 0.30, 0.18), SHADE)
        mass((s * 0.80, -1.95, 1.51), (0.12, 0.17, 0.095), CYAN, mat=GLOW)
        mass((s * 0.78, -1.85, 1.62), (0.27, 0.33, 0.095), PLATE,
             roll=s * -0.18, smooth=False)
        # Three clean gill folds; only the central slit is emissive.
        for j in range(3):
            mass((s * (0.91 - j * 0.02), -1.28 + j * 0.15, 1.15),
                 (0.07, 0.045, 0.20 - j * 0.03), CYAN if j == 1 else SHADE,
                 mat=GLOW if j == 1 else 0)
        p.cone((s * 0.66, -1.11, 1.55), (s * 0.94, -0.79, 1.88), 0.17, CORAL, sides=5)
        for j in range(4):
            x = s * (0.22 + 0.17 * j)
            p.cone((x, -2.47 + j * 0.08, 0.92),
                   (x, -2.48 + j * 0.08, 0.73 - (j % 2) * 0.07), 0.06, IVORY, sides=5)
    p.on('Jaw')
    mass((0, -1.92, 0.69), (0.89, 0.72, 0.21), BELLY)
    mass((0, -2.02, 0.81), (0.72, 0.55, 0.055), MOUTH)
    for s in (-1, 1):
        for j in range(3):
            p.cone((s * (0.30 + j * 0.17), -2.48 + j * 0.12, 0.8),
                   (s * (0.30 + j * 0.17), -2.47 + j * 0.12, 0.98), 0.045, IVORY, sides=5)
    p.on('Throat')
    mass((0, -1.12, 0.72), (0.65, 0.63, 0.29), BELLY)
    for bone, pts, radii in [
        ('Tail1', [(0, 1.35, 1.03), (0, 2.0, 0.95), (0, 2.7, 0.8)], [0.57, 0.41, 0.29]),
        ('Tail2', [(0, 2.7, 0.8), (0, 3.5, 0.65), (0, 4.35, 0.36)], [0.29, 0.20, 0.03]),
    ]:
        p.on(bone)
        p.tube(pts, radii, SKIN, sides=10, squash=0.8)
        for j in range(2):
            a, b = pts[j], pts[j + 1]
            p.cone((0, a[1] + 0.24, a[2] + radii[j] * 0.7),
                   (0, a[1] + 0.5, a[2] + radii[j] + 0.18), radii[j] * 0.3, PLATE, sides=5)
    for s, suffix in ((1, '.L'), (-1, '.R')):
        for upper, lower, hip, knee, toe, thick in [
            ('Arm', 'Hand', (0.72, -0.65, 1), (1.45, -0.8, 0.65), (1.72, -1.5, 0.18), 0.28),
            ('Leg', 'Foot', (0.72, 0.9, 0.95), (1.5, 1.5, 0.65), (1.8, 0.85, 0.16), 0.40),
        ]:
            a, b, c = [(s * v[0], v[1], v[2]) for v in (hip, knee, toe)]
            p.on(upper + suffix)
            p.tube([a, b], [thick, thick * 0.8], SKIN, sides=10)
            mass(b, (thick, thick, thick), SKIN)
            p.on(lower + suffix)
            p.tube([b, c], [thick * 0.75, 0.18], SHADE, sides=8)
            mass((c[0], c[1] - 0.10, 0.16), (0.39, 0.38, 0.15), SKIN)
            # Webbed paddle and three short ivory toe tips (never insect legs).
            for j in (-1, 0, 1):
                p.tube([(c[0] + j * 0.20, c[1] - 0.14, 0.16),
                        (c[0] + j * 0.26, c[1] - 0.45, 0.10)], [0.115, 0.07], SKIN, sides=6)
                p.cone((c[0] + j * 0.26, c[1] - 0.43, 0.10),
                       (c[0] + j * 0.28, c[1] - 0.61, 0.075), 0.065, IVORY, sides=5)
    return p


def clips(arm):
    stand = {'Jaw': [('x', 3)]}

    def idle(ph):
        return merge(stand, {'Body': [('loc', (0, 0, 0.025 * math.sin(ph)))],
            'Tail1': [('z', 5 * math.sin(ph))], 'Tail2': [('z', 9 * math.sin(ph - 0.8))],
            'Throat': [('scale', 1 + 0.025 * math.sin(ph))]})

    author_clip(arm, 'Idle', loop(72, [idle(i * math.tau / 8) for i in range(8)]))

    def gait(ph, amp=1):
        a = math.sin(ph)
        pose = {'Body': [('z', 3 * a)], 'Root': [('loc', (0, 0, 0.04 * abs(a)))],
                'Tail1': [('z', -7 * a)], 'Tail2': [('z', -10 * math.sin(ph - 0.8))]}
        for side, sign in (('.L', 1), ('.R', -1)):
            for limb, foot, phase in (('Arm', 'Hand', sign), ('Leg', 'Foot', -sign)):
                swing = a * phase
                pose[limb + side + '!'] = [('z', 16 * swing * amp), ('x', 10 * max(swing, 0) * amp)]
                pose[foot + side + '!'] = [('x', -12 * max(swing, 0) * amp)]
        return merge(stand, pose)

    author_clip(arm, 'Walk', loop(32, [gait(i * math.tau / 8) for i in range(8)]))
    author_clip(arm, 'Run', loop(20, [gait(i * math.tau / 8, 1.5) for i in range(8)]))
    rear = merge(stand, {'Head': [('x', -16)], 'Jaw': [('x', 25)], 'Body': [('x', -5)]})
    bite = merge(stand, {'Head': [('x', 12)], 'Body': [('loc', (0, -0.22, 0))], 'Jaw': [('x', -3)]})
    author_clip(arm, 'Attack', [(1, stand), (8, rear), (12, bite), (25, stand)], loop=False)
    rake = merge(rear, {'Arm.L!': [('x', -24), ('z', -20)], 'Body': [('z', 8)]})
    land = merge(bite, {'Arm.L!': [('x', 12), ('z', 20)], 'Body': [('z', -8)]})
    author_clip(arm, 'Attack2', [(1, stand), (9, rake), (15, land), (28, stand)], loop=False)
    hit = merge(stand, {'Head': [('x', -12)], 'Body': [('loc', (0, 0.12, -0.08))]})
    author_clip(arm, 'Hit', [(1, stand), (4, hit), (13, stand)], loop=False)
    # A side collapse and folded limbs distinguish the corpse from the crouch.
    # Seat the actual deformed mesh, not an estimated rest-pose bounding box.
    dead = {'Body': [('y', 76), ('z', 7)], 'Head': [('x', 7), ('z', -8)],
            'Jaw': [('x', 12)], 'Arm.L': [('z', -26), ('x', -8)], 'Hand.L': [('x', 25)],
            'Leg.L': [('z', 22)], 'Foot.L': [('x', 30)],
            'Tail1': [('z', 18)], 'Tail2': [('z', 24)]}
    import bpy
    arm.animation_data.action = None
    apply_pose(arm, dead)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    floor = min((obj.matrix_world @ vertex.co).z
                for obj in bpy.context.scene.objects if obj.type == 'MESH'
                for vertex in obj.evaluated_get(graph).data.vertices)
    dead['Root'] = [('loc', (0, 0, -floor + 0.025))]
    author_clip(arm, 'Death', [(1, idle(0)), (6, hit), (19, dead), (34, dead)], loop=False)
    gather = merge(stand, {'Body': [('loc', (0, 0.12, -0.13))], 'Head': [('x', -10)],
                         'Jaw': [('x', 24)], 'Throat': [('scale', 1.18)]})
    author_clip(arm, 'Cast', loop(24, [gather, merge(gather, {'Throat': [('scale', 1.04)]})]))
    spit = merge(bite, {'Jaw': [('x', 32)], 'Throat': [('scale', 0.85)]})
    author_clip(arm, 'Spit', [(1, gather), (12, gather), (16, spit), (30, stand)], loop=False)
    flight = merge(stand, {'Head': [('x', -8)], 'Arm.L': [('x', -25)],
                          'Leg.L': [('x', 20)], 'Tail1': [('x', 10)]})
    author_clip(arm, 'Leap', [(1, gather), (7, flight), (17, flight), (24, stand)], loop=False)
    return ['Idle', 'Walk', 'Run', 'Attack', 'Attack2', 'Hit', 'Death', 'Cast', 'Spit', 'Leap']


CREATURE = (BONES, body, clips, 1.0, 10.5)
