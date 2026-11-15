"""Collect a small set of real Perseverance rover photos for the game's
reward cards and write src/data/rover_photos.json.

The old api.nasa.gov "Mars Rover Photos" service has shut down, so this uses
NASA's official Mars 2020 raw-image feed (the same images, from mars.nasa.gov).
Only image links are stored; the game shows them straight from NASA.

    python tools/fetch_rover_photos.py            # the hand-picked list below
    python tools/fetch_rover_photos.py --browse   # suggest new photos to pick from
"""

import argparse
import datetime as dt

from common import DATA_DIR, fetch_json, write_json

FEED = "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json"
INFO_URL = "https://mars.nasa.gov/mars2020/multimedia/raw-images/"

# Plain-language camera names for kids.
CAMERAS = {
    "NAVCAM_LEFT": "Navigation Camera",
    "NAVCAM_RIGHT": "Navigation Camera",
    "MCZ_LEFT": "Mastcam-Z (its zoom 'eyes')",
    "MCZ_RIGHT": "Mastcam-Z (its zoom 'eyes')",
    "FRONT_HAZCAM_LEFT_A": "Front Hazard Camera",
    "REAR_HAZCAM_LEFT": "Rear Hazard Camera",
    "SKYCAM": "Sky Camera",
}

# Hand-picked photos (image id from the feed, short caption we wrote by
# looking at the photo), chosen to look good on a card. Run with --browse
# to find more, then look at the "small" links before adding one.
PICKED = [
    ("NLF_0013_0668101876_305ECM_N0030028NCAM00104_01_295J", "The floor of Jezero Crater, soon after landing"),
    ("NLF_0058_0672089542_660ECM_N0032046NCAM00297_00_095J", "Looking across the crater toward a distant ridge"),
    ("ZL0_0058_0672092633_568ECM_N0032046ZCAM05033_110085J", "Can you spot the little Ingenuity helicopter?"),
    ("ZL0_0200_0684691095_598EBY_N0070346ZCAM08217_1100LMJ", "Layered rocks up close"),
    ("NLF_0420_0704232696_270ECM_N0232872NCAM03420_04_195J", "Hills and ridges ahead of the rover"),
    ("NLF_0700_0729093591_495ECM_N0330366NCAM02700_01_195J", "Wind-shaped sand and the rover's tracks"),
    ("NLF_1000_0755716788_130ECM_N0474404NCAM03000_04_195J", "A rocky slope far from the landing site"),
    ("NLF_1400_0791226386_817ECM_N0660000NCAM13400_04_195J", "Hazy hills on the horizon"),
]

# Sols to look at in --browse mode.
BROWSE_SOLS = [13, 58, 120, 200, 300, 420, 550, 700, 850, 1000, 1200, 1400]


def image_by_id(image_id: str) -> dict:
    # The feed wraps a single photo as {"image": [ {...} ]}.
    return fetch_json(f"{FEED}&id={image_id}")["image"][0]


def photos_on_sol(sol: int, camera: str, count: int = 50) -> list:
    url = (f"{FEED}&num={count}&page=0&order=sol+desc"
           f"&condition_2={sol}:sol:gte&condition_3={sol}:sol:lte&search=%7C{camera}")
    return fetch_json(url).get("images", [])


def to_record(img: dict, caption: str) -> dict:
    instrument = img["camera"]["instrument"]
    return {
        "id": img["imageid"],
        "rover": "Perseverance",
        "sol": img["sol"],
        "earthDate": img["date_taken_utc"][:10],
        "camera": CAMERAS.get(instrument, instrument),
        "imageUrl": img["image_files"]["medium"],  # ~800 px wide
        "pageUrl": img["link"],
        "credit": img["credit"],
        "caption": caption,
    }


def browse() -> None:
    """Print a few full-frame candidates per sol, with links to look at."""
    for sol in BROWSE_SOLS:
        for camera in ("NAVCAM_LEFT", "MCZ_LEFT"):
            imgs = [i for i in photos_on_sol(sol, camera) if i["sample_type"] == "Full"]
            for img in imgs[:: max(1, len(imgs) // 3)][:3]:
                print(f"sol {sol:5} {camera:12} {img['imageid']}  {img['image_files']['small']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--browse", action="store_true")
    args = parser.parse_args()
    if args.browse or not PICKED:
        browse()
        return

    photos = [to_record(image_by_id(image_id), caption) for image_id, caption in PICKED]
    write_json(DATA_DIR / "rover_photos.json", {
        "source": "NASA/JPL-Caltech Mars 2020 Perseverance raw images",
        "sourceUrl": INFO_URL,
        "fetchedAt": dt.date.today().isoformat(),
        "photos": photos,
    })


if __name__ == "__main__":
    main()
