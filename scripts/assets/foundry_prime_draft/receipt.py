"""Write delivery_receipt.json (file list with sizes and sha256) into a delivery dir.

  python receipt.py <delivery_dir> <final_stats.json>
"""
import hashlib
import json
import os
import sys

root, stats = sys.argv[1], sys.argv[2]
files = {}
for d, _, fs in os.walk(root):
    for f in sorted(fs):
        if f == 'delivery_receipt.json':
            continue
        full = os.path.join(d, f)
        rel = os.path.relpath(full, root).replace(os.sep, '/')
        files[rel] = {'bytes': os.path.getsize(full), 'sha256': hashlib.sha256(open(full, 'rb').read()).hexdigest()}
st = json.load(open(stats))
rec = {'asset': 'prime_draft', 'delivered': '2026-10-02', 'ship': 'glb/prime_draft.glb',
       'ship_light': 'glb/prime_draft_normal1024.glb', 'triangles': st['tris_total'], 'bones': st['bones'],
       'materials': st['materials'], 'idle_height_yd': round(st['idle_height'], 2), 'clips': st['clips'],
       'forward': 'glTF +Z', 'notes': 'NOTAS.md', 'files': files}
json.dump(rec, open(os.path.join(root, 'delivery_receipt.json'), 'w'), indent=1)
print(len(files), 'files')
