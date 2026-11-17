# Solar System Explorer

An offline, WebGL solar-system simulator: Keplerian ephemerides computed **locally** (no network calls), rendered with Three.js, with 3D bodies, moons, rings, motion trails, orbit lines, labels, camera follow, timeline scrubbing and multiple observer frames (heliocentric / geocentric / surface).

**[Live demo →](https://yonay.github.io/solar-system-explorer/)** *(placeholder — updated after first deploy)*

## Features

- Real-time positions of the Sun, 8 planets, dwarf planets and major moons from Keplerian elements (J2000 epoch)
- Time control: pause, reverse, any rate from seconds to decades per second (custom rates like `3 h/s`, `2000 y/s`)
- Click any body for a full info card (physical data, orbit, mission notes, "from my location" observer view)
- Camera follow with lag-proof pinning, focus framing, selection markers, orbit rings, fading motion trails
- Starfield, planet textures + procedural fallbacks, Saturn rings, corona glow
- Runs 100% offline — everything (including Three.js and imagery) ships in `assets/`

## Run locally

No build step, no dependencies — just serve the folder:

```
npx serve SolarSystemExplorer
```

or open `index.html` via any static server. Double-clicking the file works in most browsers too.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space | play / pause |
| T | toggle motion trails |
| M | toggle moon orbit lines |
| F | follow selected body |
| Esc | deselect |

## Tech

Plain ES5-era JavaScript (no framework), Three.js (vendored), and hand-rolled Keplerian propagation in `assets/js/astro-core.js`.
