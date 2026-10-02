"""The Prime Draft's surfaces: procedural bake shaders per kind (brass, iron,
socket, steel, copper, ceramic, cable, hazard), the shared UV atlas, and the
high-to-low Cycles bake into one albedo, one tangent normal map and one
roughness/metallic map (adapted from the Great Saurian / Balgath kit).

Brass: aged and tarnished, polished bright on the edges, verdigris in the seams and
running down in streaks. Iron: dark, rust in the crevices and streaks, worn to bright
steel on the edges. The hot spots (the empty socket, the shoulders, the elbows, the
knees, the stack mouths, the waist) are scorched with soot. Metals have no diffuse
pass, so the albedo is baked through an emission copy of the colour.
"""
import math
import os

import bpy
import numpy as np


def srgb(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


class NT:
    """Terse node-tree builder."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        for n in list(self.nt.nodes):
            self.nt.nodes.remove(n)
        self.x = -1600
        self.out = self.node('ShaderNodeOutputMaterial')
        self.bsdf = self.node('ShaderNodeBsdfPrincipled')
        self.link(self.bsdf.outputs['BSDF'], self.out.inputs['Surface'])
        tc = self.node('ShaderNodeTexCoord')
        self.P = tc.outputs['Object']
        geo = self.node('ShaderNodeNewGeometry')
        self.N = geo.outputs['Normal']
        self.point = geo.outputs['Pointiness']
        sep = self.node('ShaderNodeSeparateXYZ')
        self.link(self.P, sep.inputs[0])
        self.px, self.py, self.pz = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
        sepn = self.node('ShaderNodeSeparateXYZ')
        self.link(self.N, sepn.inputs[0])
        self.nx, self.ny, self.nz = sepn.outputs['X'], sepn.outputs['Y'], sepn.outputs['Z']

    def node(self, kind, **inputs):
        n = self.nt.nodes.new(kind)
        n.location = (self.x, 0)
        self.x += 40
        for k, v in inputs.items():
            n.inputs[k].default_value = v
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def val(self, sock_or_val):
        return sock_or_val

    def _in(self, node, idx, v):
        if hasattr(v, 'is_output'):
            self.link(v, node.inputs[idx])
        else:
            sock = node.inputs[idx]
            if sock.type == 'RGBA' and isinstance(v, (int, float)):
                v = (v, v, v, 1.0)
            sock.default_value = v

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        self._in(n, 0, a)
        self._in(n, 1, b)
        return n.outputs[0]

    def vmath(self, op, a, b=(0, 0, 0)):
        n = self.node('ShaderNodeVectorMath')
        n.operation = op
        self._in(n, 0, a)
        self._in(n, 1, b)
        return n.outputs[0]

    def noise(self, vec=None, scale=1.0, detail=4.0, rough=0.55, dist=0.0, w=None):
        n = self.node('ShaderNodeTexNoise')
        if w is not None:
            n.noise_dimensions = '4D'
            n.inputs['W'].default_value = w
        self.link(vec if vec is not None else self.P, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = dist
        return n.outputs['Fac']

    def voronoi(self, vec=None, scale=1.0, feature='F1', out='Distance', rnd=1.0):
        n = self.node('ShaderNodeTexVoronoi')
        n.feature = feature
        self.link(vec if vec is not None else self.P, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale
        n.inputs['Randomness'].default_value = rnd
        return n.outputs[out]

    def scale_vec(self, sx, sy, sz, vec=None):
        n = self.node('ShaderNodeMapping')
        self.link(vec if vec is not None else self.P, n.inputs['Vector'])
        n.inputs['Scale'].default_value = (sx, sy, sz)
        return n.outputs['Vector']

    def ramp(self, fac, stops):
        """stops: [(pos, value_or_rgb)]; returns a Color socket."""
        n = self.node('ShaderNodeValToRGB')
        self._in(n, 0, fac)
        el = n.color_ramp.elements
        while len(el) < len(stops):
            el.new(0.5)
        for e, (pos, c) in zip(el, stops):
            e.position = pos
            e.color = c if (isinstance(c, tuple) and len(c) == 4) else (c, c, c, 1.0) if not isinstance(c, tuple) else (*c, 1.0)
        return n.outputs['Color']

    def mix(self, fac, a, b, blend='MIX'):
        n = self.node('ShaderNodeMix')
        n.data_type = 'RGBA'
        n.blend_type = blend
        self._in(n, 0, fac)
        sa = [s for s in n.inputs if s.name == 'A' and s.type == 'RGBA'][0]
        sb = [s for s in n.inputs if s.name == 'B' and s.type == 'RGBA'][0]
        for s, v in ((sa, a), (sb, b)):
            if hasattr(v, 'is_output'):
                self.link(v, s)
            else:
                s.default_value = v
        return [s for s in n.outputs if s.name == 'Result' and s.type == 'RGBA'][0]

    def fmix(self, fac, a, b):
        n = self.node('ShaderNodeMix')
        n.data_type = 'FLOAT'
        self._in(n, 0, fac)
        sa = [s for s in n.inputs if s.name == 'A' and s.type == 'VALUE'][0]
        sb = [s for s in n.inputs if s.name == 'B' and s.type == 'VALUE'][0]
        for s, v in ((sa, a), (sb, b)):
            if hasattr(v, 'is_output'):
                self.link(v, s)
            else:
                s.default_value = v
        return [s for s in n.outputs if s.name == 'Result' and s.type == 'VALUE'][0]

    def smooth(self, x, lo, hi):
        n = self.node('ShaderNodeMapRange')
        n.interpolation_type = 'SMOOTHSTEP'
        self._in(n, 0, x)
        self._in(n, 1, lo)
        self._in(n, 2, hi)
        return n.outputs[0]

    def bump(self, height, strength=0.3, distance=0.02, normal=None):
        n = self.node('ShaderNodeBump')
        self._in(n, 'Height', height)
        n.inputs['Strength'].default_value = strength
        n.inputs['Distance'].default_value = distance
        if normal is not None:
            self.link(normal, n.inputs['Normal'])
        return n.outputs['Normal']

    def finish(self, color, rough, metal, normal=None, mat=None):
        self._in(self.bsdf, 'Base Color', color)
        self._in(self.bsdf, 'Roughness', rough)
        self._in(self.bsdf, 'Metallic', metal)
        if normal is not None:
            self.link(normal, self.bsdf.inputs['Normal'])
        # remember the metallic signal for the EMIT bake
        em = self.node('ShaderNodeEmission')
        em.name = 'METAL_EMIT'
        self._in(em, 'Color', metal)
        em.inputs['Strength'].default_value = 1.0
        # metals have no diffuse pass: the albedo is baked through emission too
        ec = self.node('ShaderNodeEmission')
        ec.name = 'COLOR_EMIT'
        self._in(ec, 'Color', color)
        ec.inputs['Strength'].default_value = 1.0


# ------------------------------------------------------------------ shared masks
def cavity(t, color, dark=0.55, light=1.12, lo=0.47, hi=0.53):
    concave = t.smooth(t.point, lo, lo - 0.08)
    convex = t.smooth(t.point, hi, hi + 0.08)
    color = t.mix(concave, color, t.mix(1.0, color, srgb((dark * 0.6, dark * 0.55, dark * 0.5)), 'MULTIPLY'))
    color = t.mix(t.math('MULTIPLY', convex, 0.6), color, t.mix(1.0, color, srgb((light, light, light * 0.97)), 'MULTIPLY'))
    return color


def length3(t, p):
    d = t.vmath('SUBTRACT', t.P, p)
    n = t.node('ShaderNodeVectorMath')
    n.operation = 'LENGTH'
    t.link(d, n.inputs[0])
    return n.outputs['Value']


def near(t, p, r0, r1):
    """1 within r0 of the point p, fading to 0 at r1."""
    return t.smooth(length3(t, p), r1, r0)


def chip(t, mask, scale=7.0):
    return t.math('MULTIPLY', mask, t.smooth(t.noise(scale=scale, detail=4, w=1.3), 0.3, 0.42))


def streaks(t, scale=9.0):
    """Vertical run-off streaks (rain, condensate, oil)."""
    return t.smooth(t.noise(t.scale_vec(scale, scale, 0.55), scale=1.0, detail=3, rough=0.5), 0.55, 0.72)


# The hot spots: joints that arc and vent, the empty socket, the stack mouths.
HOT = [((0, -1.0, 7.58), 0.5, 1.6), ((2.7, 0.3, 8.5), 0.4, 1.3), ((-2.7, 0.3, 8.5), 0.4, 1.3),
       ((3.15, 0.55, 5.8), 0.3, 1.0), ((-3.15, 0.55, 5.8), 0.3, 1.0), ((1.55, -0.12, 2.55), 0.3, 0.9),
       ((-1.55, -0.12, 2.55), 0.3, 0.9), ((0.65, 2.25, 10.7), 0.2, 1.0), ((-0.65, 2.25, 10.7), 0.2, 1.0),
       ((0, 0.16, 5.8), 0.3, 1.0)]


def scorch_mask(t):
    m = None
    for p, r0, r1 in HOT:
        n = near(t, p, r0, r1)
        m = n if m is None else t.math('MAXIMUM', m, n)
    brk = t.smooth(t.noise(scale=2.6, detail=5, rough=0.62, w=3.0), 0.38, 0.62)
    return t.math('MULTIPLY', m, brk)


def soot(t, color, rough, amount):
    color = t.mix(amount, color, srgb((0.035, 0.03, 0.028)))
    rough = t.fmix(amount, rough, 0.9)
    return color, rough


def grime(t, color, rough, strength=0.5):
    low = t.smooth(t.pz, 2.6, 0.2)
    g = t.math('MULTIPLY', t.math('MAXIMUM', low, t.math('MULTIPLY', streaks(t), 0.6)), strength)
    color = t.mix(g, color, t.mix(1.0, color, srgb((0.42, 0.38, 0.33)), 'MULTIPLY'))
    return color, rough


BRASS = (0.66, 0.48, 0.2)
BRASS_DARK = (0.34, 0.23, 0.09)
BRASS_BRIGHT = (0.95, 0.8, 0.45)
VERD = (0.26, 0.56, 0.47)
IRON_EDGE = (0.5, 0.5, 0.52)
RUST = (0.34, 0.15, 0.07)
HAZ_Y = (0.86, 0.64, 0.07)


def shade(mat, kind):
    t = NT(mat)
    k = kind
    concave = t.smooth(t.point, 0.48, 0.41)
    convex = t.smooth(t.point, 0.52, 0.6)
    scorch = scorch_mask(t)
    if k == 'brass':
        big = t.noise(scale=0.55, detail=3, rough=0.5)
        color = t.ramp(big, [(0.32, srgb(BRASS_DARK)), (0.55, srgb(BRASS)), (0.75, srgb((0.8, 0.62, 0.28)))])
        tarn = t.smooth(t.noise(scale=2.2, detail=5, rough=0.6, w=1.7), 0.4, 0.62)
        color = t.mix(t.math('MULTIPLY', tarn, 0.75), color, srgb((0.2, 0.14, 0.07)))
        rough = t.fmix(tarn, 0.3, 0.52)
        edge = t.math('MULTIPLY', convex, 0.85)
        color = t.mix(edge, color, srgb(BRASS_BRIGHT))
        rough = t.fmix(edge, rough, 0.2)
        # verdigris: in the seams and round the rivets, and running down in streaks
        vmask = t.math('MULTIPLY', t.smooth(t.point, 0.495, 0.44), t.smooth(t.noise(scale=4.5, detail=4, w=2.2), 0.25, 0.5))
        vmask = t.math('MAXIMUM', vmask, t.math('MULTIPLY', t.math('MULTIPLY', streaks(t, 7.0), 0.9),
                                               t.smooth(t.noise(scale=1.1, detail=3, w=5.0), 0.46, 0.6)))
        vmask = t.math('MAXIMUM', vmask, t.math('MULTIPLY', t.smooth(t.noise(scale=3.0, detail=6, rough=0.7, w=8.0), 0.6, 0.72), 0.8))
        vc = t.mix(t.noise(scale=9, detail=3), srgb(VERD), srgb((0.42, 0.66, 0.56)))
        color = t.mix(vmask, color, vc)
        rough = t.fmix(vmask, rough, 0.85)
        metal = t.fmix(vmask, 0.92, 0.0)
        color, rough = soot(t, color, rough, t.math('MULTIPLY', scorch, 0.85))
        metal = t.fmix(t.math('MULTIPLY', scorch, 0.8), metal, 0.2)
        color = cavity(t, color, dark=0.7, light=1.05)
        h = t.math('ADD', t.math('MULTIPLY', t.voronoi(scale=26.0), 0.5),
                   t.math('MULTIPLY', t.noise(t.scale_vec(40, 40, 3), scale=1.0, detail=2), 0.4))
        normal = t.bump(h, strength=0.04, distance=0.006)
    elif k in ('iron', 'socket'):
        base = t.noise(scale=1.4, detail=4, rough=0.55)
        color = t.ramp(base, [(0.35, srgb((0.11, 0.115, 0.13))), (0.65, srgb((0.2, 0.2, 0.22)))])
        rust = t.smooth(t.noise(scale=3.2, detail=5, rough=0.62, w=4.4), 0.56, 0.7)
        rust = t.math('MAXIMUM', rust, t.math('MULTIPLY', concave, t.smooth(t.noise(scale=6, detail=3, w=1.1), 0.45, 0.6)))
        rust = t.math('MAXIMUM', rust, t.math('MULTIPLY', streaks(t, 10.0), 0.6))
        rc = t.mix(t.noise(scale=12, detail=3), srgb(RUST), srgb((0.48, 0.24, 0.1)))
        color = t.mix(t.math('MULTIPLY', rust, 0.8), color, rc)
        rough = t.fmix(rust, 0.55, 0.92)
        metal = t.fmix(rust, 0.85, 0.1)
        edge = t.math('MULTIPLY', convex, 0.8)
        color = t.mix(edge, color, srgb(IRON_EDGE))
        rough = t.fmix(edge, rough, 0.32)
        metal = t.fmix(edge, metal, 1.0)
        if k == 'socket':
            heat = t.math('MULTIPLY', near(t, (0, -0.8, 7.58), 0.15, 0.75), t.smooth(t.noise(scale=3, detail=3), 0.3, 0.6))
            hc = t.ramp(near(t, (0, -0.8, 7.58), 0.1, 0.8),
                        [(0.0, srgb((0.12, 0.14, 0.3))), (0.5, srgb((0.3, 0.16, 0.36))), (1.0, srgb((0.62, 0.48, 0.2)))])
            color = t.mix(t.math('MULTIPLY', heat, 0.9), color, hc)
            color, rough = soot(t, color, rough, t.math('MULTIPLY', t.smooth(t.noise(scale=4, detail=4), 0.3, 0.55), 0.75))
        color, rough = soot(t, color, rough, t.math('MULTIPLY', scorch, 0.7))
        color = cavity(t, color, dark=0.6, light=1.0)
        h = t.math('ADD', t.math('MULTIPLY', t.noise(scale=30, detail=4), 0.6), t.math('MULTIPLY', rust, 0.5))
        normal = t.bump(h, strength=0.18, distance=0.01)
    elif k == 'steel':
        color = t.mix(t.smooth(t.noise(scale=3, detail=3), 0.4, 0.7), srgb((0.72, 0.73, 0.75)), srgb((0.5, 0.5, 0.52)))
        oil = t.math('MULTIPLY', streaks(t, 14.0), 0.7)
        color = t.mix(oil, color, srgb((0.18, 0.16, 0.13)))
        rough = t.fmix(oil, 0.16, 0.42)
        metal = 1.0
        color, rough = soot(t, color, rough, t.math('MULTIPLY', scorch, 0.5))
        normal = t.bump(t.noise(t.scale_vec(60, 60, 2), scale=1.0, detail=2), strength=0.06, distance=0.005)
    elif k == 'copper':
        color = t.mix(convex, srgb((0.62, 0.3, 0.16)), srgb((0.9, 0.55, 0.36)))
        v = t.smooth(t.noise(scale=6, detail=4, w=2.4), 0.4, 0.58)
        color = t.mix(v, color, srgb(VERD))
        rough = t.fmix(v, 0.3, 0.85)
        metal = t.fmix(v, 1.0, 0.0)
        color, rough = soot(t, color, rough, t.math('MULTIPLY', t.smooth(t.noise(scale=5, detail=3), 0.45, 0.7), 0.8))
        normal = t.bump(t.noise(scale=25, detail=3), strength=0.1, distance=0.01)
    elif k == 'ceramic':
        cz = t.voronoi(scale=34, feature='DISTANCE_TO_EDGE')
        craze = t.smooth(cz, 0.025, 0.0)
        color = t.mix(t.math('MULTIPLY', craze, 0.6), srgb((0.86, 0.83, 0.74)), srgb((0.42, 0.38, 0.3)))
        color = t.mix(t.math('MULTIPLY', concave, 0.7), color, srgb((0.3, 0.27, 0.22)))
        color, rough = soot(t, color, 0.18, t.math('MULTIPLY', t.smooth(t.noise(scale=3.5, detail=3), 0.5, 0.75), 0.6))
        metal = 0.0
        normal = t.bump(craze, strength=0.08, distance=0.004)
    elif k == 'cable':
        braid = t.voronoi(scale=55.0, feature='DISTANCE_TO_EDGE')
        color = t.mix(t.smooth(t.noise(scale=4, detail=3), 0.4, 0.7), srgb((0.06, 0.055, 0.055)), srgb((0.11, 0.1, 0.09)))
        color = t.mix(t.math('MULTIPLY', t.smooth(braid, 0.06, 0.0), 0.5), color, srgb((0.02, 0.02, 0.02)))
        dust = t.math('MULTIPLY', t.smooth(t.nz, 0.2, 0.9), 0.35)
        color = t.mix(dust, color, srgb((0.3, 0.27, 0.22)))
        rough = 0.62
        metal = 0.0
        normal = t.bump(braid, strength=0.25, distance=0.01)
    elif k == 'hazard':
        diag = t.math('ADD', t.math('ADD', t.px, t.pz), t.math('MULTIPLY', t.py, 0.4))
        stripe = t.smooth(t.math('ABSOLUTE', t.math('SUBTRACT', t.math('FRACT', t.math('MULTIPLY', diag, 3.2)), 0.5)),
                          0.24, 0.26)
        color = t.mix(stripe, srgb((0.03, 0.03, 0.03)), srgb(HAZ_Y))
        rough = 0.58
        worn = t.math('MAXIMUM', convex, t.smooth(t.noise(scale=7, detail=4, w=2.0), 0.62, 0.7))
        worn = chip(t, worn, 9.0)
        color = t.mix(worn, color, srgb((0.35, 0.36, 0.38)))
        rough = t.fmix(worn, rough, 0.38)
        metal = t.fmix(worn, 0.0, 1.0)
        color, rough = grime(t, color, rough, 0.6)
        color, rough = soot(t, color, rough, t.math('MULTIPLY', scorch, 0.6))
        color = cavity(t, color, dark=0.6, light=1.0)
        normal = t.bump(t.math('MULTIPLY', worn, -1.0), strength=0.15, distance=0.006)
    else:
        raise KeyError(k)
    if k in ('brass', 'iron', 'steel'):
        color, rough = grime(t, color, rough, 0.5)
    t.finish(color, rough, metal, normal)
    return mat


KINDS = ('brass', 'iron', 'socket', 'steel', 'copper', 'ceramic', 'cable', 'hazard')


def bake_materials():
    return {k: shade(bpy.data.materials.new('Bake_' + k), k) for k in KINDS}


# ------------------------------------------------------------------ uv
def unwrap(objs, scale_fn=None, margin=float(os.environ.get('UV_MARGIN', 0.0012)), angle=float(os.environ.get('UV_ANGLE', 72.0))):
    """One shared UV atlas over many low objects: smart project, equalize texel
    density, then let `scale_fn(obj, face_center) -> float` boost islands (the
    face, the eye and the hands get more texels), and pack."""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0,
                             scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    if scale_fn is not None:
        import bmesh
        for o in objs:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            uv = bm.loops.layers.uv.active
            # islands: flood over shared UV coordinates
            seen = set()
            for f in bm.faces:
                if f.index in seen:
                    continue
                stack, island = [f], []
                seen.add(f.index)
                while stack:
                    g = stack.pop()
                    island.append(g)
                    for e in g.edges:
                        for h in e.link_faces:
                            if h.index in seen:
                                continue
                            # same island if the UVs agree across the edge
                            ok = True
                            for v in e.verts:
                                a = [lp[uv].uv for lp in g.loops if lp.vert == v][0]
                                b = [lp[uv].uv for lp in h.loops if lp.vert == v][0]
                                if (a - b).length > 1e-5:
                                    ok = False
                            if ok:
                                seen.add(h.index)
                                stack.append(h)
                c = sum((g.calc_center_median() for g in island), start=island[0].calc_center_median() * 0) / len(island)
                k = scale_fn(o, c)
                if abs(k - 1.0) > 1e-3:
                    uvs = [lp[uv] for g in island for lp in g.loops]
                    cen = sum((l.uv for l in uvs), start=uvs[0].uv * 0) / len(uvs)
                    for l in uvs:
                        l.uv = cen + (l.uv - cen) * k
            bm.to_mesh(o.data)
            bm.free()
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    try:
        bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION', margin=margin,
                                shape_method='CONCAVE', scale=True)
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


# ------------------------------------------------------------------ bake
def bake_all(highs, low, size=4096, samples=64, cage=0.05, ray=0.35, out_dir=None):
    """Bake every pass selected-to-active from `highs` onto the joined `low`.
    Returns numpy arrays (albedo, normal, rough, metal, ao), each (size, size, 4)."""
    from stage import use_gpu
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    print('BAKE_DEVICE', use_gpu(scene), flush=True)
    scene.cycles.samples = samples
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = cage
    scene.render.bake.max_ray_distance = ray
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    # Only the highs may occlude or be hit: hide every other object from the
    # render, and make the low itself invisible to rays (else the occlusion pass
    # sees the low skin hovering over the high one and goes black in patches).
    hidden = []
    for o in scene.objects:
        if o is low or o in highs or o.hide_render:
            continue
        o.hide_render = True
        hidden.append(o)
    for attr in ('visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission',
                 'visible_volume_scatter', 'visible_shadow'):
        setattr(low, attr, False)
    target = bpy.data.materials.new('BakeTarget')
    target.use_nodes = True
    low.data.materials.clear()
    low.data.materials.append(target)
    node = target.node_tree.nodes.new('ShaderNodeTexImage')
    target.node_tree.nodes.active = node
    results = {}

    def run(name, btype, colorspace='sRGB', **kw):
        img = bpy.data.images.new(f'PrimeDraft_{name}', size, size, alpha=False, float_buffer=(name == 'normal'))
        img.colorspace_settings.name = colorspace
        node.image = img
        for o in bpy.context.selected_objects:
            o.select_set(False)
        for h in highs:
            h.select_set(True)
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.bake(type=btype, **kw)
        a = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
        results[name] = a
        if out_dir:
            img.filepath_raw = os.path.join(out_dir, f'primedraft_{name}_raw.png')
            img.file_format = 'PNG'
            img.save()
        print('BAKED', name, a[..., :3].mean(axis=(0, 1)), flush=True)
        return img

    scene.cycles.samples = 16

    def emit_pass(name, node_name, colorspace):
        saved = []
        for m in {s.material for h in highs for s in h.material_slots if s.material is not None}:
            if node_name not in m.node_tree.nodes:
                continue
            nt = m.node_tree
            out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
            prev = out.inputs['Surface'].links[0].from_socket
            nt.links.new(nt.nodes[node_name].outputs[0], out.inputs['Surface'])
            saved.append((nt, prev, out))
        run(name, 'EMIT', colorspace)
        for nt, prev, out in saved:
            nt.links.new(prev, out.inputs['Surface'])

    emit_pass('albedo', 'COLOR_EMIT', 'sRGB')
    run('rough', 'ROUGHNESS', 'Non-Color')
    emit_pass('metal', 'METAL_EMIT', 'Non-Color')
    scene.cycles.samples = 8
    run('normal', 'NORMAL', 'Non-Color', normal_space='TANGENT')
    scene.cycles.samples = samples
    scene.world = scene.world or bpy.data.worlds.new('bakeworld')
    scene.world.light_settings.distance = 0.9
    run('ao', 'AO', 'Non-Color')
    for o in hidden:
        o.hide_render = False
    return results
