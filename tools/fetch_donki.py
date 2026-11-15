"""Download real solar flares from NASA DONKI and write src/data/flares.json.

Each round of the game replays these flares in order: a flare's class
(C, M or X) sets how strong the in-game solar flare is.

    python tools/fetch_donki.py                      # May 2024 (a very busy month)
    python tools/fetch_donki.py --start 2025-01-01 --end 2025-01-31

Asks api.nasa.gov first with your NASA_API_KEY (from the environment or .env),
then with DEMO_KEY. If the api.nasa.gov gateway is down, it asks NASA CCMC's
DONKI server directly (same database, no key needed).
"""

import argparse
import datetime as dt
import re

from common import DATA_DIR, fetch_json, fetch_nasa_api_json, hide_key, write_json

API_NASA = "https://api.nasa.gov/DONKI/FLR?startDate={start}&endDate={end}&api_key={{key}}"
API_CCMC = "https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate={start}&endDate={end}"
INFO_URL = "https://ccmc.gsfc.nasa.gov/tools/DONKI/"

# "M3.5" -> letter M, number 3.5. Only C, M and X flares matter to the game
# (A and B flares are too weak to notice).
CLASS_RE = re.compile(r"^([CMX])(\d+(?:\.\d+)?)$")


def download(start: str, end: str) -> tuple[list, str]:
    try:
        return fetch_nasa_api_json(API_NASA.format(start=start, end=end)), "api.nasa.gov DONKI"
    except Exception as err:  # gateway down or rate limited: go to the source
        print(f"{hide_key(str(err))}; trying CCMC directly")
        return fetch_json(API_CCMC.format(start=start, end=end)), "NASA CCMC DONKI"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", default="2024-05-01")
    parser.add_argument("--end", default="2024-05-31")
    args = parser.parse_args()

    raw, via = download(args.start, args.end)
    flares = []
    for f in raw:
        match = CLASS_RE.match((f.get("classType") or "").strip())
        if not match or not f.get("peakTime"):
            continue
        flares.append({
            "id": f["flrID"],
            "peakTime": f["peakTime"],
            "classType": match.group(0),  # e.g. "X1.0"
            "classLetter": match.group(1),  # C, M or X: picks the game's flare class
            "magnitude": float(match.group(2)),
            "link": f.get("link", ""),
        })
    flares.sort(key=lambda f: f["peakTime"])
    if not flares:
        raise SystemExit("No C/M/X flares in that date range; try a longer range.")

    write_json(DATA_DIR / "flares.json", {
        "source": "NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)",
        "sourceUrl": INFO_URL,
        "via": via,
        "startDate": args.start,
        "endDate": args.end,
        "fetchedAt": dt.date.today().isoformat(),
        "flares": flares,
    })
    counts = {c: sum(1 for f in flares if f["classLetter"] == c) for c in "CMX"}
    print(f"{len(flares)} flares: {counts}")


if __name__ == "__main__":
    main()
