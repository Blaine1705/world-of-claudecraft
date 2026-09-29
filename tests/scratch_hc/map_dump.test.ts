import { it } from 'vitest';
import fs from 'node:fs';
import { isBlocked } from '../../src/sim/colliders';
import { DUNGEONS, instanceOrigin } from '../../src/sim/data';
import { groundHeight } from '../../src/sim/world';
import { authoredFieldColliders, authoredFieldFor } from '../../src/sim/instances/authored_field';

it('dump', () => {
  const d = DUNGEONS.hollow_crypt;
  const o = instanceOrigin(d.index, 0);
  const field = authoredFieldFor('hollow_crypt')!;
  console.log('colliders', authoredFieldColliders(field, 0).length);
  const rows: string[] = [];
  const t0 = Date.now();
  for (let z = 246; z >= -146; z -= 2) {
    let row = '';
    for (let x = -114; x <= 114; x += 2) {
      const h = groundHeight(o.x + x, o.z + z, 1);
      const b = isBlocked(1, o.x + x, o.z + z, 0.5);
      row += b ? '#' : h <= -39 ? ' ' : h >= 20 ? 'L' : h >= 8 ? 'H' : h >= 4 ? '5' : h >= 1 ? '2' : h <= -5 ? 'v' : '.';
    }
    rows.push(`${String(z).padStart(4)} ${row}`);
  }
  console.log('ms', Date.now() - t0);
  fs.writeFileSync('C:/Users/joseg/AppData/Local/Temp/claude/C--Users-joseg-Desktop-world-of-claudecraft/08a07b0d-cfe0-4fe3-b1bb-eb3f5e05df79/scratchpad/map.txt', rows.join('\n'));
});
