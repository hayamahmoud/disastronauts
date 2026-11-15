"""Build the game map from real Mars data: Jezero Crater, where NASA's
Perseverance rover landed.

Writes:
  src/data/map_heights.json   128 x 128 elevation grid (in studs)
  public/map.png              1024 x 1024 ground image (greyscale; the game tints it)

    python tools/process_marstrek.py

Where the data comes from (both are layers you can view in NASA Mars Trek):
  - Elevation: the MOLA global elevation model (463 m per pixel) from Mars
    Global Surveyor's laser altimeter. We download just the ~150 rows over
    Jezero from the USGS copy of the file (the whole file is 2 GB).
  - Image: the CTX global mosaic (Mars Reconnaissance Orbiter's Context
    Camera), at about 40 m per pixel.
Downloads are cached in tools/raw/ (gitignored), so re-running is quick.
"""

import argparse
import io
import json
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image

from common import DATA_DIR, PUBLIC_DIR, RAW_DIR, fetch, write_json

# Jezero Crater: center 18.41 N, 77.69 E, diameter 47.52 km.
# SOURCE: USGS Gazetteer of Planetary Nomenclature, "Jezero" (Mars crater)
# https://planetarynames.wr.usgs.gov/SearchResults?Target=20_Mars&Feature%20Name=Jezero
CENTER_LAT = 18.41
CENTER_LON = 77.69

# Mars radius used by both datasets (Mars 2000 sphere).
MARS_RADIUS_M = 3396190.0

MOLA_URL = "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
MOLA_INFO = "https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m"
CTX_TILE_URL = "https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{row}/{col}"
CTX_INFO = "https://trek.nasa.gov/mars/"
CTX_LEVEL = 9  # 0.000687 degrees (~40 m) per pixel
CTX_TILE_PX = 512
CTX_DEG_PER_PX_LEVEL0 = 0.3515625

TREK_URL = "https://trek.nasa.gov/mars/"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    # The crater rim (radius 23.76 km) lands about 400 studs from the middle.
    parser.add_argument("--map-km", type=float, default=60.0, help="width of the square map in km")
    parser.add_argument("--world-size", type=int, default=1000, help="map width in studs (BALANCE.map.worldSize)")
    parser.add_argument("--grid", type=int, default=128, help="height points per side (BALANCE.map.gridSize)")
    parser.add_argument("--exaggeration", type=float, default=4.0, help="vertical stretch so hills read well in-game")
    parser.add_argument("--image-px", type=int, default=1024)
    args = parser.parse_args()

    meters_per_stud = args.map_km * 1000 / args.world_size
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    # --- Elevation ---
    lat, lon = grid_lat_lon(args.grid, args.world_size, meters_per_stud)
    dem = MolaWindow(lat, lon)
    meters = dem.sample(lat, lon)
    # Zero = the typical crater-floor height, so the floor sits near y = 0.
    radius_studs = (23.76e3 / meters_per_stud)
    ys, xs = np.mgrid[0:args.grid, 0:args.grid]
    cell = args.world_size / (args.grid - 1)
    r = np.hypot(xs * cell - args.world_size / 2, ys * cell - args.world_size / 2)
    floor = float(np.median(meters[r < radius_studs * 0.6]))
    studs = (meters - floor) / meters_per_stud * args.exaggeration
    heights = [round(float(h), 2) for h in studs.flatten()]
    print(f"elevation: floor {floor:.0f} m, range {meters.min():.0f} to {meters.max():.0f} m "
          f"-> {studs.min():.1f} to {studs.max():.1f} studs")

    write_json(DATA_DIR / "map_heights.json", {
        "source": "MOLA global elevation model (Mars Global Surveyor), as shown in NASA Mars Trek",
        "sourceUrl": TREK_URL,
        "dataUrl": MOLA_INFO,
        "place": "Jezero Crater",
        "centerLat": CENTER_LAT,
        "centerLon": CENTER_LON,
        "mapKm": args.map_km,
        "metersPerStud": meters_per_stud,
        "verticalExaggeration": args.exaggeration,
        "floorElevationM": round(floor),
        "size": args.grid,
        "worldSize": args.world_size,
        # Row by row: heights[row * size + col]; row 0 = north, col 0 = west.
        "heights": heights,
    })

    # --- Ground image ---
    lat, lon = grid_lat_lon(args.image_px, args.world_size, meters_per_stud)
    image = ctx_image(lat, lon)
    out = PUBLIC_DIR / "map.png"
    Image.fromarray(image, "L").save(out, optimize=True)
    print(f"wrote {out.relative_to(PUBLIC_DIR.parent)} ({out.stat().st_size // 1024} KB)")


def grid_lat_lon(n: int, world_size: float, meters_per_stud: float):
    """Latitude/longitude (degrees) of an n x n grid covering the map.
    Row 0 = north edge, col 0 = west edge (same layout as the game's height grid)."""
    stud = np.linspace(-world_size / 2, world_size / 2, n)
    east_m = stud[np.newaxis, :] * meters_per_stud  # x grows to the east
    north_m = -stud[:, np.newaxis] * meters_per_stud  # z grows to the south
    deg_m = 2 * math.pi * MARS_RADIUS_M / 360  # meters per degree of latitude
    lat = CENTER_LAT + north_m / deg_m + 0 * east_m
    lon = CENTER_LON + east_m / (deg_m * math.cos(math.radians(CENTER_LAT))) + 0 * north_m
    return lat, lon


class MolaWindow:
    """Reads only the rows of the 2 GB MOLA GeoTIFF that cover the map.
    The file is uncompressed with one image row per strip, so we can fetch
    just the bytes we need with an HTTP range request."""

    def __init__(self, lat, lon):
        self.header = self._read_header()
        h = self.header
        rows = (h["y0"] - np.radians(lat) * MARS_RADIUS_M) / h["px"]
        self.row0 = int(math.floor(rows.min())) - 2
        self.row1 = int(math.ceil(rows.max())) + 2
        cache = RAW_DIR / f"mola_rows_{self.row0}_{self.row1}.npy"
        if cache.exists():
            self.rows = np.load(cache)
        else:
            print(f"downloading MOLA rows {self.row0}-{self.row1}…")
            start = h["offsets"][self.row0]
            end = h["offsets"][self.row1] + h["width"] * 2 - 1
            if h["offsets"][self.row1] - start != (self.row1 - self.row0) * h["width"] * 2:
                raise SystemExit("Unexpected MOLA file layout (rows not stored back to back).")
            raw = fetch(MOLA_URL, headers={"Range": f"bytes={start}-{end}"}, timeout=600)
            self.rows = np.frombuffer(raw, dtype="<i2").reshape(self.row1 - self.row0 + 1, h["width"])
            np.save(cache, self.rows)

    def sample(self, lat, lon):
        """Bilinear elevation (meters) at each lat/lon."""
        h = self.header
        r = (h["y0"] - np.radians(lat) * MARS_RADIUS_M) / h["px"] - self.row0
        c = (np.radians(lon) * MARS_RADIUS_M - h["x0"]) / h["px"]
        return bilinear(self.rows.astype(np.float64), r, c)

    def _read_header(self) -> dict:
        cache = RAW_DIR / "mola_header.json"
        if cache.exists():
            return json.loads(cache.read_text())
        first = fetch(MOLA_URL, headers={"Range": "bytes=0-7"})
        if first[:4] != b"II*\x00":
            raise SystemExit("MOLA file is not a little-endian TIFF.")
        ifd = struct.unpack("<I", first[4:8])[0]
        # The directory sits at the end of the file; 200 KB covers it and its arrays.
        tail = fetch(MOLA_URL, headers={"Range": f"bytes={ifd}-{ifd + 200_000}"})
        tags = {}
        count = struct.unpack("<H", tail[:2])[0]
        for i in range(count):
            entry = tail[2 + i * 12: 14 + i * 12]
            tag, kind, n = struct.unpack("<HHI", entry[:8])
            size = {3: 2, 4: 4, 12: 8}.get(kind, 1) * n
            fmt = {3: "H", 4: "I", 12: "d"}.get(kind)
            if fmt is None:
                continue
            if size <= 4:
                tags[tag] = struct.unpack("<" + fmt * n, entry[8:8 + size])
            else:
                at = struct.unpack("<I", entry[8:12])[0] - ifd
                tags[tag] = struct.unpack("<" + fmt * n, tail[at:at + size])
        if tags[258][0] != 16 or tags[259][0] != 1 or tags[278][0] != 1:
            raise SystemExit("Unexpected MOLA file format (expected 16-bit, uncompressed, 1 row per strip).")
        header = {
            "width": tags[256][0],
            "px": tags[33550][0],  # meters per pixel
            "x0": tags[33922][3],  # map x of the left edge
            "y0": tags[33922][4],  # map y of the top edge
            "offsets": list(tags[273]),
        }
        cache.write_text(json.dumps(header))
        return header


def ctx_image(lat, lon) -> np.ndarray:
    """Greyscale ground image from CTX tiles, sampled at each lat/lon."""
    deg = CTX_DEG_PER_PX_LEVEL0 / 2 ** CTX_LEVEL
    px_row = (90 - lat) / deg  # pixel position in the whole-planet image
    px_col = (lon + 180) / deg
    t_row0, t_row1 = int(px_row.min() // CTX_TILE_PX), int(px_row.max() // CTX_TILE_PX)
    t_col0, t_col1 = int(px_col.min() // CTX_TILE_PX), int(px_col.max() // CTX_TILE_PX)
    mosaic = np.zeros(((t_row1 - t_row0 + 1) * CTX_TILE_PX, (t_col1 - t_col0 + 1) * CTX_TILE_PX))
    for tr in range(t_row0, t_row1 + 1):
        for tc in range(t_col0, t_col1 + 1):
            tile = ctx_tile(tr, tc)
            y, x = (tr - t_row0) * CTX_TILE_PX, (tc - t_col0) * CTX_TILE_PX
            mosaic[y:y + CTX_TILE_PX, x:x + CTX_TILE_PX] = tile
    r = px_row - t_row0 * CTX_TILE_PX
    c = px_col - t_col0 * CTX_TILE_PX
    image = bilinear(mosaic, r, c)
    # Stretch the contrast a little so craters and the delta are easy to see.
    lo, hi = np.percentile(image, [1, 99])
    image = np.clip((image - lo) / max(hi - lo, 1), 0, 1)
    return (image * 255).round().astype(np.uint8)


def ctx_tile(row: int, col: int) -> np.ndarray:
    cache = RAW_DIR / "ctx" / f"{CTX_LEVEL}_{row}_{col}.png"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(fetch(CTX_TILE_URL.format(z=CTX_LEVEL, row=row, col=col)))
    return np.asarray(Image.open(io.BytesIO(Path(cache).read_bytes())).convert("L"), dtype=np.float64)


def bilinear(grid: np.ndarray, r, c) -> np.ndarray:
    r = np.clip(r, 0, grid.shape[0] - 1.001)
    c = np.clip(c, 0, grid.shape[1] - 1.001)
    r0, c0 = np.floor(r).astype(int), np.floor(c).astype(int)
    fr, fc = r - r0, c - c0
    top = grid[r0, c0] * (1 - fc) + grid[r0, c0 + 1] * fc
    bottom = grid[r0 + 1, c0] * (1 - fc) + grid[r0 + 1, c0 + 1] * fc
    return top * (1 - fr) + bottom * fr


if __name__ == "__main__":
    main()
