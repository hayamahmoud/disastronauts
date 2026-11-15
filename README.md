# Disastronauts

Grow your base. Survive Mars. Don't be a disaster.

A browser game for kids (7–12) built for NASA Space Apps 2026 ("Build a Junior Astronaut Mission Trainer").

## Run it

```bash
npm install
npm run dev     # open the URL it prints
npm test        # run the simulation tests
```

## Real NASA data

Everything the game needs is saved in `src/data/` (and the map photo in `public/map.png`),
so the game works offline. The in-game **Real NASA Data** screen (menu and podium) lists
each dataset, what it changes in the game, and whether it is live or archived.

| Data | NASA source | In the game |
|---|---|---|
| Solar flares | DONKI (space weather) | Each solar flare replays a real one; its class (C/M/X) sets its strength |
| Radiation | OSDR RadLab (Curiosity rover RAD) | How fast an unshielded crew gets hurt |
| Map | Mars Trek: MOLA heights + CTX photo mosaic (Jezero Crater) | The ground you drive on |
| Rover photos | Perseverance raw images | Photo card reward on the podium |
| Facts | NASA web pages (`src/data/facts.json`) | "Real NASA fact!" pop-ups and the podium fact |

**Today's space weather** (switch on in the Real NASA Data screen): the next game downloads
the last 30 days of real flares from NASA DONKI. It is only labelled LIVE if that worked;
otherwise the game says it is using the archived flares.

### Refreshing the data (Python tools)

```bash
python3 -m venv .venv
.venv/bin/pip install -r tools/requirements.txt
.venv/bin/python tools/fetch_donki.py          # src/data/flares.json (May 2024 by default)
.venv/bin/python tools/fetch_radlab.py         # src/data/radiation.json (2023 by default)
.venv/bin/python tools/process_marstrek.py     # src/data/map_heights.json + public/map.png
.venv/bin/python tools/fetch_rover_photos.py   # src/data/rover_photos.json
```

Or run all four (then the tests) with `npm run data`.

The tools use your `NASA_API_KEY` from `.env` first (copy `.env.example`; free key from
https://api.nasa.gov) and fall back to the public `DEMO_KEY`. 


## Credits

- Map heights: MOLA, NASA Mars Global Surveyor (USGS Astrogeology copy), viewed in NASA Mars Trek.
- Map photo: CTX mosaic, NASA/JPL/MSSS/The Murray Lab.
- Rover photos: NASA/JPL-Caltech (Perseverance raw images).
- Solar flares: NASA DONKI (CCMC). Radiation: NASA OSDR RadLab, Curiosity RAD (NASA/JPL-Caltech/SwRI).
