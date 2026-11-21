import json, os, re, datetime
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(os.path.dirname(ROOT), 'bone-quiz')
OUT = os.path.join(SITE, 'assets', 'bones')
CAT2G = {'01_颅骨': 'skull', '02_躯干骨': 'trunk', '03_上肢骨': 'upper', '04_下肢骨': 'lower'}

manifest = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))
content = json.load(open(os.path.join(ROOT, 'tools', 'kb_content.json'), encoding='utf-8'))

def slug(en):
    return re.sub(r'[^a-z0-9]+', '_', en.split('(')[0].lower()).strip('_')

bones, n = [], 0
for b in manifest['bones']:
    g = CAT2G[b['cat']]
    s = slug(b['en'])
    c = content['bones'][s]
    views = {}
    for v in ['front', 'side', 'back']:
        src = os.path.join(ROOT, b['views'][v])
        dst_dir = os.path.join(OUT, g)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, f'{s}_{v}.webp')
        im = Image.open(src).convert('RGB')
        if im.width > 640:
            im = im.resize((640, round(im.height * 640 / im.width)), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=82, method=6)
        views[v] = f'bones/{g}/{s}_{v}.webp'
        n += 1
    bones.append({'id': s, 'cn': b['cn'], 'en': b['en'], 'cat': g,
                  'views': views, 'intro': c['intro'], 'points': c['points']})

for g in CAT2G.values():
    im = Image.open(os.path.join(ROOT, '_body', g + '.png')).convert('RGBA')
    im.save(os.path.join(OUT, f'body_{g}.webp'), 'WEBP', quality=90, method=6)

data = {'ver': datetime.datetime.now().isoformat(timespec='seconds'),
        'cats': content['cats'], 'bones': bones}
json.dump(data, open(os.path.join(SITE, 'assets', 'bones.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('webp', n, '+ 4 layers;', 'bones', len(bones))
missing = [s for s in content['bones'] if s not in {b['id'] for b in bones}]
print('content without bone:', missing)