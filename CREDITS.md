# Credits

Every asset in Disastronauts, who made it, and its license.
Disastronauts uses NASA open data. It is not made, endorsed or sponsored by NASA.

## Made by our team (MIT, like the code)

| Asset | Where | Notes |
|---|---|---|
| All 3D models (astronauts, lander, habitats, solar panels, greenhouse, shield generator, pickups, wrecks, supply capsule) | `src/assets/manifest.ts`, `src/assets/parts.ts` | Built in code from simple shapes (boxes, domes, capsules). No model files |
| Sounds and music | `src/audio/gameAudio.ts` | Made live in the browser with the Web Audio API. No sound files |
| Particles, floating numbers, joystick, HUD, icons | `src/render/juice.ts`, `src/ui/` | Built in code and CSS; icons are emoji |
| Start screen pictures: `public/ui/starting-page.png`, `starting-page-launch-bg.png`, `starting-page-no-level.png`, `menu-rocket.png` | `public/ui/` | Made by our team with an AI image tool |

## NASA data and images

NASA material is generally not under copyright in the United States. We follow the
NASA media guidelines (https://www.nasa.gov/nasa-brand-center/images-and-media/)
and give the credit each source asks for. We use no NASA logos.

| Asset | File | Credit | Link |
|---|---|---|---|
| Jezero Crater heights | `src/data/map_heights.json` | MOLA, NASA Mars Global Surveyor (USGS Astrogeology copy), as shown in NASA Mars Trek | https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m |
| Jezero Crater photo | `public/map.png` | CTX mosaic: NASA/JPL/MSSS/The Murray Lab, via the NASA Mars Trek CTX layer | https://trek.nasa.gov/mars/ |
| Solar flares | `src/data/flares.json` | NASA DONKI (Community Coordinated Modeling Center, NASA GSFC) | https://ccmc.gsfc.nasa.gov/tools/DONKI/ |
| Mars surface radiation | `src/data/radiation.json` | NASA OSDR RadLab; Curiosity RAD instrument (NASA/JPL-Caltech/SwRI) | https://visualization.osdr.nasa.gov/radlab/gui/data-overview/ |
| Perseverance photos (loaded from NASA's servers, not stored here) | `src/data/rover_photos.json` | NASA/JPL-Caltech | https://mars.nasa.gov/mars2020/multimedia/raw-images/ |
| Fact texts | `src/data/facts.json` | Our own words; each fact lists the NASA page it comes from | see `url` in each fact |

## Open-source code and fonts

| What | License | Link |
|---|---|---|
| Three.js (3D engine) | MIT | https://threejs.org |
| Vite, TypeScript, Vitest (build and test tools, not shipped in the game) | MIT / Apache-2.0 | https://vite.dev, https://www.typescriptlang.org, https://vitest.dev |
| Fredoka font (loaded from Google Fonts) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Fredoka |
| Python tools: NumPy, Pillow, certifi (data scripts only) | BSD-3-Clause / MIT-CMU / MPL-2.0 | `tools/requirements.txt` |
