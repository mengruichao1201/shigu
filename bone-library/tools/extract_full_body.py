import json, os, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_source')
ZIP = os.path.join(SRC, 'isa_BP3D_4.0_obj_99.zip')
PREFIX = 'isa_BP3D_4.0_obj_99/'

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
FINGERS = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger']
TOES = ['big toe', 'second toe', 'third toe', 'fourth toe', 'little toe']

wanted = []  # (group, base_name, paired)
for n in ['third', 'fourth', 'fifth', 'sixth']:
    wanted.append(('trunk', f'{n} cervical vertebra', False))
for n in NUM:
    if n != 'fifth':
        wanted.append(('trunk', f'{n} thoracic vertebra', False))
for n in NUM[:5]:
    if n != 'third':
        wanted.append(('trunk', f'{n} lumbar vertebra', False))
for n in NUM:
    wanted.append(('trunk', f'{n} rib', True))
for n in NUM[:5]:
    wanted.append(('upper', f'{n} metacarpal bone', True))
    wanted.append(('lower', f'{n} metatarsal bone', True))
for f in FINGERS:
    wanted.append(('upper', f'proximal phalanx of {f}', True))
    wanted.append(('upper', f'distal phalanx of {f}', True))
for f in FINGERS[1:]:
    wanted.append(('upper', f'middle phalanx of {f}', True))
for t in TOES:
    wanted.append(('lower', f'proximal phalanx of {t}', True))
    wanted.append(('lower', f'distal phalanx of {t}', True))
for t in TOES[1:]:
    wanted.append(('lower', f'middle phalanx of {t}', True))

sided = [('lower', f'{s} {b}') for b in
         ['medial cuneiform bone', 'intermediate cuneiform bone', 'lateral cuneiform bone']
         for s in ['right', 'left']]
sided += [('lower', 'navicular bone of right foot'), ('lower', 'navicular bone of left foot')]

def resolve(name):
    fma = name2fma.get(name.lower())
    return fma2fj.get(fma, []) if fma else []

zf = zipfile.ZipFile(ZIP)
have = set(os.listdir(os.path.join(SRC, 'obj')))
groups = {'skull': [], 'trunk': [], 'upper': [], 'lower': []}
seen = {g: set() for g in groups}
extracted, mirrored, missing = 0, [], []

def add(g, fs, mirror):
    global extracted
    for f in fs:
        if (f, mirror) in seen[g]:
            continue
        if f not in have:
            with zf.open(PREFIX + f) as s, open(os.path.join(SRC, 'obj', f), 'wb') as d:
                d.write(s.read())
            have.add(f)
            extracted += 1
        seen[g].add((f, mirror))
        groups[g].append({'f': f, 'mirror': mirror})

cat2group = {'01_颅骨': 'skull', '02_躯干骨': 'trunk', '03_上肢骨': 'upper', '04_下肢骨': 'lower'}
catalog = json.load(open(os.path.join(ROOT, 'catalog.json'), encoding='utf-8'))
for b in catalog['bones']:
    g = cat2group[b['cat']]
    add(g, b['files'], False)
    en = b['en'].split('(')[0].strip().lower()
    lfma = name2fma.get('left ' + en)
    if lfma and lfma != b['fma']:
        add(g, fma2fj.get(lfma, []), False)

for g, base, paired in wanted:
    right = (resolve(f'right {base}') or resolve(base.replace(' of ', ' of right ', 1))
             or resolve(base))
    if not right:
        missing.append(base)
        continue
    add(g, right, False)
    if paired:
        left = resolve(f'left {base}') or resolve(base.replace(' of ', ' of left ', 1))
        if left:
            add(g, left, False)
        else:
            mirrored.append(base)
            add(g, right, True)

for g, name in sided:
    fs = resolve(name)
    if fs:
        add(g, fs, False)
    else:
        missing.append(name)

json.dump(groups, open(os.path.join(SRC, 'full_body_map.json'), 'w', encoding='utf-8'), indent=1)
print('extracted', extracted, 'mirrored_left', len(mirrored), mirrored)
print('missing', missing)
print({k: len(v) for k, v in groups.items()})