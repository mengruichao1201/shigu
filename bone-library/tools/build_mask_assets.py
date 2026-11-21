import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BODY = os.path.join(ROOT, '_body')
DEST = os.path.join(ROOT, '..', 'bone-quiz', 'assets', 'bones')
os.makedirs(os.path.join(DEST, 'masks'), exist_ok=True)

comp = np.asarray(Image.open(os.path.join(BODY, 'composite.png')).convert('RGB')).astype(int)
bg = np.array([236, 231, 221])
fg = (np.abs(comp - bg).max(axis=2) > 8)
Image.open(os.path.join(BODY, 'composite.png')).convert('RGB').save(
    os.path.join(DEST, 'body_composite.webp'), 'WEBP', quality=88, method=6)

meta = {}
for f in sorted(os.listdir(os.path.join(BODY, 'masks'))):
    if not f.endswith('.png'):
        continue
    t = f[:-4]
    im = Image.open(os.path.join(BODY, 'masks', f)).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    on = a > 16
    inside = (on & fg).sum() / max(on.sum(), 1)
    ys, xs = np.nonzero(on)
    meta[t] = {
        'px': int(on.sum()), 'contain': round(float(inside), 4),
        'cx': round(float(xs.mean()), 1), 'cy': round(float(ys.mean()), 1),
        'bbox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
    }
    im.save(os.path.join(DEST, 'masks', t + '.webp'), 'WEBP', quality=90, method=6)
    print(t, meta[t]['px'], 'contain', meta[t]['contain'])

json.dump(meta, open(os.path.join(BODY, 'mask_meta.json'), 'w'), indent=1)
print('composite', comp.shape, 'fg', int(fg.sum()))