"""Drive tools/render/render.html in headless Chromium on the local GPU and save path-traced frames.

usage: python render.py <job> [--test]
  jobs are defined in JOBS below; each writes PNG frames to tools/render/out/<job>/ which are then converted to
  WebP for the site. Needs the site served on http://localhost:8743 and Playwright with Chromium.
"""
import asyncio, base64, json, math, pathlib, sys, time
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent
URL = 'http://localhost:8743/tools/render/render.html'

def ease(x):
    x = min(1, max(0, x)); return 4*x*x*x if x < .5 else 1 - (-2*x + 2) ** 3 / 2

def hero(n=120):
    # seamless 12 s loop at 10 fps: breathes part-closed and back while swaying a little; one site glows at the crest.
    # Small steps per frame (and a temporal filter in pack.py) keep the playback from shimmering.
    out = []
    for k in range(n):
        u = k / n
        out.append(dict(lam=.3 - .3 * math.cos(2 * math.pi * u), rotY=.14 * math.sin(2 * math.pi * u), rotX=.05,
                        glow=max(0, math.sin(2 * math.pi * u)) ** 3 * .9, site=0))
    return out

def story(n=40):
    # scroll-driven: open → closed (first 60%), then the allosteric site lights up and swells out of its pocket
    out = []
    for k in range(n):
        u = k / (n - 1)
        out.append(dict(lam=ease(u / .6), rotY=-.35 + .45 * ease(u), rotX=.05, glow=ease((u - .62) / .38), site=0))
    return out

JOBS = {'hero': (hero, dict(w=800, h=890, samples=160)), 'story': (story, dict(w=800, h=890, samples=160))}

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
            data = await pg.evaluate('o => window.renderFrame(o)', {**base, **f})
            (out / f'{k:03d}.png').write_bytes(base64.b64decode(data.split(',', 1)[1]))
            print(f'{job} {k + 1}/{len(frames)} {time.time() - t:.1f}s', flush=True)
        await b.close()

asyncio.run(main())
