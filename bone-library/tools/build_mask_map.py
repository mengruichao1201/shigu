import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_source')

name2fma = {}
for line in open(os.path.join(SRC, 'isa_parts_list.txt'), encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) >= 3:
        name2fma[p[2].strip().lower()] = p[0]
fma2fj = {}
for line in open(os.path.join(SRC, 'isa_element_parts.txt'), encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) >= 3 and p[2].strip():
        fma2fj.setdefault(p[0], []).append(p[2].strip() + '.obj')

NUM = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
       'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']

def resolve(name):
    fma = name2fma.get(name.lower())
    return fma2fj.get(fma, []) if fma else []

def slug(en):
    return re.sub(r'[^a-z0-9]+', '_', en.split('(')[0].lower()).strip('_')

catalog = json.load(open(os.path.join(ROOT, 'catalog.json'), encoding='utf-8'))
mapping = json.load(open(os.path.join(SRC, 'full_body_map.json'), encoding='utf-8'))
bones = json.load(open(os.path.join(ROOT, '..', 'bone-quiz', 'assets', 'bones.json'), encoding='utf-8'))
cn_by_id = {b['id']: b['cn'] for b in bones['bones']}
cat2group = {'01_颅骨': 'skull', '02_躯干骨': 'trunk', '03_上肢骨': 'upper', '04_下肢骨': 'lower'}
by_slug = {slug(b['en']): b for b in catalog['bones']}

TARGETS = ['frontal_bone', 'mandible', 'sternum', 'rib', 'lumbar_vertebra', 'sacrum',
           'clavicle', 'scapula', 'humerus', 'radius', 'ulna',
           'hip_bone', 'femur', 'patella', 'tibia', 'fibula']

def files_for(names):
    fs = set()
    for base in names:
        fs.update(resolve(f'right {base}') or resolve(base.replace(' of ', ' of right ', 1)) or resolve(base))
        fs.update(resolve(f'left {base}') or resolve(base.replace(' of ', ' of left ', 1)))
    return fs

out = {}
for t in TARGETS:
    if t == 'rib':
        fs = files_for([f'{n} rib' for n in NUM])
        g = 'trunk'
    elif t == 'lumbar_vertebra':
        fs = set()
        for n in NUM[:5]:
            fs.update(resolve(f'{n} lumbar vertebra'))
        g = 'trunk'
    else:
        b = by_slug[t]
        g = cat2group[b['cat']]
        fs = set(b['files'])
        en = b['en'].split('(')[0].strip().lower()
        lfma = name2fma.get('left ' + en)
        if lfma and lfma != b['fma']:
            fs.update(fma2fj.get(lfma, []))
    entries = [e for e in mapping[g] if e['f'] in fs]
    if not entries:
        raise SystemExit(f'no meshes for {t}')
    out[t] = {'group': g, 'cn': cn_by_id[t], 'entries': entries}

json.dump(out, open(os.path.join(SRC, 'mask_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print({t: len(v['entries']) for t, v in out.items()})