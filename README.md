# Allotar Therapeutics — website (dark edition)

Static, multi-page site for Allotar Therapeutics with WebGL scenes (Three.js) in a dark, cinematic style.
Content comes from the current site preview (dev--allotar.netlify.app).

## Pages

| File | Page |
|---|---|
| `index.html` | Home — hero protein, mission film, impact, AllotarX™ workflow, news |
| `platform.html` | Platform — workflow engine, dynamics sampling, allosteric discovery, closed-loop discovery |
| `programs.html` | Programs — slideshow, approach, program pipelines |
| `team.html` | Team and news |
| `contact.html` | Partnerships, stats and contact form (visual only for now) |

## Run locally

The 3D scenes are ES modules and load data with `fetch`, so the site must be served over http
(opening the HTML files directly will not run them).

```sh
python3 -m http.server 8742
# then open http://localhost:8742
```

On macOS you can also double-click `start.command`.

## Structure

```
assets/
  css/site.css          all styles
  js/site.js            loader, smooth scroll (Lenis), nav, reveals, slideshow, video modal, form; lazy-starts the scenes
  js/gl.js              shared WebGL helpers (renderer + bloom, glow points, protein surface, on-screen render loop)
  js/hero.js            hero: particle wave field, optional assembling protein
  js/engine.js          AllotarX™ closed-loop engine ring
  js/dynamics.js        open ⇄ closed protein over a free-energy landscape
  js/allosteric.js      allosteric discovery charts (2D canvas)
  data/protein.json     adenylate kinase, open (PDB 4AKE) and closed (PDB 1AKE) heavy atoms
  img/ video/ brand/    images, films and logos
closed-loop/
  closed_loop_card.html closed-loop discovery animation, embedded on the platform page in an iframe
```

Three.js 0.165 and Lenis 1.1.13 load from jsDelivr; fonts from Google Fonts.

## Colour

Allotar's design system (Raleway; navy, blue, lavender, peach on a light background) throughout.
Sections that hold films or animations are marked `.sec.dk`; as they reach the middle of the screen the
page colour fades to dark navy, and back to light for the text sections (`site.js` sets `--d` / `--dt`,
`site.css` mixes the palette with `color-mix()`). Browsers without `color-mix()` show those sections as
rounded navy panels instead.

## Deploy

Any static host works (Vercel: framework preset "Other", no build command, root as output).

## Not done yet

- Privacy Policy and Terms of Service pages (footer links point to `#`).
- The contact form is visual only: submitting shows a note with the contact email and sends nothing.
