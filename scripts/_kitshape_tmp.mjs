import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const file = process.argv[2];
const want = process.argv.slice(3);
const doc = await io.readBinary(new Uint8Array(readFileSync(file)));
for (const node of doc.getRoot().listNodes()) {
  const name = node.getName();
  if (want.length && !want.some((w) => name.includes(w))) continue;
  const mesh = node.getMesh(); if (!mesh) { console.log(name, '(no mesh)', node.getTranslation().map(v=>v.toFixed(2)).join(',')); continue; }
  const m = node.getWorldMatrix();
  const min=[1e9,1e9,1e9], max=[-1e9,-1e9,-1e9];
  for (const prim of mesh.listPrimitives()) { const a = prim.getAttribute('POSITION'); const e=[]; for (let i=0;i<a.getCount();i++){a.getElement(i,e); const p=[m[0]*e[0]+m[4]*e[1]+m[8]*e[2]+m[12],m[1]*e[0]+m[5]*e[1]+m[9]*e[2]+m[13],m[2]*e[0]+m[6]*e[1]+m[10]*e[2]+m[14]]; for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}}}
  console.log(name, 'min', min.map(v=>v.toFixed(2)).join(','), 'max', max.map(v=>v.toFixed(2)).join(','), 'prims', mesh.listPrimitives().map(p=>p.getMaterial()?.getName()).join('|'));
}
