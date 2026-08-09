// Author Ignivar's restrained boss motion on a Rig_Medium GLB.
//
// The stock Spellcasting clip waves both hands, which reads poorly on a
// top-heavy forge titan. ForgeIdle and ForgeCast instead freeze a planted
// KayKit pose; ForgeCast moves only chest/head as the furnace charges.
// ForgeSlam keeps the proven right-arm Punch_A motion while pinning the magma
// arm, so the oversized forge gauntlet is the clear source of the hit.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const args = process.argv.slice(2);
const inFile = args[0];
const outFile = args[1] ?? inFile;
if (!inFile) throw new Error('usage: node author_kaykit_boss_clips.mjs <in.glb> [out.glb]');

const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qX = (degrees) => {
  const radians = (degrees * Math.PI) / 180;
  return [Math.sin(radians / 2), 0, 0, Math.cos(radians / 2)];
};
const normalizeQuaternion = (value) => {
  const length = Math.hypot(...value) || 1;
  return value.map((component) => component / length);
};

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(inFile);
const root = document.getRoot();
const buffer = root.listBuffers()[0];
const animations = new Map(
  root.listAnimations().map((animation) => [animation.getName(), animation]),
);
const plantedSource = animations.get('Spellcasting');
const slamSource = animations.get('Punch_A');
if (!plantedSource || !slamSource) {
  throw new Error('Rig_Medium source must contain Spellcasting and Punch_A');
}

for (const name of ['ForgeIdle', 'ForgeCast', 'ForgeSlam']) animations.get(name)?.dispose();

function channelFirstValue(channel) {
  const sampler = channel.getSampler();
  const output = sampler?.getOutput();
  const array = output?.getArray();
  if (!sampler || !output || !array) throw new Error('animation channel is missing sampler output');
  const elementSize = output.getElementSize();
  const value = new Array(elementSize).fill(0);
  // getArray() exposes quantized integer storage for normalized animation
  // accessors; getElement() returns the dequantized floats Three.js expects.
  output.getElement(0, value);
  return {
    interpolation: sampler.getInterpolation(),
    targetNode: channel.getTargetNode(),
    targetPath: channel.getTargetPath(),
    type: output.getType(),
    value,
  };
}

function addTrack(animation, name, node, path, type, times, values, interpolation = 'LINEAR') {
  const input = document
    .createAccessor(`${animation.getName()}_${name}_times`)
    .setType('SCALAR')
    .setArray(new Float32Array(times))
    .setBuffer(buffer);
  const output = document
    .createAccessor(`${animation.getName()}_${name}_values`)
    .setType(type)
    .setArray(new Float32Array(values.flat()))
    .setBuffer(buffer);
  const sampler = document
    .createAnimationSampler()
    .setInput(input)
    .setOutput(output)
    .setInterpolation(interpolation);
  animation
    .addSampler(sampler)
    .addChannel(
      document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler),
    );
}

function authorFrozenPose(name, times, chestPitchDegrees = null) {
  const animation = document.createAnimation(name);
  for (const channel of plantedSource.listChannels()) {
    const first = channelFirstValue(channel);
    if (!first.targetNode) continue;
    const values = times.map(() => [...first.value]);
    if (
      chestPitchDegrees &&
      first.targetNode.getName() === 'chest' &&
      first.targetPath === 'rotation'
    ) {
      for (let key = 0; key < values.length; key++) {
        values[key] = normalizeQuaternion(qMul(first.value, qX(chestPitchDegrees[key])));
      }
    }
    addTrack(
      animation,
      `${first.targetNode.getName()}_${first.targetPath}`,
      first.targetNode,
      first.targetPath,
      first.type,
      times,
      values,
    );
  }
  return animation;
}

authorFrozenPose('ForgeIdle', [0, 3.2]);
authorFrozenPose('ForgeCast', [0, 0.28, 0.7, 1.16, 1.46], [0, -2, -5, -5, 0]);

const pinnedLeft = new Set(['upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l']);
const plantedChannels = new Map(
  plantedSource
    .listChannels()
    .filter((channel) => channel.getTargetNode())
    .map((channel) => [
      `${channel.getTargetNode().getName()}|${channel.getTargetPath()}`,
      channelFirstValue(channel),
    ]),
);
const slam = document.createAnimation('ForgeSlam');
for (const sourceChannel of slamSource.listChannels()) {
  const node = sourceChannel.getTargetNode();
  const sampler = sourceChannel.getSampler();
  if (!node || !sampler?.getInput() || !sampler.getOutput()) continue;
  if (pinnedLeft.has(node.getName())) {
    const planted = plantedChannels.get(`${node.getName()}|${sourceChannel.getTargetPath()}`);
    if (!planted) continue;
    const duration = 0.7;
    addTrack(
      slam,
      `${node.getName()}_${sourceChannel.getTargetPath()}`,
      node,
      sourceChannel.getTargetPath(),
      planted.type,
      [0, duration],
      [[...planted.value], [...planted.value]],
    );
    continue;
  }
  const clonedSampler = document
    .createAnimationSampler()
    .setInput(sampler.getInput())
    .setOutput(sampler.getOutput())
    .setInterpolation(sampler.getInterpolation());
  slam
    .addSampler(clonedSampler)
    .addChannel(
      document
        .createAnimationChannel()
        .setTargetNode(node)
        .setTargetPath(sourceChannel.getTargetPath())
        .setSampler(clonedSampler),
    );
}

await io.write(outFile, document);
console.log(`${inFile} -> ${outFile}`);
console.log('authored: ForgeIdle, ForgeCast (planted), ForgeSlam (right gauntlet)');
