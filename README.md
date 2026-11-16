# Disastronauts

**Grow your base. Survive Mars. Don't be a disaster.**

A fast 3D browser game made for the NASA Space Apps Challenge 2026
("Build a Junior Astronaut Mission Trainer"). You run a small outpost in the real
Jezero Crater on Mars and race three computer rivals to build the best colony. The
solar flares, radiation and terrain all come from real NASA open data.

**Play it:** https://disastronauts.vercel.app/ (no download, no account; works on laptops, tablets and phones)
**Demo:** https://www.youtube.com/watch?v=ZFkVoURkhxk

## How to play

A round lasts 5 minutes (about 5 Mars days, called **sols**). A short tutorial walks you through your first round.

1. **Grab supplies.** Walk near small items and your magnet pulls them in. Big ones (ice deposits, broken solar panels, soil to scoop) need you to stand next to them and hold **E**.
2. **Bring them home.** Unload at your lander and your base grows: new crew, shelters, solar panels, greenhouses, shield generators.
3. **Keep your three bars up:** ⚡ **Power**, 🫁 **Life Support** (air, water and food) and 🛡️ **Shielding**. More crew and buildings use more, so growing too fast can sink you. Every choice costs something.
4. **Survive disasters.** Dust storms block the sun, cold nights eat Power, and solar flares (replayed from real ones) hurt crew your shield doesn't cover. Missions tell you how to get ready, and you earn stars for finishing them.
5. **Win on Colony Score:** healthy crew, powered buildings, stored resources and mission stars. A big base with sick crew and no power loses to a small, well-run one.

Coins you earn buy upgrades, power-ups and colors in the shop (earned coins only; no real money anywhere).

| Action | Keyboard | Touch screen |
|---|---|---|
| Walk | WASD or arrow keys | Joystick (bottom left) |
| Work on a big pickup | Hold **E** | Hold the work button |
| Call Earth for a supply drop (costs Power, arrives after the real radio delay) | **Space** | On-screen button |
| Switch spare Power between greenhouse and shield | **P** | On-screen button |
| Solar Boost power-up (if you packed one) | **B** | On-screen button |
| Change camera view | **C** | **View** button |

## Real NASA data

Everything the game needs is saved in `src/data/` (plus the map photo in `public/map.png`),
so it works without a connection. The in-game **Real NASA Data** screen (main menu and
end-of-round podium) lists each dataset, what it changes in the game, and whether it is
live or archived.

| Data | NASA source | In the game |
|---|---|---|
| Solar flares | DONKI space weather database (181 flares, May 2024) | Each solar flare replays a real one; its class (C/M/X) sets its strength |
| Radiation | OSDR RadLab: Curiosity rover's RAD instrument on the Mars surface (2023) | How fast unshielded crew get hurt |
| Map | Mars Trek: MOLA heights + CTX photo mosaic of Jezero Crater | The ground you walk on |
| Rover photos | Perseverance raw images | Photo card reward on the podium |
| Facts | NASA web pages, each cited in `src/data/facts.json` | "Real NASA fact!" pop-ups and podium facts |
| Mars basics | NSSDCA Mars Fact Sheet | Sol length (24 h 39 m), Mars gets about 43% of Earth's sunlight, 3–22 minute radio delay |

**Today's space weather:** switch it on in the Real NASA Data screen and the next game
downloads the last 30 days of real flares from DONKI. It is labelled **LIVE** only if that
worked; otherwise the game says it is using the archived May 2024 flares.

**What we simplified (and say so in the game):**
- DONKI flares are seen from near Earth; the game pretends each one reaches your Mars base.
- The radiation readings are from Gale Crater (Curiosity), not Jezero, and sped up for the game.
- The 60 km map is squeezed into the play area and hills are made 4× taller so you can see them.
- One sol lasts 60 seconds, and one minute of radio delay lasts one game second.
- Power use, building costs and disaster damage are game-balance numbers, not real measurements.

## Run it yourself

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev       # then open the link it prints (http://localhost:5173)
npm test          # run the game-logic tests
npm run build     # make the finished website in dist/
npm run preview   # try the finished website locally
```


## How it's built

- **Vite + TypeScript + Three.js**, a static website with no server, accounts or tracking.
- `src/core/` holds all the game rules as plain, testable logic (seeded randomness, no
  graphics). `src/render/`, `src/ui/` and `src/input/` only draw the game and read controls.
- Every tunable number (speeds, costs, timings) lives in `src/config/balance.ts`.
- All art is built in code from simple shapes, listed by ID in `src/assets/manifest.ts`.
  Sounds are made live in the browser.
- We plan to port the game to Roblox later, so the logic is kept simple to translate.

## Deploying

The game is hosted on **Vercel**. Vercel is connected to this GitHub repo:
- every merge into `main` runs the tests, builds the game and updates the live site;
- every pull request gets its own preview link to test before merging.

The build settings are in `vercel.json`. If the tests fail, nothing is published and the
live site stays as it was.

## Team

- Zahra Hussain
- Haya Mahmoud

## Credits and license

Code is under the [MIT License](LICENSE). Every asset, data source and its license is
listed in [CREDITS.md](CREDITS.md).

Disastronauts uses NASA open data. It is not made, endorsed or sponsored by NASA.
