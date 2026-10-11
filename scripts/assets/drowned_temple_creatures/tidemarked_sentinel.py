"""Drowned Temple Warden, an original KayKit-proportioned ceremonial guardian, modelled and rigged in Blender.

Broad stone planes, bronze wave trim, a small tideglass heart, one coral-grown
pauldron and a three-tined ceremonial weapon. No downloaded geometry/textures.
The reference proposal is a mood/silhouette brief, not a copied character.
"""
import math
import bpy

from sea_kit import GLOW, SeaBody, author_clip, expand_bones, loop, over

STONE = (0.38, 0.52, 0.52)
LIGHT = (0.57, 0.67, 0.63)
DARK = (0.22, 0.34, 0.36)
BRONZE = (0.62, 0.44, 0.23)
GOLD = (0.80, 0.64, 0.36)
CYAN = (0.18, 0.79, 0.86)
CORAL = (0.76, 0.37, 0.28)
SEAM = (0.075, 0.13, 0.15)

BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.4)),
    ('Pelvis', 'Root', (0, 0, 1.32), (0, 0, 1.75)),
    ('Torso', 'Pelvis', (0, 0, 1.75), (0, 0, 2.62)),
    ('Head', 'Torso', (0, 0, 2.66), (0, 0, 3.24)),
    ('Arm.L', 'Torso', (0.86, 0, 2.53), (1.03, -0.03, 1.98)),
    ('Fore.L', 'Arm.L', (1.03, -0.03, 1.98), (1.06, -0.12, 1.43)),
    ('Thigh.L', 'Pelvis', (0.37, 0, 1.35), (0.40, 0, 0.76)),
    ('Shin.L', 'Thigh.L', (0.40, 0, 0.76), (0.40, 0, 0.18)),
    ('Weapon', 'Fore.R', (-1.06, -.30, 1.40), (-1.06, -.30, 2.0)),
])


class SentinelBody(SeaBody):
    def finish(self, materials, parent):
        obj = super().finish(materials, parent)
        # hckit already linearizes its sRGB palette before storing BYTE_COLOR.
        # Blender treats those stored bytes as sRGB and would linearize again
        # on glTF export. Assign the already-linear values through the linear
        # accessor so the stone and bronze retain their intended albedo.
        for color in obj.data.color_attributes['Col'].data:
            color.color = color.color_srgb
        return obj


def loft(p, rings, color, sides=20, smooth=True):
    """Hand-profiled elliptical sections (z, x, y, width, depth), not boxes."""
    before = set(p.bm.faces)
    loops = []
    for z, x, y, rx, ry in rings:
        loops.append([p.bm.verts.new((x + rx * math.cos(k * math.tau / sides),
                                     y + ry * math.sin(k * math.tau / sides), z))
                      for k in range(sides)])
    for row in range(len(loops) - 1):
        for k in range(sides):
            face = p.bm.faces.new((loops[row][k], loops[row][(k + 1) % sides],
                                   loops[row + 1][(k + 1) % sides], loops[row + 1][k]))
            face.smooth = smooth
    p.bm.faces.new(list(reversed(loops[0])))
    p.bm.faces.new(loops[-1])
    p._paint(p._new_faces(before), color, 0)


def curve(p, points, radius, color=BRONZE, sides=6, mat=0):
    p.tube(points, [radius] * len(points), color, sides=sides, smooth=True, mat=mat)


def ellipse(p, center, radii, color, mat=0, rings=6, segments=12):
    p.blob(center, radii, color, rings=rings, segments=segments, smooth=True, mat=mat)


def rim(p, z, rx, ry, color=BRONZE, radius=.035, center=(0, 0)):
    curve(p, [(center[0] + rx * math.cos(i * math.tau / 16),
               center[1] + ry * math.sin(i * math.tau / 16), z) for i in range(17)], radius, color)


def body():
    glow = bpy.data.materials['KitGlow'].node_tree
    bsdf = glow.nodes.get('Principled BSDF')
    for link in list(bsdf.inputs['Emission Color'].links):
        glow.links.remove(link)
    bsdf.inputs['Emission Color'].default_value = (0.025, 0.48, 0.58, 1)
    bsdf.inputs['Emission Strength'].default_value = 1.2
    p = SentinelBody('TidemarkedSentinel', seed=42, weather=.06, lichen=0)

    # Anatomical cuisses: wider at the hip, drawn in above the exposed knee.
    for side, suffix in [(1, '.L'), (-1, '.R')]:
        x = side * .39
        p.on('Thigh' + suffix)
        loft(p, [(.80,x,0,.145,.16),(.94,x,0,.19,.20),
                 (1.16,x,0,.245,.26),(1.38,x,0,.22,.23)], STONE, 16)
        p.on('Shin' + suffix)
        ellipse(p,(x,-.075,.77),(.20,.215,.19),BRONZE)
        ellipse(p,(x,-.235,.79),(.145,.085,.16),LIGHT)
        # Greave silhouette follows the calf bulge and the narrow ankle.
        loft(p,[(.19,x,.015,.16,.18),(.30,x,.035,.155,.18),
                (.46,x,.035,.205,.215),(.62,x,0,.23,.24),(.72,x,0,.19,.20)],STONE,16)
        curve(p,[(x,-.23,.67),(x,-.225,.51),(x,-.15,.29)],.024,GOLD)
        rim(p,.26,.17,.19,BRONZE,.026,(x,.025))
        # Rounded armoured foot: toe point, arched instep, heel and ankle.
        loft(p,[(.04,x,-.17,.19,.35),(.095,x,-.20,.23,.40),
                (.19,x,-.18,.22,.36),(.27,x,-.10,.17,.25),
                (.33,x,.015,.145,.16)],LIGHT,20)
        curve(p,[(x-.17,-.41,.14),(x,-.54,.14),(x+.17,-.41,.14)],.022,BRONZE)

    p.on('Pelvis')
    loft(p,[(1.25,0,.025,.47,.28),(1.38,0,.025,.54,.33),
            (1.55,0,0,.49,.32),(1.73,0,0,.43,.29)],DARK,24)
    # Curved belt and overlapping scalloped tassets, not a squared skirt.
    rim(p,1.66,.47,.32,BRONZE,.065)
    ellipse(p,(0,-.348,1.66),(.115,.045,.115),GOLD)
    for side in [-1,1]:
        for index in range(3):
            x=side*(.17+index*.16)
            y=-.31+index*.115
            ellipse(p,(x,y,1.35),(.125,.065,.25-index*.025),LIGHT if index==0 else STONE)
        ellipse(p,(side*.25,.29,1.40),(.22,.06,.22),STONE)

    p.on('Torso')
    # A single anatomical ribcage loft: waist, lower ribs, barrel and clavicles.
    # It narrows in depth as well as width at the waist, unlike a robot slab.
    loft(p,[(1.70,0,0,.42,.28),(1.82,0,.015,.47,.31),
            (2.03,0,.025,.59,.37),(2.26,0,.02,.69,.405),
            (2.43,0,.01,.70,.37),(2.55,0,.025,.57,.30),
            (2.65,0,.035,.28,.20)],STONE,24)
    # A continuous ceremonial cuirass, with a rolled collar framing its seal.
    for side in [-1,1]:
        curve(p,[(side*.61,-.29,2.46),(side*.47,-.42,2.53),
                 (side*.25,-.46,2.51),(side*.10,-.42,2.40)],.035,BRONZE)
        curve(p,[(side*.54,-.26,2.03),(side*.34,-.35,1.96),
                 (side*.10,-.33,1.91)],.024,BRONZE)
    # Bronze tidal seal is oval and nested into the chest, cyan core stays small.
    ellipse(p,(0,-.421,2.29),(.165,.07,.20),BRONZE,rings=8,segments=16)
    ellipse(p,(0,-.481,2.29),(.098,.032,.131),CYAN,GLOW,rings=8,segments=16)
    ellipse(p,(0,0,2.67),(.19,.19,.16),DARK)
    rim(p,2.60,.30,.22,BRONZE,.042,(0,.025))
    # Back armour follows the scapulae and carries three curved wave ribs.
    for side in [-1,1]:
        ellipse(p,(side*.27,.315,2.33),(.29,.10,.28),STONE)
    for z,width in [(1.93,.39),(2.15,.49),(2.39,.43)]:
        curve(p,[(-width,.28,z),(-width*.5,.40,z+.055),(0,.42,z+.07),
                 (width*.5,.40,z+.055),(width,.28,z)],.025,BRONZE)

    for side,suffix in [(1,'.L'),(-1,'.R')]:
        p.on('Arm'+suffix)
        # Articulated round shoulder shell with rolled rim and separate rerebrace.
        loft(p,[(2.37,side*.88,.025,.18,.21),(2.44,side*.88,.025,.29,.30),
                (2.55,side*.87,.02,.36,.36),(2.68,side*.86,.02,.33,.33),
                (2.78,side*.83,.02,.22,.24),(2.83,side*.82,.02,.06,.08)],LIGHT,24)
        rim(p,2.44,.295,.305,BRONZE,.039,(side*.88,.025))
        # An arched bronze rib suggests a scallop shell at the gameplay camera.
        curve(p,[(side*.61,-.16,2.59),(side*.68,-.19,2.75),
                 (side*.84,-.20,2.82),(side*1.00,-.18,2.75),
                 (side*1.15,-.12,2.57)],.023,BRONZE)
        # Broad lateral muscle tapers continuously into the elbow joint.
        loft(p,[(1.98,side*1.03,-.03,.14,.155),(2.11,side*1.01,-.025,.19,.19),
                (2.30,side*.96,0,.215,.22),(2.44,side*.90,0,.19,.20)],STONE,16)
        p.on('Fore'+suffix)
        ellipse(p,(side*1.03,-.03,1.98),(.165,.18,.15),DARK)
        # Vambrace has a visible bulging dorsal ridge and narrow wrist aperture.
        loft(p,[(1.49,side*1.06,-.115,.12,.135),(1.61,side*1.06,-.09,.15,.17),
                (1.81,side*1.05,-.055,.225,.22),(1.94,side*1.03,-.03,.19,.18)],LIGHT,16)
        rim(p,1.53,.14,.155,BRONZE,.034,(side*1.06,-.11))
        curve(p,[(side*1.06,-.25,1.59),(side*1.05,-.28,1.76),
                 (side*1.03,-.22,1.91)],.022,BRONZE)
        # A palm plus four curled fingers, with an opposing thumb over the shaft.
        ellipse(p,(side*1.06,-.13,1.40),(.15,.15,.165),STONE,rings=6,segments=12)
        for index in range(4):
            z=1.30+index*.073
            curve(p,[(side*.96,-.18,z),(side*.98,-.29,z-.015),
                     (side*1.065,-.36,z-.02),(side*1.14,-.30,z)],.039,LIGHT,6)
        curve(p,[(side*1.16,-.09,1.48),(side*1.20,-.22,1.43),
                 (side*1.13,-.31,1.40)],.055,STONE,8)

    p.on('Torso')
    curve(p,[(.46,-.29,2.41),(.41,-.34,2.31),(.46,-.32,2.22)],.009,DARK,5)
    curve(p,[(-.51,-.24,2.10),(-.43,-.29,2.05),(-.42,-.30,1.99)],.008,DARK,5)
    p.on('Arm.L')
    # Two ribbons of deep seaweed cling to the shell rather than hiding it.
    p.tube([(.99,.27,2.63),(1.10,.23,2.40),(1.14,.20,2.20),(1.10,.19,2.06)],
           [.027,.033,.023,.006],(.13,.26,.22),sides=6,squash=.35)
    p.tube([(.89,.32,2.69),(.96,.30,2.46),(.93,.28,2.26)],
           [.022,.030,.005],(.13,.26,.22),sides=6,squash=.35)
    for x,y,z in [(.76,.20,2.79),(.86,.27,2.73),(.71,.22,2.71)]:
        ellipse(p,(x,y,z),(.035,.034,.029),LIGHT,rings=4,segments=8)
    p.on('Head')
    # An ovoid helm and defined cheek/jaw anatomy replace the square toy face.
    loft(p,[(2.70,0,-.065,.13,.17),(2.76,0,-.07,.22,.23),
            (2.90,0,-.025,.285,.28),(3.06,0,.005,.31,.29),
            (3.20,0,.025,.275,.26),(3.30,0,.035,.18,.19),
            (3.34,0,.03,.025,.04)],LIGHT,20)
    for side in [-1,1]:
        # Narrow visor openings, no exposed face, lips or human eye sockets.
        ellipse(p,(side*.14,-.306,3.006),(.111,.021,.022),SEAM,rings=4,segments=12)
        ellipse(p,(side*.14,-.328,3.008),(.078,.009,.009),CYAN,GLOW,rings=4,segments=10)
        curve(p,[(side*.03,-.302,3.065),(side*.115,-.322,3.085),
                 (side*.21,-.294,3.079),(side*.285,-.235,3.06)],.035,BRONZE)
        # Curved cheek guards sweep beneath the eyes to a narrow chin.
        curve(p,[(side*.276,-.205,3.03),(side*.261,-.235,2.90),
                 (side*.20,-.26,2.78),(side*.10,-.272,2.74)],.046,BRONZE)
        # Low side crests return into the brow as part of one ceremonial helm.
        curve(p,[(side*.265,-.17,3.09),(side*.29,-.06,3.20),
                 (side*.25,.08,3.27),(side*.19,.17,3.25)],.036,BRONZE,8)
    # Solid curved lower visor plate; a clean V keel replaces nose and mouth.
    loft(p,[(2.74,0,-.195,.11,.105),(2.82,0,-.20,.19,.115),
            (2.94,0,-.195,.225,.12),(2.977,0,-.20,.225,.10)],STONE,16)
    curve(p,[(-.21,-.27,2.92),(-.13,-.32,2.78),(0,-.319,2.73),
             (.13,-.32,2.78),(.21,-.27,2.92)],.019,BRONZE,6)
    # Single flowing crest follows the helmet, no planar triangular crown.
    loft(p,[(3.21,0,.03,.052,.25),(3.37,0,.03,.065,.20),
            (3.52,0,.055,.047,.14),(3.62,0,.06,.005,.025)],BRONZE,12)
    curve(p,[(0,-.223,3.23),(0,-.178,3.38),(0,-.085,3.53),
             (0,.035,3.62)],.014,GOLD,6)

    p.on('Arm.L')
    # Sparse branching coral grows out of the rear pauldron, clear of the face.
    for x,y,z,lean in [(.78,.18,2.81,-.11),(1.01,.19,2.78,.14),(1.13,.25,2.68,.20)]:
        p.tube([(x,y,z),(x+lean*.4,y+.02,z+.18),(x+lean,y+.02,z+.34)],
               [.057,.044,.012],CORAL,sides=7)
        p.tube([(x+lean*.4,y+.02,z+.17),(x+lean+.09,y-.02,z+.26)],
               [.026,.008],CORAL,sides=6)

    p.on('Weapon')
    tx,ty=-1.06,-.30
    # Long slender shaft with a sculpted swept fork and lanceolate tines.
    p.tube([(tx,ty,.12),(tx,ty,1.4),(tx,ty,2.75),(tx,ty,3.25)],
           [.033,.039,.04,.052],BRONZE,sides=12)
    for z in [.27,1.21,1.62,2.65,3.18]:
        rim(p,z,.055,.055,GOLD,.016,(tx,ty))
    for side in [-1,1]:
        loft(p,[(3.22,tx,ty,.063,.045),(3.28,tx+side*.19,ty,.060,.040),
                (3.47,tx+side*.34,ty,.052,.035),(3.69,tx+side*.36,ty,.038,.025),
                (3.87,tx+side*.32,ty,.001,.001)],GOLD,12)
        loft(p,[(3.51,tx+side*.34,ty,.024,.018),
                (3.68,tx+side*.29,ty,.001,.001)],BRONZE,8)
    p.tube([(tx,ty,3.25),(tx,ty,3.53),(tx,ty,3.80),(tx,ty,4.08),
            (tx,ty,4.21)],[.052,.043,.063,.035,.001],GOLD,sides=10,squash=.55)
    ellipse(p,(tx,ty-.05,3.31),(.065,.03,.10),CYAN,GLOW,rings=6,segments=12)
    return p


def clips(arm):
    stand = {}
    def gait(phase, amp):
        s = math.sin(phase)
        return {'Pelvis': [('z', 3 * s)], 'Torso': [('z', -3 * s)],
                'Thigh.L!': [('x', 20 * s * amp)], 'Thigh.R': [('x', -20 * s * amp)],
                'Shin.L!': [('x', -18 * max(0, s) * amp)], 'Shin.R': [('x', -18 * max(0, -s) * amp)],
                'Arm.L!': [('x', -10 * s * amp)], 'Arm.R': [('x', 5 * s * amp)]}
    author_clip(arm, 'Idle', loop(96, [{'Torso': [('x', v)], 'Head': [('z', v * 1.5)]} for v in [0, 1.0, 0, -1.0]]))
    author_clip(arm, 'Walk', loop(36, [gait(i * math.tau / 8, 1) for i in range(8)]))
    author_clip(arm, 'Run', loop(24, [gait(i * math.tau / 8, 1.35) for i in range(8)]))
    wind = {'Torso': [('z', -18)], 'Arm.R': [('x', 28)], 'Fore.R': [('x', -14)]}
    strike = {'Torso': [('x', 10), ('z', 12)], 'Arm.R': [('x', -75)], 'Fore.R': [('x', -10)], 'Arm.L!': [('x', 20)]}
    author_clip(arm, 'Attack', [(1, stand), (10, wind), (15, strike), (21, strike), (33, stand)], loop=False)
    backhand = {'Torso': [('z', 25)], 'Arm.L!': [('x', -60), ('z', -25)], 'Fore.L!': [('x', -20)]}
    author_clip(arm, 'Attack2', [(1, stand), (10, {'Arm.L!': [('x', -85), ('z', 25)]}), (16, backhand), (30, stand)], loop=False)
    author_clip(arm, 'Hit', [(1, stand), (5, {'Torso': [('x', -9)], 'Head': [('x', -12)]}), (15, stand)], loop=False)
    channel = {'Torso': [('x', -5)], 'Arm.L!': [('x', -72), ('y', -12)], 'Fore.L!': [('x', -25)], 'Head': [('x', -6)]}
    author_clip(arm, 'Cast', loop(48, [channel, over(channel, {'Torso': [('x', -2)]})]))
    # Root pivots at the floor. The final -90 degree roll puts the back on the
    # ground; a small lift accounts for the chest depth. Arms stay alongside it.
    stagger = {'Torso': [('x', -14)], 'Thigh.L': [('x', 12)], 'Shin.L': [('x', -18)]}
    corpse = {'Root': [('x', -90), ('loc', (0, 0, .43))], 'Head': [('z', 12)],
              'Arm.L!': [('y', -10), ('x', -8)], 'Arm.R': [('y', 7), ('x', -6)],
              'Fore.L!': [('x', -12)], 'Fore.R': [('x', -8)],
              'Thigh.L!': [('x', 8), ('y', -4)], 'Thigh.R': [('x', -3)],
              'Shin.L!': [('x', -13)], 'Shin.R': [('x', -9)]}
    author_clip(arm, 'Death', [(1, stand), (10, stagger), (22, {'Root': [('x', -40), ('loc', (0, 0, .20))]}), (36, corpse), (48, corpse)], loop=False)
    return ['Idle', 'Walk', 'Run', 'Attack', 'Attack2', 'Hit', 'Death', 'Cast']


CREATURE = (BONES, body, clips, 2.0, 8.5)
