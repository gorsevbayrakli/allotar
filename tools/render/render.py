"""Drive tools/render/render.html in headless Chromium on the local GPU and save path-traced frames.

usage: python render.py <job> [--test]
  jobs are defined in JOBS below; each writes PNG frames to tools/render/out/<job>/ which are then converted to
  WebP for the site. Needs the site served on http://localhost:8743 and Playwright with Chromium.
"""
import asyncio, base64, io, json, math, pathlib, sys, time
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent
URL = 'http://localhost:8743/tools/render/render.html'

def ease(x):
    x = min(1, max(0, x)); return 4*x*x*x if x < .5 else 1 - (-2*x + 2) ** 3 / 2

def story(n=40):
    # scroll-driven: open → closed (first 60%), then the allosteric site lights up and swells out of its pocket
    out = []
    for k in range(n):
        u = k / (n - 1)
        out.append(dict(lam=ease(u / .6), rotY=-.35 + .45 * ease(u), rotX=.05, glow=ease((u - .62) / .38), site=0))
    return out

def still():
    # home hero: two stills of the same pose, the second with the allosteric site lit. The page cross-fades them
    # and floats the image; identical geometry means nothing in the protein can shimmer.
    return [dict(lam=.18, rotY=0, rotX=.05, glow=g, site=0, swell=0) for g in (0, 1)]

def states():
    # home story: open, closed, closed with the allosteric site lit, all from one angle. The page dissolves between
    # them on panel changes; a scrubbed in-between sequence blends shapes and reads as a trembling double outline.
    return [dict(lam=0, glow=0), dict(lam=1, glow=0), dict(lam=1, glow=1)]

JOBS = {'states': (states, dict(w=1400, h=1558, samples=384, grow=1.1, dist=10.2, rotY=-.3, rotX=.05, site=0, swell=0)),
        'story': (story, dict(w=1000, h=1112, samples=128, grow=1.1, dist=10.2)),
        'still': (still, dict(w=1600, h=1780, samples=512, grow=1.1, dist=10.2))}

async def main():
    job = sys.argv[1]; test = '--test' in sys.argv
    frames_fn, base = JOBS[job]; frames = frames_fn()
    if test: frames = [frames[len(frames) // 4], frames[-1]]
    out = ROOT / 'out' / job; out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 400, 'height': 400})
        pg.on('console', lambda m: print('console:', m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: print('pageerror:', e))
        await pg.goto(URL); await pg.wait_for_function('window.ready === true', timeout=120000)
        for k, f in enumerate(frames):
            t = time.time()
            o = {**base, **f}; W, H = o['w'], o['h']
            # big frames in a grid of pieces of at most 800 px (see render.html), stitched into one PNG
            nx, ny = math.ceil(W / 800), math.ceil(H / 900); full = Image.new('RGBA', (W, H))
            for j in range(ny):
                for i in range(nx):
                    x0, y0 = W * i // nx, H * j // ny; pw, ph = W * (i + 1) // nx - x0, H * (j + 1) // ny - y0
                    data = await pg.evaluate('o => window.renderFrame(o)', {**o, 'part': [x0, y0, pw, ph]})
                    full.paste(Image.open(io.BytesIO(base64.b64decode(data.split(',', 1)[1]))), (x0, y0))
            full.save(out / f'{k:03d}.png')
            print(f'{job} {k + 1}/{len(frames)} {time.time() - t:.1f}s', flush=True)
        await b.close()

asyncio.run(main())
