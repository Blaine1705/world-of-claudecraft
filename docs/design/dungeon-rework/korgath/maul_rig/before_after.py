"""Before/after close-ups of the grip (hand-only mask) from the review .blend."""
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlib
from mathutils import Vector, Matrix
BLEND, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
me = bpy.data.objects['Korgath']
for o in list(bpy.data.objects):
    if o.type in ('CAMERA', 'LIGHT') or o.name.startswith('Review'): bpy.data.objects.remove(o, do_unlink=True)
keep = ('hand.', 'fingers.', 'hammer', 'lowerarm.', 'index.', 'middle.', 'ring.', 'pinky.', 'thumb.')
g = me.vertex_groups.get('BAmask') or me.vertex_groups.new(name='BAmask')
gname = {x.index: x.name for x in me.vertex_groups}
g.add([v.index for v in me.data.vertices if sum(x.weight for x in v.groups if gname[x.group].startswith(keep)) > 0.5], 1.0, 'REPLACE')
m = me.modifiers.new('BAmask', 'MASK'); m.vertex_group = 'BAmask'
rlib.setup_bench((700, 700))
def use(name):
    a = bpy.data.actions[name]; arm.animation_data.action = a
    if a.slots: arm.animation_data.action_slot = a.slots[0]
def shoot(tag, side, dirs, dist=3.4):
    c = (rlib.bone_pos(arm, 'hand.' + side) + rlib.bone_pos(arm, 'fingers.' + side)) / 2
    chest = rlib.bone_pos(arm, 'chest')
    out = (c - chest).normalized()
    for k, d in dirs.items():
        cam = rlib.camera('g', c + (out + Vector(d)).normalized() * dist, c, lens=50)
        rlib.render(cam, os.path.join(OUT, '%s_%s.png' % (tag, k)))
V = {'a': (0, 0, 0.5), 'b': (0, -1.0, 0.1), 'c': (0, 0.9, 0.2)}
# right fist at Idle: the body's clip (finger bone bent 88 degrees) vs the modeled fist
use('Idle'); bpy.context.scene.frame_set(0)
basis = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
arm.animation_data.action = None
for pb in arm.pose.bones: pb.matrix_basis = basis[pb.name]
bpy.context.view_layer.update()
import math
print('FINGERS_R_ANGLE', math.degrees(arm.pose.bones['fingers.r'].matrix_basis.to_quaternion().angle))
shoot('antes_idle_mano_derecha', 'r', V)
arm.pose.bones['fingers.r'].matrix_basis = Matrix(); bpy.context.view_layer.update()
print('FINGERS_R_ANGLE', math.degrees(arm.pose.bones['fingers.r'].matrix_basis.to_quaternion().angle))
shoot('despues_idle_mano_derecha', 'r', V)
# both hands through the new blows
for clip, fr in (('HammerSlam', (6, 11, 14, 17)), ('HammerSweep', (11, 15, 17, 20))):
    use(clip)
    for f in fr:
        bpy.context.scene.frame_set(f)
        for side, nm in (('l', 'izquierda'), ('r', 'derecha')):
            shoot('despues_%s_%02d_mano_%s' % (clip, f, nm), side, {'a': (0, 0, 0.5), 'b': (0, -1.0, 0.1)})
