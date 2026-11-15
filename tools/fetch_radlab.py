"""Download real radiation measurements from NASA RadLab and write src/data/radiation.json.

RadLab (part of NASA's Open Science Data Repository) collects radiation
detector readings from spacecraft. We use the Radiation Assessment Detector
(RAD) on the Curiosity rover, which measures radiation ON THE SURFACE OF MARS
(instrument "MSL-RAD-Surface"). This is the everyday background radiation
that the game's Shielding protects crew from.

    python tools/fetch_radlab.py              # all of 2023
    python tools/fetch_radlab.py --year 2022

Output: the typical (median) absorbed dose rate in micrograys per hour, and
the same per sol (a Mars day). The game turns that into crew damage with one
scale factor in src/config/balance.ts.
"""

import argparse
import datetime as dt
import statistics

from common import DATA_DIR, fetch, write_json

API = "https://visualization.osdr.nasa.gov/radlab/api/"
INFO_URL = "https://visualization.osdr.nasa.gov/radlab/gui/data-overview/"
INSTRUMENT = "MSL-RAD-Surface"

# SOURCE: NASA NSSDCA Mars Fact Sheet, "Length of day 24.6597 hrs"
# https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
HOURS_PER_SOL = 24.6597


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--year", type=int, default=2023)
    args = parser.parse_args()

    # RadLab's API: each parameter is a column to return or a filter on it.
    query = (
        f"?instrument_id={INSTRUMENT}"
        f"&timestamp%3E{args.year}-01-01&timestamp%3C{args.year + 1}-01-01"
        "&absorbed_dose_rate&format=tsv"
    )
    text = fetch(API + query, timeout=300).decode("utf-8")
    rates = []
    for line in text.splitlines()[1:]:
        cols = line.split("\t")
        try:
            value = float(cols[2])
        except (IndexError, ValueError):
            continue
        if value > 0:
            rates.append(value)
    if len(rates) < 100:
        raise SystemExit(f"Only {len(rates)} readings for {args.year}; try another year.")

    median = statistics.median(rates)
    write_json(DATA_DIR / "radiation.json", {
        "source": "NASA OSDR RadLab: Curiosity rover Radiation Assessment Detector (MSL RAD) on the Mars surface",
        "sourceUrl": INFO_URL,
        "instrument": INSTRUMENT,
        "period": str(args.year),
        "fetchedAt": dt.date.today().isoformat(),
        "readings": len(rates),
        # Absorbed dose rate in micrograys per hour (RadLab's unit).
        "medianMicroGrayPerHour": round(median, 3),
        "minMicroGrayPerHour": round(min(rates), 3),
        "maxMicroGrayPerHour": round(max(rates), 3),
        "medianMicroGrayPerSol": round(median * HOURS_PER_SOL, 1),
    })
    print(f"{len(rates)} readings, median {median:.2f} uGy/h = {median * HOURS_PER_SOL:.0f} uGy per sol")


if __name__ == "__main__":
    main()
