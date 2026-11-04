"""Crop a rendered sequence to the union of its frames' content and write WebP frames for the site.

usage: python pack.py <job>   reads tools/render/out/<job>/*.png, writes assets/img/seq/<job>/{l,s}/NNN.webp
  l: desktop (max 720 px wide), s: phones (max 420 px wide). Every frame gets the same crop, so the
  sequence stays registered and the player can treat the frames as one image.
"""
import pathlib, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
job = sys.argv[1]
src = sorted((ROOT / 'tools/render/out' / job).glob('*.png'))
ims = [Image.open(f).convert('RGBA') for f in src]
# temporal filter: each frame is a weighted average of its neighbours. Path-tracing grain sits in a different place
# in every frame and "boils" during playback; averaging keeps the shape (the steps between frames are small) and
# cancels most of the grain. Loops wrap around, scrubbed sequences clamp at the ends.
import numpy as np
LOOP = job == 'hero'
W = [1, 2, 3, 2, 1] if LOOP else [1, 2, 1]
arr = [np.asarray(im, dtype=np.float32) for im in ims]
n, h = len(arr), len(W) // 2
def tap(k): return arr[k % n] if LOOP else arr[min(n - 1, max(0, k))]
filt = []
for k in range(n):
    acc = sum(w * tap(k + i - h) for i, w in enumerate(W)) / sum(W)
    filt.append(Image.fromarray(np.clip(acc + .5, 0, 255).astype(np.uint8)))
ims = filt
box = None
for im in ims:
    b = im.getchannel('A').point(lambda a: 255 if a > 6 else 0).getbbox()
    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
pad = 12
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(ims[0].width, box[2] + pad), min(ims[0].height, box[3] + pad))
print(job, len(ims), 'frames, crop', box)
total = 0
for size, maxw in (('l', 720), ('s', 340)):
    out = ROOT / 'assets/img/seq' / job / size; out.mkdir(parents=True, exist_ok=True)
    for k, im in enumerate(ims):
        c = im.crop(box)
        if c.width > maxw: c = c.resize((maxw, round(c.height * maxw / c.width)), Image.LANCZOS)
        f = out / f'{k:03d}.webp'; c.save(f, 'WEBP', quality=78, method=6, alpha_quality=85); total += f.stat().st_size
    print(size, c.size, f'{sum(p.stat().st_size for p in out.glob("*.webp")) / 1e6:.2f} MB')
