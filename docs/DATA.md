# Disastronauts: Data Sources

Every real-world number in the game, where it came from, and how we use it.
Code that uses a value has a matching `// SOURCE:` comment. Values we haven't
replaced with real data yet are marked `// TODO-REAL-DATA` in code and listed below.

## Real values in use

| Value | Used for | Source |
|---|---|---|
| Mars sol = 24.6597 h (24 h 39 m 35 s) | One sol is scaled to 60 s of game time (`BALANCE.sol`), so a 5-minute round is about 5 sols | NASA NSSDCA Mars Fact Sheet, "Length of day": https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html |
| Mars solar irradiance 586.2 W/m² vs Earth 1361.0 W/m² (ratio ≈ 0.43) | `BALANCE.resources.marsSunlight = 0.43` multiplies every solar output | Same NSSDCA Mars Fact Sheet, "Solar irradiance" |
| Earth–Mars distance: min 54.6 million km, max 401.4 million km | Supply-drop radio delay. Each game rolls a distance in that range (seeded), then delay = distance ÷ speed of light (299,792.458 km/s, exact by definition). That gives about 3.0 to 22.3 light-minutes one way. 1 light-minute = 1 game second (`BALANCE.supplyDrop.secondsPerLightMinute`) | Same NSSDCA Mars Fact Sheet, "Distance from Earth" |
| Podium "What you learned" facts (M4): sol length, ~43% sunlight, 3–22 minute radio delay, Phobos ≈ 27 km long | Now in `src/data/facts.json` (see Facts below) | NSSDCA Mars Fact Sheet (above); Phobos size 27 × 22 × 18 km from NASA Science: https://science.nasa.gov/mars/moons/phobos/ |

| Solar flares: 181 C/M/X flares, 1–31 May 2024 (C 5, M 155, X 21) | `src/data/flares.json` (`tools/fetch_donki.py`). Each in-game flare replays the next real one; its class letter sets strength and shield need. Each game starts at a seeded point in the list | NASA DONKI FLR, fetched via CCMC: https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR (api.nasa.gov/DONKI answered 404 in Nov 2026) |
| Live flares (optional "Today's space weather") | `loadFlares(true)` in `src/services/DataService.ts`: last 30 days, tries api.nasa.gov (DEMO_KEY) then CCMC, 8 s limit. LIVE badge only if it worked; otherwise archived + reason | Same DONKI FLR service |
| Mars surface radiation: median 5.577 µGy/h (min 0.982, max 15.505) from 29,315 readings in 2023 = 137.5 µGy per sol | `src/data/radiation.json` (`tools/fetch_radlab.py`). `BALANCE.crew.radiationDamagePerSol = 137.5 × 0.44` (0.44 is a game-speed factor) | NASA OSDR RadLab, MSL RAD surface data: https://visualization.osdr.nasa.gov/radlab/gui/data-overview/ |
| Jezero Crater elevation: 128×128 grid over 60 km, centred 18.41°N 77.69°E, floor −2635 m | `src/data/map_heights.json` (`tools/process_marstrek.py`). 60 m per stud; heights ×4 | MOLA MGS DEM 463 m (USGS): https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m, as shown in NASA Mars Trek https://trek.nasa.gov/mars/ |
| Jezero photo (greyscale) | `public/map.png`, laid on the terrain as soft light/shade detail | CTX global mosaic (NASA/JPL/MSSS/The Murray Lab) via the Mars Trek CTX layer |
| 8 Perseverance raw photos (sols 13–1400) with our captions | `src/data/rover_photos.json` (`tools/fetch_rover_photos.py`). Podium reward card when you win or survive a disaster | https://mars.nasa.gov/mars2020/multimedia/raw-images/ (credit NASA/JPL-Caltech) |
| Facts (16), each with its source URL | `src/data/facts.json`; pop-ups (`src/ui/factPopup.ts`) and podium. RadLab numbers are filled in from `radiation.json` | NSSDCA Mars Fact Sheet; NASA "What is a solar flare?" (X = 10× M = 100× C); JPL Mars 2020 landing-site press kit (45 km crater, lake ~3.5 billion years ago); JPL 2018 global dust storm / Opportunity; NASA Growing Plants in Space (Veggie lettuce); NASA HRP hazards (radiation); NASA Science Phobos |
| Mini task facts (M4b): Phoenix found water ice just under the soil (2008); dust on InSight's solar panels cut its power until the mission ended (2022); Mars soil is called regolith and is red because iron in it has rusted | `src/data/facts.json` (triggers `taskIce`, `taskSolar`, `taskRegolith`). Shown when you finish that mini task | JPL "NASA Phoenix Mars Lander Confirms Frozen Water" (20 June 2008): https://www.jpl.nasa.gov/news/nasa-phoenix-mars-lander-confirms-frozen-water/ ; JPL "NASA Retires InSight Mars Lander Mission After Years of Science" (21 Dec 2022): https://www.jpl.nasa.gov/news/nasa-retires-insight-mars-lander-mission-after-years-of-science/ ; NASA Science Mars facts: https://science.nasa.gov/mars/facts/ |
| Glossary bubbles (M7): sol = 24 h 39 m, sunlight less than half of Earth's, radio 3–22 minutes, giant dust storms block sunlight, radiation can make astronauts sick and thick soil/water shields stop it, regolith = loose soil/dust/rock | `src/ui/glossary.ts` (`TERMS`, with a `// SOURCE:` comment). Plain-language wording, no new numbers | Same sources as above: NSSDCA Mars Fact Sheet; JPL 2018 global dust storm; NASA HRP hazards (radiation); NASA Science Mars facts (regolith) |

## Simplifications (be honest about these)

- **Day/night curve**: solar output follows a simple sine curve (0 at night,
  peak at noon). Real Mars sunlight also depends on season, latitude and dust.
- **Panel output and building power use** are game-balance numbers, not
  measurements of real hardware. Only the 43% Mars sunlight factor is real.
- **Life Support** combines oxygen, water and food into one bar, as the challenge asks.
- **Mini tasks (M4b)**: hold times (2.5–3.5 s) and rewards (4 items) in
  `BALANCE.tasks` are game-balance numbers. Real drilling, panel repair and
  digging take far longer; only the facts shown afterwards are real.
- **Disaster effects (M3)** are game rules, not measurements: a dust storm (daytime
  only) cuts solar output to 10% and slows walking, a cold night adds heater
  Power per shelter, and a solar flare raises how much Shielding a base needs
  (1.5x / 2x / 3x for C / M / X class) so crew the shield doesn't cover get hurt.
  Durations and damage amounts are balance numbers.
- **Flares reach Mars**: DONKI flares were seen from near Earth. The game pretends
  every one hits your Mars base (really, Mars must face the right part of the Sun).
  Real flares last minutes to hours; in the game each lasts 10 s. May 2024 was very
  active and DONKI mostly lists M flares, so in-game flares lean strong.
- **Radiation location**: RAD is on Curiosity in Gale Crater, not Jezero. Same planet
  surface, different place. The damage is sped up a lot (×0.44 per µGy, per game sol).
- **Map scale**: 60 km squeezed into 1000 studs; heights exaggerated ×4 so hills show.
  Outside the play area the edge is the real terrain too.
- **Supply-drop timing**: the real one-way radio delay is used, but squeezed so
  that 1 real minute becomes 1 game second. The Earth–Mars distance is rolled at
  random within the real range, not taken from today's real orbital positions.

## On the live website (M8)

The game is a static site on Vercel (`vercel.json`). How the data gets there:

- **Bundled (archived) data**: all of `src/data/*.json` is built into the game's
  JavaScript, and `public/map.png` is copied next to it. Nothing is fetched to play,
  and the game labels this data as archived with its dates.
- **Live flares** ("Today's space weather"): the browser asks `api.nasa.gov` with the
  public `DEMO_KEY`, then the CCMC DONKI service, straight from the player's device.
  `DEMO_KEY` is shared by everyone and has a low hourly limit, so on a busy day the
  live fetch can fail; the game then falls back to the archived flares and says so.
- **Rover photos**: only the links are bundled; the pictures load from NASA's servers
  (`mars.nasa.gov`). If they can't load, the podium keeps the caption and credit and
  drops the picture.
- **Our NASA_API_KEY is never in the website.** It lives in `.env` (gitignored) and is
  only used by the Python tools.
- Credits and licenses for every dataset and image are in `CREDITS.md`; the README's
  data table is a short version of this file.

## Placeholders still to replace (`// TODO-REAL-DATA`)

None. (M5 replaced the radiation damage, the terrain and the flare classes. The
procedural crater is still in `src/core/terrain.ts` as a fallback if the real
map fails to load; the game then shows a "Placeholder map" badge.)
