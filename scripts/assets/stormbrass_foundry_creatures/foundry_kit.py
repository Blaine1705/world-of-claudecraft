"""The Stormbrass Foundry's creature kit: machines and their engineers, built in
Blender from code on the Hollow Crypt organic kit (hollow_crypt_creatures/
organic_kit.py) and its posing rig (build_morthen.RollRig).

What this kit adds for brass-and-iron machines:

  * MATERIALS. Five, every one but the glow baked into ONE albedo atlas (with
    its ambient occlusion) plus a tangent normal map:
      CreatureBody      painted iron, rubber, leather, cloth: grime, water
                        streaks running down, worn edges (Cycles pointiness);
      CreatureMetal     brass, copper and bright iron: hammered dents, polished
                        edges, VERDIGRIS blooming in the warm metals' hollows
                        (the patina follows the vertex colour's warmth, so it
                        never grows on iron), steam stains streaking down;
      CreatureGlass     gauge glass and lenses (glossy, no relief);
      CreatureMembrane  flags and aprons that bend with their spars;
      CreatureGlow      the storm's lightning blue (vertex coloured, emissive;
                        the runtime pins any material named *Glow* to its band).
  * HARD SURFACES. `MPart` shades smooth but marks every edge sharper than
    35 degrees as a hard edge, so plates and bevels read crisp and turned parts
    (tanks, pipes, gauges) stay round.
  * MACHINE PRIMITIVES. Oriented boxes and plates with rivet rows, cylinders,
    pipes with flanges, gears, coils, gauges, pistons, hazard stripes, tread
    loops, all bound rigidly to the part's one bone.
  * MOTION. Clips are authored as TRACKS of parameters with their own easing
    (an anticipation hold, a snapped strike, an overshoot that settles) and
    the pose is solved on EVERY frame, so limbs never interpolate through an
    IK target; `slides` move a bone along its own axis (pistons, recoil).

Conventions are the organic kit's: Blender units are yards, +Z up, the creature
FACES -Y (the game's +Z after the glTF export), bones (name, parent, head,
tail) with `.L` mirrored onto `.R`.

HELD TOOLS ARE NEVER THEIR OWN BONES. A wrench, a riveter, a shield or a
cannon is modelled on the hand (or the arm segment) that carries it, so it can
never turn against that hand (tests/stormbrass_foundry_creatures.test.ts).
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HC = os.path.normpath(os.path.join(HERE, '..', 'hollow_crypt_creatures'))
sys.path.insert(0, HC)
sys.path.insert(0, HERE)

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

from build_morthen import RollRig  # noqa: E402
from organic_kit import (  # noqa: E402
    BODY, GLOW, MEMBRANE, Membrane, Part, _node, _procedural_surface, _sock, bake_surface, bind,
    build_armature, expand_bones, export, join, render_sheet, setup_preview, srgb_to_linear, triangles,
)
from creature_kit import _fcurves  # noqa: E402

METAL = 3
GLASS = 4
FPS = 24

# ------------------------------------------------------------------ palette (sRGB)
BRASS = (0.79, 0.63, 0.29)        # polished brass #C9A14A
BRASS_HI = (0.93, 0.8, 0.46)
BRASS_D = (0.5, 0.37, 0.15)
COPPER = (0.74, 0.42, 0.25)
COPPER_D = (0.46, 0.23, 0.13)
VERDI = (0.31, 0.61, 0.54)        # aged verdigris #4E9C8A
IRON = (0.23, 0.25, 0.28)         # dark riveted iron #3B3F46
IRON_D = (0.12, 0.13, 0.15)
IRON_HI = (0.4, 0.42, 0.45)
STEEL = (0.58, 0.6, 0.63)
SLATE = (0.43, 0.45, 0.47)
HAZARD = (0.9, 0.76, 0.16)        # hazard yellow #E6C229
BLACK = (0.06, 0.06, 0.07)
RUBBER = (0.08, 0.08, 0.09)
LEATHER = (0.42, 0.27, 0.16)
LEATHER_D = (0.24, 0.15, 0.09)
CANVAS = (0.52, 0.47, 0.37)
CANVAS_D = (0.34, 0.3, 0.23)
DIAL = (0.9, 0.86, 0.74)          # a gauge face, old enamel
GLASS_C = (0.42, 0.55, 0.6)
LENS = (0.12, 0.2, 0.26)
STEAM = (0.91, 0.93, 0.94)
LIGHTNING = (0.81, 0.91, 1.0)     # lightning white-blue #CFE8FF
ARC = (0.42, 0.76, 1.0)
ARC_HOT = (0.9, 0.97, 1.0)
ARC_DEEP = (0.12, 0.38, 0.95)
SIGNAL_RED = (0.72, 0.12, 0.08)
WARN = (1.0, 0.72, 0.18)          # the klaxon's amber
SKIN = (0.86, 0.63, 0.5)
SKIN_D = (0.66, 0.42, 0.32)
SKIN_RUDDY = (0.86, 0.5, 0.42)
HAIR = (0.62, 0.42, 0.24)         # ginger going grey
HAIR_GREY = (0.72, 0.68, 0.62)
HAIR_D = (0.36, 0.22, 0.12)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def V(*a):
    return Vector(a[0]) if len(a) == 1 else Vector(a)


def basis(forward, up=(0, 0, 1)):
    """A right-handed frame whose local +Z runs along `forward`; local +Y as near
    `up` as it can (the columns are the local axes in armature space)."""
    z = Vector(forward).normalized()
    y = Vector(up) - z * z.dot(Vector(up))
    if y.length < 1e-5:
        y = z.orthogonal()
    y.normalize()
    x = y.cross(z).normalized()
    return Matrix((x, y, z)).transposed()


def ease(kind, t):
    t = max(0.0, min(1.0, t))
    if kind == 'linear':
        return t
    if kind == 'in':            # slow out of the key, fast into the next: a strike
        return t * t * t
    if kind == 'out':           # fast away, settling: a recovery
        return 1 - (1 - t) ** 3
    if kind == 'snap':          # nearly instant
        return 1 - (1 - t) ** 6
    if kind == 'back':          # past the target and back: an impact's overshoot
        s = 2.2
        u = t - 1
        return 1 + u * u * ((s + 1) * u + s)
    return t * t * (3 - 2 * t)  # 'inout'


class Track:
    """A parameter over the clip: keys [(frame, value, ease)] where `ease` shapes
    the segment arriving at that key. Values are floats or equal-length tuples."""

    def __init__(self, keys):
        self.keys = [(k[0], k[1], k[2] if len(k) > 2 else 'inout') for k in keys]

    def __call__(self, f):
        ks = self.keys
        if f <= ks[0][0]:
            return ks[0][1]
        for (fa, va, _), (fb, vb, e) in zip(ks, ks[1:]):
            if f <= fb:
                t = ease(e, (f - fa) / max(1e-6, fb - fa))
                if isinstance(va, (tuple, list)):
                    return tuple(a + (b - a) * t for a, b in zip(va, vb))
                return va + (vb - va) * t
        return ks[-1][1]


def tracks(spec):
    """{param: [(frame, value, ease)]} -> f -> {param: value}."""
    ts = {k: Track(v) for k, v in spec.items()}
    return lambda f: {k: t(f) for k, t in ts.items()}


# ---------------------------------------------------------------- hard surfaces
class MPart(Part):
    """A machine part: smooth shading, with every edge sharper than `crease`
    degrees marked hard (the glTF export splits its normals there)."""

    def __init__(self, name, bone, hard=True, crease=35.0, seed=0, subdiv=0):
        super().__init__(name, bone, smooth=True, subdiv=subdiv, seed=seed)
        self.hard = hard
        self.crease = crease

    def to_object(self, materials):
        if self.hard:
            bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
            lim = math.radians(self.crease)
            for e in self.bm.edges:
                if len(e.link_faces) == 2:
                    try:
                        if e.calc_face_angle() > lim:
                            e.smooth = False
                    except ValueError:
                        pass
                elif len(e.link_faces) != 2:
                    e.smooth = False
        return super().to_object(materials)

    # ------------------------------------------------------------- primitives
    def obox(self, center, size, frame, color, mat=BODY, bevel=0.0, taper=1.0):
        """A box (`size` = local x, y, z extents) turned into `frame` (a 3x3 whose
        columns are the box's axes); `taper` narrows its +z end."""
        before = set(self.bm.faces)
        made = bmesh.ops.create_cube(self.bm, size=1.0)
        m = Matrix(frame) if not isinstance(frame, Matrix) else frame
        for v in made['verts']:
            k = taper if v.co.z > 0 else 1.0
            local = Vector((v.co.x * size[0] * k, v.co.y * size[1] * k, v.co.z * size[2]))
            v.co = m @ local + Vector(center)
        faces = self._new_faces(before)
        # create_cube's winding can come out inward; the bevel needs it outward.
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        self._paint(faces, color, mat)
        if bevel > 0:
            edges = list({e for f in faces for e in f.edges})
            out = bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=1, affect='EDGES',
                                  clamp_overlap=True)
            self._paint(out['faces'], color, mat)
            bmesh.ops.recalc_face_normals(self.bm, faces=self._new_faces(before))
        return faces

    def cyl(self, a, b, r, color, sides=16, mat=METAL, r2=None, cap=True):
        """A cylinder (or a cone frustum with `r2`) from `a` to `b`."""
        a, b = Vector(a), Vector(b)
        return self.tube([a, b], [r, r if r2 is None else r2], color, sides=sides, mat=mat, cap=cap)

    def ring(self, center, axis, r, thick, color, sides=24, mat=METAL, tube_sides=6, arc=1.0, phase=0.0):
        """A torus ring of radius `r` round `axis` (a flange, a bezel, a hoop)."""
        c = Vector(center)
        f = basis(axis)
        x, y = f.col[0], f.col[1]
        n = max(3, int(sides * arc))
        pts = [c + (x * math.cos(phase + math.tau * arc * i / n) + y * math.sin(phase + math.tau * arc * i / n)) * r
               for i in range(n + 1)]
        if arc >= 1.0:
            pts[-1] = pts[0]
        return self.tube(pts, [thick] * len(pts), color, sides=tube_sides, mat=mat, cap=arc < 1.0)

    def disc(self, center, axis, r, depth, color, sides=24, mat=METAL, r_back=None):
        a = Vector(center) - Vector(axis).normalized() * depth / 2
        b = Vector(center) + Vector(axis).normalized() * depth / 2
        return self.tube([a, b], [r_back if r_back is not None else r, r], color, sides=sides, mat=mat)

    def rivets(self, pts, r=0.03, color=BRASS_D, normal=None):
        for c in pts:
            c = Vector(c)
            if normal is None:
                self.blob(tuple(c), (r * 2, r * 2, r * 2), color, segments=6, rings=4, mat=METAL)
            else:
                n = Vector(normal).normalized()
                self.blob(tuple(c + n * r * 0.2), (r * 2, r * 2, r * 1.2), color, segments=6, rings=4, mat=METAL,
                          rot=n.to_track_quat('Z', 'Y').to_euler())

    def rivet_line(self, a, b, n, r=0.03, color=BRASS_D, normal=None):
        a, b = Vector(a), Vector(b)
        self.rivets([a.lerp(b, (i + 0.5) / n) for i in range(n)], r, color, normal)

    def rivet_circle(self, center, axis, radius, n, r=0.03, color=BRASS_D):
        c = Vector(center)
        f = basis(axis)
        self.rivets([c + (f.col[0] * math.cos(math.tau * i / n) + f.col[1] * math.sin(math.tau * i / n)) * radius
                     for i in range(n)], r, color, normal=axis)

    def plate(self, center, size, frame, color, mat=METAL, bevel=0.03, rivet=0.0, rivet_color=BRASS_D,
              rivet_n=(4, 3)):
        """A riveted plate: an oriented slab with rivets round its +z face."""
        f = Matrix(frame) if not isinstance(frame, Matrix) else frame
        self.obox(center, size, f, color, mat=mat, bevel=bevel)
        if rivet > 0:
            c = Vector(center)
            x, y, z = f.col[0], f.col[1], f.col[2]
            top = c + z * size[2] / 2
            inset = rivet * 2.4
            hx, hy = size[0] / 2 - inset, size[1] / 2 - inset
            nx, ny = rivet_n
            pts = []
            for i in range(nx):
                u = -hx + 2 * hx * i / max(1, nx - 1)
                pts += [top + x * u + y * hy, top + x * u - y * hy]
            for j in range(1, ny - 1):
                v = -hy + 2 * hy * j / max(1, ny - 1)
                pts += [top + x * hx + y * v, top + x * -hx + y * v]
            self.rivets(pts, rivet, rivet_color, normal=tuple(z))

    def pipe(self, pts, r, color=COPPER, mat=METAL, sides=10, flanges=True, flange_color=BRASS_D):
        pts = [Vector(p) for p in pts]
        self.tube(pts, [r] * len(pts), color, sides=sides, mat=mat)
        if flanges:
            for i in (0, len(pts) - 1):
                d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
                self.disc(tuple(pts[i]), tuple(d.normalized()), r * 1.45, r * 0.6, flange_color, sides=sides,
                          mat=mat)

    def gear(self, center, axis, r, teeth, thick, color=BRASS, mat=METAL, hub=0.3, spokes=5):
        """A spur gear: a rim with square teeth, spokes and a hub."""
        c = Vector(center)
        f = basis(axis)
        x, y, z = f.col[0], f.col[1], f.col[2]
        self.ring(c, z, r * 0.86, r * 0.1, color, sides=max(16, teeth * 2), mat=mat, tube_sides=6)
        tw = math.tau * r / teeth * 0.5
        for i in range(teeth):
            a = math.tau * (i + 0.5) / teeth
            d = x * math.cos(a) + y * math.sin(a)
            t = d.cross(z)
            self.obox(tuple(c + d * r * 0.97), (tw, r * 0.2, thick), Matrix((t, d, z)).transposed(), color,
                      mat=mat, bevel=min(tw, thick) * 0.18)
        self.disc(tuple(c), tuple(z), r * hub, thick * 1.5, lerp(color, IRON, 0.4), sides=12, mat=mat)
        for i in range(spokes):
            a = math.tau * i / spokes
            d = x * math.cos(a) + y * math.sin(a)
            self.obox(tuple(c + d * r * 0.55), (r * 0.12, r * 0.6, thick * 0.7),
                      Matrix((d.cross(z), d, z)).transposed(), color, mat=mat, bevel=0.01)

    def coil(self, center, axis, r, length, turns, wire, color=COPPER, mat=METAL, sides=6):
        c = Vector(center)
        f = basis(axis)
        x, y, z = f.col[0], f.col[1], f.col[2]
        n = int(turns * 14)
        pts = [c + z * (length * (i / n - 0.5)) + (x * math.cos(math.tau * turns * i / n)
                                                     + y * math.sin(math.tau * turns * i / n)) * r
               for i in range(n + 1)]
        self.tube(pts, [wire] * len(pts), color, sides=sides, mat=mat)

    def gauge(self, center, normal, r, bezel=BRASS, face=DIAL, ticks=9, red_zone=True, glass=True,
              up=(0, 0, 1)):
        """A pressure gauge: bezel, enamel face, ticks (the last third red), the
        glass. Its needle is separate (a dial bone) when it must move."""
        c = Vector(center)
        n = Vector(normal).normalized()
        f = basis(n, up)
        x, y = f.col[0], f.col[1]
        self.disc(tuple(c - n * r * 0.12), tuple(n), r * 1.04, r * 0.24, lerp(bezel, IRON, 0.35), sides=24)
        self.ring(c + n * r * 0.02, n, r * 0.98, r * 0.09, bezel, sides=28)
        self.disc(tuple(c), tuple(n), r * 0.9, r * 0.03, face, sides=24, mat=BODY)
        for i in range(ticks):
            a = math.radians(225 - 270 * i / (ticks - 1))
            d = x * math.cos(a) + y * math.sin(a)
            red = red_zone and i >= int(ticks * 0.7)
            self.obox(tuple(c + n * r * 0.03 + d * r * 0.72), (r * 0.05, r * 0.2, r * 0.02),
                      Matrix((d.cross(n), d, n)).transposed(), SIGNAL_RED if red else BLACK, mat=BODY)
        if red_zone:
            for i in range(6):
                a = math.radians(225 - 270 * (0.72 + 0.28 * i / 5))
                d = x * math.cos(a) + y * math.sin(a)
                self.obox(tuple(c + n * r * 0.028 + d * r * 0.56), (r * 0.16, r * 0.07, r * 0.015),
                          Matrix((d.cross(n), d, n)).transposed(), SIGNAL_RED, mat=BODY)
        self.blob(tuple(c + n * r * 0.04), (r * 0.16, r * 0.16, r * 0.08), IRON_D, segments=8, rings=4, mat=METAL,
                  rot=n.to_track_quat('Z', 'Y').to_euler())
        if glass:
            # the glass itself is not drawn (the dial must read); two glints on its rim
            for a0 in (2.1, 2.5):
                self.obox(tuple(c + n * r * 0.1 + (x * math.cos(a0) + y * math.sin(a0)) * r * 0.7),
                          (r * 0.05, r * 0.24, r * 0.01), Matrix((x, y, n)).transposed() @ Matrix.Rotation(a0, 3, 'Z'),
                          (0.92, 0.96, 1.0), mat=GLASS)

    def needle(self, center, normal, r, angle_deg=225.0, color=SIGNAL_RED, up=(0, 0, 1)):
        """A gauge needle lying on the face (for a dial bone of its own)."""
        c = Vector(center)
        n = Vector(normal).normalized()
        f = basis(n, up)
        a = math.radians(angle_deg)
        d = f.col[0] * math.cos(a) + f.col[1] * math.sin(a)
        self.obox(tuple(c + n * r * 0.07 + d * r * 0.36), (r * 0.07, r * 0.8, r * 0.025),
                  Matrix((d.cross(n), d, n)).transposed(), color, mat=BODY, taper=0.3)
        self.obox(tuple(c + n * r * 0.07 - d * r * 0.1), (r * 0.1, r * 0.22, r * 0.025),
                  Matrix((d.cross(n), d, n)).transposed(), color, mat=BODY)

    def hazard(self, a, b, normal, width, n, depth=0.02, slant=0.6):
        """Hazard paint: alternating yellow and black slanted bars from `a` to `b`."""
        a, b = Vector(a), Vector(b)
        nn = Vector(normal).normalized()
        d = (b - a)
        step = d / n
        side = nn.cross(d.normalized()).normalized()
        for i in range(n):
            c = a + step * (i + 0.5)
            fwd = (d.normalized() + side * slant).normalized()
            self.obox(tuple(c + nn * depth * 0.5), (width, step.length * 0.98, depth),
                      Matrix((fwd.cross(nn), fwd, nn)).transposed(), HAZARD if i % 2 == 0 else BLACK, mat=BODY)

    def piston(self, a, b, r, color=STEEL, sleeve=IRON, mat=METAL):
        """A piston sleeve from `a` with its polished rod toward `b`."""
        a, b = Vector(a), Vector(b)
        mid = a.lerp(b, 0.55)
        self.cyl(a, mid, r, sleeve, sides=12, mat=mat)
        self.ring(mid, (b - a).normalized(), r * 1.05, r * 0.25, BRASS_D, sides=14)
        self.cyl(mid, b, r * 0.55, color, sides=10, mat=mat)
        self.ring(a, (b - a).normalized(), r * 1.05, r * 0.22, BRASS_D, sides=14)

    def treads(self, center, length, height, width, links=34, color=IRON_D):
        """A caterpillar track loop (in the YZ plane, running along Y) round two end
        wheels. The links do not move: the road wheels inside turn on their own bones."""
        c = Vector(center)
        r = height / 2
        half = length / 2 - r
        per = 4 * half + 2 * math.pi * r
        seg = per / links
        for i in range(links):
            s = per * i / links
            if s < 2 * half:
                y, z, d, n = -half + s, r, (0, 1, 0), (0, 0, 1)
            elif s < 2 * half + math.pi * r:
                a = (s - 2 * half) / r
                y, z = half + math.sin(a) * r, math.cos(a) * r
                d, n = (0, math.cos(a), -math.sin(a)), (0, math.sin(a), math.cos(a))
            elif s < 4 * half + math.pi * r:
                y, z, d, n = half - (s - 2 * half - math.pi * r), -r, (0, -1, 0), (0, 0, -1)
            else:
                a = (s - 4 * half - math.pi * r) / r
                y, z = -half - math.sin(a) * r, -math.cos(a) * r
                d, n = (0, -math.cos(a), math.sin(a)), (0, -math.sin(a), -math.cos(a))
            d, n = Vector(d), Vector(n)
            frame = Matrix((d.cross(n), d, n)).transposed()
            pos = c + Vector((0, y, z))
            self.obox(tuple(pos), (width, seg * 0.9, height * 0.09), frame, color, mat=METAL, bevel=0.01)
            self.obox(tuple(pos + n * height * 0.06), (width * 0.92, seg * 0.3, height * 0.06), frame,
                      lerp(color, STEEL, 0.25), mat=METAL)


# --------------------------------------------------------------------- materials
def _machine_surface(mat, kind):
    """The bake-time shader: vertex colour x wear, plus a bump. `kind` is 'metal'
    (brass, copper, iron: hammered, polished at the edges, verdigris in the warm
    metals' hollows, steam stains) or 'body' (painted iron, rubber, leather:
    grime, water streaks, worn edges) or 'glass'."""
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = nt.nodes.get('Material Output')
    bsdf = _node(nt, 'ShaderNodeBsdfPrincipled', (900, 0))
    bsdf.inputs['Roughness'].default_value = 0.7
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    vc.location = (-1100, 400)
    if kind == 'glass':
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        return
    tex = _node(nt, 'ShaderNodeTexCoord', (-1500, 0))

    def mapped(scale, loc=(-1300, 0)):
        m = _node(nt, 'ShaderNodeMapping', loc)
        m.inputs['Scale'].default_value = scale
        nt.links.new(tex.outputs['Object'], m.inputs['Vector'])
        return m.outputs['Vector']

    def noise(vec, scale, detail, rough, loc):
        n = _node(nt, 'ShaderNodeTexNoise', loc, Scale=scale, Detail=detail, Roughness=rough)
        nt.links.new(vec, n.inputs['Vector'])
        return n.outputs['Fac']

    def ramp(fac, a, ca, b, cb, loc):
        r = nt.nodes.new('ShaderNodeValToRGB')
        r.location = loc
        r.color_ramp.elements[0].position = a
        r.color_ramp.elements[0].color = (ca, ca, ca, 1)
        r.color_ramp.elements[1].position = b
        r.color_ramp.elements[1].color = (cb, cb, cb, 1)
        nt.links.new(fac, r.inputs['Fac'])
        return r.outputs['Color']

    def mix(a, b, fac, blend='MIX', loc=(0, 0), fac_value=None):
        m = _node(nt, 'ShaderNodeMix', loc)
        m.data_type = 'RGBA'
        m.blend_type = blend
        if fac is None:
            m.inputs['Factor'].default_value = fac_value if fac_value is not None else 1.0
        else:
            nt.links.new(fac, m.inputs['Factor'])
        if isinstance(a, tuple):
            _sock(m.inputs, 'A').default_value = (*srgb_to_linear(a), 1.0)
        else:
            nt.links.new(a, _sock(m.inputs, 'A'))
        if isinstance(b, tuple):
            _sock(m.inputs, 'B').default_value = (*srgb_to_linear(b), 1.0)
        else:
            nt.links.new(b, _sock(m.inputs, 'B'))
        return _sock(m.outputs, 'Result')

    def math_node(op, a, b, loc, clamp=False):
        m = _node(nt, 'ShaderNodeMath', loc)
        m.operation = op
        m.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                nt.links.new(v, m.inputs[i])
        return m.outputs['Value']

    base = mapped((1, 1, 1))
    # Broad mottling and the streaks that run down from every seam (water, steam).
    mott = ramp(noise(base, 2.4, 6.0, 0.6, (-1100, 0)), 0.25, 0.8, 0.75, 1.07, (-850, 0))
    streak_v = mapped((2.6, 2.6, 0.22), (-1300, -300))
    streak = ramp(noise(streak_v, 5.0, 5.0, 0.62, (-1100, -300)), 0.42, 1.0, 0.72,
                  0.7 if kind == 'body' else 0.78, (-850, -300))
    # Worn convex edges (Cycles pointiness) and the grimy hollows.
    geo = _node(nt, 'ShaderNodeNewGeometry', (-1100, -600))
    edge = ramp(geo.outputs['Pointiness'], 0.53, 0.0, 0.62, 1.0, (-850, -600))
    hollow = ramp(geo.outputs['Pointiness'], 0.44, 1.0, 0.5, 0.0, (-850, -800))
    col = mix(vc.outputs['Color'], mott, None, 'MULTIPLY', (-600, 300))
    col = mix(col, streak, None, 'MULTIPLY', (-450, 300))
    if kind == 'metal':
        # Verdigris: in the noise's peaks and the hollows, only on warm metal.
        sep = _node(nt, 'ShaderNodeSeparateColor', (-850, 500))
        nt.links.new(vc.outputs['Color'], sep.inputs['Color'])
        warm = math_node('SUBTRACT', sep.outputs['Red'], sep.outputs['Blue'], (-650, 520))
        warm = math_node('MULTIPLY', warm, 3.0, (-500, 520), clamp=True)
        vn = ramp(noise(base, 3.4, 8.0, 0.66, (-1100, -1000)), 0.54, 0.0, 0.7, 1.0, (-850, -1000))
        hol = math_node('MULTIPLY', _sock_val(nt, hollow), 0.55, (-650, -850))
        vmask = math_node('ADD', _sock_val(nt, vn), hol, (-500, -900), clamp=True)
        vmask = math_node('MULTIPLY', vmask, warm, (-350, -900), clamp=True)
        vmask = math_node('MULTIPLY', vmask, 0.7, (-250, -900))
        col = mix(col, VERDI, vmask, 'MIX', (-250, 300))
        # Polished edges catch the light.
        edge_k = math_node('MULTIPLY', _sock_val(nt, edge), 0.16, (-450, -600))
        lift = mix(col, (1.0, 0.94, 0.78), edge_k, 'MIX', (-100, 300))
        col = lift
    else:
        # Paint and leather wear pale at the edges, grime gathers in the hollows.
        edge_k = math_node('MULTIPLY', _sock_val(nt, edge), 0.22, (-450, -600))
        col = mix(col, (0.62, 0.6, 0.56), edge_k, 'MIX', (-250, 300))
        hk = math_node('MULTIPLY', _sock_val(nt, hollow), 0.35, (-450, -800))
        col = mix(col, (0.08, 0.07, 0.06), hk, 'MIX', (-100, 300))
    nt.links.new(col, bsdf.inputs['Base Color'])
    # Relief: hammered dents (metal) or fine pitting, plus the streaks.
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.location = (-1100, -1300)
    vor.feature = 'SMOOTH_F1' if kind == 'metal' else 'F1'
    vor.inputs['Scale'].default_value = 16.0 if kind == 'metal' else 34.0
    nt.links.new(base, vor.inputs['Vector'])
    pits = noise(base, 70.0, 2.0, 0.5, (-1100, -1550))
    h = math_node('MULTIPLY', vor.outputs['Distance'], 0.6, (-800, -1300))
    h = math_node('ADD', h, pits, (-650, -1350))
    bump = _node(nt, 'ShaderNodeBump', (600, -400), Strength=0.32 if kind == 'metal' else 0.42, Distance=0.02)
    nt.links.new(h, bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def _sock_val(nt, color_socket):
    """A ramp's colour output as a scalar (its red channel)."""
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(color_socket, sep.inputs['Color'])
    return sep.outputs['Red']


def machine_materials():
    """[Body, Glow, Membrane, Metal, Glass], the indices BODY, GLOW, MEMBRANE,
    METAL, GLASS."""
    body = bpy.data.materials.new('CreatureBody')
    glow = bpy.data.materials.new('CreatureGlow')
    memb = bpy.data.materials.new('CreatureMembrane')
    metal = bpy.data.materials.new('CreatureMetal')
    glass = bpy.data.materials.new('CreatureGlass')
    for m in (body, glow, memb, metal, glass):
        m.use_nodes = True
        m.use_backface_culling = True
    memb.use_backface_culling = False
    nt = glow.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 3.0
    _machine_surface(body, 'body')
    _machine_surface(metal, 'metal')
    _machine_surface(glass, 'glass')
    _procedural_surface(memb, 'cloth')
    return [body, glow, memb, metal, glass]


def finish_materials(mats):
    """After the bake: the shipping roughness and metalness per material."""
    look = {'CreatureBody': (0.0, 0.72), 'CreatureMembrane': (0.0, 0.86), 'CreatureMetal': (0.5, 0.4),
            'CreatureGlass': (0.05, 0.06)}
    for m in mats:
        if m.name not in look:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        bsdf.inputs['Metallic'].default_value, bsdf.inputs['Roughness'].default_value = look[m.name]


def machine_bake(obj, size=2048, samples=40, ao_strength=0.6, normal=True, ao_distance=0.35):
    """The organic kit's bake (organic_kit.bake_surface) tuned for machines: the
    unwrap is re-packed tightly (hundreds of rivet and bolt islands otherwise
    starve the big plates of texels), and the occlusion only looks a short way
    (`ao_distance` yards), so a crevice darkens but a whole flank under an arm
    does not."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.device = 'CPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for backend in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = backend
                prefs.get_devices()
                if any(d.type == backend for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == backend
                    scene.cycles.device = 'GPU'
                    break
            except TypeError:
                continue
    except Exception:  # noqa: BLE001
        pass
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.002, area_weight=0.0,
                             scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0015)
    bpy.ops.object.mode_set(mode='OBJECT')
    albedo = bpy.data.images.new(obj.name + '_albedo', size, size, alpha=False)
    ao = bpy.data.images.new(obj.name + '_ao', size, size, alpha=False, float_buffer=False)
    nrm = bpy.data.images.new(obj.name + '_normal', size // 2, size // 2, alpha=False)
    nrm.colorspace_settings.name = 'Non-Color'
    # The glow and a translucent smoke keep their vertex colours (and alpha): never baked.
    unbaked = ('CreatureGlow', 'CreatureSmoke')
    baked = [m for m in obj.data.materials if m and m.name not in unbaked]
    glow = [m for m in obj.data.materials if m and m.name in unbaked]

    def target(img):
        for m in obj.data.materials:
            if not m:
                continue
            nt = m.node_tree
            node = nt.nodes.get('BakeTarget') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'BakeTarget'
            node.image = img
            node.location = (900, 400)
            nt.nodes.active = node

    scene.render.bake.margin = 6
    scene.render.bake.use_selected_to_active = False
    # 1. albedo (colour only)
    target(albedo)
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=6)
    # 2. ambient occlusion
    target(ao)
    scene.world = scene.world or bpy.data.worlds.new('bakeworld')
    scene.world.light_settings.distance = ao_distance
    bpy.ops.object.bake(type='AO', margin=6)
    # 3. normal (the shader bump)
    if normal:
        target(nrm)
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=6)
    # Fold AO into the albedo.
    import numpy as np
    a = np.array(albedo.pixels[:], dtype=np.float32).reshape(-1, 4)
    o = np.array(ao.pixels[:], dtype=np.float32).reshape(-1, 4)
    print('BAKE_MEANS albedo', a[:, :3].mean(0), 'ao', o[:, 0].mean())
    k = 1.0 - ao_strength * (1.0 - o[:, 0:1])
    a[:, 0:3] *= k
    albedo.pixels[:] = a.ravel().tolist()
    albedo.update()
    # Swap bake shaders for the shipping ones.
    for m in baked:
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type != 'OUTPUT_MATERIAL':
                nt.nodes.remove(n)
        out = nt.nodes.get('Material Output')
        bsdf = _node(nt, 'ShaderNodeBsdfPrincipled', (300, 0))
        bsdf.inputs['Roughness'].default_value = 0.82
        img = nt.nodes.new('ShaderNodeTexImage')
        img.image = albedo
        img.location = (-200, 200)
        nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
        if normal:
            nimg = nt.nodes.new('ShaderNodeTexImage')
            nimg.image = nrm
            nimg.location = (-200, -200)
            nmap = nt.nodes.new('ShaderNodeNormalMap')
            nmap.location = (50, -200)
            nt.links.new(nimg.outputs['Color'], nmap.inputs['Color'])
            nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    for m in glow:
        node = m.node_tree.nodes.get('BakeTarget')
        if node:
            m.node_tree.nodes.remove(node)
    bpy.data.images.remove(ao)
    # The baked texture now carries the colour: whiten the body's vertex colours
    # (a glTF loader multiplies COLOR_0 into the texture) and keep them only
    # where the unlit glow material still reads them.
    col = obj.data.color_attributes.get('Col')
    if col is not None:
        keep = {i for i, m in enumerate(obj.data.materials) if m and m.name in unbaked}
        for poly in obj.data.polygons:
            if poly.material_index in keep:
                continue
            for li in poly.loop_indices:
                col.data[li].color = (1.0, 1.0, 1.0, 1.0)
    albedo.pack()
    nrm.pack()
    return albedo, nrm



# ------------------------------------------------------------------- posing
class MachineRig(RollRig):
    """RollRig plus `slides` {bone: yards along its own axis} (pistons, recoil)."""

    def pose(self, aims=None, ik=None, turns=None, root=(0, 0, 0), rolls=None, scales=None, absolute=None,
             slides=None):
        out = super().pose(aims=aims, ik=ik, turns=turns, root=root, rolls=rolls, scales=scales, absolute=absolute)
        out['__slide'] = dict(slides or {})
        return out


def key_pose(arm, pose, frame):
    scales = pose.get('__scale', {})
    slides = pose.get('__slide', {})
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        q = pose.get(pb.name)
        pb.rotation_quaternion = q if q is not None else (1, 0, 0, 0)
        pb.location = (0, slides.get(pb.name, 0.0), 0)
        s = scales.get(pb.name, 1.0)
        pb.scale = (s, s, s) if isinstance(s, (int, float)) else s
    rb = arm.pose.bones.get('Root')
    root = pose.get('__root')
    if rb is not None and root is not None:
        rb.location = rb.bone.matrix_local.to_3x3().inverted() @ root
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)
        pb.keyframe_insert('scale', frame=frame)


def anim(arm, name, frames, pose_at, loop=True, step=1):
    """A clip of `frames` frames (24 fps), the pose solved on every `step`-th frame
    by `pose_at(f)` (f from 0); a looped clip closes on its first pose."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    last = None
    for f in range(0, frames + 1, step):
        fr = 0 if (loop and f == frames) else f
        key_pose(arm, pose_at(fr), f + 1)
        last = f
    if last != frames:
        key_pose(arm, pose_at(0 if loop else frames), frames + 1)
    for fc in _fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    return act


def measure(arm, body_objs, clip='Idle', frame=13):
    """The game's measure: the posed height half a second into Idle."""
    scene = bpy.context.scene
    arm.animation_data.action = bpy.data.actions[clip]
    scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    zs, xs, ys = [], [], []
    for ob in body_objs:
        ev = ob.evaluated_get(dg)
        for v in ev.data.vertices:
            w = ev.matrix_world @ v.co
            zs.append(w.z)
            xs.append(w.x)
            ys.append(w.y)
    print('IDLE_HEIGHT', round(max(zs) - min(zs), 3), 'MINZ', round(min(zs), 3), 'MAXZ', round(max(zs), 3),
          'WIDTH', round(max(xs) - min(xs), 3), 'LENGTH', round(max(ys) - min(ys), 3))
    ob = body_objs[0]
    for tag, i in (('LOWEST', min(range(len(zs)), key=lambda k: zs[k])),
                   ('HIGHEST', max(range(len(zs)), key=lambda k: zs[k]))):
        if i < len(ob.data.vertices):
            gs = [ob.vertex_groups[g.group].name for g in ob.data.vertices[i].groups if g.weight > 0.3]
            print(tag, gs, round(zs[i], 3))
    return max(zs) - min(zs), min(zs)


def bone_at(arm, clip, frame, bone, tail=False):
    """A bone's head (or tail) in armature space at one frame of a clip, printed
    in the game's frame (side +x, up, fwd = -y) for the effect anchors."""
    scene = bpy.context.scene
    arm.animation_data.action = bpy.data.actions[clip]
    scene.frame_set(frame)
    pb = arm.pose.bones[bone]
    p = arm.matrix_world @ (pb.tail if tail else pb.head)
    print('ANCHOR', clip, frame, bone, 'side', round(p.x, 3), 'up', round(p.z, 3), 'fwd', round(-p.y, 3))
    return p


# ------------------------------------------------------------------ preview
def knight_reference(at, height):
    """The player's knight at `height` yards: a plain (meshopt- and KTX2-free) copy
    of public/models/chars/players/knight.glb named by FOUNDRY_KNIGHT, or a capsule."""
    path = os.environ.get('FOUNDRY_KNIGHT', '')
    if not path or not os.path.exists(path):
        from organic_kit import player_reference
        return player_reference(bpy.context.scene, at, height)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    holder = bpy.data.objects.new('PlayerReference', None)
    bpy.context.scene.collection.objects.link(holder)
    for r in roots:
        r.parent = holder
    for o in new:
        if o.type == 'ARMATURE':
            # the import leaves its last clip (Death_A) posed: stand it at rest
            if o.animation_data:
                o.animation_data.action = None
            for pb in o.pose.bones:
                pb.location = (0, 0, 0)
                pb.rotation_quaternion = (1, 0, 0, 0)
                pb.rotation_euler = (0, 0, 0)
                pb.scale = (1, 1, 1)
        elif o.type == 'MESH' and o.name.startswith('Icosphere'):
            o.hide_render = True
    bpy.context.view_layer.update()
    zs = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in new:
        if o.type == 'MESH' and not o.hide_render:
            ev = o.evaluated_get(dg)
            zs += [(ev.matrix_world @ v.co).z for v in ev.data.vertices]
    h = (max(zs) - min(zs)) if zs else 1.0
    holder.scale = (height / h,) * 3
    holder.location = Vector(at)
    holder.rotation_euler = (0, 0, math.radians(200))
    return [holder]


def review_look():
    """Review renders in the plain sRGB transform (AgX greys out saturated brass),
    under a brighter daylight sky like the Foundry's."""
    scene = bpy.context.scene
    try:
        scene.view_settings.view_transform = 'Standard'
    except TypeError:
        pass
    if scene.world and scene.world.node_tree:
        bg = scene.world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.42, 0.47, 0.56, 1)
            bg.inputs[1].default_value = 1.0


def sheet(arm, clips, out_dir, prefix, focus, dist, game_scale, ref_side=None, frames=5):
    """Every clip's frames beside the knight, both at their in-game sizes (the
    creature's authored size x its template scale, the knight at 2.6)."""
    setup_preview(focus, dist)
    review_look()
    side = ref_side if ref_side is not None else dist * 0.32
    knight_reference((side, 0.6, 0), 2.6 / game_scale)
    render_sheet(arm, clips, out_dir, prefix, frames_per_clip=frames)


def run(name, bones, parts_fn, clips_fn, membranes_fn=None, argv=None, atlas=2048, sheet_args=None,
        anchors=None, extras=None):
    """Build, bake, rig, animate and export one creature.

      blender -b --factory-startup --python <creature>.py -- <out.glb|-> [--sheet dir] [--blend f]
              [--fast] [--nobake] [--clips A,B] [--frames N]
    """
    argv = argv if argv is not None else sys.argv[sys.argv.index('--') + 1:]
    out = argv[0]
    fast = '--fast' in argv
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    mats = machine_materials()
    parts = parts_fn()
    mems = membranes_fn() if membranes_fn else []
    objects = [pt.to_object(mats) for pt in parts] + [m.to_object(mats) for m in mems]
    body = join(objects, name)
    print('TRIANGLES', triangles(body))
    if '--nobake' not in argv:
        machine_bake(body, size=512 if fast else atlas, samples=16 if fast else 40)
    finish_materials(mats)
    arm = build_armature(name, bones)
    bind(body, arm)
    clips = clips_fn(arm)
    measure(arm, [body])
    for clip_name, frame, bone, tail in (anchors or []):
        bone_at(arm, clip_name, frame, bone, tail)
    for pb in arm.pose.bones:
        pb.scale = (1, 1, 1)
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    if extras:
        extras(body, arm)
    if out != '-':
        export(out, arm, extras=True)
    if '--sheet' in argv and sheet_args:
        only = argv[argv.index('--clips') + 1].split(',') if '--clips' in argv else clips
        frames = int(argv[argv.index('--frames') + 1]) if '--frames' in argv else 5
        sheet(arm, [c for c in clips if c in only], argv[argv.index('--sheet') + 1], sheet_args['prefix'],
              sheet_args['focus'], sheet_args['dist'], sheet_args['scale'], sheet_args.get('ref_side'), frames)
    views = os.environ.get('FOUNDRY_VIEWS', '')
    if views and sheet_args:
        render_views(arm, os.environ.get('FOUNDRY_VIEWS_DIR', '.'), views.split(';'), sheet_args)
    if '--blend' in argv:
        arm.animation_data.action = bpy.data.actions['Idle']
        bpy.ops.wm.save_as_mainfile(filepath=argv[argv.index('--blend') + 1])
        print('SAVED')
    return arm, body, clips


def render_views(arm, out_dir, specs, sheet_args, res=(1100, 900)):
    """Review stills: each spec `Clip:frame:az:el:dist:fx:fy:fz` (az 0 looks at the
    creature's face, degrees; dist in yards; the focus point), the knight beside."""
    scene = bpy.context.scene
    if scene.camera is None:
        setup_preview(sheet_args['focus'], sheet_args['dist'])
        review_look()
        knight_reference((sheet_args.get('ref_side', 2.0), 0.6, 0), 2.6 / sheet_args['scale'])
    os.makedirs(out_dir, exist_ok=True)
    cam = scene.camera
    cam.data.lens = 40
    scene.render.resolution_x, scene.render.resolution_y = res
    for spec in specs:
        name, frame, az, el, dist, fx, fy, fz = spec.split(':')
        arm.animation_data.action = bpy.data.actions[name]
        scene.frame_set(int(frame))
        az, el, dist = math.radians(float(az)), math.radians(float(el)), float(dist)
        focus = Vector((float(fx), float(fy), float(fz)))
        cam.location = focus + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
        cam.rotation_euler = (focus - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out_dir, f'{sheet_args["prefix"]}_{name}_{frame}_{int(math.degrees(az))}.png')
        bpy.ops.render.render(write_still=True)
        print('VIEW', scene.render.filepath)


__all__ = [n for n in dir() if not n.startswith('__')]
